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
  0: 'bg-[#EDE8E0] text-[#B8B3AB]',
  1: 'bg-[#B8CEAE] text-[#5D7052]',
  2: 'bg-[#8FB082] text-white',
  3: 'bg-[#6B9461] text-white',
  4: 'bg-[#4A7040] text-white',
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
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C] hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-all active:scale-95"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#2C2C24]">
            {year}年 {MONTHS[month]}
          </span>
          {monthTotal > 0 && (
            <span className="text-xs text-[#78786C] bg-[#E6DCCD]/60 px-2 py-0.5 rounded-full">
              共 {monthTotal} 篇
            </span>
          )}
        </div>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          disabled={!canGoNext}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C] hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-[#78786C]/60 text-xs">加载中…</div>
      ) : (
        <div className="w-full">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] text-[#78786C]/60 font-medium py-0.5">
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
                        isToday ? 'ring-2 ring-[#5D7052] ring-offset-1' : '',
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
