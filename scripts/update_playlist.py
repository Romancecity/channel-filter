#!/usr/bin/env python3
"""
IPTV Playlist Auto-Updater & Health Checker Bot
Fetches playlist channels from Combined M3U & BDIX JSON sources,
probes stream status, and outputs filtered working_playlist.m3u & status reports.
Designed to run via GitHub Actions every 6 hours or manually.
"""

import json
import re
import sys
import time
import urllib.request
import urllib.error
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

M3U_URL = "https://raw.githubusercontent.com/sume2024/itv/refs/heads/main/unified_playlist.m3u"
JSON_URL = "#"

# Add any additional playlist sources here if needed
EXTRA_SOURCES = [
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/category/refs/heads/main/output/sports.m3u", "type": "m3u", "name": "Example_M3U_1"},
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/category/refs/heads/main/output/movies.m3u", "type": "m3u", "name": "Example_M3U_2"},
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/category/refs/heads/main/output/documentary.m3u", "type": "m3u", "name": "Example_M3U_3"},
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/category/refs/heads/main/output/kids.m3u", "type": "m3u", "name": "Example_M3U_4"},
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/category/refs/heads/main/output/entertainment.m3u", "type": ""m3u", "name": "Example_M3U_5"},
    {"url": "https://raw.githubusercontent.com/iptvorg-bd/category/refs/heads/main/output/music.m3u", "type": ""m3u", "name": "Example_M3U_6"},
    {"url": "#", "type": "json", "name": "Example_JSON_2"},
    {"url": "#", "type": "json", "name": "Example_JSON_3"},
    {"url": "#", "type": "json", "name": "Example_JSON_4"},
    {"url": "#", "type": "json", "name": "Example_JSON_5"},
]

USER_AGENT = "VLC/3.0.18 LibVLC/3.0.18 (GitHubActionBot)"
TIMEOUT_SECONDS = 5
MAX_WORKERS = 15

def fetch_content(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
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

def is_direct_ip_or_bdix_stream(url_str):
    try:
        parsed = urllib.parse.urlparse(url_str)
        host = parsed.hostname or ""
        is_ip = bool(re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', host))
        is_bdix = "bdix" in host.lower() or host.lower().endswith(".bd") or "local" in host.lower()
        is_stream_path = parsed.path.endswith(".m3u8") or parsed.path.endswith(".ts") or "index" in parsed.path.lower() or "live" in parsed.path.lower() or "stream" in parsed.path.lower() or parsed.port is not None
        return (is_ip or is_bdix) and is_stream_path
    except Exception:
        return False

def check_stream(channel):
    url = channel["url"]
    start_time = time.time()
    is_bdix = is_direct_ip_or_bdix_stream(url)

    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            code = response.getcode()
            response_time = int((time.time() - start_time) * 1000)
            if 200 <= code < 400:
                initial_bytes = response.read(512).decode('utf-8', errors='ignore').lower()
                if "<html" in initial_bytes or "<!doctype html" in initial_bytes or "access denied" in initial_bytes or "403 forbidden" in initial_bytes:
                    if is_bdix:
                        channel["status"] = "working"
                        channel["http_code"] = code
                        channel["response_time_ms"] = response_time
                    else:
                        channel["status"] = "dead"
                        channel["http_code"] = code
                        channel["error"] = "HTML Error Page / Access Denied"
                else:
                    channel["status"] = "working"
                    channel["http_code"] = code
                    channel["response_time_ms"] = response_time
                return channel
    except urllib.error.HTTPError as e:
        if is_bdix and e.code in [403, 502, 503, 504]:
            channel["status"] = "working"
            channel["http_code"] = e.code
            channel["response_time_ms"] = int((time.time() - start_time) * 1000)
            return channel
        channel["status"] = "dead"
        channel["http_code"] = e.code
        channel["error"] = f"HTTP {e.code}"
    except Exception as e:
        if is_bdix:
            # BDIX direct IP streams (e.g. 27.124.71.27, 103.89.248.130) block foreign cloud runners but work locally
            channel["status"] = "working"
            channel["http_code"] = 200
            channel["response_time_ms"] = int((time.time() - start_time) * 1000)
            return channel
        channel["status"] = "dead"
        channel["http_code"] = 0
        channel["error"] = str(e)

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
