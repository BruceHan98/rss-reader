import { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { api, type Article } from '../lib/api';
import { useStore } from '../store';
import { formatDate } from '../lib/utils';
import { ExternalLink, Star, Clock, Loader2, ALargeSmall, AlignJustify, Sparkles, Tag, ArrowLeft, CheckCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

// Custom organic reading styles injected once
const READER_STYLES = `
  .article-body {
    font-family: 'Fraunces', 'Georgia', 'Songti SC', 'SimSun', 'Source Han Serif SC', serif;
    color: #2C2C24;
    font-size: 1rem;
    line-height: 1.8;
  }
  .dark .article-body { color: #E8E6DF; }
  .article-body h1,
  .article-body h2,
  .article-body h3,
  .article-body h4 {
    font-family: 'Fraunces', 'Georgia', 'Songti SC', 'SimSun', 'Source Han Serif SC', serif;
    color: #2C2C24;
    margin-top: 2em;
    margin-bottom: 0.6em;
    line-height: 1.3;
    font-weight: 700;
  }
  .article-body h1 { font-size: 1.6rem; }
  .article-body h2 { font-size: 1.35rem; }
  .article-body h3 { font-size: 1.15rem; }
  .article-body p { margin-bottom: 1.2em; text-align: justify; }
  .article-body.indent-paragraphs p { text-indent: 2em; }
  .article-body.indent-paragraphs blockquote p,
  .article-body.indent-paragraphs li p,
  .article-body.indent-paragraphs pre p,
  .article-body.indent-paragraphs code p,
  .article-body.indent-paragraphs p:has(> img:only-child),
  .article-body.indent-paragraphs p:has(> a > img:only-child) { text-indent: 0; }
  .article-body a {
    color: #5D7052;
    text-decoration: underline;
    text-decoration-color: #5D7052/40;
    text-underline-offset: 3px;
  }
  .article-body a:hover { text-decoration-color: #5D7052; }
.article-body img {
max-width: 100%;
border-radius: 1.25rem;
box-shadow: 0 4px 20px -2px rgba(93,112,82,0.15);
margin: 1.5em auto;
display: block;
}
.article-img-error {
display: inline-flex;
align-items: center;
gap: 0.35em;
margin: 0.6em 0;
padding: 0.3em 0.75em 0.3em 0.55em;
border-radius: 99px;
background: #EDE8E0;
border: 1px solid #D4CFC8;
color: #8C887E;
font-family: 'Nunito', system-ui, sans-serif;
font-size: 0.75rem;
font-style: normal;
font-weight: 500;
line-height: 1;
letter-spacing: 0.01em;
}
.article-img-error svg {
display: block;
flex-shrink: 0;
}
  .article-body blockquote {
    border-left: 3px solid #C18C5D;
    padding: 0.5em 0 0.5em 1.25em;
    margin: 1.5em 0;
    color: #78786C;
    font-style: italic;
    background: #F0EBE5/30;
    border-radius: 0 1rem 1rem 0;
  }
  .article-body pre {
    background: #F0EBE5;
    border: 1px solid #DED8CF;
    border-radius: 1rem;
    padding: 1.25em 1.5em;
    overflow-x: auto;
    margin: 1.5em 0;
    font-size: 0.875rem;
  }
  .article-body code:not(pre code) {
    background: #E6DCCD/60;
    color: #C18C5D;
    padding: 0.15em 0.45em;
    border-radius: 0.4em;
    font-size: 0.875em;
  }
.article-body ul, .article-body ol {
padding-left: 2em;
margin-bottom: 1.2em;
}
  .article-body li { margin-bottom: 0.4em; }
  .article-body hr {
    border: none;
    border-top: 1px solid #DED8CF;
    margin: 2em 0;
  }
  .article-body .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 1.5em 0;
  }
  .article-body table {
    width: 100%;
    min-width: 400px;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .article-body th {
    background: #F0EBE5;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    padding: 0.6em 1em;
    border: 1px solid #DED8CF;
    text-align: left;
  }
  .article-body td {
    padding: 0.5em 1em;
    border: 1px solid #DED8CF/60;
  }
  .article-body tr:nth-child(even) td { background: #FDFCF8; }
  /* Dark mode overrides for reader */
  .dark .article-body pre { background: #252420; border-color: #3A3830; }
  .dark .article-body code:not(pre code) { background: rgba(58,56,48,0.7); color: #D4A574; }
  .dark .article-body blockquote { color: #8A8880; background: rgba(37,36,32,0.5); }
  .dark .article-body h1, .dark .article-body h2, .dark .article-body h3, .dark .article-body h4 { color: #E8E6DF; }
  .dark .article-body a { color: #7A9A6E; }
  .dark .article-body td { border-color: #3A3830; }
  .dark .article-body th { background: #252420; border-color: #3A3830; color: #E8E6DF; }
  .dark .article-body tr:nth-child(even) td { background: #1C1C18; }
  .dark .article-body hr { border-color: #3A3830; }
`;

// Width presets: max-w class and label
const WIDTH_PRESETS = [
  { key: 'sm', label: '窄', maxW: 'max-w-xl' },
  { key: 'md', label: '中', maxW: 'max-w-2xl' },
  { key: 'lg', label: '宽', maxW: 'max-w-4xl' },
] as const;
type WidthKey = typeof WIDTH_PRESETS[number]['key'];

// Font size presets: rem value and label
const FONT_PRESETS = [
  { key: 'sm', label: '小', size: '0.9375rem' },
  { key: 'md', label: '中', size: '1.0625rem' },
  { key: 'lg', label: '大', size: '1.125rem' },
] as const;
type FontKey = typeof FONT_PRESETS[number]['key'];

function loadPref<T extends string>(key: string, fallback: T): T {
  return (localStorage.getItem(key) as T) ?? fallback;
}

interface Props {
  articleId: string;
  onBack?: () => void;
  /** Called when the article is marked as read (only when it was unread on load) */
  onRead?: (articleId: string, feedId: string) => void;
}

export default function ArticleReader({ articleId, onBack, onRead }: Props) {
  const { setImmersiveMode, immersiveMode } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollY = useRef(0);
  const saveScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchCancelRef = useRef(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not-found' | 'network' | null>(null);
  const [widthKey, setWidthKey] = useState<WidthKey>(() => loadPref('reader-width', 'md'));
  const [fontKey, setFontKey] = useState<FontKey>(() => loadPref('reader-font', 'md'));
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: 'success' | 'error') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  const widthPreset = WIDTH_PRESETS.find((p) => p.key === widthKey)!;
  const fontPreset = FONT_PRESETS.find((p) => p.key === fontKey)!;

  function handleSetWidth(k: WidthKey) {
    setWidthKey(k);
    localStorage.setItem('reader-width', k);
    setShowWidthPicker(false);
  }

  function handleSetFont(k: FontKey) {
    setFontKey(k);
    localStorage.setItem('reader-font', k);
    setShowFontPicker(false);
  }

  // Inject styles once
  useEffect(() => {
    const id = 'reader-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = READER_STYLES;
      document.head.appendChild(style);
    }
  }, []);

  async function fetchArticle() {
    fetchCancelRef.current = false;
    setLoading(true);
    setLoadError(null);
    setArticle(null);

    // 自动重试：最多尝试 3 次（首次 + 2 次重试），每次间隔翻倍
    const MAX_ATTEMPTS = 3;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (fetchCancelRef.current) return;
      // 404 类错误无需重试
      if (lastErr) {
        const is404 = lastErr.message === '文章不存在' || lastErr.message?.includes('404');
        if (is404) break;
        // 等待后重试：500ms、1000ms
        await new Promise((r) => setTimeout(r, 500 * attempt));
        if (fetchCancelRef.current) return;
      }
      try {
        const a = await api.getArticle(articleId);
        if (fetchCancelRef.current) return;
        setArticle(a);
        setLoading(false);
        if (!a.isRead) {
          onRead?.(articleId, a.feedId);
        }
        return;
      } catch (err) {
        lastErr = err as Error;
        console.error(`加载文章失败 (attempt ${attempt + 1}):`, err);
      }
    }

    if (fetchCancelRef.current) return;
    const is404 = lastErr?.message === '文章不存在' || lastErr?.message?.includes('404');
    setLoadError(is404 ? 'not-found' : 'network');
    setLoading(false);
  }

  useEffect(() => {
    fetchCancelRef.current = false;
    fetchArticle();
    return () => {
      fetchCancelRef.current = true;
      // 离开时保存当前滚动位置
      if (scrollRef.current && scrollRef.current.scrollTop > 0) {
        localStorage.setItem(`read-pos:${articleId}`, String(scrollRef.current.scrollTop));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // 文章加载完成后，恢复上次已读位置
  useEffect(() => {
    if (!article || !scrollRef.current) return;
    const saved = localStorage.getItem(`read-pos:${article.id}`);
    if (saved) {
      const pos = parseInt(saved, 10);
      if (pos > 0) {
        // 等内容渲染后再恢复，避免内容未就绪导致滑动无效
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: pos, behavior: 'instant' });
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  useEffect(() => {
    if (!article) return;
    document.querySelectorAll('.article-body pre code').forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
    // 将表格包裹在可横向滚动的容器内，防止撑破页面宽度
    document.querySelectorAll('.article-body table').forEach((table) => {
      if (table.parentElement?.classList.contains('table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode!.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
    document.querySelectorAll('.article-body img').forEach((el) => {
      const img = el as HTMLImageElement;
      img.loading = 'lazy';

      // 优先取懒加载属性中的真实图片地址（掘金、知乎等网站常用 data-src/data-lazy-src/data-original）
      const lazySrc =
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-url') ||
        null;

      let src = lazySrc || img.getAttribute('src');
      if (!src) return;
      // Base64 占位图（懒加载占位）：本身不是真实图片，直接跳过
      if (src.startsWith('data:')) return;
      // 已经是代理 URL，跳过（避免重复处理）
      if (src.startsWith('/api/img-proxy')) return;

      // 若从 data-src 取到了真实地址，同步更新 img.src 并清除 srcset
      if (lazySrc) {
        img.src = lazySrc;
        img.removeAttribute('srcset');
      }

      // 相对路径（如 /_next/image?...）：补全文章来源域名，使其成为可代理的绝对 URL
      if (!src.startsWith('http://') && !src.startsWith('https://')) {
        if (!article.url) return; // 无来源 URL，无法补全，跳过
        try {
          const origin = new URL(article.url).origin;
          src = origin + (src.startsWith('/') ? src : '/' + src);
          img.src = src; // 先用绝对 URL 替换，让直连尝试也能生效
          img.removeAttribute('srcset'); // 清除 srcset，防止浏览器优先用 srcset 中的相对路径
        } catch {
          return;
        }
      }

      const proxyUrl = article.url
        ? `/api/img-proxy?url=${encodeURIComponent(src)}&referer=${encodeURIComponent(article.url)}`
        : `/api/img-proxy?url=${encodeURIComponent(src)}`;

      // 策略：先让图片直接加载（不替换 src）
      // 失败后才降级走服务端代理（绕过防盗链），代理失败再重试一次，最终仍失败才显示占位
      let stage = 0; // 0=直连, 1=代理, 2=代理重试
      img.onerror = () => {
        stage++;
        if (stage === 1) {
          // 直连失败 → 走代理
          img.src = proxyUrl;
        } else if (stage === 2) {
          // 代理首次失败 → 加时间戳重试一次
          setTimeout(() => { img.src = `${proxyUrl}&_r=1`; }, 800);
        } else {
          // 全部失败 → 显示占位
          img.onerror = null;
          const placeholder = document.createElement('div');
          placeholder.className = 'article-img-error';
          placeholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span>图片加载失败</span>`;
          img.replaceWith(placeholder);
        }
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  const [starPending, setStarPending] = useState(false);
  const [readLaterPending, setReadLaterPending] = useState(false);

  async function handleStar() {
    if (!article || starPending) return;
    setStarPending(true);
    const prevStarred = article.isStarred;
    const nextStarred = !prevStarred;
    setArticle((prev) => prev ? { ...prev, isStarred: nextStarred } : prev); // 乐观更新
    try {
      const res = await api.toggleStar(article.id);
      setArticle((prev) => prev ? { ...prev, isStarred: res.isStarred } : prev);
      // 通知列表更新对应文章的收藏状态
      window.dispatchEvent(new CustomEvent('article-starred', { detail: { articleId: article.id, isStarred: res.isStarred } }));
      showToast(res.isStarred ? '已加入收藏' : '已取消收藏', 'success');
    } catch {
      setArticle((prev) => prev ? { ...prev, isStarred: prevStarred } : prev); // 失败回滚
      showToast('操作失败，请重试', 'error');
    } finally {
      setStarPending(false);
    }
  }

  async function handleReadLater() {
    if (!article || readLaterPending) return;
    setReadLaterPending(true);
    const prevReadLater = article.isReadLater;
    const nextReadLater = !prevReadLater;
    setArticle((prev) => prev ? { ...prev, isReadLater: nextReadLater } : prev); // 乐观更新
    try {
      const res = await api.toggleReadLater(article.id);
      setArticle((prev) => prev ? { ...prev, isReadLater: res.isReadLater } : prev);
      // 通知列表更新对应文章的稍后阅读状态
      window.dispatchEvent(new CustomEvent('article-read-later', { detail: { articleId: article.id, isReadLater: res.isReadLater } }));
      showToast(res.isReadLater ? '已加入稍后阅读' : '已从稍后阅读移除', 'success');
    } catch {
      setArticle((prev) => prev ? { ...prev, isReadLater: prevReadLater } : prev); // 失败回滚
      showToast('操作失败，请重试', 'error');
    } finally {
      setReadLaterPending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#FDFCF8] dark:bg-[#1C1C18]">
        <div className="flex flex-col items-center gap-3 text-[#78786C] dark:text-[#8A8880]">
          <div className="w-12 h-12 rounded-full bg-[#E6DCCD]/60 dark:bg-[#2E2B25] flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-[#5D7052] dark:text-[#7A9A6E]" />
          </div>
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#FDFCF8] dark:bg-[#1C1C18] gap-3 text-[#78786C] dark:text-[#8A8880]">
        {loadError === 'network' ? (
          <>
            <p className="text-sm">加载失败，请检查网络连接</p>
            <button
              onClick={fetchArticle}
              className="px-4 py-2 rounded-full bg-[#5D7052]/10 text-[#5D7052] text-sm font-semibold hover:bg-[#5D7052]/20 active:scale-95 transition-all"
            >
              重试
            </button>
          </>
        ) : (
          <p className="text-sm">文章不存在</p>
        )}
      </div>
    );
  }

  const rawContent = DOMPurify.sanitize(article.content || article.summary || '', {
    ADD_ATTR: ['target', 'data-src', 'data-lazy-src', 'data-original', 'data-url'],
    FORBID_TAGS: ['script', 'style'],
  // Remove stray quotes after closing tags — artifact of malformed RSS HTML
  }).replace(/<\/a>"/g, '</a>').replace(/<\/a>&#34;/g, '</a>').replace(/<\/a>&quot;/g, '</a>');

  // 剥除 <p> 开头的全角空格（U+3000）和普通空格缩进
  // 财新等中文媒体常用 "　　文字" 代替 CSS text-indent，需先统一剥除再由 CSS 处理
  const strippedContent = rawContent
    ? rawContent.replace(/(<p[^>]*>)([\u3000\u00a0\s]+)/gi, '$1')
    : rawContent;

  // 判断文章是否适合首行缩进
  // 规则：中文字符占比 ≥ 30%、有效段落数 ≥ 3、段落平均字符数 ≥ 40
  const shouldIndent = (() => {
    if (!strippedContent) return false;
    const doc = new DOMParser().parseFromString(strippedContent, 'text/html');
    const paragraphs = Array.from(doc.querySelectorAll('p')).filter((p) => {
      // 排除只含图片的段落
      const imgs = p.querySelectorAll('img');
      const text = p.textContent?.trim() ?? '';
      return !(imgs.length > 0 && text.length === 0);
    });
    if (paragraphs.length < 3) return false;
    // 检测是否已有内联 text-indent 样式（避免双重缩进）
    const indentedCount = paragraphs.filter((p) =>
      /text-indent\s*:/i.test(p.getAttribute('style') ?? '')
    ).length;
    if (indentedCount / paragraphs.length > 0.3) return false;
    const texts = paragraphs.map((p) => p.textContent?.trim() ?? '').filter(Boolean);
    const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
    if (totalChars / texts.length < 40) return false;
    // 检测中文字符占比
    const chineseChars = texts.join('').match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
    if (totalChars > 0 && chineseChars / totalChars < 0.3) return false;
    return true;
  })();

  // 去除正文中与页面标题重复的内容块，以及媒体页面专有的文章头部元信息区块
  const safeContent = (() => {
    const base = strippedContent;
    if (!base) return base;

    const doc = new DOMParser().parseFromString(base, 'text/html');

    // 移除财新等媒体页面专有的元信息容器（标题区、发布信息、版权墙等）
    const JUNK_SELECTORS = [
      '#conTit',       // 财新文章头部（含 h1 标题 + 发布信息）
      '.artInfo',      // 发布时间/来源/作者区
      '.bd_block',     // 百度爬虫元信息
      '#chargeWall',   // 付费墙
      '#pay-box',      // 付费弹层
      '#pay-layer-ad',
      '#pay-layer-pro-ad',
      '.payreadwarp',
    ];
    JUNK_SELECTORS.forEach((sel) => {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    });

    if (article.title) {
      const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const titleNorm = normalizeText(article.title);

      // 判断两段文本是否"实质相同"：完全一致，或一方包含另一方
      // 要求标题至少 10 字符才做包含比较，避免短标题误删正文
      const isSameTitle = (a: string, b: string) => {
        if (!a || !b) return false;
        if (a === b) return true;
        const minLen = 10;
        if (b.length >= minLen && a.includes(b)) return true;
        if (a.length >= minLen && b.includes(a)) return true;
        return false;
      };

      // 遍历所有 h1~h6 和顶层 p，移除文本与标题实质相同的节点
      doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
        if (isSameTitle(normalizeText(el.textContent ?? ''), titleNorm)) el.remove();
      });

      // 移除第一个文本内容与标题实质相同的 <p>
      const firstP = doc.body.querySelector('p');
      if (firstP && isSameTitle(normalizeText(firstP.textContent ?? ''), titleNorm)) {
        firstP.remove();
      }
    }

    return doc.body.innerHTML;
  })();

  return (
    <div
      className="flex flex-col h-full bg-[#FDFCF8] dark:bg-[#1C1C18] overflow-hidden"
      onClick={(e) => { const t=e.target as HTMLElement; if (t.closest("button,a")) return; setShowWidthPicker(false); setShowFontPicker(false); if (window.innerWidth < 768) { if (!isScrolling.current) setImmersiveMode(false); } }}
    >
      {/* Toolbar: fixed on mobile, static on desktop */}
      <div className={cn(
        "border-b border-[#DED8CF]/50 dark:border-[#3A3830]/60 bg-[#FDFCF8]/90 dark:bg-[#1C1C18]/95 backdrop-blur-sm z-30",
        "fixed top-0 left-0 right-0 transition-[transform,opacity] duration-300 ease-in-out",
        "md:static md:flex-shrink-0 md:translate-y-0 md:opacity-100",
        immersiveMode ? "-translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      )}>
        <div className={cn('mx-auto px-4 md:px-6 py-3.5 flex items-center gap-2', widthPreset.maxW)}>
          {/* Mobile back button */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-[#78786C] transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052] active:scale-95 flex-shrink-0 -ml-1"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          {/* Action buttons */}
          <button
            onClick={handleStar}
            disabled={starPending}
            className={cn(
              'flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed',
              article.isStarred
                ? 'bg-[#C18C5D]/15 text-[#C18C5D]'
                : 'bg-[#E6DCCD]/50 dark:bg-[#2E2B25] text-[#78786C] hover:bg-[#C18C5D]/15 hover:text-[#C18C5D]'
            )}
          >
            <Star size={14} fill={article.isStarred ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">{article.isStarred ? '已收藏' : '收藏'}</span>
          </button>

          <button
            onClick={handleReadLater}
            disabled={readLaterPending}
            className={cn(
              'flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed',
              article.isReadLater
                ? 'bg-[#5D7052]/15 text-[#5D7052]'
                : 'bg-[#E6DCCD]/50 dark:bg-[#2E2B25] text-[#78786C] hover:bg-[#5D7052]/15 hover:text-[#5D7052]'
            )}
          >
            <Clock size={14} />
            <span className="hidden sm:inline">{article.isReadLater ? '稍后阅读' : '稍后'}</span>
          </button>

          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#E6DCCD]/50 dark:bg-[#2E2B25] text-[#78786C] transition-all duration-200 hover:bg-[#5D7052] hover:text-[#F3F4F1] hover:scale-105 active:scale-95"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">原文</span>
            </a>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Font size picker */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowFontPicker((v) => !v); setShowWidthPicker(false); }}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95',
                showFontPicker
                  ? 'bg-[#5D7052]/15 text-[#5D7052]'
                  : 'bg-[#E6DCCD]/50 dark:bg-[#2E2B25] text-[#78786C] hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
              )}
              title="字体大小"
            >
              <ALargeSmall size={14} />
              <span className="hidden sm:inline">{fontPreset.label}</span>
            </button>
            {showFontPicker && (
              <div
                className="absolute right-0 top-full mt-1.5 bg-[#FEFEFA] dark:bg-[#252420] border border-[#DED8CF]/60 rounded-2xl shadow-[0_8px_24px_-4px_rgba(93,112,82,0.15)] z-50 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {FONT_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handleSetFont(p.key)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap',
                      fontKey === p.key
                        ? 'bg-[#5D7052]/10 text-[#5D7052]'
                        : 'text-[#78786C] hover:bg-[#F0EBE5] dark:hover:bg-[#2E2B25]'
                    )}
                  >
                    <span style={{ fontSize: p.size, lineHeight: 1 }} className="font-serif">A</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Width picker */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowWidthPicker((v) => !v); setShowFontPicker(false); }}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95',
                showWidthPicker
                  ? 'bg-[#5D7052]/15 text-[#5D7052]'
                  : 'bg-[#E6DCCD]/50 dark:bg-[#2E2B25] text-[#78786C] hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
              )}
              title="展示宽度"
            >
              <AlignJustify size={14} />
              <span className="hidden sm:inline">{widthPreset.label}</span>
            </button>
            {showWidthPicker && (
              <div
                className="absolute right-0 top-full mt-1.5 bg-[#FEFEFA] dark:bg-[#252420] border border-[#DED8CF]/60 rounded-2xl shadow-[0_8px_24px_-4px_rgba(93,112,82,0.15)] z-50 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {WIDTH_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handleSetWidth(p.key)}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap',
                      widthKey === p.key
                        ? 'bg-[#5D7052]/10 text-[#5D7052]'
                        : 'text-[#78786C] hover:bg-[#F0EBE5] dark:hover:bg-[#2E2B25]'
                    )}
                  >
                    {/* Width visual indicator */}
                    <span className="flex gap-0.5 items-center">
                      {[...Array(p.key === 'sm' ? 2 : p.key === 'md' ? 3 : 4)].map((_, i) => (
                        <span key={i} className="w-1 h-3 rounded-sm bg-current opacity-70" />
                      ))}
                    </span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Article */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={(e) => {
          const el=e.currentTarget;
          // 节流保存阅读位置（500ms 防抖）
          if (saveScrollTimer.current) clearTimeout(saveScrollTimer.current);
          saveScrollTimer.current = setTimeout(() => {
            if (el.scrollTop > 0) {
              localStorage.setItem(`read-pos:${articleId}`, String(el.scrollTop));
            }
          }, 500);
          if (window.innerWidth >= 768) return;
          const delta=el.scrollTop-lastScrollY.current;
          lastScrollY.current=el.scrollTop;
          // 滚动时进入沉浸模式（离开顶部 40px 以内不隐藏）
          if (el.scrollTop > 40) {
            setImmersiveMode(true);
          }
          // 标记正在滚动，防止滚动期间 click 触发展示
          isScrolling.current = true;
          if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
          scrollEndTimer.current = setTimeout(() => { isScrolling.current = false; }, 200);
          // 滚动到底部，或向上滚到顶部时展示
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
          const atTop = el.scrollTop <= 40 && delta < 0;
          if (atBottom || atTop) setImmersiveMode(false);
        }}
      >
        {/* Spacer for fixed toolbar on mobile */}
        <div className="h-14 md:hidden" />
        <article className={cn('mx-auto px-6 py-10', widthPreset.maxW)}>
          {/* Feed + meta */}
          <div className="flex items-center gap-2 mb-5">
            {article.feed_favicon && (
              <img
                src={article.feed_favicon}
                alt=""
                className="w-5 h-5 rounded-full"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <span className="text-xs font-semibold text-[#5D7052] dark:text-[#7A9A6E]">{article.feed_title}</span>
            {article.author && (
              <>
                <span className="text-[#DED8CF] dark:text-[#3A3830]">·</span>
                <span className="text-xs text-[#78786C] dark:text-[#8A8880]">{article.author}</span>
              </>
            )}
            <span className="text-[#DED8CF] dark:text-[#3A3830]">·</span>
            <span className="text-xs text-[#78786C] dark:text-[#8A8880]">{formatDate(article.publishedAt)}</span>
          </div>

          {/* Title */}
          <h1 className="font-heading font-bold text-2xl leading-snug mb-4 text-[#2C2C24] dark:text-[#E8E6DF]">
            {article.title}
          </h1>

          {/* AI score + tags */}
          {(article.aiScore !== null || (article.aiTags && article.aiTags.length > 0)) && (
            <div className="flex items-center flex-wrap gap-1.5 mb-6">
              {article.aiScore !== null && (
                <span className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
                  article.aiScore >= 7
                    ? 'bg-[#5D7052]/12 text-[#5D7052]'
                    : article.aiScore >= 4
                    ? 'bg-[#C18C5D]/12 text-[#C18C5D]'
                    : 'bg-[#A85448]/12 text-[#A85448]'
                )}>
                  <Sparkles size={10} />
                  质量 {article.aiScore} / 10
                </span>
              )}
              {article.aiTags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E6DCCD]/70 dark:bg-[#2E2B25] text-[#78786C] dark:text-[#8A8880] text-xs font-medium"
                >
                  <Tag size={9} />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Organic divider */}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-0.5 flex-1 bg-gradient-to-r from-[#5D7052]/20 to-transparent rounded-full" />
            <div className="w-2 h-2 rounded-full bg-[#C18C5D]/40" />
            <div className="h-0.5 flex-1 bg-gradient-to-l from-[#5D7052]/20 to-transparent rounded-full" />
          </div>

          {/* Content */}
          {safeContent ? (
            <div
              className={cn('article-body', shouldIndent && 'indent-paragraphs')}
              style={{ fontSize: fontPreset.size }}
              dangerouslySetInnerHTML={{ __html: safeContent }}
            />
          ) : (
            <div className="text-center py-14">
              <div className="w-20 h-20 rounded-[40%_60%_60%_40%_/_40%_40%_60%_60%] bg-[#E6DCCD]/60 dark:bg-[#2E2B25] mx-auto mb-5 flex items-center justify-center">
                <ExternalLink size={24} className="text-[#5D7052]/60" />
              </div>
              <p className="text-[#78786C] dark:text-[#8A8880] mb-5 text-sm">此订阅源未提供完整内容</p>
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#5D7052] text-[#F3F4F1] text-sm font-semibold shadow-[0_4px_20px_-2px_rgba(93,112,82,0.15)] hover:shadow-[0_6px_24px_-4px_rgba(93,112,82,0.25)] hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <ExternalLink size={14} />
                  阅读原文
                </a>
              )}
            </div>
          )}
        </article>
        {/* Spacer for fixed bottom nav on mobile */}
        <div className="h-14 md:hidden" />
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-2.5 px-4 py-3 rounded-2xl',
            'shadow-[0_8px_24px_-4px_rgba(44,44,36,0.18)]',
            'text-sm font-medium min-w-[200px] max-w-[300px]',
            'animate-[slideUp_0.2s_ease-out]',
            toast.type === 'success' ? 'bg-[#5D7052] text-[#F3F4F1]' : 'bg-[#A85448] text-white'
          )}
        >
          {toast.type === 'success'
            ? <CheckCircle size={15} className="shrink-0" />
            : <AlertCircle size={15} className="shrink-0" />}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 active:scale-95">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
