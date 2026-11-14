#!/usr/bin/env python3
"""
IPTV Playlist Auto-Updater & Health Checker Bot
Fetches playlist channels from Combined M3U & BDIX JSON sources,
deep-probes stream & HLS segment status, verifies real BD IPs for BDIX bypass,
and outputs filtered working_playlist.m3u & status reports.
Designed to run via GitHub Actions every 1 hour or manually.
"""

import ipaddress
import json
import re
import ssl
import threading
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

# Thread-safe cache for IP country lookups
IP_COUNTRY_CACHE = {}
IP_CACHE_LOCK = threading.Lock()
CGNAT_NET = ipaddress.ip_network("100.64.0.0/10")


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


def get_ip_country(ip_str):
    """Returns ISO country code (e.g. 'BD', 'US') or 'LOCAL' for private/CGNAT IPs."""
    with IP_CACHE_LOCK:
        if ip_str in IP_COUNTRY_CACHE:
            return IP_COUNTRY_CACHE[ip_str]

        country = "UNKNOWN"
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj in CGNAT_NET:
                country = "LOCAL"
            else:
                # Primary fast GeoIP lookup
                for api_url, key in [
                    (f"https://api.country.is/{ip_str}", "country"),
                    (f"http://ip-api.com/json/{ip_str}?fields=status,countryCode", "countryCode"),
                ]:
                    try:
                        req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req, timeout=4, context=SSL_CONTEXT) as resp:
                            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                            val = data.get(key)
                            if val:
                                country = str(val).upper()
                                break
                    except Exception:
                        continue
        except ValueError:
            pass

        IP_COUNTRY_CACHE[ip_str] = country
        return country


def is_bdix_host(url_str):
    """Checks if host is a BDIX domain or an actual Bangladeshi / local ISP IP."""
    try:
        parsed = urllib.parse.urlparse(url_str)
        host = (parsed.hostname or "").lower()
        if not host:
            return False

        if "bdix" in host or host.endswith(".bd") or "local" in host:
            return True

        if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", host):
            country = get_ip_country(host)
            return country in ("BD", "LOCAL")

        return False
    except Exception:
        return False


def is_geo_blocked_domain(url_str):
    try:
        host = (urllib.parse.urlparse(url_str).hostname or "").lower()
        return any(host == d or host.endswith("." + d) for d in GEO_BLOCKED_DOMAINS)
    except Exception:
        return False


def is_html_error_body(lower_body):
    return (
        "<html" in lower_body
        or "<!doctype html" in lower_body
        or "access denied" in lower_body
        or "403 forbidden" in lower_body
        or "404 not found" in lower_body
        or "attention required! | cloudflare" in lower_body
    )


def probe_url_request(url, user_agent, referer=None, max_bytes=2048):
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
        final_url = response.geturl()
        content_type = (response.headers.get("Content-Type") or "").lower()
        raw_bytes = response.read(max_bytes)

        head_text = raw_bytes.decode("utf-8", errors="ignore").lower()
        if "#extm3u" in head_text or "#ext-x-" in head_text or "mpegurl" in content_type:
            extra_bytes = response.read(131072)
            raw_bytes += extra_bytes

        return code, final_url, content_type, raw_bytes


def check_bypass_rules(target_url, http_code, error_msg):
    """
    Only bypasses firewall/geo-block errors (Timeout, 401, 403, 503) for verified
    Bangladeshi (BD) IPs / BDIX hosts or GEO_BLOCKED_DOMAINS.
    Genuine stream failures (404, 500, 502, Connection Refused, Empty M3U8) are NOT bypassed.
    """
    err_low = (error_msg or "").lower()
    is_timeout = "timed out" in err_low or "timeout" in err_low
    is_dns_or_refused = (
        "name or service not known" in err_low
        or "getaddrinfo failed" in err_low
        or "connection refused" in err_low
    )

    if is_dns_or_refused:
        return False, ""

    is_firewall_or_geo_err = http_code in (401, 403, 405, 429, 503) or is_timeout
    if not is_firewall_or_geo_err:
        return False, ""

    if is_geo_blocked_domain(target_url):
        return True, f"Geo-block bypass ({error_msg})"

    if is_bdix_host(target_url):
        return True, f"BD/BDIX firewall bypass ({error_msg})"

    return False, ""


