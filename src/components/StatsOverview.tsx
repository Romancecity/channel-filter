import React from 'react';
import { CheckCircle2, XCircle, Activity, Clock, ShieldCheck, Database, Radio, Layers } from 'lucide-react';
import { PlaylistStats, PlaylistSource } from '../types';

interface StatsOverviewProps {
  stats: PlaylistStats;
  isChecking: boolean;
  onRefresh: () => void;
  sources: PlaylistSource[];
  onOpenSourceManager: () => void;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  stats,
  isChecking,
  onRefresh,
  sources,
  onOpenSourceManager,
}) => {
  const workingPercent = stats.total > 0 ? Math.round((stats.working / stats.total) * 100) : 0;
  const activeSources = sources.filter((s) => s.enabled);

  return (
    <div className="space-y-4">
      {/* Top Source Notice Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                লাইভ প্লেলিস্ট মনিটর ও অটো-ফিল্টার সিস্টেম
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              সংযুক্ত <span className="text-indigo-400 font-bold">{activeSources.length} টি প্লেলিস্ট</span> থেকে অটোমেটিক চ্যানেল ফেচ করে লোকালহোস্ট/ডাইরেক্ট ফিল্টার টেস্ট করা হচ্ছে। 
              <span className="text-emerald-400 font-medium"> ওয়ার্কিং প্লেলিস্টে পরিচ্ছন্ন চ্যানেল নাম</span> রপ্তানি হবে।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {activeSources.map((src) => (
              <span key={src.id} className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-300 flex items-center gap-1.5 font-mono truncate max-w-xs">
                {src.type === 'json' ? (
                  <Database className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                )}
                <span className="truncate">{src.name}</span>
              </span>
            ))}
            <button
              onClick={onOpenSourceManager}
              className="bg-indigo-950/80 border border-indigo-700/60 px-3 py-1.5 rounded-lg text-indigo-300 hover:text-white flex items-center gap-1 font-medium transition"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>+ নতুন প্লেলিস্ট যুক্ত করুন</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Channels */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">মোট চ্যানেল (Total)</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-mono">
              {stats.total}
            </span>
            <span className="text-xs text-slate-400">চ্যানেল</span>
          </div>
        </div>

        {/* Working Channels (Green Check) */}
        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between shadow-md bg-emerald-950/10">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              সচল চ্যানেল (Working) 🟢
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
              {stats.working}
            </span>
            <span className="text-xs font-bold text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {workingPercent}% পাস
            </span>
          </div>
        </div>

        {/* Dead Channels (Red Cross) */}
        <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-4 flex flex-col justify-between shadow-md bg-rose-950/10">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              বন্ধ স্ট্রিম (Dead) ❌
            </span>
            <XCircle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-400 font-mono">
              {stats.dead}
            </span>
            <span className="text-xs font-medium text-rose-400/80">
              অকার্যকর
            </span>
          </div>
        </div>

        {/* Auto Bot Update Schedule */}
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between shadow-md bg-indigo-950/10">
          <div className="flex items-center justify-between text-indigo-300">
            <span className="text-xs font-semibold uppercase tracking-wider">
              বট আপডেট শিডিউল
            </span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <div className="text-xs font-semibold text-indigo-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              প্রতি ৬ ঘণ্টা পর পর
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {stats.lastUpdated
                ? `সর্বশেষ: ${new Date(stats.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'ম্যানুয়াল বা বট স্ক্যান চলমান'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
