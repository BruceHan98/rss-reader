import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { api, ApiError, type DigestResult, type DigestItem } from '../lib/api';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Loader2, Newspaper, RefreshCw, AlertCircle, Settings } from 'lucide-react';

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function DigestPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDigest(null);
    api.getDigest(date)
      .then((d) => { if (!cancelled) setDigest(d); })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError({ message: err.message, code: err.code });
        else setError({ message: '加载失败，请重试' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const d = await api.getDigest(date, true);
      setDigest(d);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, code: err.code });
      else setError({ message: '生成失败，请重试' });
    } finally {
      setRegenerating(false);
    }
  }

  function shiftDate(delta: number) {
    setDate(format(addDays(new Date(date), delta), 'yyyy-MM-dd'));
  }

  const dateObj = new Date(date);
  const dateLabel = isToday(dateObj) ? '今天' : format(dateObj, 'M月d日 EEEE', { locale: zhCN });
  const canGoNext = date < todayStr();

  return (
    <div className="flex flex-col h-full bg-[#FDFCF8] dark:bg-[#1C1C18]">
      {/* Header */}
      <div className="bg-[#FEFEFA]/90 dark:bg-[#1C1C18]/90 backdrop-blur-sm border-b border-[#DED8CF]/50 dark:border-[#3A3830]/60 px-4 py-3 flex items-center gap-2 flex-shrink-0 min-h-[3.25rem]">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Newspaper size={16} className="text-[#5D7052] dark:text-[#7A9A6E] flex-shrink-0" />
          <h2 className="font-heading font-semibold text-sm text-[#2C2C24] dark:text-[#E8E6DF] truncate">今日日报</h2>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => shiftDate(-1)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-all duration-200 active:scale-95"
            title="前一天"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="select-field h-7 text-xs px-2.5 w-[8.5rem]"
          />
          <button
            onClick={() => canGoNext && shiftDate(1)}
            disabled={!canGoNext}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            title="后一天"
          >
            <ChevronRight size={15} />
          </button>
          {digest && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#C18C5D]/15 hover:text-[#C18C5D] transition-all duration-200 active:scale-95 disabled:opacity-40 flex-shrink-0"
              title="重新生成"
            >
              <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[3.5rem] lg:pb-0">
        {(loading || regenerating) && (
          <div className="flex flex-col items-center justify-center h-full min-h-[16rem] gap-3 text-[#78786C]">
            <Loader2 size={24} className="animate-spin text-[#5D7052]" />
            <p className="text-xs text-[#78786C]/70">{regenerating ? '正在重新生成日报…' : '正在生成日报，请稍候…'}</p>
          </div>
        )}

        {!loading && !regenerating && error && (
          <div className="flex flex-col items-center justify-center h-full min-h-[20rem] gap-4 text-[#78786C] px-6 text-center">
            <div className="w-20 h-20 rounded-[40%_60%_60%_40%_/_40%_40%_60%_60%] bg-[#E6DCCD]/50 dark:bg-[#2E2B25] flex items-center justify-center">
              <AlertCircle size={26} className="text-[#C18C5D]" />
            </div>
            <p className="text-sm font-medium text-[#4A4A40] dark:text-[#B0ADA3]">{error.message}</p>
            {error.code === 'NO_API_KEY' ? (
              <button
                onClick={() => navigate('/settings')}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <Settings size={13} /> 前往设置
              </button>
            ) : error.code === 'NO_ARTICLES' ? (
              <p className="text-xs text-[#78786C]/60">换个日期试试，或先刷新订阅源</p>
            ) : (
              <button onClick={handleRegenerate} className="btn-secondary">重试</button>
            )}
          </div>
        )}

        {!loading && !regenerating && !error && digest && digest.categories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[20rem] gap-3 text-[#78786C]">
            <Newspaper size={28} className="text-[#5D7052]/40" />
            <p className="text-sm font-medium">{dateLabel}暂无日报内容</p>
          </div>
        )}

        {!loading && !regenerating && !error && digest && digest.categories.length > 0 && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-[#78786C] dark:text-[#8A8880]">
                {dateLabel} · 共 <strong className="text-[#5D7052] dark:text-[#7A9A6E]">{digest.articleCount}</strong> 篇文章
              </span>
            </div>

            {digest.categories.map((cat, ci) => (
              <div key={ci} className="card-organic p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5D7052] flex-shrink-0" />
                  <h3 className="font-heading font-semibold text-sm text-[#2C2C24] dark:text-[#E8E6DF]">{cat.name}</h3>
                  <span className="text-[10px] text-[#78786C]/60 dark:text-[#5A5850]">{cat.items.length} 条</span>
                </div>
                <div className="space-y-1">
                  {cat.items.map((item, ii) => {
                    const key = `${ci}-${ii}`;
                    return (
                      <DigestItemRow
                        key={key}
                        item={item}
                        expanded={expandedKey === key}
                        onToggle={() => setExpandedKey((k) => (k === key ? null : key))}
                        onOpenArticle={(id) => navigate(`/article/${id}`)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DigestItemRow({
  item, expanded, onToggle, onOpenArticle,
}: {
  item: DigestItem;
  expanded: boolean;
  onToggle: () => void;
  onOpenArticle: (id: string) => void;
}) {
  const multi = item.articles.length > 1;

  function handleClick() {
    if (multi) {
      onToggle();
    } else if (item.articles[0]) {
      onOpenArticle(item.articles[0].id);
    }
  }

  return (
    <div className="rounded-xl transition-colors duration-150 hover:bg-[#F0EBE5]/50 dark:hover:bg-[#2E2B25]/50">
      <div
        onClick={handleClick}
        className="flex items-start gap-2 px-2 py-2 cursor-pointer"
      >
        <span className="w-1 h-1 rounded-full bg-[#C18C5D]/60 flex-shrink-0 mt-1.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-[#2C2C24] dark:text-[#E8E6DF]">{item.title}</span>
            {multi && (
              <span className="text-[10px] text-[#5D7052] dark:text-[#7A9A6E] font-medium">
                关联 {item.articles.length} 篇{expanded ? ' ▴' : ' ▾'}
              </span>
            )}
          </div>
          <p className="text-xs text-[#78786C] dark:text-[#8A8880] leading-relaxed mt-0.5">{item.summary}</p>
          {!multi && item.articles[0] && (
            <span className="text-[10px] text-[#78786C]/60 dark:text-[#5A5850]">{item.articles[0].feedTitle}</span>
          )}
        </div>
      </div>
      {multi && expanded && (
        <div className="ml-5 pl-2.5 border-l-2 border-[#DED8CF]/60 dark:border-[#3A3830] space-y-1 pb-2">
          {item.articles.map((a) => (
            <div
              key={a.id}
              onClick={(e) => { e.stopPropagation(); onOpenArticle(a.id); }}
              className="flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer hover:bg-[#5D7052]/10 transition-colors duration-150"
            >
              <span className={cn(
                'text-xs truncate flex-1',
                a.isRead ? 'text-[#78786C] dark:text-[#5A5850]' : 'text-[#2C2C24] dark:text-[#E8E6DF] font-medium'
              )}>
                {a.title}
              </span>
              <span className="text-[10px] text-[#78786C]/60 dark:text-[#5A5850] flex-shrink-0">{a.feedTitle}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