def verify_hls_playlist(playlist_text, base_url, user_agent, referer=None, depth=0):
    if depth > 2:
        return False, 0, "Too many nested HLS playlists", False

    uris = []
    for line in playlist_text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            uris.append(urllib.parse.urljoin(base_url, line))

    if not uris:
        return False, 200, "Empty M3U8 playlist (no stream/segments)", False

    is_master = "#ext-x-stream-inf" in playlist_text.lower()

    if is_master:
        last_code = 0
        last_err = "All HLS variants failed"
        retryable = False
        for variant_url in uris[:2]:
            try:
                v_code, v_final, v_ctype, v_bytes = probe_url_request(variant_url, user_agent, referer)
                v_text = v_bytes.decode("utf-8", errors="ignore")
                v_low = v_text.lower()

                if 200 <= v_code < 400:
                    if "#extm3u" in v_low or "#ext-x-" in v_low or "mpegurl" in v_ctype:
                        ok, sub_code, sub_msg, sub_retry = verify_hls_playlist(
                            v_text, v_final, user_agent, referer, depth + 1
                        )
                        if ok:
                            return True, sub_code, sub_msg, False
                        last_code, last_err, retryable = sub_code, sub_msg, sub_retry
                    elif not is_html_error_body(v_low) and len(v_bytes) > 0 and not v_ctype.startswith("text/"):
                        return True, v_code, "", False
                    else:
                        last_code, last_err, retryable = v_code, "Invalid HLS variant response", True
            except urllib.error.HTTPError as e:
                bypassed, note = check_bypass_rules(variant_url, e.code, f"HTTP {e.code}")
                if bypassed:
                    return True, e.code, note, False
                last_code, last_err = e.code, f"Dead HLS variant: HTTP {e.code}"
                retryable = e.code in (400, 401, 403, 406, 429)
            except Exception as e:
                bypassed, note = check_bypass_rules(variant_url, 0, str(e))
                if bypassed:
                    return True, 200, note, False
                last_code, last_err = 0, f"Dead HLS variant: {e}"
                retryable = True
        return False, last_code, last_err, retryable

    # Media playlist: test the freshest (last) segment, and fallback to the first segment
    candidates = [uris[-1]]
    if len(uris) > 1 and uris[0] != uris[-1]:
        candidates.append(uris[0])

    last_code = 0
    last_err = "Dead HLS segments"
    retryable = False

    for seg_url in candidates:
        try:
            s_code, _, s_ctype, s_bytes = probe_url_request(seg_url, user_agent, referer, max_bytes=1024)
            s_low = s_bytes.decode("utf-8", errors="ignore").lower()

            if 200 <= s_code < 400:
                if len(s_bytes) == 0:
                    last_code, last_err = s_code, "Empty HLS segment (0 bytes)"
                    continue
                if is_html_error_body(s_low) or (s_ctype.startswith("text/") and "#extm3u" not in s_low):
                    last_code, last_err, retryable = s_code, "Dead HLS segment (HTML/Text error)", True
                    continue
                return True, s_code, "", False
        except urllib.error.HTTPError as e:
            bypassed, note = check_bypass_rules(seg_url, e.code, f"HTTP {e.code}")
            if bypassed:
                return True, e.code, note, False
            last_code, last_err = e.code, f"Dead HLS segment: HTTP {e.code}"
            retryable = e.code in (400, 401, 403, 406, 429)
        except Exception as e:
            bypassed, note = check_bypass_rules(seg_url, 0, str(e))
            if bypassed:
                return True, 200, note, False
            last_code, last_err = 0, f"Dead HLS segment: {e}"
            retryable = True

    return False, last_code, last_err, retryable


