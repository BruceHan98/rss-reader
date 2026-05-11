import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
  } catch {
    return '';
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
  } catch {
    return '';
  }
}

export function getFaviconUrl(feed: { favicon?: string | null; siteUrl?: string | null; url: string }): string {
  if (feed.favicon) return feed.favicon;
  try {
    const host = new URL(feed.siteUrl || feed.url).origin;
    return `${host}/favicon.ico`;
  } catch {
    return '';
  }
}
