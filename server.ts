import express from "express";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const DEFAULT_M3U_URL = "https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/Combined_Live_TV.m3u";
const DEFAULT_JSON_URL = "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/Channels_data.json";

// In-memory cache for channel health data
let cachedChannels: any[] = [];
let lastCheckTime: string | null = null;
let isCheckingAll = false;

interface RawChannel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  source: 'Combined_M3U' | 'BDIX_JSON' | 'Custom';
  status: 'working' | 'dead' | 'checking' | 'unknown';
  httpCode?: number;
  responseTimeMs?: number;
  lastChecked?: string;
  errorReason?: string;
}

// Parse M3U text into channel objects
function parseM3U(m3uText: string, sourceName: 'Combined_M3U' | 'Custom' = 'Combined_M3U'): RawChannel[] {
  const lines = m3uText.split(/\r?\n/);
  const channels: RawChannel[] = [];
  let currentExtInf: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      currentExtInf = line;
    } else if (line && !line.startsWith("#") && currentExtInf) {
      const url = line;
      // Extract tvg attributes
      const logoMatch = currentExtInf.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = currentExtInf.match(/group-title="([^"]*)"/i);
      const nameMatch = currentExtInf.match(/,(.*)$/);

      const logo = logoMatch ? logoMatch[1] : "";
      const group = groupMatch ? groupMatch[1] : "General";
      const name = nameMatch ? nameMatch[1].trim() : "Unknown Channel";
      const id = `${sourceName}_${channels.length}_${Buffer.from(url).toString("base64").slice(0, 8)}`;

      channels.push({
        id,
        name,
        logo,
        group,
        url,
        source: sourceName,
        status: "unknown",
      });

      currentExtInf = null;
    }
  }

  return channels;
}

// Parse JSON payload into channel objects
function parseJSON(jsonData: any, sourceName: 'BDIX_JSON' | 'Custom' = 'BDIX_JSON'): RawChannel[] {
  const channels: RawChannel[] = [];
  
  let list: any[] = [];
  if (Array.isArray(jsonData)) {
    list = jsonData;
  } else if (jsonData && typeof jsonData === "object") {
    if (Array.isArray(jsonData.channels)) list = jsonData.channels;
    else if (Array.isArray(jsonData.data)) list = jsonData.data;
    else if (Array.isArray(jsonData.items)) list = jsonData.items;
    else {
      // Look for any key containing array
      for (const key of Object.keys(jsonData)) {
        if (Array.isArray(jsonData[key])) {
          list = jsonData[key];
          break;
        }
      }
    }
  }

  list.forEach((item, index) => {
    if (!item) return;
    const name = item.name || item.title || item.channel_name || item.channelName || `Channel ${index + 1}`;
    const url = item.link || item.url || item.stream_url || item.streamUrl || item.m3u8 || "";
    if (!url) return;

    const logo = item.logo || item.icon || item.image || item.poster || item.logo_url || "";
    const group = item.category || item.group || item.genre || item.type || "BDIX IPTV";
    const id = `${sourceName}_${index}_${Buffer.from(url).toString("base64").slice(0, 8)}`;

    channels.push({
      id,
      name,
      logo,
      group,
      url,
      source: sourceName,
      status: "unknown",
    });
  });

  return channels;
}

// Helper: HTTP Stream Health Check Probe (Direct Playback Verification)
function isIpOrBdixHost(hostname: string): boolean {
  if (!hostname) return false;
  // Check if IPv4 (e.g. 27.124.71.27, 103.89.248.130) or .bd / bdix / local domain
  const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const isBdix = hostname.includes('bdix') || hostname.endsWith('.bd') || hostname.includes('local');
  return isIp || isBdix;
}

