import { create } from 'zustand';
import { api, ApiError, type DigestProgressStage, type DigestResult } from '../lib/api';

export type DigestStatus = 'idle' | 'loading' | 'not_generated' | 'generating' | 'ready' | 'error';

export interface DigestEntry {
  status: DigestStatus;
  data?: DigestResult;
  error?: { message: string; code?: string };
  articleCount?: number;
  progress?: number;
  stage?: DigestProgressStage | null;
}

interface DigestStoreState {
  entries: Record<string, DigestEntry>;
  generatedDates: Record<string, string[]>;
  getEntry: (date: string) => DigestEntry;
  fetchDigest: (date: string) => Promise<void>;
  generateDigest: (date: string, force?: boolean) => Promise<void>;
  fetchGeneratedDates: (month: string) => Promise<void>;
}

const DEFAULT_ENTRY: DigestEntry = { status: 'idle' };
const POLL_INTERVAL_MS = 1_000;

function updateEntry(date: string, entry: DigestEntry) {
  return (state: DigestStoreState) => ({ entries: { ...state.entries, [date]: entry } });
}

export const useDigestStore = create<DigestStoreState>((set, get) => ({
  entries: {},
  generatedDates: {},

  getEntry: (date) => get().entries[date] ?? DEFAULT_ENTRY,

  fetchDigest: async (date) => {
    set(updateEntry(date, { status: 'loading' }));
    try {
      const data = await api.getDigest(date);
      set(updateEntry(date, { status: 'ready', data }));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_GENERATED') {
        set(updateEntry(date, { status: 'not_generated', articleCount: error.articleCount ?? 0 }));
      } else if (error instanceof ApiError) {
        set(updateEntry(date, { status: 'error', error: { message: error.message, code: error.code } }));
      } else {
        set(updateEntry(date, { status: 'error', error: { message: '加载失败，请重试' } }));
      }
    }
  },

  generateDigest: async (date, force = false) => {
    try {
      const initial = await api.startDigestGeneration(date, force);
      if (initial.status === 'ready' && initial.result) {
        set(updateEntry(date, { status: 'ready', data: initial.result, progress: 100, stage: 'completed' }));
        return;
      }

      set(updateEntry(date, { status: 'generating', progress: initial.progress, stage: initial.stage }));
      while (true) {
        const status = await api.getDigestGenerationStatus(date);
        if (status.status === 'generating') {
          set(updateEntry(date, { status: 'generating', progress: status.progress, stage: status.stage }));
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          continue;
        }
        if (status.status === 'ready' && status.result) {
          set(updateEntry(date, { status: 'ready', data: status.result, progress: 100, stage: 'completed' }));
          const month = date.slice(0, 7);
          set((state) => {
            const dates = state.generatedDates[month];
            if (!dates || dates.includes(date)) return state;
            return { generatedDates: { ...state.generatedDates, [month]: [...dates, date].sort() } };
          });
          return;
        }
        const error = status.error ?? { message: '生成失败，请重试' };
        set(updateEntry(date, { status: 'error', error }));
        return;
      }
    } catch (error) {
      const entryError = error instanceof ApiError
        ? { message: error.message, code: error.code }
        : { message: '生成失败，请重试' };
      set(updateEntry(date, { status: 'error', error: entryError }));
    }
  },

  fetchGeneratedDates: async (month) => {
    try {
      const { dates } = await api.getDigestDates(month);
      set((state) => ({ generatedDates: { ...state.generatedDates, [month]: dates } }));
    } catch {
      // 日历标记加载失败不影响主流程。
    }
  },
}));
