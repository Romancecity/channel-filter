import React from 'react';
import { Search, Filter, CheckCircle2, XCircle, Grid, List, Sparkles } from 'lucide-react';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: 'all' | 'working' | 'dead';
  onStatusFilterChange: (s: 'all' | 'working' | 'dead') => void;
  selectedGroup: string;
  onGroupChange: (g: string) => void;
  groups: string[];
  selectedSource: string;
  onSourceChange: (src: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (v: 'grid' | 'list') => void;
  sortBy: 'name' | 'status' | 'responseTime';
  onSortChange: (sort: 'name' | 'status' | 'responseTime') => void;
  totalFiltered: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedGroup,
  onGroupChange,
  groups,
  selectedSource,
  onSourceChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  totalFiltered,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search Field */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="চ্যানেলের নাম অনুসন্ধান করুন..."
            className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
          />
        </div>

        {/* Status Pills Filter */}
        <div className="flex items-center space-x-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 w-full md:w-auto justify-center">
          <button
            onClick={() => onStatusFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            সব চ্যানেল
          </button>
          <button
            onClick={() => onStatusFilterChange('working')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              statusFilter === 'working'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'text-slate-400 hover:text-emerald-400'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>সচল 🟢 (Working)</span>
          </button>
          <button
            onClick={() => onStatusFilterChange('dead')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              statusFilter === 'dead'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                : 'text-slate-400 hover:text-rose-400'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 text-rose-300" />
            <span>বন্ধ ❌ (Dead)</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
        {/* Category Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>ক্যাটাগরি:</span>
          </div>
          <select
            value={selectedGroup}
            onChange={(e) => onGroupChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">সকল ক্যাটাগরি ({groups.length})</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          {/* Source Dropdown */}
          <select
            value={selectedSource}
            onChange={(e) => onSourceChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">সকল সোর্স (Combined + BDIX)</option>
            <option value="Combined_M3U">Combined_Live_TV.m3u</option>
            <option value="BDIX_JSON">Channels_data.json</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="name">নাম অনুযায়ী (Name)</option>
            <option value="status">স্ট্যাটাস অনুযায়ী (Working First)</option>
            <option value="responseTime">স্পিড/পিং অনুযায়ী (Fastest First)</option>
          </select>
        </div>

        {/* View Mode & Filtered Count */}
        <div className="flex items-center space-x-3">
          <span className="text-slate-400 font-medium">
            দেখাচ্ছে: <strong className="text-emerald-400">{totalFiltered}</strong> টি চ্যানেল
          </span>

          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid' ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="গ্রিড ভিউ"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list' ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="লিস্ট ভিউ"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
