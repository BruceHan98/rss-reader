import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { type DigestItem } from '../lib/api';
import { useDigestStore } from '../store/digestStore';
import { cn } from '../lib/utils';
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader2, Newspaper, RefreshCw, AlertCircle, Settings, Sparkles } from 'lucide-react';
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

  const { getEntry, getExpandedKeys, toggleExpandedKey, fetchDigest, generateDigest } = useDigestStore();
  const entry = getEntry(date);
  const expandedKeys = getExpandedKeys(date);

  useEffect(() => {
    // idle 状态（首次访问该日期）才发起查询；已有状态（包括其他日期正在后台生成）不受影响
    if (entry.status === 'idle') fetchDigest(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

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
          <div className="relative">
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className={cn(
                'h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-medium transition-all duration-200 active:scale-95',
                showCalendar
                  ? 'bg-[#5D7052]/15 text-[#5D7052]'
                  : 'text-[#78786C] hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
              )}
            >
              <CalendarDays size={13} />
              {format(dateObj, 'MM-dd')}
            </button>
            {showCalendar && (
              <DigestCalendar date={date} onSelect={setDate} onClose={() => setShowCalendar(false)} />
            )}
          </div>
          <button
            onClick={() => canGoNext && shiftDate(1)}
            disabled={!canGoNext}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            title="后一天"
          >
            <ChevronRight size={15} />
          </button>
          {entry.status === 'ready' && (
            <button
              onClick={() => generateDigest(date, true)}
              disabled={isGenerating}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#C18C5D]/15 hover:text-[#C18C5D] transition-all duration-200 active:scale-95 disabled:opacity-40 flex-shrink-0"
              title="重新生成"
            >
              <RefreshCw size={13} className={isGenerating ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {entry.status === 'loading' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[16rem] gap-3 text-[#78786C]">
            <Loader2 size={24} className="animate-spin text-[#5D7052]" />
            <p className="text-xs text-[#78786C]/70">加载中…</p>
          </div>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center justify-center h-full min-h-[20rem] gap-4 text-[#78786C] px-8">
            <div className="w-16 h-16 rounded-[40%_60%_60%_40%_/_40%_40%_60%_60%] bg-[#5D7052]/10 dark:bg-[#2E2B25] flex items-center justify-center">
              <Sparkles size={22} className="text-[#5D7052] animate-pulse" />
            </div>
            <div className="w-full max-w-[16rem] text-center">
              <p className="text-sm font-medium text-[#4A4A40] dark:text-[#B0ADA3] mb-3">
                {stageLabel(entry.stage)}
              </p>
              <div className="h-1.5 w-full rounded-full bg-[#E6DCCD]/60 dark:bg-[#2E2B25] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#5D7052] transition-[width] duration-500 ease-out"
                  style={{ width: `${entry.progress ?? 0}%` }}
                />
              </div>
              <p className="text-[11px] text-[#78786C]/60 mt-2">
                {entry.stage === 'classifying' && entry.total ? `已分类 ${entry.processed ?? 0} / ${entry.total} 篇 · ` : ''}
                {Math.round(entry.progress ?? 0)}%
              </p>
            </div>
          </div>
        )}

        {entry.status === 'not_generated' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[20rem] gap-4 text-[#78786C] px-6 text-center">
            <div className="w-20 h-20 rounded-[40%_60%_60%_40%_/_40%_40%_60%_60%] bg-[#5D7052]/10 dark:bg-[#2E2B25] flex items-center justify-center">
              <Newspaper size={26} className="text-[#5D7052]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#4A4A40] dark:text-[#B0ADA3]">{dateLabel}还没有生成日报</p>
              {(entry.articleCount ?? 0) > 0 ? (
                <p className="text-xs text-[#78786C]/60 mt-1">
                  当天共 {entry.articleCount} 篇文章，生成将消耗一定 AI 用量
                </p>
              ) : (
                <p className="text-xs text-[#78786C]/60 mt-1">换个日期试试，或先刷新订阅源</p>
              )}
            </div>
            {(entry.articleCount ?? 0) > 0 && (
              <button onClick={() => generateDigest(date)} className="btn-primary inline-flex items-center gap-1.5">
                <Sparkles size={13} /> 生成日报
              </button>
            )}
          </div>
        )}

        {entry.status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[20rem] gap-4 text-[#78786C] px-6 text-center">
            <div className="w-20 h-20 rounded-[40%_60%_60%_40%_/_40%_40%_60%_60%] bg-[#E6DCCD]/50 dark:bg-[#2E2B25] flex items-center justify-center">
              <AlertCircle size={26} className="text-[#C18C5D]" />
            </div>
            <p className="text-sm font-medium text-[#4A4A40] dark:text-[#B0ADA3]">{entry.error?.message}</p>
            {entry.error?.code === 'NO_API_KEY' ? (
              <button
                onClick={() => navigate('/settings')}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <Settings size={13} /> 前往设置
              </button>
            ) : entry.error?.code === 'NO_ARTICLES' ? (
              <p className="text-xs text-[#78786C]/60">换个日期试试，或先刷新订阅源</p>
            ) : (
              <button onClick={() => generateDigest(date)} className="btn-secondary">重试</button>
            )}
          </div>
        )}

        {entry.status === 'ready' && entry.data && entry.data.categories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[20rem] gap-3 text-[#78786C]">
            <Newspaper size={28} className="text-[#5D7052]/40" />
            <p className="text-sm font-medium">{dateLabel}暂无日报内容</p>
          </div>
        )}

        {entry.status === 'ready' && entry.data && entry.data.categories.length > 0 && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs text-[#78786C] dark:text-[#8A8880]">
                {dateLabel} · 已整理 <strong className="text-[#5D7052] dark:text-[#7A9A6E]">{entry.data.articleCount}</strong> 篇文章
              </span>
              <span className="text-[10px] font-semibold tracking-[0.14em] text-[#C18C5D]">DAILY BRIEF</span>
            </div>

            {entry.data.categories.flatMap((cat, ci) => cat.items.map((item, ii) => {
              const key = `${ci}-${ii}`;
              return (
                <DigestItemRow
                  key={key}
                  item={item}
                  expanded={expandedKeys.includes(key)}
                  onToggle={() => toggleExpandedKey(date, key)}
                  onOpenArticle={(id) => navigate(`/article/${id}`)}
                />
              );
            }))}
          </div>
        )}
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
  const sourceLabel = multi ? `${item.articles.length} 篇关联原文` : item.articles[0]?.feedTitle ?? '原文速览';

  function handleClick() {
    if (multi) {
      onToggle();
    } else if (item.articles[0]) {
      onOpenArticle(item.articles[0].id);
    }
  }

  return (
    <article className={cn(
      'group relative overflow-hidden rounded-[1.5rem_1.5rem_1.75rem_1.25rem] border border-[#DED8CF]/70 bg-[#FEFEFA]/95 shadow-[0_4px_20px_-8px_rgba(93,112,82,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-14px_rgba(93,112,82,0.34)] dark:border-[#3A3830] dark:bg-[#232320]',
      expanded && 'border-[#5D7052]/35 shadow-[0_16px_32px_-14px_rgba(93,112,82,0.30)] dark:border-[#7A9A6E]/35'
    )}>
      <div className="pointer-events-none absolute -right-7 -top-8 h-24 w-24 rounded-[40%_60%_65%_35%_/_45%_35%_65%_55%] bg-[#E6DCCD]/50 transition-transform duration-500 group-hover:scale-110 dark:bg-[#5D7052]/10" />
      <button
        type="button"
        onClick={handleClick}
        className="relative block w-full px-4 pb-3 pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5D7052]/45"
        aria-expanded={multi ? expanded : undefined}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full bg-[#5D7052]/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-[#5D7052] dark:bg-[#7A9A6E]/15 dark:text-[#9EBD91]">
            主题速览
          </span>
          <span className="max-w-[9rem] truncate text-[10px] font-medium text-[#78786C] dark:text-[#8A8880]">
            {sourceLabel}
          </span>
        </div>
        <h3 className="pr-7 text-[15px] font-bold leading-snug text-[#2C2C24] dark:text-[#E8E6DF]">
          {item.title}
        </h3>
        {item.summary && (
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#78786C] dark:text-[#B0ADA3]">
            {item.summary}
          </p>
        )}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#5D7052] dark:text-[#9EBD91]">
          {multi ? (expanded ? '收起关联原文' : '查看关联原文') : '阅读原文'}
          {multi ? (
            <ChevronDown size={14} className={cn('transition-transform duration-300', expanded && 'rotate-180')} />
          ) : (
            <ArrowUpRight size={14} />
          )}
        </span>
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
            <div className="px-4 pb-4">
              <div className="border-t border-[#DED8CF]/70 pt-3 dark:border-[#3A3830]">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[10px] font-semibold tracking-[0.12em] text-[#78786C] dark:text-[#8A8880]">关联原文</span>
                  <span className="text-[10px] text-[#78786C]/70 dark:text-[#5A5850]">{item.articles.length} 篇</span>
                </div>
                {item.articles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onOpenArticle(article.id)}
                    tabIndex={expanded ? 0 : -1}
                    className="group/article flex w-full items-center gap-2 border-t border-[#DED8CF]/45 py-3 text-left first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7052]/45 focus-visible:ring-offset-2 dark:border-[#3A3830]/80"
                  >
                    <span className={cn(
                      'min-w-0 flex-1 text-xs leading-5 transition-colors duration-150 group-hover/article:text-[#5D7052] dark:group-hover/article:text-[#9EBD91]',
                      article.isRead ? 'text-[#78786C] dark:text-[#8A8880]' : 'font-semibold text-[#2C2C24] dark:text-[#E8E6DF]'
                    )}>
                      {article.title}
                    </span>
                    <span className="max-w-[5.5rem] truncate text-[10px] text-[#78786C]/70 dark:text-[#5A5850]">{article.feedTitle}</span>
                    <ArrowUpRight size={13} className="flex-shrink-0 text-[#C18C5D] opacity-0 transition-opacity duration-150 group-hover/article:opacity-100" />
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
