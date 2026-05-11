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

  // Actions
  loadFeeds: () => Promise<void>;
  loadGroups: () => Promise<void>;
  loadSettings: () => Promise<void>;
  setFilter: (filter: Filter) => void;
  setSelectedArticle: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSidebarOpen: (open: boolean) => void;

  refreshFeed: (feedId: string) => Promise<void>;
  deleteFeed: (feedId: string) => Promise<void>;
  addFeed: (url: string, title?: string, groupId?: string) => Promise<void>;
  updateFeed: (id: string, data: Partial<Feed>) => Promise<void>;

  createGroup: (name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  updateGroup: (id: string, data: Partial<Group>) => Promise<void>;

  updateSettings: (data: Partial<Settings>) => Promise<void>;

  markArticleRead: (id: string, isRead?: boolean) => Promise<void>;
  toggleStar: (id: string) => Promise<{ isStarred: boolean }>;
  toggleReadLater: (id: string) => Promise<{ isReadLater: boolean }>;
  markAllRead: (params?: { feedId?: string; groupId?: string }) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  feeds: [],
  groups: [],
  settings: null,
  filter: { type: 'all' },
  selectedArticleId: null,
  searchQuery: '',
  sidebarOpen: typeof window !== "undefined" && window.innerWidth >= 1024,

  loadFeeds: async () => {
    const feeds = await api.getFeeds();
    set({ feeds });
  },

  loadGroups: async () => {
    const groups = await api.getGroups();
    set({ groups });
  },

  loadSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
    applyTheme(settings.theme);
    applyFontSettings(settings.fontSize, settings.lineHeight);
  },

  setFilter: (filter) => set({ filter, selectedArticleId: null }),
  setSelectedArticle: (id) => set({ selectedArticleId: id }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  refreshFeed: async (feedId) => {
    await api.refreshFeed(feedId);
    await get().loadFeeds();
  },

  deleteFeed: async (feedId) => {
    await api.deleteFeed(feedId);
    set((s) => ({ feeds: s.feeds.filter((f) => f.id !== feedId) }));
    if (get().filter.feedId === feedId) set({ filter: { type: 'all' } });
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
    if (get().filter.groupId === id) set({ filter: { type: 'all' } });
    await get().loadFeeds(); // feeds 可能改变 groupId
  },

  updateGroup: async (id, data) => {
    const updated = await api.updateGroup(id, data);
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...updated } : g)) }));
  },

  updateSettings: async (data) => {
    const updated = await api.updateSettings(data);
    set({ settings: updated });
    applyTheme(updated.theme);
    applyFontSettings(updated.fontSize, updated.lineHeight);
  },

  markArticleRead: async (id, isRead = true) => {
    await api.markRead(id, isRead);
    if (isRead) {
      set((s) => ({
        feeds: s.feeds.map((f) => {
          return { ...f }; // 重新加载才准确，这里仅触发重渲
        }),
      }));
    }
  },

  toggleStar: async (id) => {
    return api.toggleStar(id);
  },

  toggleReadLater: async (id) => {
    return api.toggleReadLater(id);
  },

  markAllRead: async (params) => {
    await api.markAllRead(params);
    await get().loadFeeds();
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
}

function applyFontSettings(fontSize: string, lineHeight: string) {
  const root = document.documentElement;
  root.style.setProperty('--font-size', `${fontSize}px`);
  root.style.setProperty('--line-height', lineHeight);
}
