import { useState } from 'react';
import { cn } from '../lib/utils';

// 保留订阅源的独立识别色，统一为低饱和的编辑部色板。
const COLORS = [
  '#3478F6', '#82634C', '#7761A4', '#367A83', '#A85448',
  '#397967', '#856B50', '#6558A2', '#69754B', '#4D6D96',
];
function colorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface FeedIconProps {
  favicon?: string | null;
  siteUrl?: string | null;
  url: string;
  title: string;
  className?: string;
}

export default function FeedIcon({ favicon, siteUrl, url, title, className }: FeedIconProps) {
  const [failed, setFailed] = useState(false);

  // 计算 favicon URL：优先用存储的，否则猜 /favicon.ico
  let faviconUrl = '';
  if (!failed) {
    if (favicon) {
      faviconUrl = favicon;
    } else {
      try {
        faviconUrl = new URL(siteUrl || url).origin + '/favicon.ico';
      } catch {
        faviconUrl = '';
      }
    }
  }

  const letter = (title || url).trim()[0]?.toUpperCase() || '?';
  const bgColor = colorFromString(title || url);

  if (faviconUrl && !failed) {
    return (
      <img
        src={faviconUrl}
        alt=""
        className={cn('rounded-[25%] object-cover flex-shrink-0', className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn('rounded-[25%] flex-shrink-0 flex items-center justify-center text-white font-semibold', className)}
      style={{ backgroundColor: bgColor, fontSize: '55%' }}
    >
      {letter}
    </span>
  );
}
