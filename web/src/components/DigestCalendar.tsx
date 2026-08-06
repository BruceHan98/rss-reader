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
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
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
      className="absolute right-0 top-full mt-1.5 bg-[#FEFEFA] dark:bg-[#252420] border border-[#DED8CF]/60 dark:border-[#3A3830] rounded-2xl shadow-[0_8px_24px_-4px_rgba(93,112,82,0.2)] z-50 p-3 w-[17.5rem]"
    >
      {/* Month header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-[#2C2C24] dark:text-[#E8E6DF]">
          {format(viewMonth, 'yyyy年M月', { locale: zhCN })}
        </span>
        <button
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          disabled={isAfter(startOfMonth(addMonths(viewMonth, 1)), today)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[#78786C]/60 hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[10px] text-[#78786C]/50 dark:text-[#5A5850] font-medium py-1">
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
              disabled={future}
              onClick={() => { onSelect(dStr); onClose(); }}
              className={cn(
                'relative w-full aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-colors duration-150',
                !inMonth && 'text-[#C8C4BB]/60 dark:text-[#4A4840]',
                inMonth && !selected && 'text-[#2C2C24] dark:text-[#E8E6DF] hover:bg-[#5D7052]/10',
                selected && 'bg-[#5D7052] text-white font-semibold',
                future && 'opacity-30 pointer-events-none',
                isToday(d) && !selected && 'font-semibold text-[#5D7052] dark:text-[#7A9A6E]'
              )}
            >
              {format(d, 'd')}
              {marked && (
                <span
                  className={cn(
                    'absolute bottom-1 w-1 h-1 rounded-full',
                    selected ? 'bg-white' : 'bg-[#C18C5D]'
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
