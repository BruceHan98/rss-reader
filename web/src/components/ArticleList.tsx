import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api, type Article, type AiTag } from '../lib/api';
import { cn, relativeTime } from '../lib/utils';
import { CheckCheck, Loader2, Leaf, RefreshCw, Sparkles, Tag, X, Star, Hash, Menu, Rss, CheckCircle, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 30;

function articleFaviconUrl(article: Article): string {
  if (article.feed_favicon) return article.feed_favicon;
  try { return new URL(article.url!).origin + '/favicon.ico'; } catch { return ''; }
}

export default function ArticleList() {
  const {
    filter, selectedArticleId, settings,
    setSelectedArticle, markArticleRead, markAllRead, loadFeeds, setSidebarOpen, sidebarOpen,
  } = useStore();

  // Keep a ref to filter to avoid stale closures in IntersectionObserver callbacks
  const filterRef = useRef(filter);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  const navigate = useNavigate();

  // 「滚动自动已读」是否开启
  const markReadOnScroll = settings?.markReadOnScroll === 'true';

  // AI filter state
  const [minScore, setMinScore] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<AiTag[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);

  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aiQuickTrigger, setAiQuickTrigger] = useState<'score' | 'tags' | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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

  // 各 filter key 对应的 displayTotal 缓存，切换 tab 时先显示缓存值
  const displayTotalCacheRef = useRef<Map<string, number>>(new Map());
  function getFilterKey(f: typeof filter): string {
    if (f.type === 'feed') return `feed:${f.feedId}`;
    if (f.type === 'group') return `group:${f.groupId}`;
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
  const loadArticlesRef = useRef<(p?: number, reset?: boolean) => Promise<void>>();

  async function loadArticles(p = 1, reset = false) {
    // 取消上一个未完成的请求，防止旧响应覆盖新数据（竞态条件）
    if (reset) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
    }
    const signal = reset ? abortControllerRef.current!.signal : undefined;

    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page: p,
        limit: PAGE_SIZE,
      };
      if (filter.type === 'feed') params.feedId = filter.feedId;
      if (filter.type === 'group') params.groupId = filter.groupId;
      if (filter.type === 'unread') params.isRead = 'false';
      if (filter.type === 'starred') params.isStarred = 'true';
      if (filter.type === 'read-later') params.isReadLater = 'true';

      if (minScoreRef.current > 0) params.minScore = minScoreRef.current;
      if (selectedTagsRef.current.length > 0) params.tags = selectedTagsRef.current.join(',');

      const data = await api.getArticles(params, signal);
      setTotal(data.total);
      if (reset) {
        setDisplayTotal(data.total);
        displayTotalCacheRef.current.set(getFilterKey(filter), data.total);
      }
      setHasMore(data.articles.length === PAGE_SIZE);
      setArticles((prev) => (reset ? data.articles : [...prev, ...data.articles]));
      setPage(p);
    } catch (err: any) {
      // 请求被主动取消时不更新状态（新请求正在进行中）
      if (err?.name === 'AbortError') return;
      setLoading(false);
      throw err;
    }
    setLoading(false);
  }
  // Always keep the ref pointing at the latest loadArticles (captures current filter/minScore/tags)
  loadArticlesRef.current = loadArticles;

  // Reload when filter changes（不提前清空文章列表，保留旧内容直到新数据返回，避免白屏闪烁；数量先恢复该tab的缓存值）
  useEffect(() => {
    const cached = displayTotalCacheRef.current.get(getFilterKey(filter)) ?? 0;
    setTotal(cached);
    setDisplayTotal(cached);
    setHasMore(false);
    setPage(1);
    scrollReadPendingIds.current.clear(); // 清除旧 tab 的已读记录，防止 id 污染新 tab
    scrollContainerRef.current?.scrollTo({ top: 0 });
    loadArticles(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
          if (filterRef.current.type === 'unread') decDisplayTotal();
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

  useEffect(() => {
    if (!loaderRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading && hasMore) {
          loadArticles(pageRef.current + 1);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [loading, hasMore]);

  async function handleSelect(article: Article) {
    if (!article.isRead) {
      // 乐观更新本地列表显示（isRead + 计数），实际标记由 ArticleReader.onRead 负责
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a))
      );
      if (filter.type === 'unread') decDisplayTotal();
      // 直接发请求，不经过 markArticleRead（避免与 ArticlePage.onRead 重复更新 store unreadCount）
      api.markRead(article.id).catch(() => {});
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

  async function handleMarkAllRead() {
    const params =
      filter.type === 'feed' ? { feedId: filter.feedId } :
      filter.type === 'group' ? { groupId: filter.groupId } : undefined;
    await markAllRead(params);
    setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
    setDisplayTotal(0);
    displayTotalCacheRef.current.set(getFilterKey(filter), 0);
    if (filter.type === 'unread') {
      setTotal(0);
      setHasMore(false);
    }
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
    filter.type === 'read-later' ? '稍后阅读' : '';

  const hasAiFilter = minScore > 0 || selectedTags.length > 0;

  return (
    <div className="flex flex-col h-full bg-[#FDFCF8]">
      {/* Mobile top header */}
      <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-[#DED8CF]/50 bg-[#FEFEFA]/90 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-6 h-6 rounded-full bg-[#5D7052] flex items-center justify-center">
            <Rss size={12} className="text-[#F3F4F1]" />
          </div>
          <span className="font-heading font-semibold text-sm text-[#2C2C24]">RSS Reader</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#78786C] transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052] active:scale-95"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#DED8CF]/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-heading font-semibold text-sm text-[#2C2C24] flex-shrink-0">{title}</h2>
            <span className="text-[11px] text-[#78786C]/60">{filter.type === 'unread' ? displayTotal : total} 篇</span>
          </div>
          <div className="flex items-center gap-1">
            {/* AI filter toggle */}
            <button
              onClick={() => setShowTagFilter((v) => !v)}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 flex-shrink-0',
                hasAiFilter || showTagFilter
                  ? 'bg-[#5D7052]/15 text-[#5D7052]'
                  : 'text-[#78786C]/60 hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
              )}
              title="AI 筛选"
            >
              <Sparkles size={13} />
            </button>
            {/* AI quick actions */}
            <button
              onClick={() => handleAiQuick('score')}
              disabled={!!aiQuickTrigger}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 transition-all duration-200 hover:bg-[#C18C5D]/15 hover:text-[#C18C5D] active:scale-95 flex-shrink-0 disabled:opacity-40"
              title="质量打分"
            >
              {aiQuickTrigger === 'score' ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
            </button>
            <button
              onClick={() => handleAiQuick('tags')}
              disabled={!!aiQuickTrigger}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 transition-all duration-200 hover:bg-[#C18C5D]/15 hover:text-[#C18C5D] active:scale-95 flex-shrink-0 disabled:opacity-40"
              title="标签提取"
            >
              {aiQuickTrigger === 'tags' ? <Loader2 size={13} className="animate-spin" /> : <Hash size={13} />}
            </button>
            {(filter.type === 'all' || filter.type === 'feed' || filter.type === 'group') && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052] active:scale-95 flex-shrink-0 disabled:opacity-40"
                title={filter.type === 'feed' ? '刷新该订阅源' : '刷新所有订阅'}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              onClick={handleMarkAllRead}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052] active:scale-95 flex-shrink-0"
              title="全部标为已读"
            >
              <CheckCheck size={14} />
            </button>
          </div>
        </div>

        {/* AI filter panel */}
        {showTagFilter && (
          <div className="mt-2.5 space-y-2.5">
            {/* Score filter */}
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-[#78786C] whitespace-nowrap flex-shrink-0">最低分</span>
              <input
                type="range"
                min={0}
                max={10}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="flex-1 h-1.5 accent-[#5D7052] cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-[#5D7052] w-5 text-right flex-shrink-0">{minScore}</span>
              {minScore > 0 && (
                <button
                  onClick={() => setMinScore(0)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[#78786C]/50 hover:text-[#A85448] transition-colors"
                >
                  <X size={10} />
                </button>
              )}
            </div>

            {/* Tags filter */}
            {allTags.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Tag size={10} className="text-[#78786C]/60" />
                  <span className="text-[11px] text-[#78786C]">按标签筛选</span>
                  {selectedTags.length > 0 && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="ml-auto text-[10px] text-[#78786C]/50 hover:text-[#A85448] transition-colors"
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
                          ? 'bg-[#5D7052] text-white'
                          : 'bg-[#E6DCCD]/60 text-[#78786C] hover:bg-[#5D7052]/15 hover:text-[#5D7052]'
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
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#5D7052]/10 text-[10px] text-[#5D7052] font-medium">
                <Sparkles size={9} />
                分数 ≥ {minScore}
                <button onClick={() => setMinScore(0)} className="hover:text-[#A85448] transition-colors"><X size={9} /></button>
              </span>
            )}
            {selectedTags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C18C5D]/10 text-[10px] text-[#C18C5D] font-medium">
                <Tag size={9} />
                {tag}
                <button onClick={() => toggleTag(tag)} className="hover:text-[#A85448] transition-colors"><X size={9} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto pb-[3.5rem] lg:pb-0 transition-opacity duration-150 ${loading && articles.length > 0 ? 'opacity-60' : 'opacity-100'}`}>
        {articles.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#78786C]">
            <div className="w-16 h-16 rounded-full bg-[#E6DCCD]/60 flex items-center justify-center">
              <Leaf size={24} className="text-[#5D7052]/50" />
            </div>
            <p className="text-sm font-medium">暂无文章</p>
            <p className="text-xs text-[#78786C]/70">
              {hasAiFilter ? '尝试调整 AI 筛选条件' : '添加订阅源后内容将出现在这里'}
            </p>
          </div>
        )}

        <div className="p-2.5 pb-1 space-y-1.5">
          {articles.map((article) => (
            <ArticleItem
              key={article.id}
              article={article}
              selected={selectedArticleId === article.id}
              onSelect={() => handleSelect(article)}
            />
          ))}
        </div>

        <div ref={loaderRef} className="py-4 pb-4 lg:pb-4 flex justify-center">
          {loading && <Loader2 size={18} className="animate-spin text-[#5D7052]/50" />}
        </div>
      </div>
          {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-2.5 px-4 py-3 rounded-2xl',
            'shadow-[0_8px_24px_-4px_rgba(44,44,36,0.18)]',
            'text-sm font-medium min-w-[240px] max-w-[320px]',
            'animate-[slideUp_0.2s_ease-out]',
            toast.type === 'success' ? 'bg-[#5D7052] text-[#F3F4F1]' : 'bg-[#A85448] text-white'
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
  article, selected, onSelect,
}: {
  article: Article;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      data-article-id={article.id}
      onClick={onSelect}
      className={cn(
        'group relative px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-200 overflow-hidden',
        'border border-transparent',
        selected
          ? 'bg-[#5D7052]/10 border-[#5D7052]/30 shadow-[0_2px_12px_-2px_rgba(93,112,82,0.18)] ring-1 ring-[#5D7052]/15'
          : [
              'bg-[#FEFEFA] border-[#DED8CF]/40',
              'hover:shadow-[0_4px_16px_-4px_rgba(93,112,82,0.1)] hover:border-[#DED8CF]/70',
              !article.isRead && 'border-l-2 border-l-[#5D7052]/50',
            ]
      )}
    >
      {/* Unread dot */}
      {!article.isRead && !selected && (
        <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-[#5D7052]" />
      )}

      {/* Feed source + time */}
      <div className="flex items-center gap-1.5 mb-1.5 pr-4">
        {articleFaviconUrl(article) && (
          <img
            src={articleFaviconUrl(article)}
            alt=""
            className="w-3 h-3 rounded-full flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <span className="text-[11px] text-[#78786C]/80 truncate font-medium">{article.feed_title}</span>
        <span className="text-[11px] text-[#C8C4BB] ml-auto flex-shrink-0">
          {relativeTime(article.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <h3
        className={cn(
          'text-[15px] leading-snug mb-1 line-clamp-2',
          article.isRead
            ? 'text-[#78786C] font-normal'
            : 'text-[#2C2C24] font-semibold'
        )}
      >
        {article.title}
      </h3>

      {/* Summary */}
      {article.summary && (
        <p className="text-[12px] text-[#78786C]/70 line-clamp-2 leading-relaxed mt-0.5">
          {article.summary}
        </p>
      )}

      {/* AI score + tags */}
      {(article.aiScore !== null || (article.aiTags && article.aiTags.length > 0)) && (
        <div className="flex items-center flex-wrap gap-1 mt-1.5">
          {article.aiScore !== null && (
            <span className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
              article.aiScore >= 7
                ? 'bg-[#5D7052]/12 text-[#5D7052]'
                : article.aiScore >= 4
                ? 'bg-[#C18C5D]/12 text-[#C18C5D]'
                : 'bg-[#A85448]/12 text-[#A85448]'
            )}>
              <Sparkles size={8} />
              {article.aiScore}
            </span>
          )}
          {article.aiTags?.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-full bg-[#E6DCCD]/70 text-[#78786C] text-[10px] font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
