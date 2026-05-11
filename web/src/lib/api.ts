export interface Feed {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  favicon: string | null;
  groupId: string | null;
  lastFetchedAt: string | null;
  fetchInterval: number;
  errorCount: number;
  createdAt: string;
  unreadCount: number;
}

export interface Group {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Article {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  summary: string | null;
  content: string | null;
  author: string | null;
  url: string | null;
  publishedAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  isReadLater: boolean;
  aiScore: number | null;
  aiTags: string[] | null;
  createdAt: string;
  feed_title?: string;
  feed_favicon?: string | null;
}

export type AiJobType = 'score' | 'tags' | 'all';

export interface AiJobStatus {
  status: 'running' | 'idle';
  jobId: string | null;
  total: number;
  processed: number;
  currentTitle: string;
}

export interface AiStatus {
  score: AiJobStatus;
  tags: AiJobStatus;
}

export interface AiTag {
  tag: string;
  count: number;
}

export interface ArticleList {
  articles: Article[];
  total: number;
  page: number;
  limit: number;
}

export interface Settings {
  fetchInterval: string;
  fetchScheduleMode: string;   // 'interval' | 'times'
  fetchScheduleTimes: string;  // 逗号分隔的小时列表，如 "8,12,18"
  retentionDays: string;
  theme: string;
  fontSize: string;
  lineHeight: string;
  aiEnabled: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiMinScore: string;
  aiTokensUsed: string;
  autoAiAfterFetch: string;
}

const BASE = '/api';

// 全局 401 回调，由 App.tsx 注入
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { ...options, headers, credentials: 'include' });
  if (res.status === 401) {
    onUnauthorized?.();
    const err = await res.json().catch(() => ({ error: '未登录' }));
    throw new Error(err.error || '未登录');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Groups
  getGroups: () => request<Group[]>('/feeds/groups'),
  createGroup: (name: string) => request<Group>('/feeds/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  updateGroup: (id: string, data: Partial<Group>) =>
    request<Group>(`/feeds/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id: string) => request<void>(`/feeds/groups/${id}`, { method: 'DELETE' }),

  // Feeds
  getFeeds: () => request<Feed[]>('/feeds'),
  addFeed: (data: { url: string; title?: string; groupId?: string; fetchInterval?: number }) =>
    request<Feed>('/feeds', { method: 'POST', body: JSON.stringify(data) }),
  updateFeed: (id: string, data: Partial<Feed>) =>
    request<Feed>(`/feeds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFeed: (id: string) => request<void>(`/feeds/${id}`, { method: 'DELETE' }),
  refreshFeed: (id: string) =>
    request<{ newArticles: number; error?: string }>(`/feeds/${id}/refresh`, { method: 'POST' }),
  refreshAll: () =>
    request<{ newArticles: number; total: number }>('/feeds/refresh-all', { method: 'POST' }),

  // Articles
  getArticles: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return request<ArticleList>(`/articles?${q}`);
  },
  getArticle: (id: string) => request<Article>(`/articles/${id}`),
  markRead: (id: string, isRead = true) =>
    request<void>(`/articles/${id}/read`, { method: 'PUT', body: JSON.stringify({ isRead }) }),
  toggleStar: (id: string) => request<{ isStarred: boolean }>(`/articles/${id}/star`, { method: 'PUT' }),
  toggleReadLater: (id: string) =>
    request<{ isReadLater: boolean }>(`/articles/${id}/read-later`, { method: 'PUT' }),
  markAllRead: (params?: { feedId?: string; groupId?: string }) =>
    request<void>('/articles/mark-all-read', { method: 'POST', body: JSON.stringify(params || {}) }),

  // Search
  search: (params: { q: string; from?: string; to?: string; feedId?: string; isRead?: string }) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v!])
    ).toString();
    return request<{ results: Article[]; total: number }>(`/search?${q}`);
  },

  // Settings
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (data: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  cleanup: (preview?: boolean) =>
    request<{ deleted?: number; wouldDelete?: number; preview?: boolean; message?: string }>(
      '/cleanup',
      { method: 'POST', body: JSON.stringify({ preview }) }
    ),

  // AI
  aiAnalyze: (type: AiJobType, feedId?: string, groupId?: string) =>
    request<{ jobId: string }>('/ai/analyze', { method: 'POST', body: JSON.stringify({ type, feedId, groupId }) }),
  getAiStatus: () => request<AiStatus>('/ai/status'),
  cancelAiJob: (jobId: string) =>
    request<{ cancelled: boolean; processed: number }>(`/ai/analyze/${jobId}`, { method: 'DELETE' }),
  getAiTags: () => request<{ tags: AiTag[] }>('/ai/tags'),
  aiTest: () => request<{ ok: boolean; error?: string }>('/ai/test', { method: 'POST' }),

  // OPML
  importOpml: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(BASE + '/opml/import', { method: 'POST', body: fd, credentials: 'include' }).then((r) => r.json());
  },
  exportOpml: () => {
    window.location.href = BASE + '/opml/export';
  },

  // Auth
  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ userId: string; username: string }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
