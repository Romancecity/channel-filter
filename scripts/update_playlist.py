#!/usr/bin/env python3
"""
IPTV Playlist Auto-Updater & Health Checker Bot
Fetches playlist channels from Combined M3U & BDIX JSON sources,
probes stream status, and outputs filtered working_playlist.m3u & status reports.
Designed to run via GitHub Actions every 1 hour or manually.
"""

import json
import re
import ssl
import time
import base64
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

M3U_URL = "https://raw.githubusercontent.com/Romancecity/pl_vip/refs/heads/main/playlist_vip.m3u"
JSON_URL = "#"

# Add any additional playlist sources here if needed
EXTRA_SOURCES = [
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/Bingst/refs/heads/main/IPTV%20Playlist.m3u", "type": "m3u", "name": "Example_M3U_1"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_2"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_3"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_4"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_5"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_6"},
    {"url": "#", "type": "json", "name": "Example_JSON_2"},
    {"url": "#", "type": "json", "name": "Example_JSON_3"},
    {"url": "#", "type": "json", "name": "Example_JSON_4"},
    {"url": "#", "type": "json", "name": "Example_JSON_5"},
]

# Real player User-Agents (removed 'GitHubActionBot' to avoid WAF/server blocks)
USER_AGENTS = [
    "VLC/3.0.20 LibVLC/3.0.20",
    "okhttp/4.12.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# Domains that often geo-block / rate-limit GitHub Actions datacenter IPs (403/Timeout),
# while still working on local user networks. (404 / DNS failures will still be marked DEAD)
GEO_BLOCKED_DOMAINS = [
    "tvhunter.top",
    "ziboplay.co",
]

TIMEOUT_SECONDS = 10
MAX_WORKERS = 20

# Disable strict SSL verification for streaming servers with self-signed/expired certs
SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE


def is_valid_http_url(url):
    return isinstance(url, str) and url.strip().startswith(("http://", "https://"))


def fetch_content(url):
    if not is_valid_http_url(url):
        return ""
    try:
        req = urllib.request.Request(
            url.strip(),
            headers={"User-Agent": USER_AGENTS[2], "Accept": "*/*"}
        )
        with urllib.request.urlopen(req, timeout=15, context=SSL_CONTEXT) as response:
            return response.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""


def parse_m3u(m3u_text, source="Combined_M3U"):
    channels = []
    if not m3u_text:
        return channels

    lines = m3u_text.splitlines()
    current_extinf = None
    custom_ua = None
    custom_ref = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith("#EXTINF:"):
            current_extinf = line
            custom_ua = None
            custom_ref = None
        elif line.startswith("#EXTVLCOPT:") and current_extinf:
            opt = line[len("#EXTVLCOPT:"):].strip()
            if opt.lower().startswith("http-user-agent="):
                custom_ua = opt.split("=", 1)[1].strip()
            elif opt.lower().startswith("http-referrer="):
                custom_ref = opt.split("=", 1)[1].strip()
        elif not line.startswith("#") and current_extinf:
            raw_url = line
            if not is_valid_http_url(raw_url):
                current_extinf = None
                continue

            logo_match = re.search(r'tvg-logo="([^"]*)"', current_extinf, re.IGNORECASE)
            group_match = re.search(r'group-title="([^"]*)"', current_extinf, re.IGNORECASE)
            name_match = re.search(r',([^,]*)$', current_extinf)

            logo = logo_match.group(1) if logo_match else ""
            group = group_match.group(1) if group_match else "General"
            name = name_match.group(1).strip() if name_match else "Unknown Channel"

            # Handle inline pipe options like url|User-Agent=...&Referer=...
            probe_url = raw_url
            url_ua = custom_ua
            url_ref = custom_ref
            if "|" in raw_url:
                parts = raw_url.split("|", 1)
                probe_url = parts[0].strip()
                for param in parts[1].split("&"):
                    if "=" in param:
                        k, v = param.split("=", 1)
                        k_low = k.strip().lower()
                        if k_low == "user-agent":
                            url_ua = urllib.parse.unquote(v.strip())
                        elif k_low in ("referer", "referrer"):
                            url_ref = urllib.parse.unquote(v.strip())

            channels.append({
                "id": f"{source}_{len(channels)}_{base64.b64encode(raw_url.encode()).decode()[:8]}",
                "name": name,
                "logo": logo,
                "group": group,
                "url": raw_url,
                "probe_url": probe_url,
                "custom_ua": url_ua,
                "custom_ref": url_ref,
                "source": source,
            })
            current_extinf = None
            custom_ua = None
            custom_ref = None

    return channels


def parse_json(json_text, source="BDIX_JSON"):
    channels = []
    if not json_text:
        return channels
    try:
        data = json.loads(json_text)
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for _, v in data.items():
                if isinstance(v, list):
                    items = v
                    break

        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("title") or item.get("channel_name") or f"Channel {idx+1}"
            url = item.get("link") or item.get("url") or item.get("stream_url") or item.get("m3u8") or ""
            if not is_valid_http_url(url):
                continue

            logo = item.get("logo") or item.get("icon") or item.get("image") or ""
            group = item.get("category") or item.get("group") or item.get("genre") or "BDIX IPTV"

            channels.append({
                "id": f"{source}_{idx}_{base64.b64encode(url.encode()).decode()[:8]}",
                "name": name,
                "logo": logo,
                "group": group,
                "url": url,
                "probe_url": url,
                "custom_ua": None,
                "custom_ref": None,
                "source": source,
            })
    except Exception as e:
        print(f"Error parsing JSON: {e}")

    return channels


def is_direct_ip_or_bdix_stream(url_str):
    try:
        parsed = urllib.parse.urlparse(url_str)
        host = parsed.hostname or ""
        is_ip = bool(re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host))
        is_bdix = "bdix" in host.lower() or host.lower().endswith(".bd") or "local" in host.lower()
        is_stream_path = (
            parsed.path.endswith(".m3u8")
            or parsed.path.endswith(".ts")
            or "index" in parsed.path.lower()
            or "live" in parsed.path.lower()
            or "stream" in parsed.path.lower()
            or parsed.port is not None
        )
        return (is_ip or is_bdix) and is_stream_path
    except Exception:
        return False


