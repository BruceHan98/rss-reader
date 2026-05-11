import { useState } from 'react';
import ReactDOM from 'react-dom';
import { useStore } from '../store';
import { X, Rss, Loader2 } from 'lucide-react';

export default function AddFeedModal({ onClose }: { onClose: () => void }) {
  const { addFeed, groups } = useStore();
  const [url, setUrl] = useState('');
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      await addFeed(url.trim(), undefined, groupId || undefined);
      onClose();
    } catch (err: any) {
      setError(err.message || '添加失败，请检查 URL 是否正确');
    } finally {
      setLoading(false);
    }
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#2C2C24]/40 backdrop-blur-sm">
      <div className="bg-[#FEFEFA] dark:bg-[#232320] border border-[#DED8CF]/50 rounded-[2rem] shadow-[0_24px_64px_-12px_rgba(44,44,36,0.2)] w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#DED8CF]/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#5D7052] flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(93,112,82,0.3)]">
              <Rss size={16} className="text-[#F3F4F1]" />
            </div>
            <h2 className="font-heading font-semibold text-base text-[#2C2C24]">添加订阅源</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#78786C] transition-all duration-200 hover:bg-[#E6DCCD] hover:text-[#2C2C24] active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#78786C] uppercase tracking-wider mb-2">
              RSS / Atom URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="input-field"
              autoFocus
              required
            />
          </div>

          {groups.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[#78786C] uppercase tracking-wider mb-2">
                分组（可选）
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="select-field w-full"
              >
                <option value="">不分组</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-2xl bg-[#A85448]/10 border border-[#A85448]/20 text-sm text-[#A85448]">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? '添加中…' : '添加订阅'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
