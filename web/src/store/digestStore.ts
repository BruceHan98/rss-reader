import { create } from 'zustand';
import { api, ApiError, type DigestResult } from '../lib/api';

export type DigestStatus = 'idle' | 'loading' | 'not_generated' | 'generating' | 'ready' | 'error';

export interface DigestEntry {
  status: DigestStatus;
  data?: DigestResult;
  error?: { message: string; code?: string };
  articleCount?: number; // NOT_GENERATED 状态下当天的文章数，用于展示确认提示
  progress?: number; // 0-100，生成中的模拟进度（无法拿到真实 LLM 流式进度，用于提升等待体验）
}

interface DigestStoreState {
  // 按日期（YYYY-MM-DD）独立存储状态，保证切换日期查看/多个日期同时生成互不阻塞
  entries: Record<string, DigestEntry>;
  // 按月份（YYYY-MM）缓存已生成日报的日期列表，供日历标记
  generatedDates: Record<string, string[]>;

  getEntry: (date: string) => DigestEntry;
  fetchDigest: (date: string) => Promise<void>;
  generateDigest: (date: string, force?: boolean) => Promise<void>;
  fetchGeneratedDates: (month: string) => Promise<void>;
}

const DEFAULT_ENTRY: DigestEntry = { status: 'idle' };

// 模拟进度条：LLM 生成通常耗时 10~40s，无法拿到真实流式进度，
// 用分段递增模拟"稳步推进"的观感，最多推进到 90%，剩余 10% 留给真正完成时一次性跳到 100%
function startFakeProgress(onUpdate: (progress: number) => void): () => void {
  let progress = 0;
  const timer = setInterval(() => {
    // 越接近 90% 增速越慢，避免"卡住不动"的错觉，也避免过早到达 100%
    const step = progress < 40 ? 8 : progress < 70 ? 4 : progress < 88 ? 1.5 : 0.3;
    progress = Math.min(90, progress + step);
    onUpdate(progress);
  }, 500);
  return () => clearInterval(timer);
}

export const useDigestStore = create<DigestStoreState>((set, get) => ({
  entries: {},
  generatedDates: {},

  getEntry: (date) => get().entries[date] ?? DEFAULT_ENTRY,

  // 仅读取缓存，不触发生成；每个日期独立更新，不影响其他日期的展示状态
  fetchDigest: async (date) => {
    set((s) => ({ entries: { ...s.entries, [date]: { status: 'loading' } } }));
    try {
      const data = await api.getDigest(date);
      set((s) => ({ entries: { ...s.entries, [date]: { status: 'ready', data } } }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_GENERATED') {
        set((s) => ({
          entries: { ...s.entries, [date]: { status: 'not_generated', articleCount: err.articleCount ?? 0 } },
        }));
      } else if (err instanceof ApiError) {
        set((s) => ({ entries: { ...s.entries, [date]: { status: 'error', error: { message: err.message, code: err.code } } } }));
      } else {
        set((s) => ({ entries: { ...s.entries, [date]: { status: 'error', error: { message: '加载失败，请重试' } } } }));
      }
    }
  },

  // 后台生成指定日期日报，不影响其他日期的状态；同一时间可对多个日期分别调用
  generateDigest: async (date, force = false) => {
    set((s) => ({ entries: { ...s.entries, [date]: { status: 'generating', progress: 0 } } }));
    const stopProgress = startFakeProgress((progress) => {
      set((s) => {
        const cur = s.entries[date];
        if (!cur || cur.status !== 'generating') return s; // 已完成/已切走，停止更新
        return { entries: { ...s.entries, [date]: { ...cur, progress } } };
      });
    });
    try {
      const data = await api.getDigest(date, force ? { force: true } : { generate: true });
      set((s) => ({ entries: { ...s.entries, [date]: { status: 'ready', data, progress: 100 } } }));
      // 生成成功后，若该月的日历标记已加载过，直接把这天追加进去，日历上能立即显示标记
      const month = date.slice(0, 7);
      set((s) => {
        const list = s.generatedDates[month];
        if (!list || list.includes(date)) return s;
        return { generatedDates: { ...s.generatedDates, [month]: [...list, date].sort() } };
      });
    } catch (err) {
      const error = err instanceof ApiError ? { message: err.message, code: err.code } : { message: '生成失败，请重试' };
      set((s) => ({ entries: { ...s.entries, [date]: { status: 'error', error } } }));
    } finally {
      stopProgress();
    }
  },

  fetchGeneratedDates: async (month) => {
    try {
      const { dates } = await api.getDigestDates(month);
      set((s) => ({ generatedDates: { ...s.generatedDates, [month]: dates } }));
    } catch {
      // 日历标记加载失败不影响主流程，静默忽略
    }
  },
}));
