#!/usr/bin/env python3
"""
IPTV Playlist Auto-Updater & Health Checker Bot
Fetches playlist channels from Combined M3U & BDIX JSON sources,
probes stream status, and outputs filtered working_playlist.m3u & status reports.
Designed to run via GitHub Actions every 1 hours or manually.
"""

import json
import re
import sys
import time
import ssl
import socket
import http.client
import urllib.request
import urllib.error
import urllib.parse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

M3U_URL = "https://raw.githubusercontent.com/Romancecity/pl_vip/refs/heads/main/playlist_vip.m3u"
JSON_URL = "#"

# Add any additional playlist sources here if needed
EXTRA_SOURCES = [
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/Anya/refs/heads/main/ayna_ott.m3u", "type": "m3u", "name": "Example_M3U_1"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_2"},
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/Bingst/refs/heads/main/IPTV%20Playlist.m3u", "type": "m3u", "name": "Example_M3U_3"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_4"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_5"},
    {"url": "#", "type": "m3u", "name": "Example_M3U_6"},
    {"url": "#", "type": "json", "name": "Example_JSON_2"},
    {"url": "#", "type": "json", "name": "Example_JSON_3"},
    {"url": "#", "type": "json", "name": "Example_JSON_4"},
    {"url": "#", "type": "json", "name": "Example_JSON_5"},
]

USER_AGENT = "VLC/3.0.20 LibVLC/3.0.20"
FALLBACK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
TIMEOUT_SECONDS = 8
MAX_WORKERS = 15

SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE


class _RedirectTracker(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.final_url = None

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.final_url = newurl
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_content(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=SSL_CONTEXT) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

def parse_m3u(m3u_text, source="Combined_M3U"):
    channels = []
    lines = m3u_text.splitlines()
    current_extinf = None

    for line in lines:
        line = line.strip()
        if line.startswith("#EXTINF:"):
            current_extinf = line
        elif line and not line.startswith("#") and current_extinf:
            url = line
            logo_match = re.search(r'tvg-logo="([^"]*)"', current_extinf, re.IGNORECASE)
            group_match = re.search(r'group-title="([^"]*)"', current_extinf, re.IGNORECASE)
            name_match = re.search(r',([^,]*)$', current_extinf)

            logo = logo_match.group(1) if logo_match else ""
            group = group_match.group(1) if group_match else "General"
            name = name_match.group(1).strip() if name_match else "Unknown Channel"

            channels.append({
                "id": f"{source}_{len(channels)}_{base64.b64encode(url.encode()).decode()[:8]}",
                "name": name,
                "logo": logo,
                "group": group,
                "url": url,
                "source": source
            })
            current_extinf = None

    return channels

def parse_json(json_text, source="BDIX_JSON"):
    channels = []
    try:
        data = json.loads(json_text)
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list):
                    items = v
                    break

        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("title") or item.get("channel_name") or f"Channel {idx+1}"
            url = item.get("link") or item.get("url") or item.get("stream_url") or item.get("m3u8") or ""
            if not url:
                continue

            logo = item.get("logo") or item.get("icon") or item.get("image") or ""
            group = item.get("category") or item.get("group") or item.get("genre") or "BDIX IPTV"

            channels.append({
                "id": f"{source}_{idx}_{base64.b64encode(url.encode()).decode()[:8]}",
                "name": name,
                "logo": logo,
                "group": group,
                "url": url,
                "source": source
            })
    except Exception as e:
        print(f"Error parsing JSON: {e}")

    return channels

def parse_stream_url_and_headers(raw_url):
    if "|" not in raw_url:
        return raw_url, {}
    clean_url, param_str = raw_url.split("|", 1)
    headers = {}
    parts = re.split(
        r'\||&(?=(?:referer|referrer|user-agent|user_agent|ua|origin|cookie|authorization)=)',
        param_str,
        flags=re.IGNORECASE,
    )
    for part in parts:
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k_lower = k.strip().lower()
        v = v.strip()
        if not v:
            continue
        if k_lower in ("referer", "referrer"):
            headers["Referer"] = v
        elif k_lower in ("user-agent", "user_agent", "ua"):
            headers["User-Agent"] = v
        elif k_lower == "origin":
            headers["Origin"] = v
        elif k_lower == "cookie":
            headers["Cookie"] = v
        elif k_lower == "authorization":
            headers["Authorization"] = v
        else:
            headers[k.strip()] = v
    return clean_url.strip(), headers

