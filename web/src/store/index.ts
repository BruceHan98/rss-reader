import { create } from 'zustand';
import { api, type Feed, type Group, type Article, type Settings } from '../lib/api';

interface Filter {
  type: 'all' | 'feed' | 'group' | 'starred' | 'read-later' | 'unread';
  feedId?: string;
  groupId?: string;
}

interface AppState {
  // Data
  feeds: Feed[];
  groups: Group[];
  settings: Settings | null;

  // UI state
  filter: Filter;
  selectedArticleId: string | null;
  searchQuery: string;
  sidebarOpen: boolean;
  immersiveMode: boolean;

  // Actions
  loadFeeds: () => Promise<void>;
  loadGroups: () => Promise<void>;
  loadSettings: () => Promise<void>;
  setFilter: (filter: Filter) => void;
  setSelectedArticle: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setImmersiveMode: (v: boolean) => void;

  // 已保存的 filter 可能指向已删除的订阅源/分组，feeds 加载后校验并回退到「全部」
  validateSavedFilter: () => void;

  refreshFeed: (feedId: string) => Promise<void>;
  deleteFeed: (feedId: string) => Promise<void>;
  addFeed: (url: string, title?: string, groupId?: string) => Promise<void>;
  updateFeed: (id: string, data: Partial<Feed>) => Promise<void>;

