#!/usr/bin/env python3
"""
IPTV Playlist Auto-Updater & Strict Health Checker Bot
Fetches playlist channels from Combined M3U & BDIX JSON sources,
strictly probes stream & segment status, and outputs only genuinely working channels.
"""

import argparse
import base64
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
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

USER_AGENT = "VLC/3.0.18 LibVLC/3.0.18"
TIMEOUT_SECONDS = 6
MAX_WORKERS = 15
CHECK_INTERVAL_SECONDS = 3600  # ১ ঘণ্টা

ERROR_TEXT_MARKERS = (
    "<html",
    "<!doctype html",
    "access denied",
    "403 forbidden",
    "404 not found",
    "not found",
    "channel offline",
    "stream offline",
    "stream not found",
    "unauthorized",
    "expired",
    "service unavailable",
    "bad gateway",
)


def is_valid_source_url(url):
    return bool(url and url.strip() != "#" and url.strip().startswith(("http://", "https://")))


def fetch_content(url):
    if not is_valid_source_url(url):
        return ""
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as response:
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
                "source": source,
            })
            current_extinf = None

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
                "source": source,
            })
    except Exception as e:
        print(f"Error parsing JSON ({source}): {e}")

    return channels


def looks_like_error_payload(raw_bytes, content_type):
    if not raw_bytes:
        return True, "Empty response body"

    ct = (content_type or "").lower()
    if "text/html" in ct or "application/json" in ct:
        return True, f"Invalid Content-Type: {ct}"

    text_preview = raw_bytes[:1024].decode("utf-8", errors="ignore").strip().lower()
    if text_preview.startswith("{") and ("error" in text_preview or "message" in text_preview):
        return True, "JSON error response"
    if text_preview.startswith("<?xml") and "error" in text_preview:
        return True, "XML error response"

    for marker in ERROR_TEXT_MARKERS:
        if marker in text_preview:
            return True, f"Error marker found: {marker}"

    return False, ""


def probe_url_bytes(url, max_bytes=65536):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        code = response.getcode()
        final_url = response.geturl()
        content_type = response.headers.get("Content-Type", "")
        raw_bytes = response.read(max_bytes)
        return code, final_url, content_type, raw_bytes


def extract_first_media_or_playlist_url(m3u8_text, base_url):
    for line in m3u8_text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return urllib.parse.urljoin(base_url, line)
    return None


def validate_hls_playlist(m3u8_text, base_url, depth=0):
    if "#EXTM3U" not in m3u8_text:
        return False, "Missing #EXTM3U header"

    has_streams = "#EXT-X-STREAM-INF" in m3u8_text
    has_segments = "#EXTINF" in m3u8_text or "#EXT-X-TARGETDURATION" in m3u8_text

    if not (has_streams or has_segments):
        return False, "Empty or invalid M3U8 playlist"

    next_url = extract_first_media_or_playlist_url(m3u8_text, base_url)
    if not next_url:
        return False, "No stream/segment URL inside M3U8"

    # প্রথম সাব-প্লেলিস্ট বা সেগমেন্ট আসলে লাইভ আছে কি না চেক করা
    if depth < 2:
        code, final_url, content_type, raw_bytes = probe_url_bytes(next_url, max_bytes=32768)
        if not (200 <= code < 300):
            return False, f"Sub-resource HTTP {code}"

        is_err, err_msg = looks_like_error_payload(raw_bytes, content_type)
        if is_err:
            return False, f"Sub-resource failed: {err_msg}"

        sub_text = raw_bytes.decode("utf-8", errors="ignore")
        if has_streams and "#EXTM3U" in sub_text:
            return validate_hls_playlist(sub_text, final_url, depth=depth + 1)

    return True, "OK"


