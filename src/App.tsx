import React, { useEffect, useState, useMemo } from 'react';
import { Channel, PlaylistStats, PlaylistSource } from './types';
import { Header } from './components/Header';
import { StatsOverview } from './components/StatsOverview';
import { FilterBar } from './components/FilterBar';
import { ChannelCard } from './components/ChannelCard';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { ExportModal } from './components/ExportModal';
import { GitHubGuideModal } from './components/GitHubGuideModal';
import { SourceManagerModal } from './components/SourceManagerModal';
import { Radio, RefreshCw, AlertCircle } from 'lucide-react';

const DEFAULT_SOURCES: PlaylistSource[] = [
  {
    id: 'default-m3u',
    name: 'SM-Live-TV',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/Combined_Live_TV.m3u',
    type: 'm3u',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'default-json',
    name: 'Mrgify-BDIX',
    url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/Channels_data.json',
    type: 'json',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'ex-m3u-1',
    name: 'Example M3U 1',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/এক্সাম্পল.m3u',
    type: 'm3u',
    enabled: true,
  },
  {
    id: 'ex-m3u-2',
    name: 'Example M3U 2',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/এক্সাম্পল.m3u',
    type: 'm3u',
    enabled: true,
  },
  {
    id: 'ex-m3u-3',
    name: 'Example M3U 3',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/এক্সাম্পল.m3u',
    type: 'm3u',
    enabled: true,
  },
  {
    id: 'ex-m3u-4',
    name: 'Example M3U 4',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/এক্সাম্পল.m3u',
    type: 'm3u',
    enabled: true,
  },
  {
    id: 'ex-m3u-5',
    name: 'Example M3U 5',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/refs/heads/main/এক্সাম্পল.m3u',
    type: 'm3u',
    enabled: true,
  },
  {
    id: 'ex-json-1',
    name: 'Example JSON 1',
    url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/এক্সাম্পল.json',
    type: 'json',
    enabled: true,
  },
  {
    id: 'ex-json-2',
    name: 'Example JSON 2',
    url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/এক্সাম্পল.json',
    type: 'json',
    enabled: true,
  },
  {
    id: 'ex-json-3',
    name: 'Example JSON 3',
    url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/এক্সাম্পল.json',
    type: 'json',
    enabled: true,
  },
  {
    id: 'ex-json-4',
    name: 'Example JSON 4',
    url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/এক্সাম্পল.json',
    type: 'json',
    enabled: true,
  },
  {
    id: 'ex-json-5',
    name: 'Example JSON 5',
    url: 'https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/refs/heads/main/এক্সাম্পল.json',
    type: 'json',
    enabled: true,
  },
];

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sources Management with localStorage persistence
  const [playlistSources, setPlaylistSources] = useState<PlaylistSource[]>(() => {
    try {
      const saved = localStorage.getItem('iptv_playlist_sources');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load sources from localStorage', e);
    }
    return DEFAULT_SOURCES;
  });

  // Save to localStorage when sources change
  useEffect(() => {
    try {
      localStorage.setItem('iptv_playlist_sources', JSON.stringify(playlistSources));
    } catch (e) {
      console.error('Failed to save sources to localStorage', e);
    }
  }, [playlistSources]);

  // Stats
  const [stats, setStats] = useState<PlaylistStats>({
    total: 0,
    working: 0,
    dead: 0,
    checking: 0,
    lastUpdated: null,
  });

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'working' | 'dead'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'responseTime'>('status');

  // Modals
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isGithubGuideOpen, setIsGithubGuideOpen] = useState<boolean>(false);
  const [isSourceManagerOpen, setIsSourceManagerOpen] = useState<boolean>(false);

  // Initial Fetch & Health Check on Load
  useEffect(() => {
    loadPlaylistsAndCheck(playlistSources);
  }, []);

  const loadPlaylistsAndCheck = async (sourcesToFetch = playlistSources) => {
    try {
      setIsFetching(true);
      setError(null);

      const activeSources = sourcesToFetch.filter((s) => s.enabled);
      if (activeSources.length === 0) {
        setIsFetching(false);
        setError('কোনো অ্যাক্টিভ প্লেলিস্ট নির্বাচন করা নেই। প্লেলিস্ট যুক্ত বা এনাবল করুন।');
        setChannels([]);
        return;
      }

      // 1. Fetch channel lists from backend
      const fetchRes = await fetch('/api/playlists/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: activeSources }),
      });

      const fetchResult = await fetchRes.json();
      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch channels');
      }

      const initialChannels: Channel[] = fetchResult.channels;
      setChannels(initialChannels);
      setStats({
        total: initialChannels.length,
        working: 0,
        dead: 0,
        checking: initialChannels.length,
        lastUpdated: null,
      });

      setIsFetching(false);

      // 2. Automatically trigger stream probe checks
      if (initialChannels.length > 0) {
        runStreamProbe(initialChannels);
      }
    } catch (err: any) {
      setIsFetching(false);
      setError(err.message || 'Error loading IPTV playlists');
    }
  };

  const handleAddSource = (newSource: Omit<PlaylistSource, 'id'>) => {
    const created: PlaylistSource = {
      ...newSource,
      id: 'custom-' + Date.now(),
    };
    setPlaylistSources((prev) => [...prev, created]);
  };

  const handleRemoveSource = (id: string) => {
    setPlaylistSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleSource = (id: string) => {
    setPlaylistSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const runStreamProbe = async (targetChannels: Channel[]) => {
    try {
      setIsChecking(true);
      const probeRes = await fetch('/api/playlists/check-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: targetChannels }),
      });

      const probeResult = await probeRes.json();
      if (probeResult.success) {
        setChannels(probeResult.channels);
        setStats(probeResult.stats);
      }
    } catch (err: any) {
      console.error('Error probing streams:', err);
    } finally {
      setIsChecking(false);
    }
  };

  // Manual re-check trigger
  const handleManualRefresh = () => {
    if (isChecking) return;
    loadPlaylistsAndCheck();
  };

  // Check single channel
  const handleCheckSingleChannel = async (channel: Channel) => {
    try {
      const res = await fetch('/api/channel/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: channel.url }),
      });
      const data = await res.json();
      if (data.success) {
        setChannels((prev) =>
          prev.map((c) =>
            c.id === channel.id
              ? {
                  ...c,
                  status: data.status,
                  httpCode: data.httpCode,
                  responseTimeMs: data.responseTimeMs,
                  errorReason: data.errorReason,
                  lastChecked: data.lastChecked,
                }
              : c
          )
        );

        // Update stats summary
        setStats((prev) => {
          const updated = channels.map((c) => (c.id === channel.id ? { ...c, status: data.status } : c));
          return {
            ...prev,
            working: updated.filter((c) => c.status === 'working').length,
            dead: updated.filter((c) => c.status === 'dead').length,
          };
        });
      }
    } catch (err) {
      console.error('Failed to probe single channel:', err);
    }
  };

  // Unique groups
  const groups = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => {
      if (c.group) set.add(c.group);
    });
    return Array.from(set).sort();
  }, [channels]);

  // Filtered & Sorted channels
  const filteredChannels = useMemo(() => {
    return channels
      .filter((c) => {
        // Search query
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const nameMatch = c.name.toLowerCase().includes(q);
          const groupMatch = c.group.toLowerCase().includes(q);
          if (!nameMatch && !groupMatch) return false;
        }

        // Status filter
        if (statusFilter === 'working' && c.status !== 'working') return false;
        if (statusFilter === 'dead' && c.status !== 'dead') return false;

        // Group filter
        if (selectedGroup !== 'ALL' && c.group !== selectedGroup) return false;

        // Source filter
        if (selectedSource !== 'ALL' && c.source !== selectedSource) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'status') {
          // Working first
          if (a.status === 'working' && b.status !== 'working') return -1;
          if (a.status !== 'working' && b.status === 'working') return 1;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'responseTime') {
          const timeA = a.responseTimeMs || 99999;
          const timeB = b.responseTimeMs || 99999;
          return timeA - timeB;
        }
        return 0;
      });
  }, [channels, searchQuery, statusFilter, selectedGroup, selectedSource, sortBy]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <Header
        onRefresh={() => loadPlaylistsAndCheck(playlistSources)}
        isChecking={isChecking || isFetching}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenGithubGuide={() => setIsGithubGuideOpen(true)}
        onOpenSourceManager={() => setIsSourceManagerOpen(true)}
        workingCount={stats.working}
        totalCount={stats.total}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats Summary */}
        <StatsOverview
          stats={stats}
          isChecking={isChecking || isFetching}
          onRefresh={() => loadPlaylistsAndCheck(playlistSources)}
          sources={playlistSources}
          onOpenSourceManager={() => setIsSourceManagerOpen(true)}
        />

        {/* Filter & Search Bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedGroup={selectedGroup}
          onGroupChange={setSelectedGroup}
          groups={groups}
          selectedSource={selectedSource}
          onSourceChange={setSelectedSource}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortBy={sortBy}
          onSortChange={setSortBy}
          totalFiltered={filteredChannels.length}
        />

        {/* Loading Spinner */}
        {isFetching && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>
              <h3 className="font-bold text-slate-200 text-lg">
                প্লেলিস্ট ফেচ করা হচ্ছে...
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                সংযুক্ত প্লেলিস্ট সোর্সসমূহ থেকে চ্যানেলগুলো লোড করা হচ্ছে
              </p>
            </div>
          </div>
        )}

        {/* Checking Stream Bar Indicator */}
        {!isFetching && isChecking && (
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center justify-between animate-pulse">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              <span>
                লাইভ ব্যাকএন্ড প্রব জবের মাধ্যমে সকল চ্যানেলগুলোর ডাইরেক্ট হেলথ চেক করা হচ্ছে...
              </span>
            </div>
            <span className="font-mono text-emerald-400 font-bold">
              {stats.working} 🟢 সচল / {stats.dead} ❌ বন্ধ
            </span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-rose-950/30 border border-rose-500/40 rounded-2xl p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h3 className="font-bold text-rose-200">{error}</h3>
            <button
              onClick={() => loadPlaylistsAndCheck(playlistSources)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
            >
              পুনরায় চেষ্টা করুন
            </button>
          </div>
        )}

        {/* Channels Content Grid/List */}
        {!isFetching && !error && (
          <div>
            {filteredChannels.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <Radio className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="font-bold text-slate-300 text-base">কোনো চ্যানেল পাওয়া যায়নি</h3>
                <p className="text-xs text-slate-500">
                  আপনার ফিল্টার বা সার্চ কুয়েরি পরিবর্তন করে দেখুন।
                </p>
              </div>
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                    : 'space-y-3.5'
                }
              >
                {filteredChannels.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    viewMode={viewMode}
                    onPlay={(ch) => setSelectedChannel(ch)}
                    onCheckSingle={handleCheckSingleChannel}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Video Player Modal */}
      <VideoPlayerModal
        channel={selectedChannel}
        onClose={() => setSelectedChannel(null)}
      />

      {/* Source Manager Modal */}
      <SourceManagerModal
        isOpen={isSourceManagerOpen}
        onClose={() => setIsSourceManagerOpen(false)}
        sources={playlistSources}
        onAddSource={handleAddSource}
        onRemoveSource={handleRemoveSource}
        onToggleSource={handleToggleSource}
        onApplyAndFetch={() => loadPlaylistsAndCheck(playlistSources)}
      />

      {/* Export Playlist Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        workingCount={stats.working}
        totalCount={stats.total}
      />

      {/* GitHub Action Guide Modal */}
      <GitHubGuideModal
        isOpen={isGithubGuideOpen}
        onClose={() => setIsGithubGuideOpen(false)}
      />
    </div>
  );
}