def is_geo_blocked_domain(url_str):
    try:
        host = (urllib.parse.urlparse(url_str).hostname or "").lower()
        return any(host == d or host.endswith("." + d) for d in GEO_BLOCKED_DOMAINS)
    except Exception:
        return False


def probe_once(url, user_agent, referer=None):
    headers = {
        "User-Agent": user_agent,
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    if referer:
        headers["Referer"] = referer

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS, context=SSL_CONTEXT) as response:
        code = response.getcode()
        content_type = (response.headers.get("Content-Type") or "").lower()
        initial_bytes = response.read(2048).decode("utf-8", errors="ignore")
        return code, content_type, initial_bytes


def check_stream(channel):
    url = channel.get("probe_url") or channel["url"]
    custom_ua = channel.get("custom_ua")
    custom_ref = channel.get("custom_ref")
    start_time = time.time()

    is_bdix = is_direct_ip_or_bdix_stream(url)
    is_geo_domain = is_geo_blocked_domain(url)

    ua_list = [custom_ua] if custom_ua else USER_AGENTS
    last_http_code = 0
    last_error = ""

    for ua in ua_list:
        try:
            code, content_type, initial_bytes = probe_once(url, ua, custom_ref)
            last_http_code = code
            lower_body = initial_bytes.lower()

            if 200 <= code < 400:
                is_hls = "#extm3u" in lower_body or "mpegurl" in content_type
                is_html_error = (
                    "<html" in lower_body
                    or "<!doctype html" in lower_body
                    or "access denied" in lower_body
                    or "403 forbidden" in lower_body
                    or "attention required! | cloudflare" in lower_body
                )

                if is_hls or not is_html_error:
                    channel["status"] = "working"
                    channel["http_code"] = code
                    channel["response_time_ms"] = int((time.time() - start_time) * 1000)
                    return cleanup_channel_dict(channel)

                last_error = "HTML Error Page / Access Denied"
                # Try next UA if blocked by WAF/HTML page
                continue

        except urllib.error.HTTPError as e:
            last_http_code = e.code
            last_error = f"HTTP {e.code}"
            # Retry with another User-Agent on 400/401/403/406/429
            if e.code in (400, 401, 403, 406, 429):
                continue
            break

        except Exception as e:
            last_http_code = 0
            last_error = str(e)
            # If timeout or connection reset, no need to spam retries for BDIX
            if is_bdix:
                break
            continue

    # Fallback evaluation if all UAs failed
    elapsed_ms = int((time.time() - start_time) * 1000)

    # 1. BDIX / direct IP streams block foreign cloud runners
    if is_bdix and (last_http_code in (403, 502, 503, 504) or last_http_code == 0):
        channel["status"] = "working"
        channel["http_code"] = last_http_code or 200
        channel["note"] = "BDIX bypass"
        channel["response_time_ms"] = elapsed_ms
        return cleanup_channel_dict(channel)

    # 2. Known geo-blocked domains (only bypass WAF/403/503 or timeout; 404/DNS errors still mark DEAD)
    is_timeout = "timed out" in last_error.lower() or "timeout" in last_error.lower()
    is_dns_or_refused = (
        "name or service not known" in last_error.lower()
        or "getaddrinfo failed" in last_error.lower()
        or "connection refused" in last_error.lower()
    )
    if is_geo_domain and not is_dns_or_refused and (
        last_http_code in (401, 403, 405, 429, 503) or is_timeout
    ):
        channel["status"] = "working"
        channel["http_code"] = last_http_code or 200
        channel["note"] = f"Geo-block bypass ({last_error})"
        channel["response_time_ms"] = elapsed_ms
        return cleanup_channel_dict(channel)

    channel["status"] = "dead"
    channel["http_code"] = last_http_code
    channel["error"] = last_error or "Unknown Error"
    channel["response_time_ms"] = elapsed_ms
    return cleanup_channel_dict(channel)


