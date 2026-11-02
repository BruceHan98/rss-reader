import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 根据阅读数量返回颜色深度等级 0-4
function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 10) return 2;
  if (count <= 20) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-[#EAF2FF] dark:bg-[#283449] text-[#717784] dark:text-[#959CA8]',
  1: 'bg-[#C3D9FF] dark:bg-[#273B5A] text-[#2563D9] dark:text-[#C3D9FF]',
  2: 'bg-[#B2CDFF] dark:bg-[#3C5D91] text-[#224A88] dark:text-[#E5E7EB]',
  3: 'bg-[#5E91E8] dark:bg-[#5584D6] text-white',
  4: 'bg-[#3478F6] dark:bg-[#3478F6] text-white',
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function ReadingHeatmap() {
  const [statsMap, setStatsMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  // 当前显示月份：offset 相对于今天所在月 (0=本月, -1=上月...)
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    api.getReadingStats().then((res) => {
      const m = new Map<string, number>();
      for (const { day, count } of res.stats) m.set(day, count);
      setStatsMap(m);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());

  // 月统计总数
  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    monthTotal += statsMap.get(formatDate(year, month, d)) ?? 0;
  }

  // 构建日历格子：前补空，后补空凑满整行
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: formatDate(year, month, d) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });

  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const canGoNext = monthOffset < 0;

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#717784] hover:bg-[#3478F6]/10 hover:text-[#3478F6] transition-all active:scale-95"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#242424]">
            {year}年 {MONTHS[month]}
          </span>
          {monthTotal > 0 && (
            <span className="text-xs text-[#717784] dark:text-[#959CA8] bg-[#EAF2FF]/60 dark:bg-[#283449] px-2 py-0.5 rounded-full">
              共 {monthTotal} 篇
            </span>
          )}
        </div>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          disabled={!canGoNext}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#717784] hover:bg-[#3478F6]/10 hover:text-[#3478F6] transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-[#717784]/60 text-xs">加载中…</div>
      ) : (
        <div className="w-full">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] text-[#717784]/60 font-medium py-0.5">
                {w}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((cell, ci) => {
                  if (!cell.day || !cell.dateStr) {
                    return <div key={ci} className="aspect-square" />;
                  }
                  const count = statsMap.get(cell.dateStr) ?? 0;
                  const level = getLevel(count);
                  const isToday = cell.dateStr === todayStr;
                  return (
                    <div
                      key={ci}
                      className={[
                        'aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold transition-all duration-150',
                        LEVEL_CLASSES[level],
                        isToday ? 'ring-2 ring-[#3478F6] dark:ring-[#82AEFF] ring-offset-1 dark:ring-offset-[#202124]' : '',
                      ].join(' ')}
                      title={count > 0 ? `${cell.dateStr}：阅读 ${count} 篇` : cell.dateStr}
                    >
                      {count > 0 ? count : cell.day}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
