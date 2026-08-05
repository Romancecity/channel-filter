import React, { useState } from 'react';
import { Download, Copy, Check, FileText, CheckCircle2, XCircle, ExternalLink, X, ShieldCheck } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workingCount: number;
  totalCount: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  workingCount,
  totalCount,
}) => {
  const [copiedWorking, setCopiedWorking] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!isOpen) return null;

  const workingM3uUrl = `${window.location.origin}/api/export/m3u?filter=working`;
  const allM3uUrl = `${window.location.origin}/api/export/m3u?filter=all`;

  const copyLink = (url: string, setFn: (b: boolean) => void) => {
    navigator.clipboard.writeText(url);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">আউটপুট প্লেলিস্ট এক্সপোর্ট (Export Playlist)</h3>
              <p className="text-xs text-slate-400">ফিল্টারকৃত M3U ফাইল ডাউনলোড অথবা লাইভ প্লেলিস্ট লিংক</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Option 1: Working Channels Only (Recommended) */}
          <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h4 className="font-bold text-emerald-300 text-sm">
                    শুধু সচল চ্যানেল প্লেলিস্ট (Working Channels Only) 🟢
                  </h4>
                </div>
                <p className="text-xs text-slate-300">
                  যে চ্যানেলগুলোর লাইভ স্ট্রিম চালু আছে শুধুমাত্র সেগুলো ফিল্টার করে প্লেলিস্টে আউটপুট দিবে।
                </p>
                <div className="text-[11px] font-semibold text-emerald-400">
                  মোট সচল চ্যানেল: {workingCount} টি (Total {totalCount} টির মধ্যে)
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="/api/export/m3u?filter=working"
                download="working_playlist.m3u"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center space-x-2 shadow-md shadow-emerald-950/50 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>ডাউনলোড M3U (working_playlist.m3u)</span>
              </a>

              <button
                onClick={() => copyLink(workingM3uUrl, setCopiedWorking)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium rounded-lg text-xs flex items-center space-x-1.5 transition-all"
              >
                {copiedWorking ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedWorking ? 'ইউআরএল কপি হয়েছে!' : 'লাইভ প্লেলিস্ট ইউআরএল কপি'}</span>
              </button>
            </div>
          </div>

          {/* Option 2: All Channels with Status Tags */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <h4 className="font-bold text-slate-200 text-sm">
                  সকল চ্যানেল + স্ট্যাটাস ট্যাগ সহ (All Channels Report)
                </h4>
              </div>
              <p className="text-xs text-slate-400">
                সকল চ্যানেল থাকবে, তবে নামগুলির সাথে 🟢 [WORKING] বা ❌ [DEAD] চিহ্ন যুক্ত থাকবে।
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="/api/export/m3u?filter=all"
                download="all_channels_status.m3u"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold rounded-lg text-xs flex items-center space-x-2 transition-all active:scale-95"
              >
                <Download className="w-4 h-4 text-blue-400" />
                <span>ডাউনলোড M3U (all_channels_status.m3u)</span>
              </a>

              <button
                onClick={() => copyLink(allM3uUrl, setCopiedAll)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium rounded-lg text-xs flex items-center space-x-1.5 transition-all"
              >
                {copiedAll ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedAll ? 'ইউআরএল কপি হয়েছে!' : 'ইউআরএল কপি'}</span>
              </button>
            </div>
          </div>

          {/* GitHub Repo Output Reminder */}
          <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3 text-xs text-indigo-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>GitHub Action Bot সেটআপ করলে আপনার গিটহাব রিপোজিটরিতে এটি অটো আপডেট হতে থাকবে।</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
