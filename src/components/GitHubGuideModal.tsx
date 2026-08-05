import React, { useState } from 'react';
import { Github, Copy, Check, Terminal, ShieldCheck, Clock, X, Code, FileCode } from 'lucide-react';

interface GitHubGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubGuideModal: React.FC<GitHubGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedYml, setCopiedYml] = useState(false);
  const [copiedPy, setCopiedPy] = useState(false);

  if (!isOpen) return null;

  const ymlContent = `name: IPTV Playlist 24-Hour Auto Update Bot

on:
  schedule:
    # Runs automatically once every 24 hours (at 00:00 UTC)
    - cron: '0 0 * * *'
  workflow_dispatch:
    # Allows manual trigger anytime from GitHub Actions tab

permissions:
  contents: write

jobs:
  update-playlist:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Run IPTV Playlist Filter & Health Check
        run: |
          python scripts/update_playlist.py

      - name: Commit and push updated playlists
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add working_playlist.m3u all_channels_status.m3u channels_status.json
          git diff --quiet && git diff --staged --quiet || (git commit -m "🤖 Auto-update working IPTV playlist [$(date -u +'%Y-%m-%d %H:%M UTC')]" && git push)
`;

  const pythonContent = `#!/usr/bin/env python3
import json
import re
import urllib.request
import urllib.error
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

M3U_URL = "https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/Combined_Live_TV.m3u"
JSON_URL = "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/Channels_data.json"

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

def check_stream(channel):
    url = channel["url"]
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            code = response.getcode()
            if 200 <= code < 400:
                initial_bytes = response.read(512).decode('utf-8', errors='ignore').lower()
                if "<html" in initial_bytes or "<!doctype html" in initial_bytes or "access denied" in initial_bytes or "403 forbidden" in initial_bytes:
                    channel["status"] = "dead"
                else:
                    channel["status"] = "working"
                return channel
    except Exception:
        pass
    channel["status"] = "dead"
    return channel

def main():
    m3u_raw = fetch_content(M3U_URL)
    json_raw = fetch_content(JSON_URL)

    m3u_channels = parse_m3u(m3u_raw)
    json_channels = parse_json(json_raw)

    url_map = {}
    for ch in m3u_channels + json_channels:
        if ch["url"] not in url_map:
            url_map[ch["url"]] = ch

    all_channels = list(url_map.values())

    probed_channels = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(check_stream, ch) for ch in all_channels]
        for f in futures:
            probed_channels.append(f.result())

    working_channels = [ch for ch in probed_channels if ch["status"] == "working"]

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # Save working_playlist.m3u
    with open("working_playlist.m3u", "w", encoding="utf-8") as f:
        f.write("#EXTM3U x-tvg-url=\\"\\"\n")
        f.write(f"# Auto Filtered Working IPTV Playlist - Updated: {now_str}\n\n")
        for ch in working_channels:
            f.write(f'#EXTINF:-1 tvg-id="{ch["id"]}" tvg-name="{ch["name"]}" tvg-logo="{ch["logo"]}" group-title="{ch["group"]}",{ch["name"]} 🟢 [WORKING]\n')
            f.write(f'{ch["url"]}\n\n')

if __name__ == "__main__":
    main()
`;

  const copyCode = (code: string, setFn: (b: boolean) => void) => {
    navigator.clipboard.writeText(code);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Github className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">
                GitHub Action Bot (প্রতি ২৪ ঘণ্টায় অটো আপডেট সেটআপ)
              </h3>
              <p className="text-xs text-slate-400">
                গিটহাব রিপোজিটরিতে অটোমেটিক ওয়ার্কিং প্লেলিস্ট আপডেট করার গাইডলাইন
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-6 text-slate-200 text-sm">
          {/* Step Overview */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-emerald-400 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" /> কিভাবে এই বট আপনার GitHub Repo-তে কাজ করবে:
            </h4>
            <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
              <li>আপনার গিটহাব রিপোজিটরিতে <code className="bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded font-mono">.github/workflows/update-playlist.yml</code> ফাইল তৈরি করুন।</li>
              <li>একটি <code className="bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded font-mono">scripts/update_playlist.py</code> ফাইল তৈরি করুন।</li>
              <li>গিটহাব বট প্রতি ২৪ ঘণ্টা পর পর অটোমেটিক রান হয়ে ওয়ার্কিং চ্যানেল ফিল্টার করবে এবং <code className="bg-slate-900 text-emerald-300 px-1.5 py-0.5 rounded font-mono">working_playlist.m3u</code> ফাইলটি আপনার রিপোজিটরিতে অটোমেটিক পুশ করে দিবে!</li>
              <li>GitHub Actions ট্যাবে গিয়ে আপনি যেকোনো সময় <strong className="text-slate-100">Run workflow (ম্যানুয়াল আপডেট)</strong> বাটনে ক্লিক করেও আপডেট করতে পারবেন।</li>
            </ol>
          </div>

          {/* File 1: YML Workflow */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-indigo-300 font-mono flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-indigo-400" />
                .github/workflows/update-playlist.yml
              </span>
              <button
                onClick={() => copyCode(ymlContent, setCopiedYml)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
              >
                {copiedYml ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedYml ? 'কপি হয়েছে!' : 'YML কোড কপি করুন'}</span>
              </button>
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-emerald-400 overflow-x-auto max-h-56 leading-relaxed">
              {ymlContent}
            </pre>
          </div>

          {/* File 2: Python Script */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-emerald-300 font-mono flex items-center gap-1.5">
                <Code className="w-4 h-4 text-emerald-400" />
                scripts/update_playlist.py
              </span>
              <button
                onClick={() => copyCode(pythonContent, setCopiedPy)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
              >
                {copiedPy ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPy ? 'কপি হয়েছে!' : 'Python কোড কপি করুন'}</span>
              </button>
            </div>
            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-300 overflow-x-auto max-h-56 leading-relaxed">
              {pythonContent}
            </pre>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>প্রজেক্টের রুট ফোল্ডারে এই দুটি ফাইল পুশ করলেই ২৪ ঘণ্টার অটোমেটিক ক্রন জব অ্যাক্টিভ হয়ে যাবে!</span>
          </div>
        </div>
      </div>
    </div>
  );
};
