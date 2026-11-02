import { useEffect, useRef, useState } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isAfter, isToday,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDigestStore } from '../store/digestStore';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 自定义日报日期选择日历（弹出式）。
 * - 点击某天直接切换并关闭，无需原生 <input type="date"> 自带的「清除/取消/设置」按钮
 * - 已生成日报的日期下方显示小圆点标记
 */
export default function DigestCalendar({
  date, onSelect, onClose,
}: {
  date: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const { generatedDates, fetchGeneratedDates } = useDigestStore();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date(date)));
  const containerRef = useRef<HTMLDivElement>(null);

  const monthKey = format(viewMonth, 'yyyy-MM');
  const markedDates = generatedDates[monthKey];

  useEffect(() => {
    if (!markedDates) fetchGeneratedDates(monthKey);
  }, [monthKey, markedDates, fetchGeneratedDates]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();
  const selectedDate = new Date(date);
  const markedSet = new Set(markedDates ?? []);

  return (
    <div
      ref={containerRef}
      className="absolute right-[20px] md:right-[24px] top-full mt-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.1)] z-50 p-3 w-[min(280px,calc(100vw-40px))]"
    >
      {/* Month header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="toolbar-button"
          aria-label="上个月"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[13px] leading-[20px] font-semibold text-[#242424] dark:text-[#E5E7EB]">
          {format(viewMonth, 'yyyy年M月', { locale: zhCN })}
        </span>
        <button
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          disabled={isAfter(startOfMonth(addMonths(viewMonth, 1)), today)}
          className="toolbar-button"
          aria-label="下个月"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center list-meta text-[#717784]/50 dark:text-[#959CA8] font-medium py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const dStr = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, viewMonth);
          const future = isAfter(d, today) && !isToday(d);
          const selected = isSameDay(d, selectedDate);
          const marked = markedSet.has(dStr);
          return (
            <button
              key={dStr}
              aria-label={format(d, 'yyyy年M月d日')}
              aria-pressed={selected}
              disabled={future}
              onClick={() => { onSelect(dStr); onClose(); }}
              className={cn(
                'relative w-full aspect-square flex flex-col items-center justify-center rounded-lg text-[13px] leading-[20px] transition-colors duration-150',
                !inMonth && 'text-[#9299A5]/60 dark:text-[#959CA8]',
                inMonth && !selected && 'text-[#242424] dark:text-[#E5E7EB] hover:bg-[#3478F6]/10',
                selected && 'bg-[#3478F6] text-white font-semibold',
                future && 'opacity-30 pointer-events-none',
                isToday(d) && !selected && 'font-semibold text-[#3478F6] dark:text-[#82AEFF]'
              )}
            >
              {format(d, 'd')}
              {marked && (
                <span
                  className={cn(
                    'absolute bottom-1 w-1 h-1 rounded-full',
                    selected ? 'bg-white' : 'bg-[var(--color-primary)]'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
