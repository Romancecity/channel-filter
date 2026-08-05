import React from 'react';
import { Tv, RefreshCw, Download, Github, ShieldCheck, Layers } from 'lucide-react';

interface HeaderProps {
  onRefresh: () => void;
  isChecking: boolean;
  onOpenExport: () => void;
  onOpenGithubGuide: () => void;
  onOpenSourceManager: () => void;
  workingCount: number;
  totalCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  isChecking,
  onOpenExport,
  onOpenGithubGuide,
  onOpenSourceManager,
  workingCount,
  totalCount,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Branding & App Name */}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 flex items-center justify-center">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-lg tracking-tight text-slate-100">
                IPTV Channel Filter & Live Monitor
              </h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 font-medium px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Auto 6h Bot
              </span>
            </div>
            <p className="text-xs text-slate-400">
              লাইভ স্ট্রিম ফিল্টার ও ৬ ঘণ্টা পর পর অটো-আপডেট বট সিস্টেম
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={onOpenSourceManager}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 flex items-center space-x-1.5 transition-all active:scale-95"
            title="প্লেলিস্ট লিঙ্ক যোগ বা পরিবর্তন করুন"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">প্লেলিস্ট যুক্ত করুন</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isChecking}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-all ${
              isChecking
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 active:scale-95'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {isChecking ? 'যাচাই করা হচ্ছে...' : 'ম্যানুয়াল রিফ্রেশ'}
            </span>
          </button>

          <button
            onClick={onOpenExport}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">ডাউনলোড M3U</span>
          </button>

          <button
            onClick={onOpenGithubGuide}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-700/50 flex items-center space-x-1.5 transition-all active:scale-95"
          >
            <Github className="w-4 h-4 text-indigo-400" />
            <span className="hidden lg:inline">GitHub Bot</span>
          </button>
        </div>
      </div>
    </header>
  );
};