def cleanup_channel_dict(channel):
    # Remove internal probe helper keys before saving JSON
    channel.pop("probe_url", None)
    channel.pop("custom_ua", None)
    channel.pop("custom_ref", None)
    return channel


def main():
    print("🚀 Starting IPTV Playlist Update & Health Probe...")

    fetched_channels = []

    # 1. Fetch default playlists
    m3u_raw = fetch_content(M3U_URL)
    json_raw = fetch_content(JSON_URL)

    m3u_channels = parse_m3u(m3u_raw, "Combined_M3U")
    json_channels = parse_json(json_raw, "BDIX_JSON")

    fetched_channels.extend(m3u_channels)
    fetched_channels.extend(json_channels)

    print(f"📥 Fetched {len(m3u_channels)} channels from M3U")
    if is_valid_http_url(JSON_URL):
        print(f"📥 Fetched {len(json_channels)} channels from JSON")

    # Fetch extra custom sources
    for src in EXTRA_SOURCES:
        url = src.get("url")
        s_type = src.get("type", "m3u")
        s_name = src.get("name", "Extra_Source")
        if not is_valid_http_url(url):
            continue
        raw_text = fetch_content(url)
        if s_type == "json":
            extra_parsed = parse_json(raw_text, s_name)
        else:
            extra_parsed = parse_m3u(raw_text, s_name)
        fetched_channels.extend(extra_parsed)
        print(f"📥 Fetched {len(extra_parsed)} channels from extra source ({s_name})")

    # Deduplicate by URL
    url_map = {}
    for ch in fetched_channels:
        if ch["url"] not in url_map:
            url_map[ch["url"]] = ch

    all_channels = list(url_map.values())
    print(f"🔍 Testing stream status for {len(all_channels)} total unique channels...")

    # 2. Probe streams concurrently
    probed_channels = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(check_stream, ch) for ch in all_channels]
        for f in as_completed(futures):
            probed_channels.append(f.result())

    working_channels = [ch for ch in probed_channels if ch["status"] == "working"]
    dead_channels = [ch for ch in probed_channels if ch["status"] == "dead"]

    print(f"✅ Probe finished: {len(working_channels)} WORKING (🟢) | {len(dead_channels)} DEAD (❌)")

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # 3. Write working_playlist.m3u
    with open("working_playlist.m3u", "w", encoding="utf-8") as f:
        f.write('#EXTM3U x-tvg-url=""\n')
        f.write(f"# Automated Filtered IPTV Playlist - Last Updated: {now_str}\n")
        f.write(f"# Working Channels: {len(working_channels)} / Total Checked: {len(all_channels)}\n\n")
        for ch in working_channels:
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]}\n')
            f.write(f'{ch["url"]}\n\n')

    # 4. Write all_channels_status.m3u
    with open("all_channels_status.m3u", "w", encoding="utf-8") as f:
        f.write('#EXTM3U x-tvg-url=""\n')
        f.write(f"# IPTV Playlist with Live Health Status - Last Updated: {now_str}\n\n")
        for ch in probed_channels:
            tag = "🟢 [WORKING]" if ch["status"] == "working" else "❌ [DEAD]"
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]} {tag}\n')
            f.write(f'{ch["url"]}\n\n')

    # 5. Write channels_status.json
    output_json = {
        "last_updated": now_str,
        "stats": {
            "total": len(all_channels),
            "working": len(working_channels),
            "dead": len(dead_channels),
        },
        "channels": probed_channels,
    }
    with open("channels_status.json", "w", encoding="utf-8") as f:
        json.dump(output_json, f, indent=2, ensure_ascii=False)

    print("🎉 Output files generated successfully: working_playlist.m3u, all_channels_status.m3u, channels_status.json")


if __name__ == "__main__":
    main()