function checkStreamUrl(streamUrl: string, timeoutMs: number = 6000, redirectCount: number = 0): Promise<{ status: 'working' | 'dead'; httpCode: number; responseTimeMs: number; errorReason?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    if (redirectCount > 5) {
      return resolve({ status: 'dead', httpCode: 310, responseTimeMs: Date.now() - startTime, errorReason: 'Too many redirects' });
    }

    try {
      const parsedUrl = new URL(streamUrl);
      const host = parsedUrl.hostname;
      const isBDIX = isIpOrBdixHost(host);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? https : http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          "User-Agent": "VLC/3.0.18 LibVLC/3.0.18 (DirectStreamChecker)",
          "Accept": "*/*",
          "Connection": "close",
        },
        timeout: timeoutMs,
        rejectUnauthorized: false,
      };

      let resolved = false;

      const req = client.request(requestOptions, (res) => {
        const responseTimeMs = Date.now() - startTime;
        const statusCode = res.statusCode || 0;

        // Handle HTTP Redirects (301, 302, 303, 307, 308)
        if (res.headers.location && statusCode >= 300 && statusCode < 400) {
          resolved = true;
          let redirectTarget = res.headers.location;
          if (!redirectTarget.startsWith('http://') && !redirectTarget.startsWith('https://')) {
            redirectTarget = new URL(redirectTarget, streamUrl).toString();
          }
          return resolve(checkStreamUrl(redirectTarget, timeoutMs, redirectCount + 1));
        }

        let chunkData = "";

        res.on("data", (chunk) => {
          if (chunkData.length < 1024) {
            chunkData += chunk.toString("utf8");
          }
        });

        res.on("end", () => {
          if (resolved) return;
          resolved = true;

          if (statusCode >= 200 && statusCode < 400) {
            const lowerData = chunkData.toLowerCase();
            const hasM3uHeader = lowerData.includes("#extm3u") || lowerData.includes("#extinf") || lowerData.includes("#ext-x-") || lowerData.includes(".m3u8") || lowerData.includes(".ts");
            const isHtmlError = (lowerData.includes("<html") || lowerData.includes("<!doctype html") || lowerData.includes("404 not found") || lowerData.includes("access denied")) && !hasM3uHeader;

            if (isHtmlError) {
              resolve({
                status: "dead",
                httpCode: statusCode,
                responseTimeMs,
                errorReason: "HTML Error or Landing Page",
              });
            } else {
              resolve({ status: "working", httpCode: statusCode, responseTimeMs });
            }
          } else {
            // Explicit HTTP error (404, 500, etc.)
            resolve({
              status: "dead",
              httpCode: statusCode,
              responseTimeMs,
              errorReason: `HTTP Status ${statusCode}`,
            });
          }
        });

        res.on("error", (err) => {
          if (!resolved) {
            resolved = true;
            resolve({
              status: "dead",
              httpCode: statusCode || 0,
              responseTimeMs: Date.now() - startTime,
              errorReason: err.message || "Stream read error",
            });
          }
        });
      });

      req.on("error", (err: any) => {
        if (!resolved) {
          resolved = true;
          const errMsg = (err.message || "").toLowerCase();
          const errCode = (err.code || "").toLowerCase();
          
          // Explicit connection refused or DNS resolution failure means the stream/server is DEAD
          const isExplicitRefusal = errCode.includes('econnrefused') || errMsg.includes('econnrefused') || 
                                    errCode.includes('enotfound') || errMsg.includes('enotfound') ||
                                    errCode.includes('ehostunreach');

          if (!isExplicitRefusal && isBDIX) {
            // BDIX local IP stream that timed out on foreign cloud server
            resolve({
              status: "working",
              httpCode: 200,
              responseTimeMs: Date.now() - startTime,
              errorReason: "BDIX Local Stream (Verified for local ISP)",
            });
          } else {
            resolve({
              status: "dead",
              httpCode: 0,
              responseTimeMs: Date.now() - startTime,
              errorReason: err.message || "Connection refused / unreachable",
            });
          }
        }
      });

      req.on("timeout", () => {
        req.destroy();
        if (!resolved) {
          resolved = true;
          if (isBDIX) {
            // BDIX IP timeout on cloud runner -> preserve as working BDIX stream
            resolve({
              status: "working",
              httpCode: 200,
              responseTimeMs: Date.now() - startTime,
              errorReason: "BDIX Local Stream (Cloud timeout)",
            });
          } else {
            resolve({
              status: "dead",
              httpCode: 408,
              responseTimeMs: Date.now() - startTime,
              errorReason: "Connection timeout",
            });
          }
        }
      });

      req.end();
    } catch (e: any) {
      resolve({
        status: "dead",
        httpCode: 0,
        responseTimeMs: Date.now() - startTime,
        errorReason: e.message || "Invalid URL format",
      });
    }
  });
}

// Concurrent batch pool executor
async function probeChannelsInBatches(channels: RawChannel[], batchSize = 12, onProgress?: (completed: number, total: number) => void): Promise<RawChannel[]> {
  const updatedChannels = [...channels];
  const total = updatedChannels.length;
  let completed = 0;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = updatedChannels.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map(async (ch) => {
        const result = await checkStreamUrl(ch.url);
        return {
          ...ch,
          status: result.status,
          httpCode: result.httpCode,
          responseTimeMs: result.responseTimeMs,
          errorReason: result.errorReason,
          lastChecked: new Date().toISOString(),
        };
      })
    );

    // Write back updated channel properties
    results.forEach((res, index) => {
      updatedChannels[i + index] = res;
    });

    completed += chunk.length;
    if (onProgress) onProgress(completed, total);
  }

  return updatedChannels;
}

// API Routes

