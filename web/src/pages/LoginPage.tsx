import { useState, useEffect } from 'react';
import { Rss, LogIn, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  onLogin: (username: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 自动填入 admin（单用户场景方便登录）
  useEffect(() => {
    setUsername('admin');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.login(username, password);
      onLogin(username);
    } catch (err: any) {
      setError(err.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#5D7052] flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(93,112,82,0.4)]">
            <Rss size={22} className="text-[#F3F4F1]" />
          </div>
          <div className="text-center">
            <h1 className="font-heading font-bold text-xl text-[#2C2C24] tracking-tight">RSS Reader</h1>
            <p className="text-sm text-[#78786C] mt-1">请登录以继续</p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#FEFEFA] border border-[#DED8CF]/50 rounded-3xl p-7 shadow-[0_4px_24px_-4px_rgba(44,44,36,0.08)] space-y-4"
        >
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#A85448]/8 border border-[#A85448]/20 text-[#A85448] text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#78786C] uppercase tracking-wider">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className="input-field w-full h-10 text-sm px-4"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#78786C] uppercase tracking-wider">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="input-field w-full h-10 text-sm px-4 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78786C] hover:text-[#5D7052] transition-colors"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-full bg-[#5D7052] text-[#F3F4F1] text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:bg-[#4A5E42] hover:shadow-[0_4px_16px_-4px_rgba(93,112,82,0.45)] active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="text-center text-[11px] text-[#78786C]/50 mt-6">
          首次启动时密码已打印在服务端日志中
        </p>
      </div>
    </div>
  );
}
