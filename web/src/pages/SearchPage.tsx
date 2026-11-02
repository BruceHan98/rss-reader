import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Article } from '../lib/api';
import { useStore } from '../store';
import { cn, relativeTime } from '../lib/utils';
import { Search, Loader2 } from 'lucide-react';

export default function SearchPage() {
  const navigate = useNavigate();
  const { feeds } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [feedId, setFeedId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.search({
        q: query.trim(),
        feedId: feedId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setResults(data.results);
      setTotal(data.total);
    } finally {
      setLoading(false);
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
        <form onSubmit={handleSearch} className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717784]/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文章"
              className="w-full h-[36px] pl-8 pr-3 rounded-full border border-transparent bg-[#F2F4F7] dark:bg-[#27292E] text-[16px] md:text-[14px] leading-[20px] text-[var(--color-fg)] placeholder:text-[var(--color-muted-fg)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#3478F6]/25 focus:border-[#3478F6]/40"
            />
          </div>
          <button type="submit" className="toolbar-button shrink-0" aria-label="搜索" title="搜索">
            <Search size={16} />
          </button>
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
        {loading && (
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
              <span className="list-meta">找到 <span>{total}</span> 篇文章</span>
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
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="list-summary line-clamp-3">{article.summary}</p>
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
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
