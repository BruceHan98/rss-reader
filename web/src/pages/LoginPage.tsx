import { useState, useEffect } from 'react';
import { LogIn, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-[#FFFFFF] dark:bg-[#202124] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-5 mb-10">
          <img src="/favicon.svg" alt="" className="brand-mark w-16 h-16" />
          <div className="text-center">
            <h1 className="brand-wordmark text-[28px] sm:text-[32px] leading-tight text-[#242424] dark:text-[#E5E7EB]">RSS Reader</h1>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 px-3"
        >
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#A85448]/8 border border-[#A85448]/20 text-[#A85448] text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-username" className="text-xs font-medium text-[#717784] dark:text-[#959CA8] uppercase tracking-wider">用户名</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className="input-field w-full h-12 sm:h-11 rounded-xl text-base sm:text-sm px-4"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-xs font-medium text-[#717784] dark:text-[#959CA8] uppercase tracking-wider">密码</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="input-field w-full h-12 sm:h-11 rounded-xl text-base sm:text-sm px-4 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#717784] dark:text-[#959CA8] hover:text-[#3478F6] dark:hover:text-[#82AEFF] transition-colors"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full h-12 sm:h-11 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="text-center text-xs text-[#717784] dark:text-[#959CA8] mt-6 leading-relaxed">
          {import.meta.env.DEV ? '本地调试：admin / 12345678' : '首次启动时密码已打印在服务端日志中'}
        </p>
      </div>
    </div>
  );
}
