import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Article } from '../lib/api';
import { useStore } from '../store';
import { cn, relativeTime } from '../lib/utils';
import { Search, Loader2, X } from 'lucide-react';

// 搜索结果条目：后端附带 snippet（命中上下文片段）
type SearchItem = Article & { snippet?: string };

// 关键词高亮：把文本按命中词切分为片段，命中部分加 <mark>
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!text) return null;
  const valid = terms.filter((t) => t.length > 0);
  if (valid.length === 0) return <>{text}</>;
  // 转义特殊字符后构建正则（按长度降序避免短词先匹配拆散长词）
  const pattern = valid
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        valid.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="bg-[#3478F6]/15 dark:bg-[#82AEFF]/20 text-[#3478F6] dark:text-[#82AEFF] rounded-[2px] px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { feeds } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [feedId, setFeedId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // 当前有效搜索词（提交后的），供高亮使用
  const activeTerms = query.trim().split(/\s+/).filter(Boolean);

  // 防抖自动搜索 + 取消过期请求
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    // 清空输入即清空结果，不发请求
    if (!trimmed) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // 350ms 防抖：停止输入后才发起搜索
    debounceTimerRef.current = setTimeout(() => {
      // 取消上一次未完成的请求
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setSearched(true);
      api.search({ q: trimmed, feedId: feedId || undefined, from: from || undefined, to: to || undefined }, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data.results as SearchItem[]);
          setTotal(data.total);
        })
        .catch(() => { /* 被取消或失败：保留现有结果 */ })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, feedId, from, to]);

  // 离开页面时取消进行中的请求
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    // 手动提交：立即执行挂起的防抖搜索
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const trimmed = query.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.search({ q: trimmed, feedId: feedId || undefined, from: from || undefined, to: to || undefined }, controller.signal);
      setResults(data.results as SearchItem[]);
      setTotal(data.total);
    } catch { /* ignore */ } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF] dark:bg-[#202124]">
      {/* Header */}
      <header className="page-header ios-pwa-top-bar">
        <div className="page-header-row">
          <h1 className="page-title">搜索</h1>
        </div>
      </header>
      <div className="page-state-content">
      <div className="page-content-gutter pt-[16px] pb-[8px] shrink-0">
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717784]/60" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题、摘要、作者，多关键词空格分隔"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full h-[36px] pl-8 pr-9 rounded-full border border-transparent bg-[#F2F4F7] dark:bg-[#27292E] text-[16px] md:text-[14px] leading-[20px] text-[var(--color-fg)] placeholder:text-[var(--color-muted-fg)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#3478F6]/25 focus:border-[#3478F6]/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[#717784]/60 hover:text-[var(--color-fg)] hover:bg-[#E8EBF0] dark:hover:bg-[#33363D]"
                aria-label="清空搜索"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {loading && <Loader2 size={16} className="shrink-0 animate-spin text-[#3478F6]" />}
        </form>
      </div>

      {/* Filters */}
      <div className="page-content-gutter pb-[16px] border-b border-[var(--color-border)] flex flex-col gap-2 shrink-0">
        <select
          value={feedId}
          onChange={(e) => setFeedId(e.target.value)}
          className="select-field h-[36px] text-[16px] md:text-[14px] leading-[22px] px-3 w-full"
        >
          <option value="">全部订阅源</option>
          {feeds.map((f) => (
            <option key={f.id} value={f.id}>{f.title}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 w-full">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="select-field h-[36px] text-[16px] md:text-[14px] leading-[22px] px-3 flex-1 min-w-0" />
          <span className="text-[#9299A5] text-xs flex-shrink-0">—</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="select-field h-[36px] text-[16px] md:text-[14px] leading-[22px] px-3 flex-1 min-w-0" />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <p className="page-text font-medium">搜索中…</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Search size={28} />
            </div>
            <p className="page-text font-medium">没有找到相关文章</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            <div className="page-content-gutter py-[12px] border-b border-[var(--color-border)]">
              <span className="list-meta">找到 <span>{total}</span> 篇文章{total >= 100 ? '（仅显示前 100 篇）' : ''}</span>
            </div>
            <div>
              {results.map((article) => (
                <div
                  key={article.id}
                  onClick={() => navigate(`/article/${article.id}`)}
                  className="article-row py-[16px] cursor-pointer transition-colors duration-150"
                >
                  <div className="page-content-gutter">
                    <div className="flex items-center gap-1.5 mb-[6px]">
                      <span className="list-meta min-w-0 truncate">{article.feed_title}</span>
                      <span className="list-meta ml-auto shrink-0">
                        {relativeTime(article.publishedAt)}
                      </span>
                    </div>
                    <h3
                      className={cn(
                        'list-title mb-[6px] line-clamp-2',
                        article.isRead ? '!text-[var(--color-muted-fg)]' : 'text-[var(--color-fg)]'
                      )}
                    >
                      <Highlight text={article.title} terms={activeTerms} />
                    </h3>
                    {(article.snippet ?? article.summary) && (
                      <p className="list-summary line-clamp-3">
                        <Highlight text={article.snippet ?? article.summary ?? ''} terms={activeTerms} />
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!searched && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Search size={28} />
            </div>
            <p className="page-text font-medium">输入关键词搜索文章</p>
            <p className="list-meta">支持多关键词（空格分隔，需全部命中）</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
