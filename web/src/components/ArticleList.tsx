import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api, cacheArticle, type Article, type AiTag } from '../lib/api';
import { cn, relativeTime } from '../lib/utils';
import { CheckCheck, Loader2, BookOpen, RefreshCw, Sparkles, Tag, X, Star, Hash, PanelLeft, CheckCircle, AlertCircle, MoreHorizontal, ArrowUp } from 'lucide-react';
import FeedIcon from './FeedIcon';

const PAGE_SIZE = 30;

// ── 持久化辅助：筛选状态、滚动位置、新文章游标 均按 filterKey 隔离存入 localStorage ──

interface SavedListState {
  filter: FilterSaved;
  scrollTops: Record<string, number>;
  newAnchors: Record<string, { date: string; id: string } | null>;
}

interface FilterSaved {
  type: 'all' | 'feed' | 'group' | 'starred' | 'read-later' | 'unread';
  feedId?: string;
  groupId?: string;
  unreadOnly?: boolean; // feed/group 视图下的「只看未读」开关
  minScore?: number;
  tags?: string[];
}

const LIST_STATE_KEY = 'rss-list-state-v1';
function loadListState(): SavedListState | null {
  try {
    const raw = localStorage.getItem(LIST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        filter: parsed.filter ?? { type: 'all' },
        scrollTops: parsed.scrollTops ?? {},
        newAnchors: parsed.newAnchors ?? {},
      };
    }
  } catch {}
  return null;
}

function saveListState(state: Partial<SavedListState>) {
  try {
    const merged = { ...loadListState(), ...state } as SavedListState;
    localStorage.setItem(LIST_STATE_KEY, JSON.stringify(merged));
  } catch {}
}

function filterKeyOf(f: FilterSaved): string {
  if (f.type === 'feed') return `feed:${f.feedId}${f.unreadOnly ? ':unread' : ''}`;
  if (f.type === 'group') return `group:${f.groupId}${f.unreadOnly ? ':unread' : ''}`;
  return f.type;
}

// 读取指定 filterKey 的滚动位置（兼容组件内 filter 类型）
function savedScrollTopFor(f: { type: 'all' | 'feed' | 'group' | 'starred' | 'read-later' | 'unread'; feedId?: string; groupId?: string }, unreadOnly: boolean): number | null {
  return loadListState()?.scrollTops?.[filterKeyOf({ ...f, unreadOnly } as FilterSaved)] ?? null;
}


