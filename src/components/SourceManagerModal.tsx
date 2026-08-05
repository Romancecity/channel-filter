import React, { useState } from 'react';
import { PlaylistSource } from '../types';
import { X, Plus, Trash2, Link, CheckCircle, Database, FileCode, Layers, Info } from 'lucide-react';

interface SourceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: PlaylistSource[];
  onAddSource: (newSource: Omit<PlaylistSource, 'id'>) => void;
  onRemoveSource: (id: string) => void;
  onToggleSource: (id: string) => void;
  onApplyAndFetch: () => void;
}

export const SourceManagerModal: React.FC<SourceManagerModalProps> = ({
  isOpen,
  onClose,
  sources,
  onAddSource,
  onRemoveSource,
  onToggleSource,
  onApplyAndFetch,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'m3u' | 'json'>('m3u');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('দয়া করে প্লেলিস্টের একটি নাম দিন');
      return;
    }
    if (!url.trim() || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      setFormError('দয়া করে একটি সঠিক HTTP/HTTPS URL দিন');
      return;
    }

    onAddSource({
      name: name.trim(),
      url: url.trim(),
      type,
      enabled: true,
    });

    setName('');
    setUrl('');
    setType('m3u');
    setFormError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                প্লেলিস্ট সোর্স ম্যানেজার (Playlist Sources)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                নতুন M3U/JSON প্লেলিস্ট যোগ করুন অথবা পূর্বের লিঙ্কগুলো সচল/অচল করুন
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">

          {/* Add New Source Form */}
          <form onSubmit={handleAdd} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-4">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-500" />
              <span>নতুন প্লেলিস্ট যোগ করুন (Add New Playlist URL)</span>
            </h4>

            {formError && (
              <div className="p-3 text-xs rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  প্লেলিস্টের নাম (Playlist Name)
                </label>
                <input
                  type="text"
                  placeholder="যেমন: BD Live TV"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  ফরমেট টাইপ (Playlist Format)
                </label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setType('m3u')}
                    className={`flex-1 flex items-center justify-center space-x-1 py-2 text-xs font-medium rounded-lg border transition ${
                      type === 'm3u'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>M3U / M3U8</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('json')}
                    className={`flex-1 flex items-center justify-center space-x-1 py-2 text-xs font-medium rounded-lg border transition ${
                      type === 'json'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>JSON Format</span>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                প্লেলিস্ট URL লিঙ্ক (Direct URL)
              </label>
              <div className="relative">
                <Link className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="url"
                  placeholder="https://raw.githubusercontent.com/.../playlist.m3u"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>প্লেলিস্ট লিঙ্ক যুক্ত করুন (Add Playlist)</span>
            </button>
          </form>

          {/* Existing Active Sources List */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              বর্তমান সংযুক্ত প্লেলিস্টসমূহ ({sources.length} টি)
            </h4>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {sources.map((src) => (
                <div
                  key={src.id}
                  className={`p-3 rounded-xl border transition flex items-center justify-between ${
                    src.enabled
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      : 'bg-slate-100/60 dark:bg-slate-950/30 border-slate-200/50 dark:border-slate-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <input
                      type="checkbox"
                      checked={src.enabled}
                      onChange={() => onToggleSource(src.id)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                          {src.name}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                          src.type === 'json'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                          {src.type}
                        </span>
                        {src.isDefault && (
                          <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-md">
                            ডিফল্ট
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5" title={src.url}>
                        {src.url}
                      </p>
                    </div>
                  </div>

                  {!src.isDefault && (
                    <button
                      onClick={() => onRemoveSource(src.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition ml-2"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* GitHub Actions Note */}
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">GitHub Bot টিপস:</span> পরবর্তীতে GitHub Actions রোবট দিয়ে নতুন প্লেলিস্ট অটো-চেক করাতে চাইলে আপনার <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">scripts/update_playlist.py</code> ফাইলের <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">EXTRA_SOURCES</code> এরেতেও URL যুক্ত করতে পারেন।
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
          >
            বন্ধ করুন (Close)
          </button>

          <button
            onClick={() => {
              onApplyAndFetch();
              onClose();
            }}
            className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition flex items-center space-x-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>প্লেলিস্ট সিঙ্ক ও স্ক্যান শুরু করুন (Sync & Scan)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