def check_stream(channel):
    url = channel.get("probe_url") or channel["url"]
    custom_ua = channel.get("custom_ua")
    custom_ref = channel.get("custom_ref")
    start_time = time.time()

    ua_list = [custom_ua] if custom_ua else USER_AGENTS
    last_http_code = 0
    last_error = ""

    for ua in ua_list:
        try:
            code, final_url, content_type, raw_bytes = probe_url_request(url, ua, custom_ref)
            last_http_code = code
            text_body = raw_bytes.decode("utf-8", errors="ignore")
            lower_body = text_body.lower()

            if 200 <= code < 400:
                is_hls = "#extm3u" in lower_body or "#ext-x-" in lower_body or "mpegurl" in content_type

                if is_hls:
                    ok, hls_code, hls_msg, retryable = verify_hls_playlist(
                        text_body, final_url, ua, custom_ref
                    )
                    if ok:
                        channel["status"] = "working"
                        channel["http_code"] = hls_code
                        if hls_msg:
                            channel["note"] = hls_msg
                        channel["response_time_ms"] = int((time.time() - start_time) * 1000)
                        return cleanup_channel_dict(channel)

                    last_http_code = hls_code
                    last_error = hls_msg
                    if not retryable:
                        break
                    continue

                if len(raw_bytes) == 0:
                    last_error = "Empty stream response (0 bytes)"
                    break

                if is_html_error_body(lower_body) or content_type.startswith("text/"):
                    last_error = "HTML / Plain-text Error Page (not a media stream)"
                    continue

                channel["status"] = "working"
                channel["http_code"] = code
                channel["response_time_ms"] = int((time.time() - start_time) * 1000)
                return cleanup_channel_dict(channel)

        except urllib.error.HTTPError as e:
            last_http_code = e.code
            last_error = f"HTTP {e.code}"
            if e.code in (400, 401, 403, 406, 429):
                continue
            break

        except Exception as e:
            last_http_code = 0
            last_error = str(e)
            # Don't retry multiple UAs on timeout or connection refused
            if "timed out" in last_error.lower() or "connection refused" in last_error.lower():
                break
            continue

    elapsed_ms = int((time.time() - start_time) * 1000)
    bypassed, note = check_bypass_rules(url, last_http_code, last_error)
    if bypassed:
        channel["status"] = "working"
        channel["http_code"] = last_http_code or 200
        channel["note"] = note
        channel["response_time_ms"] = elapsed_ms
        return cleanup_channel_dict(channel)

    channel["status"] = "dead"
    channel["http_code"] = last_http_code
    channel["error"] = last_error or "Unknown Error"
    channel["response_time_ms"] = elapsed_ms
    return cleanup_channel_dict(channel)


def cleanup_channel_dict(channel):
    channel.pop("probe_url", None)
    channel.pop("custom_ua", None)
    channel.pop("custom_ref", None)
    return channel


def main():
    print("🚀 Starting IPTV Playlist Update & Health Probe...")

    fetched_channels = []

    m3u_raw = fetch_content(M3U_URL)
    json_raw = fetch_content(JSON_URL)

    m3u_channels = parse_m3u(m3u_raw, "Combined_M3U")
    json_channels = parse_json(json_raw, "BDIX_JSON")

    fetched_channels.extend(m3u_channels)
    fetched_channels.extend(json_channels)

    print(f"📥 Fetched {len(m3u_channels)} channels from M3U")
    if is_valid_http_url(JSON_URL):
        print(f"📥 Fetched {len(json_channels)} channels from JSON")

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

    url_map = {}
    for ch in fetched_channels:
        if ch["url"] not in url_map:
            url_map[ch["url"]] = ch

    all_channels = list(url_map.values())
    print(f"🔍 Testing stream status for {len(all_channels)} total unique channels...")

    probed_channels = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(check_stream, ch) for ch in all_channels]
        for f in as_completed(futures):
            probed_channels.append(f.result())

    working_channels = [ch for ch in probed_channels if ch["status"] == "working"]
    dead_channels = [ch for ch in probed_channels if ch["status"] == "dead"]

    print(f"✅ Probe finished: {len(working_channels)} WORKING (🟢) | {len(dead_channels)} DEAD (❌)")

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    with open("working_playlist.m3u", "w", encoding="utf-8") as f:
        f.write('#EXTM3U x-tvg-url=""\n')
        f.write(f"# Automated Filtered IPTV Playlist - Last Updated: {now_str}\n")
        f.write(f"# Working Channels: {len(working_channels)} / Total Checked: {len(all_channels)}\n\n")
        for ch in working_channels:
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]}\n')
            f.write(f'{ch["url"]}\n\n')

    with open("all_channels_status.m3u", "w", encoding="utf-8") as f:
        f.write('#EXTM3U x-tvg-url=""\n')
        f.write(f"# IPTV Playlist with Live Health Status - Last Updated: {now_str}\n\n")
        for ch in probed_channels:
            tag = "🟢 [WORKING]" if ch["status"] == "working" else "❌ [DEAD]"
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]} {tag}\n')
            f.write(f'{ch["url"]}\n\n')

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