  createGroup: (name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  updateGroup: (id: string, data: Partial<Group>) => Promise<void>;

  updateSettings: (data: Partial<Settings>) => Promise<void>;

  markArticleRead: (id: string, isRead?: boolean, feedId?: string, opened?: boolean) => Promise<void>;
  toggleStar: (id: string) => Promise<{ isStarred: boolean }>;
  toggleReadLater: (id: string) => Promise<{ isReadLater: boolean }>;
  markAllRead: (params?: { feedId?: string; groupId?: string; olderThanDays?: number }) => Promise<number>;
}

function loadFilterFromSession(): Filter {
  try {
    const raw = localStorage.getItem('rss-filter');
    if (raw) {
      const parsed = JSON.parse(raw) as Filter;
      if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') return parsed;
    }
  } catch {}
  return { type: 'all' };
}

function saveFilterToSession(filter: Filter) {
  try {
    localStorage.setItem('rss-filter', JSON.stringify(filter));
  } catch {}
}

// groups 是否已完成首次加载：validateSavedFilter 依赖它避免竞态误判
// （loadFeeds 与 loadGroups 并行，若 groups 尚未返回，分组筛选会被误判无效重置为全部）
let groupsLoadedOnce = false;

export const useStore = create<AppState>((set, get) => ({
  feeds: [],
  groups: [],
  settings: null,
  filter: loadFilterFromSession(),
  selectedArticleId: null,
  searchQuery: '',
  sidebarOpen: typeof window !== "undefined" && window.innerWidth >= 1024,
  immersiveMode: false,

  loadFeeds: async () => {
    const feeds = await api.getFeeds();
    set({ feeds });
    get().validateSavedFilter();
  },

  loadGroups: async () => {
    const groups = await api.getGroups();
    groupsLoadedOnce = true;
    set({ groups });
    // groups 首次加载后再校验一次，避免 feeds 先到时把有效分组筛选误判为无效
    get().validateSavedFilter();
  },

  loadSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
    applyTheme(settings.theme);
    applyFontSettings(settings.fontSize, settings.lineHeight);
  },

  setFilter: (filter) => { saveFilterToSession(filter); set({ filter, selectedArticleId: null }); },

  validateSavedFilter: () => {
    const { filter, feeds, groups } = get();
    let invalid = false;
    if (filter.type === 'feed' && filter.feedId && !feeds.some((f) => f.id === filter.feedId)) invalid = true;
    // groups 未加载完成时不判分组无效，等 loadGroups 后的二次校验处理
    if (filter.type === 'group' && filter.groupId && groupsLoadedOnce && !groups.some((g) => g.id === filter.groupId)) invalid = true;
    if (invalid) {
      const f = { type: 'all' as const };
      saveFilterToSession(f);
      set({ filter: f });
    }
  },
  setSelectedArticle: (id) => set({ selectedArticleId: id }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setImmersiveMode: (immersiveMode) => set({ immersiveMode }),

  refreshFeed: async (feedId) => {
    await api.refreshFeed(feedId);
    await get().loadFeeds();
  },

  deleteFeed: async (feedId) => {
    await api.deleteFeed(feedId);
    set((s) => ({ feeds: s.feeds.filter((f) => f.id !== feedId) }));
    if (get().filter.feedId === feedId) { const f = { type: 'all' as const }; saveFilterToSession(f); set({ filter: f }); }
  },

  addFeed: async (url, title, groupId) => {
    await api.addFeed({ url, title, groupId });
    await get().loadFeeds();
  },

  updateFeed: async (id, data) => {
    const updated = await api.updateFeed(id, data);
    set((s) => ({ feeds: s.feeds.map((f) => (f.id === id ? { ...f, ...updated } : f)) }));
  },

  createGroup: async (name) => {
    await api.createGroup(name);
    await get().loadGroups();
  },

  deleteGroup: async (id) => {
    await api.deleteGroup(id);
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
    if (get().filter.groupId === id) { const f = { type: 'all' as const }; saveFilterToSession(f); set({ filter: f }); }
    await get().loadFeeds(); // feeds 可能改变 groupId
  },

  updateGroup: async (id, data) => {
    const updated = await api.updateGroup(id, data);
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...updated } : g)) }));
  },

  updateSettings: async (data) => {
    const updated = await api.updateSettings(data);
    applyTheme(updated.theme);
    applyFontSettings(updated.fontSize, updated.lineHeight);
    set({ settings: updated });
  },

  markArticleRead: async (id, isRead = true, feedId?: string, opened = false) => {
    if (feedId) {
      // Optimistically update unreadCount before the API call
      set((s) => ({
        feeds: s.feeds.map((f) =>
          f.id === feedId
            ? { ...f, unreadCount: Math.max(0, f.unreadCount + (isRead ? -1 : 1)) }
            : f
        ),
      }));
    }
    try {
      await api.markRead(id, isRead, opened);
    } catch (err) {
      // Roll back optimistic update on failure
      if (feedId) {
        set((s) => ({
          feeds: s.feeds.map((f) =>
            f.id === feedId
              ? { ...f, unreadCount: Math.max(0, f.unreadCount + (isRead ? 1 : -1)) }
              : f
          ),
        }));
      }
      throw err;
    }
  },

  toggleStar: async (id) => {
    return api.toggleStar(id);
  },

  toggleReadLater: async (id) => {
    return api.toggleReadLater(id);
  },

  markAllRead: async (params) => {
    const { count } = await api.markAllRead(params);
    await get().loadFeeds();
    return count;
  },
}));

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // auto
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
  const isDark = root.classList.contains('dark');
  root.style.colorScheme = isDark ? 'dark' : 'light';
  const background = getComputedStyle(root).getPropertyValue('--color-bg-card').trim() || (isDark ? '#202124' : '#FFFFFF');
  // auto 保留两组媒体主题色，系统可直接切换；手动主题让两组都使用选定颜色。
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = theme === 'auto'
      ? (meta.media.includes('dark') ? '#202124' : '#FFFFFF')
      : background;
  });
  localStorage.setItem('rss-theme', theme);
}

function syncTheme() {
  applyTheme(useStore.getState().settings?.theme || localStorage.getItem('rss-theme') || 'auto');
}

syncTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
// iOS 挂起期间可能未触发媒体变化事件，恢复显示时按当前系统主题重新同步。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncTheme();
});
window.addEventListener('pageshow', syncTheme);
window.addEventListener('focus', syncTheme);

function applyFontSettings(fontSize: string, lineHeight: string) {
  const root = document.documentElement;
  root.style.setProperty('--font-size', `${fontSize}px`);
  root.style.setProperty('--line-height', lineHeight);
}
