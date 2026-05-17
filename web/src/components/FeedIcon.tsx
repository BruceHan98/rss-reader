import { useState } from 'react';
import { cn } from '../lib/utils';

// 根据字符串生成固定的柔和色
const COLORS = [
  '#5D7052', '#C18C5D', '#7B6B8D', '#5B8A8B', '#A85448',
  '#4A7B6B', '#8B7355', '#6B5B8D', '#7B8A5D', '#5D7B8A',
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
        className={cn('rounded-full object-cover flex-shrink-0', className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn('rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold', className)}
      style={{ backgroundColor: bgColor, fontSize: '55%' }}
    >
      {letter}
    </span>
  );
}
