export type ChannelStatus = 'working' | 'dead' | 'checking' | 'unknown';

export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  source: string;
  status: ChannelStatus;
  httpCode?: number;
  responseTimeMs?: number;
  lastChecked?: string;
  errorReason?: string;
}

export interface PlaylistStats {
  total: number;
  working: number;
  dead: number;
  checking: number;
  lastUpdated: string | null;
}

export interface PlaylistSource {
  id: string;
  name: string;
  url: string;
  type: 'm3u' | 'json';
  enabled: boolean;
  isDefault?: boolean;
}