def check_stream(channel):
    url = channel["url"].strip()
    start_time = time.time()

    if not url.startswith(("http://", "https://")):
        channel["status"] = "dead"
        channel["http_code"] = 0
        channel["error"] = "Unsupported URL scheme"
        channel["response_time_ms"] = 0
        return channel

    try:
        code, final_url, content_type, raw_bytes = probe_url_bytes(url, max_bytes=65536)
        response_time = int((time.time() - start_time) * 1000)

        if not (200 <= code < 300):
            channel["status"] = "dead"
            channel["http_code"] = code
            channel["error"] = f"HTTP {code}"
            channel["response_time_ms"] = response_time
            return channel

        is_err, err_msg = looks_like_error_payload(raw_bytes, content_type)
        if is_err:
            channel["status"] = "dead"
            channel["http_code"] = code
            channel["error"] = err_msg
            channel["response_time_ms"] = response_time
            return channel

        text_head = raw_bytes.decode("utf-8", errors="ignore")
        is_hls = (
            ".m3u8" in final_url.lower()
            or "mpegurl" in (content_type or "").lower()
            or text_head.lstrip().startswith("#EXTM3U")
        )

        if is_hls:
            ok, msg = validate_hls_playlist(text_head, final_url)
            if not ok:
                channel["status"] = "dead"
                channel["http_code"] = code
                channel["error"] = msg
                channel["response_time_ms"] = int((time.time() - start_time) * 1000)
                return channel

        channel["status"] = "working"
        channel["http_code"] = code
        channel["response_time_ms"] = int((time.time() - start_time) * 1000)
        return channel

    except urllib.error.HTTPError as e:
        channel["status"] = "dead"
        channel["http_code"] = e.code
        channel["error"] = f"HTTP {e.code}"
    except Exception as e:
        channel["status"] = "dead"
        channel["http_code"] = 0
        channel["error"] = str(e)

    channel["response_time_ms"] = int((time.time() - start_time) * 1000)
    return channel


def run_check():
    print("🚀 Starting IPTV Playlist Update & Strict Health Probe...")

    fetched_channels = []

    # 1. Fetch default playlists
    if is_valid_source_url(M3U_URL):
        m3u_raw = fetch_content(M3U_URL)
        m3u_channels = parse_m3u(m3u_raw, "Combined_M3U")
        fetched_channels.extend(m3u_channels)
        print(f"📥 Fetched {len(m3u_channels)} channels from M3U")

    if is_valid_source_url(JSON_URL):
        json_raw = fetch_content(JSON_URL)
        json_channels = parse_json(json_raw, "BDIX_JSON")
        fetched_channels.extend(json_channels)
        print(f"📥 Fetched {len(json_channels)} channels from JSON")

    # Fetch extra custom sources
    for src in EXTRA_SOURCES:
        url = src.get("url")
        s_type = src.get("type", "m3u")
        s_name = src.get("name", "Extra_Source")
        if not is_valid_source_url(url):
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

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # 3. Write working_playlist.m3u (ONLY verified working streams)
    with open("working_playlist.m3u", "w", encoding="utf-8") as f:
        f.write('#EXTM3U x-tvg-url=""\n')
        f.write(f"# Automated Filtered IPTV Playlist - Last Checked: {now_str}\n")
        f.write(f"# Working Channels: {len(working_channels)} / Total Checked: {len(all_channels)}\n\n")
        for ch in working_channels:
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]}\n')
            f.write(f'{ch["url"]}\n\n')

    # 4. Write all_channels_status.m3u
    with open("all_channels_status.m3u", "w", encoding="utf-8") as f:
        f.write('#EXTM3U x-tvg-url=""\n')
        f.write(f"# IPTV Playlist with Live Health Status - Last Checked: {now_str}\n\n")
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


def main():
    parser = argparse.ArgumentParser(description="IPTV Playlist Auto-Updater")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Run continuously every 1 hour (for VPS/PC only; do not use in GitHub Actions)",
    )
    args = parser.parse_args()

    if args.loop:
        while True:
            try:
                run_check()
            except Exception as e:
                print(f"❌ Unexpected error during run: {e}")
            print(f"⏳ Waiting {CHECK_INTERVAL_SECONDS // 60} minutes before next check...\n")
            time.sleep(CHECK_INTERVAL_SECONDS)
    else:
        run_check()


if __name__ == "__main__":
    main()
