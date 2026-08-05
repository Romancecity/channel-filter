import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Channel } from '../types';
import { X, Play, AlertCircle, Copy, Check, Radio, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

interface VideoPlayerModalProps {
  channel: Channel | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [useProxy, setUseProxy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!channel || !videoRef.current) return;

    setError(null);
    setIsLoading(true);

    const video = videoRef.current;
    const streamUrl = useProxy ? `/api/proxy-stream?url=${encodeURIComponent(channel.url)}` : channel.url;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingTimeOut: 8000,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {
          // Autoplay was prevented
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setIsLoading(false);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('নেটওয়ার্ক অথবা CORS সমস্যা। সার্ভার প্রক্সি ট্রাই করুন।');
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              setError('স্ট্রিমটি প্লে করা সম্ভব হচ্ছে না (Stream standard unsupported)');
              hls?.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });
      video.addEventListener('error', () => {
        setIsLoading(false);
        setError('স্ট্রিম প্লে ব্যাকে সমস্যা হচ্ছে।');
      });
    } else {
      setIsLoading(false);
      setError('আপনার ব্রাউজার HLS প্লেব্যাক সাপোর্ট করে না।');
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [channel, useProxy]);

  if (!channel) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(channel.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center p-1 overflow-hidden">
              {channel.logo ? (
                <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <Radio className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-100 text-base">{channel.name}</h3>
                {channel.status === 'working' ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> সচল 🟢
                  </span>
                ) : (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full border border-rose-500/30 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-rose-400" /> বন্ধ ❌
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-sm sm:max-w-md font-mono">{channel.url}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Screen Container */}
        <div className="relative bg-black aspect-video w-full flex items-center justify-center overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-slate-300 space-y-3 z-10">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-medium">লাইভ স্ট্রিম কানেক্ট করা হচ্ছে...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 text-slate-200 space-y-3 z-20">
              <ShieldAlert className="w-10 h-10 text-rose-400 animate-bounce" />
              <p className="text-sm font-semibold text-rose-200 max-w-md">{error}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setUseProxy(!useProxy)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
                >
                  {useProxy ? 'ডাইরেক্ট স্ট্রিম মোড' : 'সার্ভার প্রক্সি ব্যবহার করুন (Proxy Mode)'}
                </button>
                <button
                  onClick={handleCopy}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>VLC এর জন্য লিংক কপি</span>
                </button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            controls
            playsInline
            className="w-full h-full"
          />
        </div>

        {/* Footer info & Controls */}
        <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center space-x-3">
            <span className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-md">
              ক্যাটাগরি: <strong className="text-slate-100">{channel.group}</strong>
            </span>
            <span className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-md">
              সোর্স: <strong className="text-slate-100">{channel.source}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg font-medium flex items-center space-x-1.5 transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>কপি হয়েছে</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>কপি লিংক</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
