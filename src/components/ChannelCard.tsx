import React, { useState } from 'react';
import { Channel } from '../types';
import { Play, CheckCircle2, XCircle, Copy, Check, RefreshCw, Radio, Zap, AlertTriangle } from 'lucide-react';

interface ChannelCardProps {
  channel: Channel;
  viewMode: 'grid' | 'list';
  onPlay: (channel: Channel) => void;
  onCheckSingle: (channel: Channel) => void;
}

export const ChannelCard: React.FC<ChannelCardProps> = ({
  channel,
  viewMode,
  onPlay,
  onCheckSingle,
}) => {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(channel.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSingleCheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTesting(true);
    await onCheckSingle(channel);
    setIsTesting(false);
  };

  const isWorking = channel.status === 'working';
  const isDead = channel.status === 'dead';

  if (viewMode === 'list') {
    return (
      <div
        onClick={() => onPlay(channel)}
        className={`bg-slate-900 border transition-all rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-slate-600 ${
          isWorking
            ? 'border-emerald-500/30 hover:bg-slate-800/80'
            : isDead
            ? 'border-rose-500/20 opacity-80 hover:opacity-100 bg-rose-950/5 hover:bg-slate-800/80'
            : 'border-slate-800 hover:bg-slate-800/50'
        }`}
      >
        <div className="flex items-center space-x-3 min-w-0">
          {/* Logo */}
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 shrink-0 flex items-center justify-center overflow-hidden p-1">
            {channel.logo && !imgError ? (
              <img
                src={channel.logo}
                alt={channel.name}
                onError={() => setImgError(true)}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Radio className="w-5 h-5 text-slate-500" />
            )}
          </div>

          {/* Name & Metadata */}
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-slate-200 text-sm truncate">
                {channel.name}
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 shrink-0">
                {channel.group}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-0.5 text-xs text-slate-400">
              <span className="font-mono text-[11px] truncate max-w-[200px] sm:max-w-xs text-slate-500">
                {channel.url}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* Status Badge */}
          {isWorking && (
            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>সচল 🟢</span>
              {channel.responseTimeMs && (
                <span className="text-[10px] text-emerald-300 font-mono hidden sm:inline">
                  ({channel.responseTimeMs}ms)
                </span>
              )}
            </div>
          )}

          {isDead && (
            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>বন্ধ ❌</span>
            </div>
          )}

          {!isWorking && !isDead && (
            <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium">
              যাচাই হয়নি
            </span>
          )}

          {/* Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={handleSingleCheck}
              disabled={isTesting}
              title="পুনরায় স্ট্যাটাস চেক করুন"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              onClick={handleCopy}
              title="লিংক কপি করুন"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(channel);
              }}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shadow-md transition-all active:scale-95"
            >
              <Play className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">প্লে</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onPlay(channel)}
      className={`group relative bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-0.5 ${
        isWorking
          ? 'border-slate-800 hover:border-emerald-500/50 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/10'
          : isDead
          ? 'border-slate-800 hover:border-rose-500/40 opacity-80 hover:opacity-100 bg-gradient-to-b from-slate-900 via-slate-900 to-rose-950/10'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Top Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] font-semibold bg-slate-800/90 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700 truncate max-w-[130px]">
          {channel.group}
        </span>

        {isWorking ? (
          <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-extrabold shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>সচল 🟢</span>
          </div>
        ) : isDead ? (
          <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-extrabold shadow-sm">
            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>বন্ধ ❌</span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
            অজানা
          </span>
        )}
      </div>

      {/* Main Info */}
      <div className="flex items-center space-x-3 my-2">
        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center p-1.5 overflow-hidden group-hover:scale-105 transition-transform">
          {channel.logo && !imgError ? (
            <img
              src={channel.logo}
              alt={channel.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Radio className="w-6 h-6 text-slate-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-100 text-sm line-clamp-1 group-hover:text-emerald-400 transition-colors">
            {channel.name}
          </h3>
          <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
            {channel.source === 'Combined_M3U' ? 'Combined_Live_TV.m3u' : 'Channels_data.json'}
          </p>

          {/* Latency / Error text */}
          <div className="mt-1 flex items-center space-x-2 text-[11px]">
            {isWorking && channel.responseTimeMs && (
              <span className="text-emerald-400 font-mono flex items-center gap-1">
                <Zap className="w-3 h-3" /> {channel.responseTimeMs}ms
              </span>
            )}
            {isDead && channel.errorReason && (
              <span className="text-rose-400 truncate text-[10px] flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {channel.errorReason}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          onClick={handleCopy}
          title="কপি স্ট্রিম লিংক"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all flex items-center gap-1 text-xs"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">কপি হয়েছে!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px]">কপি লিংক</span>
            </>
          )}
        </button>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleSingleCheck}
            disabled={isTesting}
            title="লাইভ চেক"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(channel);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-950/50 transition-all active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>প্লে করুন</span>
          </button>
        </div>
      </div>
    </div>
  );
};