export default function ArticleList() {
  const {
    filter, settings,
    feeds, groups,
    setSelectedArticle, markArticleRead, markAllRead, loadFeeds, setSidebarOpen, sidebarOpen,
  } = useStore();

  // Keep a ref to filter to avoid stale closures in IntersectionObserver callbacks
  const filterRef = useRef(filter);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  const navigate = useNavigate();
  const location = useLocation();

  // 「滚动自动已读」是否开启
  const markReadOnScroll = settings?.markReadOnScroll === 'true';

  // Unread-only filter (available for feed/group)，从持久化状态恢复
  const [showUnreadOnly, setShowUnreadOnly] = useState(() => {
    return Boolean(loadListState()?.filter?.unreadOnly);
  });
  const showUnreadOnlyRef = useRef(showUnreadOnly);
  useEffect(() => { showUnreadOnlyRef.current = showUnreadOnly; }, [showUnreadOnly]);

  // AI filter state，从持久化状态恢复（与原行为一致：跨筛选器保持）
  const savedFilterState = loadListState()?.filter;
  const [minScore, setMinScore] = useState(savedFilterState?.minScore ?? 0);
  const [selectedTags, setSelectedTags] = useState<string[]>(savedFilterState?.tags ?? []);
  const [allTags, setAllTags] = useState<AiTag[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [showMarkReadMenu, setShowMarkReadMenu] = useState(false);
  const markReadMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aiQuickTrigger, setAiQuickTrigger] = useState<'score' | 'tags' | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── 新文章提示：基于「已看到位置」游标（anchor）统计当前筛选下的新文章数，点击后合并到列表顶部 ──
  const [newCount, setNewCount] = useState(0);
  // anchor 游标：用户已见过的最新文章位置，按 filterKey 持久化
  const anchorRef = useRef<{ date: string; id: string } | null>(null);
  // 防抖 timer
  const newCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persistAnchor() {
    const state = loadListState();
    const key = getFilterKey(filterRef.current, showUnreadOnlyRef.current);
    const anchors = { ...(state?.newAnchors ?? {}) };
    if (anchorRef.current) anchors[key] = anchorRef.current;
    else delete anchors[key];
    saveListState({ newAnchors: anchors });
  }

  function persistFilterState() {
    const f = filterRef.current;
    const saved: FilterSaved = {
      type: f.type,
      ...(f.type === 'feed' ? { feedId: f.feedId } : {}),
      ...(f.type === 'group' ? { groupId: f.groupId } : {}),
      ...(f.type === 'feed' || f.type === 'group' ? { unreadOnly: showUnreadOnlyRef.current } : {}),
      minScore: minScoreRef.current,
      tags: selectedTagsRef.current,
    };
    saveListState({ filter: saved });
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const loaderRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 用于取消过期请求，避免竞态条件
  const abortControllerRef = useRef<AbortController | null>(null);
  // 记录已发起「标为已读」的文章 id，防止 scroll 多次触发导致重复计数
  const scrollReadPendingIds = useRef<Set<string>>(new Set());

  // AI filter refs (to avoid stale closure in loadArticles)
  const minScoreRef = useRef(minScore);
  const selectedTagsRef = useRef(selectedTags);
  useEffect(() => { minScoreRef.current = minScore; }, [minScore]);
  useEffect(() => { selectedTagsRef.current = selectedTags; }, [selectedTags]);

  // articlesRef: 让 IntersectionObserver 闭包始终能读到最新的 articles 状态
  const articlesRef = useRef(articles);
  useEffect(() => { articlesRef.current = articles; }, [articles]);

  // 游标：记录当前列表最后一篇文章的 effectiveDate 和 id，翻页时作为 before/beforeId 参数传给服务端
  // 防止未读列表在用户阅读文章后，OFFSET 偏移导致后续页面文章丢失
  // 联合游标可解决同时间戳多篇文章被跳过的问题
  const cursorRef = useRef<{ date: string; id: string } | null>(null);

  // 各 filter key 对应的 displayTotal 缓存，切换 tab 时先显示缓存值
  const displayTotalCacheRef = useRef<Map<string, number>>(new Map());
  // 各 filter key 对应的第一页文章列表缓存，切换 tab 时先显示缓存，后台静默刷新
  const articleListCacheRef = useRef<Map<string, Article[]>>(new Map());
  function getFilterKey(f: typeof filter, unreadOnly?: boolean): string {
    const u = unreadOnly ?? showUnreadOnlyRef.current;
    if (f.type === 'feed') return `feed:${f.feedId}${u ? ':unread' : ''}`;
    if (f.type === 'group') return `group:${f.groupId}${u ? ':unread' : ''}`;
    return f.type;
  }
  // 减少 displayTotal 并同步到缓存
  function decDisplayTotal() {
    const key = getFilterKey(filterRef.current);
    setDisplayTotal((prev) => {
      const next = Math.max(0, prev - 1);
      displayTotalCacheRef.current.set(key, next);
      return next;
    });
  }

  // Load AI tags list once
  useEffect(() => {
    api.getAiTags().then((r) => setAllTags(r.tags)).catch(() => {});
  }, []);

  // 菜单支持点击外部或 Escape 关闭。
  useEffect(() => {
    if (!showMarkReadMenu && !showTagFilter) return;
    function onDocClick(e: MouseEvent) {
      if (markReadMenuRef.current && !markReadMenuRef.current.contains(e.target as Node)) setShowMarkReadMenu(false);
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node) && !filterButtonRef.current?.contains(e.target as Node)) setShowTagFilter(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (showMarkReadMenu) moreButtonRef.current?.focus();
      else filterButtonRef.current?.focus();
      setShowMarkReadMenu(false);
      setShowTagFilter(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showMarkReadMenu, showTagFilter]);

  // 监听文章被阅读事件，更新本地列表 isRead 状态
  useEffect(() => {
    function onArticleRead(e: Event) {
      const { articleId } = (e as CustomEvent).detail;
      setArticles((prev) => prev.map((a) => a.id === articleId ? { ...a, isRead: true } : a));
      // 同步更新列表缓存中的 isRead 状态，避免切换 filter 时从缓存展示已读的旧数据
      for (const [key, cached] of articleListCacheRef.current.entries()) {
        articleListCacheRef.current.set(key, cached.map((a) => a.id === articleId ? { ...a, isRead: true } : a));
      }
    }
    window.addEventListener('article-read', onArticleRead);
    return () => window.removeEventListener('article-read', onArticleRead);
  }, []);

  // 监听收藏/稍后阅读状态变更事件，同步更新列表中对应文章的状态
  useEffect(() => {
    function onArticleStarred(e: Event) {
      const { articleId, isStarred } = (e as CustomEvent).detail;
      // 始终同步列表内已存在文章的 isStarred 字段
      setArticles((prev) => prev.map((a) => a.id === articleId ? { ...a, isStarred } : a));
      if (filterRef.current.type === 'starred') {
        if (!isStarred) {
          // 取消收藏：从收藏列表移除
          setArticles((prev) => prev.filter((a) => a.id !== articleId));
          setTotal((prev) => Math.max(0, prev - 1));
          setDisplayTotal((prev) => Math.max(0, prev - 1));
        } else {
          // 新增收藏：从后端拉取文章完整数据后插入列表头部
          api.getArticle(articleId).then((article) => {
            setArticles((prev) => {
              if (prev.some((a) => a.id === articleId)) return prev; // 已在列表中，不重复添加
              return [article, ...prev];
            });
            setTotal((prev) => prev + 1);
            setDisplayTotal((prev) => prev + 1);
          }).catch(() => {});
        }
      }
    }
    function onArticleReadLater(e: Event) {
      const { articleId, isReadLater } = (e as CustomEvent).detail;
      // 始终同步列表内已存在文章的 isReadLater 字段
      setArticles((prev) => prev.map((a) => a.id === articleId ? { ...a, isReadLater } : a));
      if (filterRef.current.type === 'read-later') {
        if (!isReadLater) {
          // 取消稍后阅读：从列表移除
          setArticles((prev) => prev.filter((a) => a.id !== articleId));
          setTotal((prev) => Math.max(0, prev - 1));
          setDisplayTotal((prev) => Math.max(0, prev - 1));
        } else {
          // 新增稍后阅读：从后端拉取文章完整数据后插入列表头部
          api.getArticle(articleId).then((article) => {
            setArticles((prev) => {
              if (prev.some((a) => a.id === articleId)) return prev;
              return [article, ...prev];
            });
            setTotal((prev) => prev + 1);
            setDisplayTotal((prev) => prev + 1);
          }).catch(() => {});
        }
      }
    }
    window.addEventListener('article-starred', onArticleStarred);
    window.addEventListener('article-read-later', onArticleReadLater);
    return () => {
      window.removeEventListener('article-starred', onArticleStarred);
      window.removeEventListener('article-read-later', onArticleReadLater);
    };
  }, []);

  // Independent AI job completion polling.
  // After ai-job-started, poll every 2s until done, then refresh article list and tags.
  const aiPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiPollWasRunningRef = useRef(false);
  useEffect(() => {
    function onAiStart() {
      aiPollWasRunningRef.current = true;
      if (aiPollTimerRef.current) clearInterval(aiPollTimerRef.current);
      aiPollTimerRef.current = setInterval(async () => {
        try {
          const s = await api.getAiStatus();
          const nowRunning = s.score.status === 'running' || s.tags.status === 'running';
          if (!nowRunning && aiPollWasRunningRef.current) {
            aiPollWasRunningRef.current = false;
            if (aiPollTimerRef.current) { clearInterval(aiPollTimerRef.current); aiPollTimerRef.current = null; }
            loadArticlesRef.current?.(1, true);
            api.getAiTags().then((r) => setAllTags(r.tags)).catch(() => {});
          } else if (nowRunning) {
            aiPollWasRunningRef.current = true;
          }
        } catch { /* ignore */ }
      }, 2000);
    }
    window.addEventListener('ai-job-started', onAiStart);
    return () => {
      window.removeEventListener('ai-job-started', onAiStart);
      if (aiPollTimerRef.current) clearInterval(aiPollTimerRef.current);
    };
  }, []);

  // Keep a ref to loadArticles so the ai-job-done handler always calls the latest version
  // (avoids stale closure over `filter` state)
  const loadArticlesRef = useRef<(p?: number, reset?: boolean, silent?: boolean, opts?: { advanceAnchor?: boolean; forceRefresh?: boolean }) => Promise<void>>();

  const [loadingNew, setLoadingNew] = useState(false);
  const loadingNewRef = useRef(false);
  useEffect(() => { loadingNewRef.current = loadingNew; }, [loadingNew]);

  // ── 新文章检查：静默统计 anchor 游标之后的新文章数，展示悬浮提示 ──
  // 注意：并发守卫由调用方（loadArticles 拦截分支 / scheduleNewCheck）负责
  async function checkNewArticles() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    try {
      const params: Record<string, string | number | undefined> = { countNew: 'true', after: anchor.date, afterId: anchor.id };
      const f = filterRef.current;
      if (f.type === 'feed') params.feedId = f.feedId;
      if (f.type === 'group') params.groupId = f.groupId;
      if (f.type === 'unread') params.isRead = 'false';
      if ((f.type === 'feed' || f.type === 'group') && showUnreadOnlyRef.current) params.isRead = 'false';
      if (f.type === 'starred') params.isStarred = 'true';
      if (f.type === 'read-later') params.isReadLater = 'true';
      if (minScoreRef.current > 0) params.minScore = minScoreRef.current;
      if (selectedTagsRef.current.length > 0) params.tags = selectedTagsRef.current.join(',');
      const data = await api.getArticles(params);
      setNewCount(data.newCount ?? 0);
    } catch { /* ignore */ }
  }

  function scheduleNewCheck(delay = 3000) {
    if (newCheckTimerRef.current) clearTimeout(newCheckTimerRef.current);
    newCheckTimerRef.current = setTimeout(() => {
      newCheckTimerRef.current = null;
      if (!isFetchingRef.current && !loadingNewRef.current) void checkNewArticles();
    }, delay);
  }

  // 点击悬浮条：拉取 anchor 之后的新文章，合并到列表顶部（Twitter 风格）
  async function handleLoadNew() {
    const anchor = anchorRef.current;
    if (!anchor || loadingNew) return;
    setLoadingNew(true);
    try {
      const params: Record<string, string | number | undefined> = { page: 1, limit: 100, after: anchor.date, afterId: anchor.id };
      const f = filterRef.current;
      if (f.type === 'feed') params.feedId = f.feedId;
      if (f.type === 'group') params.groupId = f.groupId;
      if (f.type === 'unread') params.isRead = 'false';
      if ((f.type === 'feed' || f.type === 'group') && showUnreadOnlyRef.current) params.isRead = 'false';
      if (f.type === 'starred') params.isStarred = 'true';
      if (f.type === 'read-later') params.isReadLater = 'true';
      if (minScoreRef.current > 0) params.minScore = minScoreRef.current;
      if (selectedTagsRef.current.length > 0) params.tags = selectedTagsRef.current.join(',');
      const data = await api.getArticles(params);
      const fresh = data.articles;
      if (fresh.length > 0) {
        setArticles((prev) => {
          const existing = new Set(prev.map((a) => a.id));
          const merged = [...fresh.filter((a) => !existing.has(a.id)), ...prev];
          if (merged.length > 0) {
            const top = merged[0];
            const topDate = top.effectiveDate ?? top.publishedAt;
            if (topDate) anchorRef.current = { date: topDate, id: top.id };
          }
          return merged;
        });
        persistAnchor();
        // 同步计数（total 不含游标条件，为当前筛选的全量数）
        setTotal(data.total);
        setDisplayTotal(data.total);
        const fk = getFilterKey(filterRef.current, showUnreadOnlyRef.current);
        const isDynamic = filterRef.current.type === 'unread' || filterRef.current.type === 'starred' || filterRef.current.type === 'read-later';
        if (!isDynamic) displayTotalCacheRef.current.set(fk, data.total);
      }
      setNewCount(0);
      // 合并后回到顶部展示新文章（Twitter 风格）
      scrollContainerRef.current?.scrollTo({ top: 0 });
      const key = getFilterKey(filterRef.current, showUnreadOnlyRef.current);
      const cache = articleListCacheRef.current.get(key);
      if (cache) {
        const existingIds = new Set(cache.map((a) => a.id));
        articleListCacheRef.current.set(key, [...fresh.filter((a) => !existingIds.has(a.id)), ...cache]);
      }
    } catch { /* ignore */ } finally {
      setLoadingNew(false);
    }
  }

  async function loadArticles(p = 1, reset = false, silent = false, opts?: { advanceAnchor?: boolean; forceRefresh?: boolean }) {
    // 静默刷新且已有 anchor：不重置列表，改为静默检查新文章数（保持阅读位置不跳动）
    // forceRefresh=true（列表在顶部）或 advanceAnchor=false（重启恢复）时仍执行真实刷新
    if (reset && silent && anchorRef.current && opts?.forceRefresh !== true && opts?.advanceAnchor !== false) {
      isFetchingRef.current = true;
      try {
        await checkNewArticles();
      } finally {
        isFetchingRef.current = false;
      }
      return;
    }
    // 取消上一个未完成的请求，防止旧响应覆盖新数据（竞态条件）
    if (reset) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
    }
    const signal = reset ? abortControllerRef.current!.signal : undefined;

    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page: p,
        limit: PAGE_SIZE,
      };
      if (filter.type === 'feed') params.feedId = filter.feedId;
      if (filter.type === 'group') params.groupId = filter.groupId;
      if (filter.type === 'unread') params.isRead = 'false';
      if ((filter.type === 'feed' || filter.type === 'group') && showUnreadOnlyRef.current) params.isRead = 'false';
      if (filter.type === 'starred') params.isStarred = 'true';
      if (filter.type === 'read-later') params.isReadLater = 'true';

      if (minScoreRef.current > 0) params.minScore = minScoreRef.current;
      if (selectedTagsRef.current.length > 0) params.tags = selectedTagsRef.current.join(',');

      // 翻页时使用联合游标（before + beforeId）替代纯 OFFSET 分页
      // 防止已读状态变化导致文章被跳过，同时解决同时间戳文章丢失问题
      if (!reset && p > 1 && cursorRef.current) {
        params.before = cursorRef.current.date;
        params.beforeId = cursorRef.current.id;
        // 游标模式下服务端 offset=0，前端仍用 page 字段记录逻辑页码（但不影响服务端查询）
      }

      const data = await api.getArticles(params, signal);
      setTotal(data.total);
      if (reset) {
        setDisplayTotal(data.total);
        // 动态列表（未读/收藏/稍后阅读）不缓存，避免切换时显示旧数据
        const isDynamic = filter.type === 'unread' || filter.type === 'starred' || filter.type === 'read-later';
        if (!isDynamic) {
          displayTotalCacheRef.current.set(getFilterKey(filter), data.total);
        }
        // 仅对 feed/group/all 缓存第一页结果
        if (p === 1 && !isDynamic) articleListCacheRef.current.set(getFilterKey(filter), data.articles);
      }
      // 更新游标为当前批次最后一篇文章（联合游标）
      if (data.articles.length > 0) {
        const lastArticle = data.articles[data.articles.length - 1];
        const lastDate = lastArticle?.effectiveDate ?? lastArticle?.publishedAt ?? null;
        if (lastDate) cursorRef.current = { date: lastDate, id: lastArticle.id };
        else if (reset) cursorRef.current = null;
      } else if (reset) {
        cursorRef.current = null;
      }
      // reset 时同步更新 anchor（「已看到位置」）：列表最新一篇文章即新文章统计的起点
      // advanceAnchor=false 时保留已有 anchor（如重启恢复：新文章需计入提示而非静默吸收）并触发新文章检查；
      // 无 anchor 时（首次使用）仍需建立，否则新文章检测无从比较
      if (reset && data.articles.length > 0) {
        const firstArticle = data.articles[0];
        const firstDate = firstArticle?.effectiveDate ?? firstArticle?.publishedAt ?? null;
        if (firstDate && (opts?.advanceAnchor !== false || !anchorRef.current)) {
          const changed = !anchorRef.current || anchorRef.current.id !== firstArticle.id;
          anchorRef.current = { date: firstDate, id: firstArticle.id };
          persistAnchor();
          // anchor 前进意味着之前提示的新文章已被看到/吸收，清零悬浮条
          if (changed) setNewCount(0);
        } else if (opts?.advanceAnchor === false) {
          // 保留旧 anchor：检查重启期间新增的文章并提示
          scheduleNewCheck(1500);
        }
      }
      setArticles((prev) => (reset ? data.articles : [...prev, ...data.articles]));
      // hasMore 判断：本次返回文章数等于 limit，说明后面可能还有更多
      // 不使用「累积数量 < total」，因为 total 随用户阅读行为实时减少，会导致提前停止加载
      setHasMore(data.articles.length === data.limit);
      setPage(p);
    } catch (err: any) {
      // 请求被主动取消时不更新状态（新请求正在进行中）
      if (err?.name === 'AbortError') { isFetchingRef.current = false; return; }
      isFetchingRef.current = false;
      if (!silent) setLoading(false);
      throw err;
    }
    isFetchingRef.current = false;
    if (!silent) setLoading(false);
  }
  // Always keep the ref pointing at the latest loadArticles (captures current filter/minScore/tags)
  loadArticlesRef.current = loadArticles;

  // 滚动位置记忆：按 filterKey 保存，切换筛选/重新挂载时恢复
  function persistScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    // 列表容器被隐藏时（移动端点进详情页）scrollTop 会归零，不能把 0 写入覆盖有效位置
    if (el.offsetParent === null) return;
    // 待恢复中（重启恢复尚未完成）：不写，避免覆盖待恢复的目标位置
    if (pendingScrollRestoreRef.current != null) return;
    const state = loadListState();
    const key = getFilterKey(filterRef.current, showUnreadOnlyRef.current);
    const tops = { ...(state?.scrollTops ?? {}) };
    // 滚动在顶部时清除记录，下次从最新开始
    if (el.scrollTop <= 2) delete tops[key];
    else tops[key] = el.scrollTop;
    saveListState({ scrollTops: tops });
  }

  // 重启（首次挂载）：从持久化状态恢复 anchor，并延迟恢复滚动位置
  const isInitialMountRef = useRef(true);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  // 滚动恢复进行中（重启后内容尚未就绪）：隐藏列表避免「先顶部后跳转」的视觉跳动
  const [restoringScroll, setRestoringScroll] = useState(false);

  // Reset showUnreadOnly when switching to a filter that doesn't support it
  useEffect(() => {
    if (filter.type !== 'feed' && filter.type !== 'group') {
      setShowUnreadOnly(false);
      showUnreadOnlyRef.current = false;
    }
  }, [filter]);

  // Reload when filter changes
  useEffect(() => {
    const key = getFilterKey(filter, false);
    const cachedTotal = displayTotalCacheRef.current.get(key) ?? 0;
    const cachedArticles = articleListCacheRef.current.get(key);

    setTotal(cachedTotal);
    setDisplayTotal(cachedTotal);
    setHasMore(false);
    setPage(1);
    setNewCount(0);
    scrollReadPendingIds.current.clear(); // 清除旧 tab 的已读记录，防止 id 污染新 tab

    // 从持久化状态恢复该 filterKey 的 anchor（新文章游标）
    const savedAnchor = loadListState()?.newAnchors?.[getFilterKey(filter, showUnreadOnlyRef.current)] ?? null;
    anchorRef.current = savedAnchor;

    const wasInitialMount = isInitialMountRef.current;
    if (wasInitialMount) {
      isInitialMountRef.current = false;
      // 重启恢复：不回顶，待首屏文章加载后恢复到上次阅读位置
      pendingScrollRestoreRef.current = savedScrollTopFor(filter, showUnreadOnlyRef.current);
      // 恢复未完成前隐藏列表，避免「先顶部后跳转」的视觉跳动
      if (pendingScrollRestoreRef.current != null) setRestoringScroll(true);
      scrollContainerRef.current?.scrollTo({ top: 0 });
    } else {
      // 切换筛选：取消未完成的滚动恢复，回顶
      pendingScrollRestoreRef.current = null;
      scrollContainerRef.current?.scrollTo({ top: 0 });
    }

    persistFilterState();

    // 重启首装：保留已保存的 anchor，使停用期间新增的文章以悬浮条提示而非静默吸收
    const initialOpts = wasInitialMount && anchorRef.current ? { advanceAnchor: false } : undefined;

    // 未读/收藏/稍后阅读等动态列表不使用缓存（内容随时变化，缓存会导致数字和实际不一致）
    const isDynamicFilter = filter.type === 'unread' || filter.type === 'starred' || filter.type === 'read-later';
    if (cachedArticles && !showUnreadOnlyRef.current && !isDynamicFilter) {
      // 命中缓存（仅 feed/group/all 类型）：立即展示旧数据，后台静默刷新
      setArticles(cachedArticles);
      setHasMore(cachedTotal > cachedArticles.length);
      loadArticles(1, true, true, initialOpts);
    } else {
      // 动态列表或无缓存：始终重新加载，确保数据准确
      setArticles([]);
      loadArticles(1, true, false, initialOpts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Reload when showUnreadOnly changes
  const isFirstUnreadOnlyRunRef = useRef(true);
  useEffect(() => {
    if (isFirstUnreadOnlyRunRef.current) {
      isFirstUnreadOnlyRunRef.current = false;
      return;
    }
    setTotal(0);
    setDisplayTotal(0);
    setHasMore(false);
    setPage(1);
    setNewCount(0);
    // 切换未读筛选后恢复对应 filterKey 的 anchor，并持久化筛选状态
    anchorRef.current = loadListState()?.newAnchors?.[getFilterKey(filterRef.current, showUnreadOnly)] ?? null;
    persistFilterState();
    // 切换未读筛选后，重新加载
    loadArticles(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUnreadOnly]);

  // Reload when AI filters change (skip first mount run)
  const isFirstAiFilterRunRef = useRef(true);
  useEffect(() => {
    if (isFirstAiFilterRunRef.current) {
      isFirstAiFilterRunRef.current = false;
      return;
    }
    setTotal(0);
    setDisplayTotal(0);
    setHasMore(false);
    setPage(1);
    // AI 筛选条件变化后，缓存的第一页结果已失效，清除
    articleListCacheRef.current.delete(getFilterKey(filterRef.current));
    persistFilterState();
    loadArticles(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScore, selectedTags]);

  // Reload article list after AI job finishes
  useEffect(() => {
    function onAiDone() {
      setPage(1);
      loadArticlesRef.current?.(1, true);
      api.getAiTags().then((r) => setAllTags(r.tags)).catch(() => {});
    }
    window.addEventListener('ai-job-done', onAiDone);
    return () => window.removeEventListener('ai-job-done', onAiDone);
  }, []);

  // ── 滚动：节流保存位置；文章列表变化后执行待恢复的滚动位置 ──
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function onScroll() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        persistScroll();
      }, 500);
    }
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      container.removeEventListener('scroll', onScroll);
      // 卸载前保存最终位置（如跳转文章详情页）
      persistScroll();
    };
  }, []);

  // 首屏文章就绪后恢复上次阅读位置（仅重启恢复场景）；内容不足时继续加载下一页直至足够
  useEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (pending == null) return;
    const el = scrollContainerRef.current;
    // 列表为空（无内容可恢复/无文章）：立即结束恢复状态，避免列表永久不可见
    if (articles.length === 0) {
      if (!el || !hasMore) {
        pendingScrollRestoreRef.current = null;
        setRestoringScroll(false);
      }
      return;
    }
    if (!el) return;
    if (el.scrollHeight - el.clientHeight > pending) {
      pendingScrollRestoreRef.current = null;
      el.scrollTop = pending;
      setRestoringScroll(false);
    } else if (hasMore) {
      tryLoadMore();
    } else {
      // 内容已全部加载仍不够高：不再等待，尽量滚到位，避免 pending 悬挂卡住后续持久化
      pendingScrollRestoreRef.current = null;
      el.scrollTop = pending;
      setRestoringScroll(false);
    }
  }, [articles, hasMore]);

  // 页面卸载前保存滚动位置（刷新/关闭 app；iOS 上 pagehide 比 beforeunload 可靠）
  useEffect(() => {
    function onSave() {
      persistScroll();
    }
    window.addEventListener('beforeunload', onSave);
    window.addEventListener('pagehide', onSave);
    return () => {
      window.removeEventListener('beforeunload', onSave);
      window.removeEventListener('pagehide', onSave);
    };
  }, []);

  // 移动端从详情页返回：列表从 display:none 恢复显示时 scrollTop 已丢失（浏览器不保留隐藏期位置），
  // 主动从持久化状态恢复，保证「读到哪了」不丢
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // 容器从隐藏变可见：仅当当前位置丢失（归零）时才恢复，避免覆盖用户主动滚动
      if (el.offsetParent === null) return;
      if (el.scrollTop <= 2 && pendingScrollRestoreRef.current == null) {
        const saved = savedScrollTopFor(filterRef.current, showUnreadOnlyRef.current);
        if (saved != null && saved > 2) {
          // 内容足够则直接就位；不够则走待恢复流程（触发翻页加载）
          if (el.scrollHeight - el.clientHeight > saved) {
            el.scrollTop = saved;
          } else {
            pendingScrollRestoreRef.current = saved;
            tryLoadMore();
          }
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 新文章检查时机：切回页面/回前台时 + 定时轮询（仅列表处于顶部时主动吸收新文章）──
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        const el = scrollContainerRef.current;
        // 列表不可见（移动端在文章详情页）：不强制刷新，否则会重置正在阅读的列表状态；
        // 只统计新文章数，返回列表时以悬浮条提示
        if (!el || el.offsetParent === null) {
          scheduleNewCheck(800);
          return;
        }
        // 位于顶部时：强制静默刷新列表（新文章直接出现在顶部）；否则仅统计新文章数显示悬浮条
        if (el.scrollTop <= 2) {
          loadArticlesRef.current?.(1, true, true, { forceRefresh: true });
        } else {
          scheduleNewCheck(800);
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新文章检查只在切回 App 时执行（见上方 visibilitychange），
  // 不做常驻轮询：重新打开 PWA / 切回前台时检查一次即可，减少不必要的请求。

  // 滚动自动已读：监听滚动容器的 scroll 事件，检查哪些文章已滚出顶部
  const markReadOnScrollRef = useRef(markReadOnScroll);
  useEffect(() => { markReadOnScrollRef.current = markReadOnScroll; }, [markReadOnScroll]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !markReadOnScroll) return;

    function checkScrolledPast() {
      if (!container || !markReadOnScrollRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      container.querySelectorAll<HTMLElement>('[data-article-id]').forEach((el) => {
        const id = el.dataset.articleId;
        if (!id) return;
        if (scrollReadPendingIds.current.has(id)) return;
        // 文章底部已滚出容器顶部
        if (el.getBoundingClientRect().bottom <= containerTop) {
          const article = articlesRef.current.find((a) => a.id === id);
          if (!article || article.isRead) return;
          scrollReadPendingIds.current.add(id);
          setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
          if (filterRef.current.type === 'unread' || showUnreadOnlyRef.current) decDisplayTotal();
          api.markRead(id).catch(() => {});
        }
      });
    }

    container.addEventListener('scroll', checkScrolledPast, { passive: true });
    return () => container.removeEventListener('scroll', checkScrolledPast);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markReadOnScroll]);

  // Infinite scroll
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  // isFetchingRef: 追踪是否正在加载（包括 silent 模式），防止并发请求
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  // tryLoadMore: 统一的「尝试加载下一页」入口，自带防重入保护
  function tryLoadMore() {
    if (isFetchingRef.current || !hasMoreRef.current) return;
    loadArticlesRef.current?.(pageRef.current + 1);
  }

  // 是否有文章（决定 loader div 是否在 DOM 中）
  const hasArticles = articles.length > 0;

  // IntersectionObserver：以 scrollContainer 为 root，正确检测 loader 是否滚动进入可视区域
  // 依赖 hasArticles：文章列表从空变为非空时，loader div 才出现在 DOM 中，此时重建 Observer
  useEffect(() => {
    const container = scrollContainerRef.current;
    const loader = loaderRef.current;
    if (!container || !loader) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) tryLoadMore();
      },
      { root: container, threshold: 0 }
    );
    obs.observe(loader);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasArticles]);

  // 每次加载完成后，检查 loader 是否在滚动容器可视区域内
  // 处理文章不够填满屏幕、loader 始终可见但 Observer 不重复触发的场景
  useEffect(() => {
    if (loading || !hasMore) return;
    const container = scrollContainerRef.current;
    const loader = loaderRef.current;
    if (!container || !loader) return;
    // 检查 loader 是否在 container 的可视范围内
    const containerRect = container.getBoundingClientRect();
    const loaderRect = loader.getBoundingClientRect();
    const isVisible = loaderRect.top < containerRect.bottom && loaderRect.bottom > containerRect.top;
    if (isVisible) tryLoadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSelect(article: Article) {
    if (!article.isRead) {
      if (filter.type === 'unread' || showUnreadOnly) decDisplayTotal();
      // 先把带 isRead:true 的文章写入详情缓存，确保 ArticleReader 加载时读到的是最新已读状态
      // 避免因竞态导致 ArticleReader 的 onRead 回调被重复触发（从而重复扣减 unreadCount）
      cacheArticle({ ...article, isRead: true });
      // 发起后端已读标记（opened=true：用户实际点进去打开，记录到 opened_at 供阅读统计使用）
      api.markRead(article.id, true, true).then(() => {
        window.dispatchEvent(new CustomEvent('article-read', { detail: { articleId: article.id } }));
      }).catch(() => {});
    }

    setSelectedArticle(article.id);
    navigate(`/article/${article.id}`);
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (filter.type === 'feed' && filter.feedId) {
        const res = await api.refreshFeed(filter.feedId);
        await loadFeeds();
        if (res.error) {
          showToast(`拉取失败：${res.error}`, 'error');
        } else {
          showToast(res.newArticles > 0 ? `获取到 ${res.newArticles} 篇新文章` : '暂无新文章', 'success');
        }
      } else {
        const res = await api.refreshAll();
        await loadFeeds();
        showToast(res.newArticles > 0 ? `获取到 ${res.newArticles} 篇新文章` : '暂无新文章', 'success');
      }
      setNewCount(0);
      await loadArticles(1, true);
    } catch {
      showToast('刷新失败，请检查网络', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAiQuick(type: 'score' | 'tags') {
    if (aiQuickTrigger) return;
    setAiQuickTrigger(type);
    const feedId = filter.type === 'feed' ? filter.feedId : undefined;
    const groupId = filter.type === 'group' ? filter.groupId : undefined;
    try {
      await api.aiAnalyze(type, feedId, groupId);
      window.dispatchEvent(new Event('ai-job-started'));
    } catch {
      // silently ignore — e.g. already running
    } finally {
      setAiQuickTrigger(null);
    }
  }

  async function handleMarkAllRead(olderThanDays?: number) {
    const base =
      filter.type === 'feed' ? { feedId: filter.feedId } :
      filter.type === 'group' ? { groupId: filter.groupId } : {};
    const params = olderThanDays ? { ...base, olderThanDays } : base;
    const count = await markAllRead(Object.keys(params).length ? params : undefined);
    setShowMarkReadMenu(false);

    if (!olderThanDays) {
      // 全部已读：直接清空当前列表未读态
      setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
      setDisplayTotal(0);
      displayTotalCacheRef.current.set(getFilterKey(filter), 0);
      if (filter.type === 'unread') {
        setTotal(0);
        setHasMore(false);
      }
    } else {
      // 仅标记 N 天前的文章：只更新符合条件的文章，保留最近文章的未读状态
      const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.isRead) return a;
          const ts = a.effectiveDate ?? a.publishedAt;
          if (ts && new Date(ts).getTime() < cutoff) return { ...a, isRead: true };
          return a;
        })
      );
      setDisplayTotal((prev) => {
        const next = Math.max(0, prev - count);
        displayTotalCacheRef.current.set(getFilterKey(filter), next);
        return next;
      });
      if (filter.type === 'unread') {
        setTotal((prev) => Math.max(0, prev - count));
        // 未读列表中已标记的文章需要从当前视图移除
        setArticles((prev) => prev.filter((a) => !a.isRead));
      }
    }
    showToast(count > 0 ? `已标记 ${count} 篇文章为已读` : '没有符合条件的未读文章', count > 0 ? 'success' : 'error');
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const title =
    filter.type === 'all' ? '全部文章' :
    filter.type === 'unread' ? '未读' :
    filter.type === 'starred' ? '已收藏' :
    filter.type === 'read-later' ? '稍后阅读' :
    filter.type === 'group' ? (groups.find(g => g.id === filter.groupId)?.name ?? '分组') :
    (feeds.find(f => f.id === filter.feedId)?.title ?? '文章');

  const hasAiFilter = minScore > 0 || selectedTags.length > 0;
  const canShowUnreadFilter = filter.type === 'feed' || filter.type === 'group';

  return (
    <div className="article-list-surface flex flex-col h-full bg-[#FFFFFF] dark:bg-[#202124]">
      {/* Header */}
      <div className="page-header ios-pwa-top-bar">
        <div className="page-header-row">
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <h2 className="page-title truncate">{title}</h2>
            <span className="list-meta flex-shrink-0">{(filter.type === 'unread' || showUnreadOnly) ? displayTotal : total} 篇</span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="切换订阅侧栏"
            title="订阅侧栏"
            className="toolbar-button lg:hidden"
          >
            <PanelLeft size={18} />
          </button>
          {(filter.type === 'all' || filter.type === 'feed' || filter.type === 'group') && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="toolbar-button"
              title={filter.type === 'feed' ? '刷新该订阅源' : '刷新所有订阅'}
              aria-label={filter.type === 'feed' ? '刷新该订阅源' : '刷新所有订阅'}
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            ref={filterButtonRef}
            onClick={() => { setShowTagFilter((v) => !v); setShowMarkReadMenu(false); }}
            className="toolbar-button"
            data-active={hasAiFilter || showTagFilter}
            aria-expanded={showTagFilter}
            aria-controls="article-ai"
            aria-label="AI 打分、标签与筛选"
            title="AI 打分、标签与筛选"
          >
            {aiQuickTrigger ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          </button>
          <div className="relative" ref={markReadMenuRef}>
            <button
              ref={moreButtonRef}
              onClick={() => { setShowMarkReadMenu((v) => !v); setShowTagFilter(false); }}
              className="toolbar-button"
              data-active={showMarkReadMenu}
              aria-expanded={showMarkReadMenu}
              aria-controls="article-actions"
              aria-label="更多操作"
              title="更多操作"
            >
              <MoreHorizontal size={18} />
            </button>
            {showMarkReadMenu && (
              <div id="article-actions" className="action-menu">
                <p className="action-menu-label">批量已读</p>
                <button onClick={() => handleMarkAllRead()} className="action-menu-item">
                  <CheckCheck size={14} />全部标为已读
                </button>
                {[3, 7, 14].map((days) => (
                  <button key={days} onClick={() => handleMarkAllRead(days)} className="action-menu-item">
                    <span className="w-3.5" />{days} 天前标为已读
                  </button>
                ))}
                {canShowUnreadFilter && (
                  <>
                    <div className="h-px bg-[var(--color-border)] mx-2 my-1" />
                    <label className="action-menu-item justify-between cursor-pointer">
                      只看未读
                      <input type="checkbox" checked={showUnreadOnly} onChange={(event) => setShowUnreadOnly(event.target.checked)} className="w-4 h-4 accent-[#3478F6]" />
                    </label>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AI 分析后按评分与标签筛选，同一入口内完成。 */}
        {showTagFilter && (
          <div ref={aiMenuRef} id="article-ai" className="absolute right-5 top-full mt-1.5 w-[min(18rem,calc(100vw-2.5rem))] p-3 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[0_4px_20px_rgba(0,0,0,0.1)] z-50 max-h-[60dvh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <button onClick={() => handleAiQuick('score')} disabled={!!aiQuickTrigger} className="toolbar-button !w-auto flex-1 gap-2 px-3 whitespace-nowrap" aria-label="质量打分" title="质量打分">
                {aiQuickTrigger === 'score' ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Star size={16} className="shrink-0" />}
                <span>质量打分</span>
              </button>
              <button onClick={() => handleAiQuick('tags')} disabled={!!aiQuickTrigger} className="toolbar-button !w-auto flex-1 gap-2 px-3 whitespace-nowrap" aria-label="提取标签" title="提取标签">
                {aiQuickTrigger === 'tags' ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Hash size={16} className="shrink-0" />}
                <span>提取标签</span>
              </button>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <p className="list-meta">筛选</p>
            {/* Score filter */}
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-[#717784] dark:text-[#959CA8] whitespace-nowrap flex-shrink-0">最低分</span>
              <input
                aria-label="最低评分"
                type="range"
                min={0}
                max={10}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="flex-1 h-1.5 accent-[#3478F6] cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-[#3478F6] dark:text-[#82AEFF] w-5 text-right flex-shrink-0">{minScore}</span>
              {minScore > 0 && (
                <button
                  onClick={() => setMinScore(0)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[#717784]/50 hover:text-[#A85448] transition-colors"
                >
                  <X size={10} />
                </button>
              )}
            </div>

            {/* Tags filter */}
            {allTags.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Tag size={10} className="text-[#717784]/60" />
                  <span className="text-[11px] text-[#717784] dark:text-[#959CA8]">按标签筛选</span>
                  {selectedTags.length > 0 && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="ml-auto text-[10px] text-[#717784]/50 hover:text-[#A85448] transition-colors"
                    >
                      清除
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {allTags.slice(0, 20).map(({ tag, count }) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-200 active:scale-95',
                        selectedTags.includes(tag)
                          ? 'bg-[#3478F6] text-white'
                          : 'bg-[#EAF2FF]/60 text-[#717784] hover:bg-[#3478F6]/15 hover:text-[#3478F6]'
                      )}
                    >
                      {tag}
                      <span className="ml-1 opacity-60">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {!showTagFilter && hasAiFilter && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {minScore > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3478F6]/10 text-[10px] text-[#3478F6] font-medium">
                <Sparkles size={9} />
                分数 ≥ {minScore}
                <button onClick={() => setMinScore(0)} className="hover:text-[#A85448] transition-colors"><X size={9} /></button>
              </span>
            )}
            {selectedTags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[10px] text-[var(--color-primary)] font-medium">
                <Tag size={9} />
                {tag}
                <button onClick={() => toggleTag(tag)} className="hover:text-[#A85448] transition-colors"><X size={9} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

        {/* List */}
      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto flex flex-col transition-opacity duration-150 bg-[#FFFFFF] dark:bg-[#202124] ${loading && articles.length > 0 ? 'opacity-60' : 'opacity-100'} ${restoringScroll ? 'invisible' : ''}`}>
        {articles.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full pb-[3.5rem] lg:pb-0 gap-3 text-[#717784]">
            <div className="empty-state-icon w-20 h-20">
              <BookOpen size={28} />
            </div>
            <p className="text-sm font-medium">暂无文章</p>
            <p className="text-xs text-[#717784]/70 dark:text-[#959CA8]">
              {hasAiFilter ? '尝试调整 AI 筛选条件' : '添加订阅源后内容将出现在这里'}
            </p>
          </div>
        ) : (
          <>
            {/* 新文章悬浮提示（Twitter 风格）：点击拉取当前筛选下的新文章 */}
            {newCount > 0 && (
              <div className="sticky top-0 z-30 px-4 -mb-[1px] pointer-events-none">
                <button
                  onClick={handleLoadNew}
                  disabled={loadingNew}
                  className="new-articles-pill pointer-events-auto mx-auto flex items-center gap-2 px-4 h-9 rounded-full text-xs font-semibold"
                >
                  {loadingNew ? (
                    <Loader2 size={13} className="animate-spin shrink-0" />
                  ) : (
                    <ArrowUp size={13} className="shrink-0" />
                  )}
                  {newCount} 篇新文章
                </button>
              </div>
            )}
            <div className="pb-[calc(var(--mobile-tab-height)+1rem+env(safe-area-inset-bottom,0px)*0.5)] lg:pb-4">
              {articles.map((article) => (
                <ArticleItem
                  key={article.id}
                  article={article}
                  selected={location.pathname === `/article/${article.id}`}
                  onSelect={() => handleSelect(article)}
                  suppressReadStyle={filter.type === 'starred'}
                />
              ))}
            </div>
            <div ref={loaderRef} className="py-4 flex justify-center">
              {loading && <Loader2 size={18} className="animate-spin text-[#3478F6]/50" />}
            </div>
          </>
        )}
      </div>
          {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-2.5 px-4 py-3 rounded-2xl',
            'shadow-[0_8px_24px_-4px_rgba(36,36,36,0.18)]',
            'text-sm font-medium min-w-[240px] max-w-[320px]',
            'animate-[slideUp_0.2s_ease-out]',
            toast.type === 'success' ? 'bg-[#3478F6] text-[#FFFFFF]' : 'bg-[#A85448] text-white'
          )}
        >
          {toast.type === 'success'
            ? <CheckCircle size={15} className="shrink-0" />
            : <AlertCircle size={15} className="shrink-0" />}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 active:scale-95">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function 
ArticleItem({
  article, selected, onSelect, suppressReadStyle = false,
}: {
  article: Article;
  selected: boolean;
  onSelect: () => void;
  suppressReadStyle?: boolean;
}) {
  return (
    <div
      data-article-id={article.id}
      data-selected={selected}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={article.title}
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); }
      }}
      className="article-row page-content-gutter group relative py-[16px] cursor-pointer overflow-hidden"
    >
      {/* Unread dot */}
      {!suppressReadStyle && !article.isRead && !selected && (
        <span className="absolute top-[22px] right-5 w-1.5 h-1.5 rounded-full bg-[#3478F6]" />
      )}

      {/* Feed source + time */}
      <div className="flex items-center gap-1.5 mb-[6px] pr-3">
        <FeedIcon
          favicon={article.feed_favicon}
          url={article.url || ''}
          title={article.feed_title || ''}
          className="w-[14px] h-[14px]"
        />
        <span className="list-meta truncate">{article.feed_title}</span>
        <span className="list-meta ml-auto flex-shrink-0">
          {relativeTime(article.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <h3
        className={cn(
          'list-title mb-[6px] line-clamp-2',
          !suppressReadStyle && article.isRead
            ? '!text-[var(--color-muted-fg)]'
            : 'text-[var(--color-fg)]'
        )}
      >
        {article.title}
      </h3>

      {/* Summary */}
      {article.summary && (
        <p className="list-summary line-clamp-3">
          {article.summary}
        </p>
      )}

      {/* AI score + tags */}
      {(article.aiScore !== null || (article.aiTags && article.aiTags.length > 0)) && (
        <div className="flex items-center gap-1.5 mt-[8px] overflow-hidden">
          {article.aiScore !== null && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-muted-fg)] flex-shrink-0">
              <Sparkles size={8} />
              {article.aiScore}
            </span>
          )}
          {article.aiTags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-fg)] text-[10px] leading-4 truncate max-w-[7rem]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
