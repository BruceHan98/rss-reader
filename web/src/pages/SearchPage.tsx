import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Article } from '../lib/api';
import { useStore } from '../store';
import { cn, relativeTime } from '../lib/utils';
import { Search, Loader2, ArrowLeft } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-[#FDFCF8]">
      {/* Header — same height as sidebar/article-list */}
      <div className="px-4 py-3.5 border-b border-[#DED8CF]/50 flex items-center gap-2.5">
        <button
          onClick={() => navigate(-1)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C] transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052] active:scale-95 flex-shrink-0"
        >
          <ArrowLeft size={15} />
        </button>
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78786C]/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文章标题、摘要、正文…"
              className="w-full h-7 pl-9 pr-4 rounded-full border border-[#DED8CF] bg-[#F0EBE5]/40 text-xs text-[#2C2C24] placeholder-[#78786C]/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#5D7052]/25 focus:border-[#5D7052]/40"
              autoFocus
            />
          </div>
          <button type="submit" className="h-7 px-4 rounded-full bg-[#5D7052] text-[#F3F4F1] text-xs font-semibold transition-all duration-200 hover:shadow-[0_4px_12px_-2px_rgba(93,112,82,0.3)] active:scale-95 flex-shrink-0">
            搜索
          </button>
        </form>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-[#DED8CF]/30 flex flex-wrap items-center gap-2">
        <select
          value={feedId}
          onChange={(e) => setFeedId(e.target.value)}
          className="select-field h-7 text-xs px-3"
        >
          <option value="">全部订阅源</option>
          {feeds.map((f) => (
            <option key={f.id} value={f.id}>{f.title}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="select-field h-7 text-xs px-3" />
          <span className="text-[#C8C4BB] text-xs">—</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="select-field h-7 text-xs px-3" />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-[#E6DCCD]/60 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#5D7052]" />
            </div>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[#78786C]">
            <div className="w-20 h-20 rounded-[40%_60%_60%_40%_/_40%_40%_60%_60%] bg-[#E6DCCD]/50 flex items-center justify-center">
              <Search size={28} className="text-[#78786C]/50" />
            </div>
            <p className="text-sm font-medium">没有找到相关文章</p>
            <p className="text-xs text-[#78786C]/60">尝试换个关键词</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            <div className="px-5 py-2.5 border-b border-[#DED8CF]/30">
              <span className="text-xs text-[#78786C]">找到 <strong className="text-[#5D7052]">{total}</strong> 篇文章</span>
            </div>
            <div className="p-4 space-y-2">
              {results.map((article) => (
                <div
                  key={article.id}
                  onClick={() => navigate(`/article/${article.id}`)}
                  className="p-4 rounded-[1.25rem] border border-[#DED8CF]/40 bg-[#FEFEFA] cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(93,112,82,0.12)]"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[11px] font-semibold text-[#5D7052]">{article.feed_title}</span>
                    <span className="text-[11px] text-[#DED8CF] ml-auto">
                      {relativeTime(article.publishedAt)}
                    </span>
                  </div>
                  <h3
                    className={cn(
                      'text-sm font-semibold mb-1 line-clamp-2',
                      article.isRead ? 'text-[#78786C]' : 'text-[#2C2C24]'
                    )}
                  >
                    {article.title}
                  </h3>
                  {article.summary && (
                    <p className="text-xs text-[#78786C] line-clamp-2 leading-relaxed">{article.summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!searched && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[#78786C]">
            <div
              className="w-24 h-24 bg-[#E6DCCD]/50 flex items-center justify-center"
              style={{ borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }}
            >
              <Search size={32} className="text-[#5D7052]/40" />
            </div>
            <p className="font-medium text-sm">输入关键词搜索文章</p>
            <p className="text-xs text-[#78786C]/60">支持标题、摘要、正文全文搜索</p>
          </div>
        )}
      </div>
    </div>
  );
}