def is_stream_path_url(url_str):
    try:
        clean_url, _ = parse_stream_url_and_headers(url_str)
        parsed = urllib.parse.urlparse(clean_url)
        path_lower = parsed.path.lower()
        return (
            path_lower.endswith(".m3u8")
            or path_lower.endswith(".ts")
            or "index" in path_lower
            or "live" in path_lower
            or "stream" in path_lower
            or parsed.port is not None
        )
    except Exception:
        return False

def host_resolves(url_str):
    try:
        clean_url, _ = parse_stream_url_and_headers(url_str)
        host = urllib.parse.urlparse(clean_url).hostname
        if not host:
            return False
        socket.getaddrinfo(host, None)
        return True
    except Exception:
        return False

def is_direct_ip_or_bdix_stream(url_str):
    try:
        clean_url, _ = parse_stream_url_and_headers(url_str)
        parsed = urllib.parse.urlparse(clean_url)
        host = (parsed.hostname or "").lower()
        is_ip = bool(re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host))
        is_bdix = (
            "bdix" in host
            or host.endswith(".bd")
            or "local" in host
            or host.startswith("bd")
            or any(tag in host for tag in ("tvhunter", "ziboplay", "techandeat"))
        )
        return (is_ip or is_bdix) and is_stream_path_url(clean_url)
    except Exception:
        return False

