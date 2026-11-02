import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import AddFeedModal from './AddFeedModal';
import FeedIcon from './FeedIcon';
import {
  Star, Bookmark, Search, Settings, ChevronDown, ChevronRight,
  Plus, RefreshCw, Trash2, Library, CircleDot, Newspaper,
  CheckCircle, AlertCircle, X, EyeOff, Eye, MoreHorizontal,
} from 'lucide-react';
import { api } from '../lib/api';

// ── 简易 Toast ──
function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      className={cn(
        'fixed bottom-5 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-float',
        'text-sm font-medium min-w-[240px] max-w-[320px]',
        'animate-[slideUp_0.2s_ease-out]',
        type === 'success'
          ? 'bg-[#3478F6] text-[#FFFFFF]'
          : 'bg-[#A85448] text-white'
      )}
    >
      {type === 'success' ? <CheckCircle size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        <X size={13} />
      </button>
    </div>
  );
}

// ── 删除确认弹窗（替代 browser confirm，更可靠）──
function ConfirmDialog({
  title, message, onConfirm, onCancel,
}: { title: string; message: string; onConfirm: () => Promise<void> | void; onCancel: () => void }) {
  const [loading, setLoading] = React.useState(false);
  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  }
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#242424]/40 dark:bg-[#000000]/60 backdrop-blur-sm">
      <div className="bg-[#FFFFFF] dark:bg-[#202124] border border-[#E8EBF0]/50 dark:border-[#33363D]/60 rounded-[2rem] shadow-[0_24px_64px_-12px_rgba(36,36,36,0.2)] w-full max-w-sm p-8">
        <h3 className="font-heading font-semibold text-lg text-[#242424] dark:text-[#E5E7EB] mb-3">{title}</h3>
        <p className="text-sm text-[#717784] dark:text-[#959CA8] leading-relaxed mb-7">{message}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 h-10 rounded-full border border-[#E8EBF0] dark:border-[#33363D] text-[#717784] dark:text-[#959CA8] bg-transparent text-sm font-medium transition-all duration-200 hover:bg-[#EAF2FF] dark:hover:bg-[#283449] active:scale-95 disabled:opacity-40"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 h-10 rounded-full bg-[#A85448] text-white text-sm font-semibold transition-all duration-200 hover:bg-[#963D31] hover:shadow-[0_4px_16px_-4px_rgba(168,84,72,0.45)] active:scale-95 disabled:opacity-60"
          >
            {loading ? '删除中…' : '删除'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Sidebar() {
  const { feeds, groups, filter, setFilter, loadFeeds, deleteFeed, deleteGroup, updateFeed, setSidebarOpen } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'feed' | 'group'; id: string; name: string } | null>(null);

  // 隐藏的订阅源不计入总未读徽章
  const totalUnread = feeds.reduce((s, f) => s + (f.isHidden ? 0 : (f.unreadCount || 0)), 0);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function nav(f: Parameters<typeof setFilter>[0], path = '/') {
    setFilter(f);
    navigate(path);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }

  function navPage(path: string) {
    if (path === '/search') setFilter({ type: 'all' });
    navigate(path, { replace: true });
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }

  async function handleRefresh(feedId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (refreshingId) return;
    setRefreshingId(feedId);
    try {
      const res = await api.refreshFeed(feedId);
      await loadFeeds();
      if (res.error) {
        showToast(`拉取失败：${res.error}`, 'error');
      } else {
        showToast(
          res.newArticles > 0 ? `获取到 ${res.newArticles} 篇新文章` : '暂无新文章',
          'success'
        );
      }
    } catch {
      showToast('刷新请求失败，请检查网络', 'error');
    } finally {
      setRefreshingId(null);
    }
  }

  function handleDeleteFeed(id: string, title: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete({ type: 'feed', id, name: title });
  }

  function handleDeleteGroup(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDelete({ type: 'group', id, name });
  }

  async function handleToggleHidden(feedId: string, currentHidden: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await updateFeed(feedId, { isHidden: !currentHidden });
      showToast(!currentHidden ? '已隐藏，文章列表不再显示该订阅源' : '已取消隐藏', 'success');
    } catch {
      showToast('操作失败，请重试', 'error');
    }
  }

  async function doConfirmDelete() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'feed') {
        await deleteFeed(confirmDelete.id);
        showToast('订阅源已删除', 'success');
      } else {
        await deleteGroup(confirmDelete.id);
        showToast('分组已删除', 'success');
      }
    } catch {
      showToast('删除失败，请重试', 'error');
    } finally {
      setConfirmDelete(null);
    }
  }

  const ungroupedFeeds = feeds.filter((f) => !f.groupId);
  const groupedFeeds = (groupId: string) => feeds.filter((f) => f.groupId === groupId);

  return (
    <div className="sidebar-surface flex flex-col h-full pt-safe pb-safe lg:pt-0 lg:pb-0 bg-[#F7F8FA] dark:bg-[#17181A]">
      {/* Header */}
      <div className="hidden lg:block px-4 py-3.5" style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="brand-mark w-6 h-6" />
          <span className="brand-wordmark text-[16px] leading-5 text-[#242424] dark:text-[#E5E7EB]">
            RSS Reader
          </span>
        </div>
      </div>

      <div className="sidebar-divider hidden lg:block mx-4 h-px" />

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-2 space-y-1">
        <NavItem icon={<Library size={18} />} label="全部文章" badge={totalUnread || undefined}
          active={pathname === '/' && filter.type === 'all'} onClick={() => nav({ type: 'all' })} />
        <NavItem icon={<CircleDot size={18} />} label="未读"
          active={pathname === '/' && filter.type === 'unread'} onClick={() => nav({ type: 'unread' })} />
        <NavItem icon={<Star size={18} />} label="已收藏"
          active={pathname === '/' && filter.type === 'starred'} onClick={() => nav({ type: 'starred' })} />
        <NavItem icon={<Bookmark size={18} />} label="稍后阅读"
          active={pathname === '/' && filter.type === 'read-later'} onClick={() => nav({ type: 'read-later' })} />

        <div className="pt-4 pb-1.5 px-2 flex items-center justify-between">
          <span className="section-title text-[var(--color-fg-muted)]">订阅源</span>
          <button
            onClick={() => setShowAddFeed(true)}
            className="toolbar-button"
            title="添加订阅源"
            aria-label="添加订阅源"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Groups */}
        {groups.map((group) => {
          const gFeeds = groupedFeeds(group.id);
          const gUnread = gFeeds.reduce((s, f) => s + (f.isHidden ? 0 : (f.unreadCount || 0)), 0);
          const expanded = expandedGroups.has(group.id);
          return (
            <div key={group.id}>
              <div className={cn(
                'sidebar-row group',
                pathname === '/' && filter.type === 'group' && filter.groupId === group.id && 'sidebar-selected'
              )}>
                <button
                  className="p-0.5 shrink-0 rounded focus-visible:outline focus-visible:outline-2"
                  aria-label={`${expanded ? '收起' : '展开'}分组「${group.name}」`}
                  title={`${expanded ? '收起' : '展开'}分组`}
                  aria-expanded={expanded}
                  onClick={(e) => { e.stopPropagation(); toggleGroup(group.id); }}
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <button
                  className="flex flex-1 min-w-0 items-center gap-2 text-left rounded focus-visible:outline focus-visible:outline-2"
                  aria-current={pathname === '/' && filter.type === 'group' && filter.groupId === group.id ? 'page' : undefined}
                  onClick={() => nav({ type: 'group', groupId: group.id })}
                >
                  <span className="flex-1 truncate">{group.name}</span>
                  {gUnread > 0 && <Badge count={gUnread} />}
                </button>
                <button
                  onClick={(e) => handleDeleteGroup(group.id, group.name, e)}
                  className="shrink-0 p-1 rounded lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:opacity-100 text-[var(--color-fg-muted)] hover:text-[#A85448] transition-opacity"
                  title="删除分组"
                  aria-label={`删除分组「${group.name}」`}
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {expanded && (
                <div className="ml-3 mt-0.5 space-y-0.5">
                  {gFeeds.map((feed) => (
                    <FeedItem
                      key={feed.id}
                      feed={feed}
                      active={pathname === '/' && filter.type === 'feed' && filter.feedId === feed.id}
                      refreshing={refreshingId === feed.id}
                      onSelect={() => nav({ type: 'feed', feedId: feed.id })}
                      onRefresh={(e) => handleRefresh(feed.id, e)}
                      onDelete={(e) => handleDeleteFeed(feed.id, feed.title, e)}
                      onToggleHidden={(e) => handleToggleHidden(feed.id, feed.isHidden, e)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped feeds */}
        {ungroupedFeeds.map((feed) => (
          <FeedItem
            key={feed.id}
            feed={feed}
            active={pathname === '/' && filter.type === 'feed' && filter.feedId === feed.id}
            refreshing={refreshingId === feed.id}
            onSelect={() => nav({ type: 'feed', feedId: feed.id })}
            onRefresh={(e) => handleRefresh(feed.id, e)}
            onDelete={(e) => handleDeleteFeed(feed.id, feed.title, e)}
            onToggleHidden={(e) => handleToggleHidden(feed.id, feed.isHidden, e)}
          />
        ))}
      </nav>

      <div className="sidebar-divider hidden lg:block mx-4 h-px" />
      <div className="hidden lg:flex px-4 py-2 justify-between gap-2">
        <button
          onClick={() => navPage('/digest')}
          className="toolbar-button"
          data-active={pathname === '/digest'}
          title="日报"
          aria-label="日报"
          aria-current={pathname === '/digest' ? 'page' : undefined}
        >
          <Newspaper size={16} />
        </button>
        <button
          onClick={() => navPage('/search')}
          className="toolbar-button"
          data-active={pathname === '/search'}
          title="搜索"
          aria-label="搜索"
          aria-current={pathname === '/search' ? 'page' : undefined}
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => navPage('/settings')}
          className="toolbar-button"
          data-active={pathname === '/settings'}
          title="设置"
          aria-label="设置"
          aria-current={pathname === '/settings' ? 'page' : undefined}
        >
          <Settings size={16} />
        </button>
      </div>

      {showAddFeed && <AddFeedModal onClose={() => setShowAddFeed(false)} />}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.type === 'feed' ? '删除订阅源' : '删除分组'}
          message={
            confirmDelete.type === 'feed'
              ? `确定删除「${confirmDelete.name}」？相关文章也会被删除。`
              : `确定删除分组「${confirmDelete.name}」？该分组下的订阅源将移至未分组。`
          }
          onConfirm={doConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function NavItem({ icon, label, badge, active, onClick }: {
  icon: React.ReactNode; label: string; badge?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={cn(
      'sidebar-row w-full',
      active && 'sidebar-selected'
    )}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && <Badge count={badge} />}
    </button>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="list-meta shrink-0 min-w-[1.3rem] text-center tabular-nums font-normal">
      {count > 999 ? '999+' : count}
    </span>
  );
}

function FeedItem({ feed, active, refreshing, onSelect, onRefresh, onDelete, onToggleHidden }: {
  feed: { id: string; title: string; url: string; siteUrl?: string | null; favicon?: string | null; unreadCount: number; isHidden: boolean };
  active: boolean; refreshing: boolean;
  onSelect: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggleHidden: (e: React.MouseEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAbove, setMenuAbove] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const row = rowRef.current;
    const menu = menuRef.current;
    const nav = row?.closest('nav');
    if (row && menu && nav) {
      setMenuAbove(row.getBoundingClientRect().bottom + menu.offsetHeight > nav.getBoundingClientRect().bottom);
    }
    menu?.querySelector('button')?.focus({ preventScroll: true });

    function closeOutside(e: Event) {
      if (e.target instanceof Node && !rowRef.current?.contains(e.target)) setMenuOpen(false);
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    function closeOnScroll() { setMenuOpen(false); }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [menuOpen]);

  return (
    <div
      ref={rowRef}
      className={cn('sidebar-row relative', active && 'sidebar-selected', menuOpen && 'z-10')}
    >
      <button
        onClick={() => { setMenuOpen(false); onSelect(); }}
        aria-current={active ? 'page' : undefined}
        title={feed.title}
        className={cn(
          'flex flex-1 min-w-0 items-center gap-2 text-left rounded focus-visible:outline focus-visible:outline-2',
          feed.isHidden && !active && 'opacity-40'
        )}
      >
        <FeedIcon favicon={feed.favicon} siteUrl={feed.siteUrl} url={feed.url} title={feed.title} className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0 truncate">{feed.title}</span>
        {feed.unreadCount > 0 && !feed.isHidden && <Badge count={feed.unreadCount} />}
      </button>
      <button
        ref={triggerRef}
        onClick={() => setMenuOpen((open) => !open)}
        className="shrink-0 flex items-center justify-center w-7 h-7 -my-1 rounded text-[var(--color-fg-muted)] hover:bg-[var(--color-muted)]"
        title="订阅源操作"
        aria-label={`订阅源「${feed.title}」的操作`}
        aria-expanded={menuOpen}
      >
        <MoreHorizontal size={16} />
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="action-menu z-20"
          style={menuAbove ? { top: 'auto', bottom: '100%' } : undefined}
          role="group"
          aria-label={`订阅源「${feed.title}」的操作`}
        >
          <button
            onClick={(e) => { setMenuOpen(false); triggerRef.current?.focus(); onRefresh(e); }}
            className="action-menu-item"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>刷新</span>
          </button>
          <button
            onClick={(e) => { setMenuOpen(false); triggerRef.current?.focus(); onToggleHidden(e); }}
            className="action-menu-item"
          >
            {feed.isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{feed.isHidden ? '取消隐藏' : '隐藏订阅源'}</span>
          </button>
          <button
            onClick={(e) => { setMenuOpen(false); triggerRef.current?.focus(); onDelete(e); }}
            className="action-menu-item"
          >
            <Trash2 size={14} />
            <span>删除</span>
          </button>
        </div>
      )}
    </div>
  );
}
