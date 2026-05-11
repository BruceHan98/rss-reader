import { useEffect, useRef, useState } from 'react';
import { api, type AiStatus, type AiJobStatus } from '../lib/api';
import { Sparkles, X, Minus, Square } from 'lucide-react';
import { cn } from '../lib/utils';

const POLL_INTERVAL = 2000;

export default function AiProgressFloat() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [cancelling, setCancelling] = useState<{ score?: boolean; tags?: boolean }>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 记录上一次轮询时是否有任务在运行，用于检测 running→idle 转变
  const wasRunningRef = useRef(false);

  const isRunning = (s: AiStatus | null) =>
    s && (s.score.status === 'running' || s.tags.status === 'running');

  function handlePollResult(s: AiStatus) {
    const nowRunning = s.score.status === 'running' || s.tags.status === 'running';
    const justFinished = wasRunningRef.current && !nowRunning;
    wasRunningRef.current = nowRunning;

    if (nowRunning) {
      setStatus(s);
    } else if (justFinished) {
      // 任务从 running 变成 idle：通知列表刷新分数/标签
      window.dispatchEvent(new Event('ai-job-done'));
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      // 延迟 1 秒后隐藏浮层
      setTimeout(() => setStatus(null), 1000);
    } else {
      // 初始 poll 就是 idle（没有任务），停止轮询，不显示浮层
      setStatus(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  // 初始轮询：检查是否有正在运行的任务（如页面刷新后任务仍在跑）
  useEffect(() => {
    async function poll() {
      try {
        const s = await api.getAiStatus();
        handlePollResult(s);
      } catch {}
    }
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 外部触发任务后重新开始轮询
  useEffect(() => {
    function onAiStart() {
      if (timerRef.current) clearInterval(timerRef.current);
      // 标记为"有任务在跑"，确保 idle 时能触发 ai-job-done
      wasRunningRef.current = true;
      setMinimized(false);
      timerRef.current = setInterval(async () => {
        try {
          const s = await api.getAiStatus();
          handlePollResult(s);
        } catch {}
      }, POLL_INTERVAL);
    }
    window.addEventListener('ai-job-started', onAiStart);
    return () => window.removeEventListener('ai-job-started', onAiStart);
  }, []);

  async function handleCancel(type: 'score' | 'tags') {
    const job = status?.[type];
    if (!job?.jobId) return;
    setCancelling((prev) => ({ ...prev, [type]: true }));
    try {
      await api.cancelAiJob(job.jobId);
    } catch {}
    setCancelling((prev) => ({ ...prev, [type]: false }));
  }

  // 只有运行中或刚完成（status 非 null）时才显示
  if (!status || !isRunning(status)) return null;

  const totalRunning =
    (status.score.status === 'running' ? 1 : 0) +
    (status.tags.status === 'running' ? 1 : 0);

  const overallPct = totalRunning === 0 ? 100 : (() => {
    let sum = 0, count = 0;
    if (status.score.status === 'running' && status.score.total > 0) {
      sum += status.score.processed / status.score.total * 100;
      count++;
    }
    if (status.tags.status === 'running' && status.tags.total > 0) {
      sum += status.tags.processed / status.tags.total * 100;
      count++;
    }
    return count === 0 ? 0 : Math.round(sum / count);
  })();

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-2 rounded-full bg-[#5D7052] text-white shadow-[0_8px_32px_-4px_rgba(93,112,82,0.4)] hover:shadow-[0_12px_40px_-4px_rgba(93,112,82,0.5)] transition-all duration-300 hover:scale-105 active:scale-95"
      >
        <Sparkles size={14} className="animate-pulse" />
        <span className="text-xs font-semibold">{overallPct}%</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-72 bg-[#FEFEFA] border border-[#DED8CF]/60 rounded-2xl shadow-[0_12px_40px_-8px_rgba(93,112,82,0.25)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#5D7052]/8 border-b border-[#DED8CF]/40">
        <Sparkles size={13} className="text-[#5D7052] flex-shrink-0 animate-pulse" />
        <span className="flex-1 text-xs font-semibold text-[#2C2C24]">AI 分析进行中</span>
        <button
          onClick={() => setMinimized(true)}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[#78786C] hover:bg-[#5D7052]/10 hover:text-[#5D7052] transition-all duration-200"
          title="最小化"
        >
          <Minus size={11} />
        </button>
      </div>

      {/* Tasks */}
      <div className="px-4 py-3 space-y-3">
        {(['score', 'tags'] as const).map((type) => {
          const job: AiJobStatus = status[type];
          if (job.status !== 'running') return null;
          const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
          const label = type === 'score' ? '质量打分' : '标签提取';
          return (
            <JobProgress
              key={type}
              label={label}
              job={job}
              pct={pct}
              cancelling={!!cancelling[type]}
              onCancel={() => handleCancel(type)}
            />
          );
        })}
      </div>
    </div>
  );
}

function JobProgress({
  label, job, pct, cancelling, onCancel,
}: {
  label: string;
  job: AiJobStatus;
  pct: number;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#4A4A40]">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#78786C]">
            {job.processed} / {job.total}
          </span>
          <button
            onClick={onCancel}
            disabled={cancelling}
            className={cn(
              'w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200',
              'text-[#78786C]/60 hover:bg-[#A85448]/10 hover:text-[#A85448] active:scale-95',
              cancelling && 'opacity-40 cursor-not-allowed'
            )}
            title="停止任务"
          >
            <Square size={9} />
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-[#E6DCCD]/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#5D7052] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Current article */}
      {job.currentTitle && (
        <p className="text-[10px] text-[#78786C]/70 truncate leading-tight">
          {job.currentTitle}
        </p>
      )}
    </div>
  );
}