def check_stream(channel):
    raw_url = channel["url"]
    clean_url, custom_headers = parse_stream_url_and_headers(raw_url)
    start_time = time.time()
    is_bdix = is_direct_ip_or_bdix_stream(clean_url)

    if "User-Agent" in custom_headers:
        user_agents = [custom_headers["User-Agent"]]
    else:
        user_agents = [USER_AGENT, FALLBACK_USER_AGENT]

    last_error = None
    last_code = 0

    for idx, ua in enumerate(user_agents):
        is_last_attempt = (idx == len(user_agents) - 1)
        redirect_tracker = _RedirectTracker()
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=SSL_CONTEXT),
            redirect_tracker,
        )

        req_headers = {
            "User-Agent": ua,
            "Accept": "*/*",
            "Connection": "close",
        }
        req_headers.update(custom_headers)

        try:
            req = urllib.request.Request(clean_url, headers=req_headers)
            with opener.open(req, timeout=TIMEOUT_SECONDS) as response:
                code = response.getcode()
                response_time = int((time.time() - start_time) * 1000)
                final_url = redirect_tracker.final_url or response.geturl() or clean_url
                final_is_bdix = is_bdix or is_direct_ip_or_bdix_stream(final_url)

                if 200 <= code < 400:
                    try:
                        raw_bytes = response.read(1024)
                    except http.client.IncompleteRead as ic_err:
                        raw_bytes = ic_err.partial
                    initial_bytes = raw_bytes.decode('utf-8', errors='ignore').lower()

                    if "#extm3u" in initial_bytes or "#extinf" in initial_bytes:
                        channel["status"] = "working"
                        channel["http_code"] = code
                        channel["response_time_ms"] = response_time
                        return channel

                    resp_headers_str = str(response.headers).lower() if response.headers else ""
                    is_cf = (
                        "cloudflare" in resp_headers_str
                        or "cf-ray" in resp_headers_str
                        or "just a moment" in initial_bytes
                        or "cf-browser-verification" in initial_bytes
                    )
                    is_html_err = (
                        "<html" in initial_bytes
                        or "<!doctype html" in initial_bytes
                        or "access denied" in initial_bytes
                        or "403 forbidden" in initial_bytes
                    )

                    if is_html_err:
                        if not is_last_attempt and not final_is_bdix:
                            last_code = code
                            last_error = "HTML Error Page / Access Denied"
                            continue
                        if final_is_bdix or (is_cf and is_stream_path_url(final_url)):
                            channel["status"] = "working"
                            channel["http_code"] = code
                            channel["response_time_ms"] = response_time
                        else:
                            channel["status"] = "dead"
                            channel["http_code"] = code
                            channel["error"] = "HTML Error Page / Access Denied"
                            channel["response_time_ms"] = response_time
                    else:
                        channel["status"] = "working"
                        channel["http_code"] = code
                        channel["response_time_ms"] = response_time
                    return channel

        except urllib.error.HTTPError as e:
            last_code = e.code
            last_error = f"HTTP {e.code}"
            final_url = redirect_tracker.final_url or clean_url
            final_is_bdix = is_bdix or is_direct_ip_or_bdix_stream(final_url)
            resp_headers_str = str(e.headers).lower() if e.headers else ""
            is_cf = (
                "cloudflare" in resp_headers_str
                or "cf-ray" in resp_headers_str
                or "cf-mitigated" in resp_headers_str
            )

            if e.code in [403, 406, 429, 503] and not is_last_attempt:
                continue

            if (final_is_bdix and e.code in [403, 502, 503, 504]) or (
                is_cf and e.code in [403, 429, 503] and is_stream_path_url(final_url)
            ):
                channel["status"] = "working"
                channel["http_code"] = e.code
                channel["response_time_ms"] = int((time.time() - start_time) * 1000)
                return channel

            channel["status"] = "dead"
            channel["http_code"] = e.code
            channel["error"] = f"HTTP {e.code}"
            channel["response_time_ms"] = int((time.time() - start_time) * 1000)
            return channel

        except Exception as e:
            last_code = 0
            last_error = str(e)
            final_url = redirect_tracker.final_url or clean_url
            final_is_bdix = is_bdix or is_direct_ip_or_bdix_stream(final_url)
            is_dns_error = isinstance(e, urllib.error.URLError) and isinstance(e.reason, socket.gaierror)

            if not is_dns_error and final_is_bdix and host_resolves(final_url):
                # BDIX / BD geo-restricted streams block foreign cloud runners but work locally
                channel["status"] = "working"
                channel["http_code"] = 200
                channel["response_time_ms"] = int((time.time() - start_time) * 1000)
                return channel

            if not is_last_attempt and not is_dns_error:
                continue

            channel["status"] = "dead"
            channel["http_code"] = 0
            channel["error"] = str(e)
            channel["response_time_ms"] = int((time.time() - start_time) * 1000)
            return channel

    channel["status"] = "dead"
    channel["http_code"] = last_code
    channel["error"] = last_error or "Unknown Error"
    channel["response_time_ms"] = int((time.time() - start_time) * 1000)
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
    print(f"📥 Fetched {len(json_channels)} channels from JSON")

    # Fetch extra custom sources
    for src in EXTRA_SOURCES:
        url = src.get("url")
        s_type = src.get("type", "m3u")
        s_name = src.get("name", "Extra_Source")
        if not url:
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
        for f in futures:
            probed_channels.append(f.result())

    working_channels = [ch for ch in probed_channels if ch["status"] == "working"]
    dead_channels = [ch for ch in probed_channels if ch["status"] == "dead"]

    print(f"✅ Probe finished: {len(working_channels)} WORKING (🟢) | {len(dead_channels)} DEAD (❌)")

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # 3. Write working_playlist.m3u (clean channel names, no [WORKING] tag suffix)
    with open("working_playlist.m3u", "w", encoding="utf-8") as f:
        f.write("#EXTM3U x-tvg-url=\"\"\n")
        f.write(f"# Automated Filtered IPTV Playlist - Last Updated: {now_str}\n")
        f.write(f"# Working Channels: {len(working_channels)} / Total Checked: {len(all_channels)}\n\n")
        for ch in working_channels:
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]}\n')
            f.write(f'{ch["url"]}\n\n')

    # 4. Write all_channels_status.m3u
    with open("all_channels_status.m3u", "w", encoding="utf-8") as f:
        f.write("#EXTM3U x-tvg-url=\"\"\n")
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
            "dead": len(dead_channels)
        },
        "channels": probed_channels
    }
    with open("channels_status.json", "w", encoding="utf-8") as f:
        json.dump(output_json, f, indent=2, ensure_ascii=False)

    print("🎉 Output files generated successfully: working_playlist.m3u, all_channels_status.m3u, channels_status.json")

if __name__ == "__main__":
    main()
