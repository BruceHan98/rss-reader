import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { cn, getFaviconUrl } from '../lib/utils';
import AddFeedModal from './AddFeedModal';
import {
  Rss, Star, Clock, Search, Settings, ChevronDown, ChevronRight,
  Plus, RefreshCw, Trash2, Inbox, BookOpen,
  CheckCircle, AlertCircle, X,
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
          ? 'bg-[#5D7052] text-[#F3F4F1]'
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#2C2C24]/40 backdrop-blur-sm">
      <div className="bg-[#FEFEFA] dark:bg-[#232320] border border-[#DED8CF]/50 rounded-[2rem] shadow-[0_24px_64px_-12px_rgba(44,44,36,0.2)] w-full max-w-sm p-8">
        <h3 className="font-heading font-semibold text-lg text-[#2C2C24] mb-3">{title}</h3>
        <p className="text-sm text-[#78786C] leading-relaxed mb-7">{message}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 h-10 rounded-full border border-[#DED8CF] text-[#78786C] bg-transparent text-sm font-medium transition-all duration-200 hover:bg-[#F0EDE6] active:scale-95 disabled:opacity-40"
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
  const { feeds, groups, filter, setFilter, loadFeeds, deleteFeed, deleteGroup, setSidebarOpen } = useStore();
  const navigate = useNavigate();
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'feed' | 'group'; id: string; name: string } | null>(null);

  const totalUnread = feeds.reduce((s, f) => s + (f.unreadCount || 0), 0);

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
    <div className="flex flex-col h-full bg-[#FDFCF8]">
      {/* Header */}
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#5D7052] flex items-center justify-center shadow-[0_2px_8px_-1px_rgba(93,112,82,0.35)]">
            <Rss size={13} className="text-[#F3F4F1]" />
          </div>
          <span className="font-heading font-bold text-base text-[#2C2C24] tracking-tight">
            RSS Reader
          </span>
        </div>
      </div>

      <div className="mx-4 h-px bg-[#DED8CF]/60" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2.5 space-y-0.5">
        <NavItem icon={<Inbox size={14} />} label="全部文章" badge={totalUnread || undefined}
          active={filter.type === 'all'} onClick={() => nav({ type: 'all' })} />
        <NavItem icon={<BookOpen size={14} />} label="未读"
          active={filter.type === 'unread'} onClick={() => nav({ type: 'unread' })} />
        <NavItem icon={<Star size={14} />} label="已收藏"
          active={filter.type === 'starred'} onClick={() => nav({ type: 'starred' })} />
        <NavItem icon={<Clock size={14} />} label="稍后阅读"
          active={filter.type === 'read-later'} onClick={() => nav({ type: 'read-later' })} />

        <div className="pt-3 pb-1 px-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-[#78786C]/70 uppercase tracking-widest">订阅源</span>
          <button
            onClick={() => setShowAddFeed(true)}
            className="w-5 h-5 rounded-full bg-[#E6DCCD] flex items-center justify-center text-[#5D7052] transition-all duration-200 hover:bg-[#5D7052] hover:text-[#F3F4F1] hover:scale-110 active:scale-95"
            title="添加订阅源"
          >
            <Plus size={11} />
          </button>
        </div>

        {/* Groups */}
        {groups.map((group) => {
          const gFeeds = groupedFeeds(group.id);
          const gUnread = gFeeds.reduce((s, f) => s + (f.unreadCount || 0), 0);
          const expanded = expandedGroups.has(group.id);
          return (
            <div key={group.id}>
              <div className={cn(
                'group flex items-center gap-1 px-3 py-2 rounded-full text-[13px] font-medium transition-all duration-200 cursor-pointer',
                filter.type === 'group' && filter.groupId === group.id
                  ? 'bg-[#5D7052] text-[#F3F4F1] shadow-[0_4px_12px_-2px_rgba(93,112,82,0.3)]'
                  : 'text-[#4A4A40] hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
              )}>
                <button
                  className="p-0.5 flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); toggleGroup(group.id); }}
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <span className="flex-1 truncate" onClick={() => nav({ type: 'group', groupId: group.id })}>
                  {group.name}
                </span>
                {gUnread > 0 && (
                  <Badge count={gUnread} active={filter.type === 'group' && filter.groupId === group.id} />
                )}
                <button
                  onClick={(e) => handleDeleteGroup(group.id, group.name, e)}
                  className={cn(
                    'opacity-0 group-hover:opacity-100 p-1 rounded-full transition-all duration-150 flex-shrink-0',
                    filter.type === 'group' && filter.groupId === group.id
                      ? 'hover:bg-[#F3F4F1]/20 text-[#F3F4F1]/70'
                      : 'hover:bg-[#A85448]/15 text-[#78786C] hover:text-[#A85448]'
                  )}
                  title="删除分组"
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
                      active={filter.type === 'feed' && filter.feedId === feed.id}
                      refreshing={refreshingId === feed.id}
                      onSelect={() => nav({ type: 'feed', feedId: feed.id })}
                      onRefresh={(e) => handleRefresh(feed.id, e)}
                      onDelete={(e) => handleDeleteFeed(feed.id, feed.title, e)}
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
            active={filter.type === 'feed' && filter.feedId === feed.id}
            refreshing={refreshingId === feed.id}
            onSelect={() => nav({ type: 'feed', feedId: feed.id })}
            onRefresh={(e) => handleRefresh(feed.id, e)}
            onDelete={(e) => handleDeleteFeed(feed.id, feed.title, e)}
          />
        ))}
      </nav>

      <div className="mx-4 h-px bg-[#DED8CF]/60" />
      <div className="px-2.5 py-2 flex gap-1">
        <button
          onClick={() => { setFilter({ type: 'all' }); navigate('/search', { replace: true }); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-full text-xs text-[#78786C] transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052]"
        >
          <Search size={13} />
          <span className="font-medium">搜索</span>
        </button>
        <button
          onClick={() => navigate('/settings', { replace: true })}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-full text-xs text-[#78786C] transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052]"
        >
          <Settings size={13} />
          <span className="font-medium">设置</span>
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
    <button onClick={onClick} className={cn(
      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200',
      active
        ? 'bg-[#5D7052] text-[#F3F4F1] shadow-[0_4px_12px_-2px_rgba(93,112,82,0.3)]'
        : 'text-[#4A4A40] hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
    )}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && <Badge count={badge} active={active} />}
    </button>
  );
}

function Badge({ count, active }: { count: number; active: boolean }) {
  return (
    <span className={cn(
      'text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[1.3rem] text-center',
      active ? 'bg-[#F3F4F1]/25 text-[#F3F4F1]' : 'bg-[#C18C5D]/15 text-[#C18C5D]'
    )}>
      {count > 999 ? '999+' : count}
    </span>
  );
}

function FeedItem({ feed, active, refreshing, onSelect, onRefresh, onDelete }: {
  feed: { id: string; title: string; url: string; siteUrl?: string | null; favicon?: string | null; unreadCount: number };
  active: boolean; refreshing: boolean;
  onSelect: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const faviconUrl = getFaviconUrl(feed);

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-all duration-200',
        active
          ? 'bg-[#5D7052] text-[#F3F4F1] shadow-[0_4px_12px_-2px_rgba(93,112,82,0.25)]'
          : 'text-[#4A4A40] hover:bg-[#5D7052]/10 hover:text-[#5D7052]'
      )}
      onClick={onSelect}
    >
      <img
        src={faviconUrl} alt=""
        className="w-4 h-4 rounded-full object-cover flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="flex-1 truncate text-[13px] min-w-0">{feed.title}</span>

      {/* 未读数：非活跃且无 hover 时显示 */}
      {feed.unreadCount > 0 && !active && (
        <span className="text-[11px] font-bold text-[#C18C5D] flex-shrink-0 group-hover:hidden">
          {feed.unreadCount}
        </span>
      )}

      {/* Actions：hover 时显示 */}
      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={onRefresh}
          className={cn(
            'p-1 rounded-full transition-all duration-150',
            active ? 'hover:bg-[#F3F4F1]/20 text-[#F3F4F1]/80' : 'hover:bg-[#5D7052]/15 text-[#78786C]'
          )}
          title="刷新"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onDelete}
          className={cn(
            'p-1 rounded-full transition-all duration-150',
            active ? 'hover:bg-[#F3F4F1]/20 text-[#F3F4F1]/80' : 'hover:bg-[#A85448]/15 text-[#78786C] hover:text-[#A85448]'
          )}
          title="删除"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