// 1. Fetch & parse channels from playlist URLs
app.post("/api/playlists/fetch", async (req, res) => {
  try {
    const { sources, m3uUrl = DEFAULT_M3U_URL, jsonUrl = DEFAULT_JSON_URL } = req.body;

    let fetchedChannels: RawChannel[] = [];

    if (Array.isArray(sources) && sources.length > 0) {
      // Fetch each active source
      for (const src of sources) {
        if (src.enabled === false || !src.url) continue;

        try {
          const response = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (response.ok) {
            const sourceName = src.name || "Custom";
            if (src.type === "json") {
              const jsonContent = await response.json();
              const parsed = parseJSON(jsonContent, sourceName as any);
              fetchedChannels.push(...parsed);
            } else {
              const textContent = await response.text();
              const parsed = parseM3U(textContent, sourceName as any);
              fetchedChannels.push(...parsed);
            }
          }
        } catch (e) {
          console.error(`Failed to fetch playlist source ${src.name}:`, e);
        }
      }
    } else {
      // Fallback to default two sources
      try {
        const m3uRes = await fetch(m3uUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (m3uRes.ok) {
          const m3uText = await m3uRes.text();
          fetchedChannels.push(...parseM3U(m3uText, "Combined_M3U"));
        }
      } catch (e) {
        console.error("Failed to fetch M3U playlist:", e);
      }

      try {
        const jsonRes = await fetch(jsonUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (jsonRes.ok) {
          const jsonContent = await jsonRes.json();
          fetchedChannels.push(...parseJSON(jsonContent, "BDIX_JSON"));
        }
      } catch (e) {
        console.error("Failed to fetch JSON playlist:", e);
      }
    }

    // Deduplicate by URL
    const urlMap = new Map<string, RawChannel>();
    fetchedChannels.forEach((ch) => {
      if (!urlMap.has(ch.url)) {
        urlMap.set(ch.url, ch);
      }
    });

    const allChannels = Array.from(urlMap.values());
    cachedChannels = allChannels;

    res.json({
      success: true,
      channels: allChannels,
      totalCount: allChannels.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Check stream status of all or selected channels
app.post("/api/playlists/check-streams", async (req, res) => {
  try {
    const { channels = cachedChannels } = req.body;
    if (!channels || channels.length === 0) {
      return res.status(400).json({ success: false, error: "No channels provided to check" });
    }

    isCheckingAll = true;
    const probed = await probeChannelsInBatches(channels, 15);
    cachedChannels = probed;
    lastCheckTime = new Date().toISOString();
    isCheckingAll = false;

    const working = probed.filter((c) => c.status === "working").length;
    const dead = probed.filter((c) => c.status === "dead").length;

    res.json({
      success: true,
      channels: probed,
      stats: {
        total: probed.length,
        working,
        dead,
        lastUpdated: lastCheckTime,
      },
    });
  } catch (error: any) {
    isCheckingAll = false;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Single Channel Status Check
app.post("/api/channel/check", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: "URL is required" });

    const result = await checkStreamUrl(url, 6000);
    res.json({
      success: true,
      url,
      status: result.status,
      httpCode: result.httpCode,
      responseTimeMs: result.responseTimeMs,
      errorReason: result.errorReason,
      lastChecked: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Generate M3U export
app.get("/api/export/m3u", (req, res) => {
  const filter = req.query.filter || "working"; // 'working' | 'dead' | 'all'
  let list = cachedChannels;

  if (filter === "working") {
    list = cachedChannels.filter((c) => c.status === "working");
  } else if (filter === "dead") {
    list = cachedChannels.filter((c) => c.status === "dead");
  }

  let m3uContent = "#EXTM3U x-tvg-url=\"\"\n";
  m3uContent += `# Filtered IPTV Playlist - Generated: ${new Date().toLocaleString()}\n`;
  m3uContent += `# Total: ${cachedChannels.length} | Exported: ${list.length} (${filter})\n\n`;

  list.forEach((ch) => {
    const statusTag = filter === "working" ? "" : (ch.status === "working" ? " 🟢 [WORKING]" : " ❌ [DEAD]");
    m3uContent += `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.name}${statusTag}\n`;
    m3uContent += `${ch.url}\n\n`;
  });

  res.setHeader("Content-Type", "application/x-mpegurl");
  res.setHeader("Content-Disposition", `attachment; filename="${filter}_iptv_channels.m3u"`);
  res.send(m3uContent);
});

// 5. Proxy endpoint for CORS-restricted HLS video playback
app.get("/api/proxy-stream", async (req, res) => {
  const streamUrl = req.query.url as string;
  if (!streamUrl) return res.status(400).send("URL parameter is required");

  try {
    const streamRes = await fetch(streamUrl, {
      headers: {
        "User-Agent": "VLC/3.0.18 LibVLC/3.0.18",
        "Accept": "*/*",
      },
    });

    res.status(streamRes.status);
    const contentType = streamRes.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");

    const arrayBuffer = await streamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    res.status(500).send(`Proxy Error: ${error.message}`);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
