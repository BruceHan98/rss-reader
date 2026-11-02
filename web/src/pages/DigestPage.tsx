import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { type DigestItem } from '../lib/api';
import { useDigestStore } from '../store/digestStore';
import { cn } from '../lib/utils';
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Loader2, Newspaper, RefreshCw, AlertCircle, Settings, Sparkles } from 'lucide-react';
import DigestCalendar from '../components/DigestCalendar';

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function DigestPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 日期存放在 URL query 中：从日报进入文章详情再返回时，历史记录带着正确日期，
  // 不会因组件重新挂载而回退到默认的「今天」
  const date = searchParams.get('date') || todayStr();
  const [showCalendar, setShowCalendar] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);

  const { getEntry, getExpandedKeys, toggleExpandedKey, fetchDigest, generateDigest } = useDigestStore();
  const entry = getEntry(date);
  const expandedKeys = getExpandedKeys(date);

  useEffect(() => {
    // idle 状态（首次访问该日期）才发起查询；已有状态（包括其他日期正在后台生成）不受影响
    if (entry.status === 'idle') fetchDigest(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || entry.status !== 'ready') return;
    const saved = Number(sessionStorage.getItem(`digest-scroll:${date}`));
    const position = Number.isFinite(saved) && saved > 0 ? saved : 0;
    scrollPositionRef.current = position;
    container.scrollTo({ top: position, behavior: 'instant' });

    // 卡片展开状态和页面布局会在渲染后继续稳定，再校正一次防止位置偏移。
    const frame = requestAnimationFrame(() => {
      container.scrollTo({ top: position, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [date, entry.status]);

  useEffect(() => {
    const currentDate = date;
    return () => {
      const position = scrollPositionRef.current;
      if (position > 0) {
        sessionStorage.setItem(`digest-scroll:${currentDate}`, String(position));
      } else {
        sessionStorage.removeItem(`digest-scroll:${currentDate}`);
      }
    };
  }, [date]);

  function saveScrollPosition() {
    const position = scrollContainerRef.current?.scrollTop ?? scrollPositionRef.current;
    scrollPositionRef.current = position;
    if (position > 0) sessionStorage.setItem(`digest-scroll:${date}`, String(position));
  }

  function setDate(d: string) {
    // 用 replace 避免每次切换日期都新增一条历史记录（否则「返回」需要点很多次才能退出日报页）
    // 进入文章详情前的这条 /digest?date=xxx 记录始终是最新选中日期，返回时能正确带回
    setSearchParams({ date: d }, { replace: true });
  }

  function shiftDate(delta: number) {
    setDate(format(addDays(new Date(date), delta), 'yyyy-MM-dd'));
  }

  const dateObj = new Date(date);
  const dateLabel = isToday(dateObj) ? '今天' : format(dateObj, 'M月d日 EEEE', { locale: zhCN });
  const canGoNext = date < todayStr();
  const isGenerating = entry.status === 'generating';

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-card)]">
      {/* Header */}
      <header className="page-header ios-pwa-top-bar">
        <div className="page-header-row">
        <h1 className="page-title flex-1 min-w-0 truncate">日报</h1>
          <button
            onClick={() => shiftDate(-1)}
            className="toolbar-button shrink-0"
            title="前一天"
            aria-label="前一天"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="shrink-0">
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="toolbar-button !w-auto !px-[8px]"
              data-active={showCalendar}
              aria-label={`选择日期，当前 ${format(dateObj, 'yyyy年M月d日')}`}
              aria-expanded={showCalendar}
            >
              <span className="sm:hidden">{format(dateObj, 'MM-dd')}</span>
              <span className="hidden sm:inline">{format(dateObj, 'yyyy-MM-dd')}</span>
            </button>
          </div>
          <button
            onClick={() => canGoNext && shiftDate(1)}
            disabled={!canGoNext}
            className="toolbar-button shrink-0 disabled:opacity-30 disabled:pointer-events-none"
            title="后一天"
            aria-label="后一天"
          >
            <ChevronRight size={16} />
          </button>
          {entry.status === 'ready' && (
            <button
              onClick={() => generateDigest(date, true)}
              disabled={isGenerating}
              className="toolbar-button shrink-0 disabled:opacity-40"
              title="重新生成"
              aria-label="重新生成"
            >
              <RefreshCw size={16} className={isGenerating ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        {showCalendar && (
          <DigestCalendar date={date} onSelect={setDate} onClose={() => setShowCalendar(false)} />
        )}
      </header>

      <div className="page-state-content">
      <div
        ref={scrollContainerRef}
        onScroll={(event) => { scrollPositionRef.current = event.currentTarget.scrollTop; }}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {entry.status === 'loading' && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <p className="page-text font-medium">加载中…</p>
          </div>
        )}

        {isGenerating && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Sparkles size={28} className="animate-pulse" />
            </div>
            <div className="w-full max-w-[16rem] text-center">
              <p className="page-text font-medium mb-3">
                {stageLabel(entry.stage)}
              </p>
              <div className="h-1.5 w-full rounded-full bg-[var(--color-muted)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500 ease-out"
                  style={{ width: `${entry.progress ?? 0}%` }}
                />
              </div>
              <p className="list-meta mt-2">
                {entry.stage === 'classifying' && entry.total ? `已分类 ${entry.processed ?? 0} / ${entry.total} 篇 · ` : ''}
                {Math.round(entry.progress ?? 0)}%
              </p>
            </div>
          </div>
        )}

        {entry.status === 'not_generated' && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Newspaper size={28} />
            </div>
            <p className="page-text font-medium">{dateLabel}还没有生成日报</p>
            {(entry.articleCount ?? 0) > 0 && (
              <button onClick={() => generateDigest(date)} className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
                <Sparkles size={14} className="shrink-0" />
                <span>生成日报</span>
              </button>
            )}
          </div>
        )}

        {entry.status === 'error' && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <AlertCircle size={28} />
            </div>
            <p className="page-text font-medium break-words max-w-full">{entry.error?.message}</p>
            {entry.error?.code === 'NO_API_KEY' ? (
              <button
                onClick={() => navigate('/settings')}
                className="btn-secondary inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Settings size={14} className="shrink-0" />
                <span>前往设置</span>
              </button>
            ) : entry.error?.code === 'NO_ARTICLES' ? null : (
              <button onClick={() => generateDigest(date)} className="btn-secondary">重试</button>
            )}
          </div>
        )}

        {entry.status === 'ready' && entry.data && entry.data.categories.length === 0 && (
          <div className="page-empty-state">
            <div className="empty-state-icon">
              <Newspaper size={28} />
            </div>
            <p className="page-text font-medium">{dateLabel}暂无日报内容</p>
          </div>
        )}

        {entry.status === 'ready' && entry.data && entry.data.categories.length > 0 && (
          <div>
            <div className="list-meta page-content-gutter py-3">
              {dateLabel} · 已整理 {entry.data.articleCount} 篇文章
            </div>

            {entry.data.categories.flatMap((cat, ci) => cat.items.map((item, ii) => {
              const key = `${ci}-${ii}`;
              return (
                <DigestItemRow
                  key={key}
                  item={item}
                  expanded={expandedKeys.includes(key)}
                  onToggle={() => toggleExpandedKey(date, key)}
                  onOpenArticle={(id) => {
                    saveScrollPosition();
                    navigate(`/article/${id}`);
                  }}
                />
              );
            }))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// 阶段由服务端实际处理流程上报，不再按时间模拟进度。
function stageLabel(stage?: string | null): string {
  switch (stage) {
    case 'preparing': return '正在整理当天文章…';
    case 'classifying': return 'AI 正在轻量分类…';
    case 'merging': return '正在合并全局主题…';
    case 'saving': return '正在保存日报…';
    default: return '正在启动生成…';
  }
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
  const sourceLabel = multi ? `${item.articles.length} 篇关联原文` : item.articles[0]?.feedTitle ?? '原文';

  function handleClick() {
    if (multi) {
      onToggle();
    } else if (item.articles[0]) {
      onOpenArticle(item.articles[0].id);
    }
  }

  return (
    <article className="article-row relative overflow-hidden">
      <button
        type="button"
        onClick={handleClick}
        className="relative block w-full py-[16px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
        aria-label={`${multi ? (expanded ? '收起关联原文' : '查看关联原文') : '阅读原文'}：${item.title}`}
        aria-expanded={multi ? expanded : undefined}
      >
        <div className="page-content-gutter">
          <span className="list-meta block mb-[6px] truncate">{sourceLabel}</span>
          <div className="flex items-start gap-2">
            <h3 className="list-title line-clamp-2 min-w-0 flex-1">
              {item.title}
            </h3>
            {multi ? (
              <ChevronDown size={16} aria-hidden="true" className={cn('mt-0.5 shrink-0 text-[var(--color-muted-fg)] transition-transform duration-300', expanded && 'rotate-180')} />
            ) : (
              <ArrowUpRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-muted-fg)]" />
            )}
          </div>
          {item.summary && (
            <p className="list-summary line-clamp-3 mt-[6px]">
              {item.summary}
            </p>
          )}
        </div>
      </button>

      {multi && (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
          aria-hidden={!expanded}
        >
          <div className="overflow-hidden">
            <div className="pb-2">
              <div className="border-t border-[var(--color-border)]">
                {item.articles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onOpenArticle(article.id)}
                    tabIndex={expanded ? 0 : -1}
                    aria-label={`阅读原文：${article.title}`}
                    className="article-row block w-full py-[16px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
                  >
                    <span className="page-content-gutter flex items-start gap-2">
                      <span className="min-w-0 flex-1 pl-2">
                        <span className="list-meta block mb-[6px] truncate">{article.feedTitle}</span>
                        <span className={cn('list-title line-clamp-2', article.isRead && '!text-[var(--color-muted-fg)]')}>
                          {article.title}
                        </span>
                      </span>
                      <ArrowUpRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-muted-fg)]" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
