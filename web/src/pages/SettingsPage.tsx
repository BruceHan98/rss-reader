import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api, type AiJobType } from '../lib/api';
import { ArrowLeft, Upload, Download, Trash2, CheckCircle, AlertCircle, Loader2, Sparkles, Clock, LogOut, KeyRound } from 'lucide-react';
import ReadingHeatmap from '../components/ReadingHeatmap';

export default function SettingsPage({ onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate();
  const { settings, updateSettings, loadFeeds, loadGroups, loadSettings } = useStore();

  // 当 AI 任务完成时，刷新 settings 以获取最新 token 消耗统计
  useEffect(() => {
    function onAiDone() { loadSettings(); }
    window.addEventListener('ai-job-done', onAiDone);
    return () => window.removeEventListener('ai-job-done', onAiDone);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanPreview, setCleanPreview] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [aiTriggering, setAiTriggering] = useState<AiJobType | null>(null);
  const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [aiTesting, setAiTesting] = useState(false);

  // 修改密码
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdChanging, setPwdChanging] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwdCurrent || !pwdNew) { setPwdMsg({ type: 'error', text: '请填写完整' }); return; }
    if (pwdNew.length < 6) { setPwdMsg({ type: 'error', text: '新密码至少 6 位' }); return; }
    if (pwdNew !== pwdNew2) { setPwdMsg({ type: 'error', text: '两次密码不一致' }); return; }
    setPwdChanging(true);
    setPwdMsg(null);
    try {
      await api.changePassword(pwdCurrent, pwdNew);
      setPwdMsg({ type: 'success', text: '密码已修改' });
      setPwdCurrent(''); setPwdNew(''); setPwdNew2('');
      setTimeout(() => setPwdMsg(null), 4000);
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err.message || '修改失败' });
    } finally {
      setPwdChanging(false);
    }
  }

  async function handleLogout() {
    try { await api.logout(); } catch {}
    onLogout?.();
  }

  async function handleSettingChange(key: string, value: string) {
    await updateSettings({ [key]: value });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.importOpml(file);
      setImportResult(result);
      if (result.imported > 0) {
        await Promise.all([loadFeeds(), loadGroups()]);
      }
    } catch (err: any) {
      setSuccessMsg('导入失败：' + err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleCleanupPreview() {
    const res = await api.cleanup(true);
    setCleanPreview(res.wouldDelete ?? 0);
  }

  async function handleCleanup() {
    setCleaning(true);
    try {
      const res = await api.cleanup(false);
      setSuccessMsg(`已清理 ${res.deleted} 篇旧文章`);
      setCleanPreview(null);
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setCleaning(false);
    }
  }

  async function handleAiTest() {
    if (aiTesting) return;
    setAiTesting(true);
    setAiMsg(null);
    try {
      const res = await api.aiTest();
      if (res.ok) {
        setAiMsg({ type: 'success', text: '连通成功，AI 服务正常响应' });
      } else {
        setAiMsg({ type: 'error', text: res.error || '连通失败' });
      }
    } catch (err: any) {
      setAiMsg({ type: 'error', text: err.message || '连通失败，请检查配置' });
    } finally {
      setAiTesting(false);
      setTimeout(() => setAiMsg(null), 6000);
    }
  }

  async function handleAiAnalyze(type: AiJobType) {
    if (aiTriggering) return;
    setAiTriggering(type);
    setAiMsg(null);
    try {
      await api.aiAnalyze(type);
      window.dispatchEvent(new Event('ai-job-started'));
      const label = type === 'score' ? '质量打分' : type === 'tags' ? '标签提取' : '打分与标签提取';
      setAiMsg({ type: 'success', text: `${label}任务已启动，请在右下角查看进度` });
      setTimeout(() => setAiMsg(null), 5000);
    } catch (err: any) {
      setAiMsg({ type: 'error', text: err.message || '启动失败，请检查 AI 配置' });
    } finally {
      setAiTriggering(null);
    }
  }

  if (!settings) return null;

  return (
    <div className="flex flex-col h-full bg-[#FDFCF8] overflow-y-auto pb-[3.5rem] lg:pb-0">
      {/* Header — matches sidebar/article-list height */}
      <div className="bg-[#FEFEFA]/90 backdrop-blur-sm border-b border-[#DED8CF]/50 px-4 py-3.5 flex items-center gap-2.5 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#78786C] transition-all duration-200 hover:bg-[#5D7052]/10 hover:text-[#5D7052] active:scale-95"
        >
          <ArrowLeft size={15} />
        </button>
        <h1 className="font-heading font-semibold text-sm text-[#2C2C24]">设置</h1>
      </div>

      <div className="max-w-2xl mx-auto w-full px-5 py-5 space-y-4">

        {successMsg && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#5D7052]/10 border border-[#5D7052]/20 text-[#5D7052] text-sm font-medium">
            <CheckCircle size={14} />
            {successMsg}
          </div>
        )}

        {/* ── OPML ── */}
        <Section title="导入 / 导出">
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="btn-primary flex items-center gap-1.5 text-xs py-2 px-4"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              导入 OPML
            </button>
            <input ref={fileRef} type="file" accept=".opml,.xml" className="hidden" onChange={handleImport} />
            <button onClick={() => api.exportOpml()} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-4">
              <Download size={13} />
              导出 OPML
            </button>
          </div>
          {importResult && (
            <div className="px-3 py-2 rounded-xl bg-[#5D7052]/10 border border-[#5D7052]/20 text-xs text-[#5D7052] flex items-center gap-2 font-medium">
              <CheckCircle size={13} />
              导入完成：成功 <strong>{importResult.imported}</strong> 个，跳过重复 <strong>{importResult.skipped}</strong> 个
            </div>
          )}
        </Section>

        {/* ── 外观 & 抓取 (two columns) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* 外观 */}
          <Section title="外观">
            <SettingRow label="主题">
              <select value={settings.theme} onChange={(e) => handleSettingChange('theme', e.target.value)} className="select-field text-xs h-8 px-3">
                <option value="auto">跟随系统</option>
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
              </select>
            </SettingRow>
            <SettingRow label="字体大小">
              <select value={settings.fontSize} onChange={(e) => handleSettingChange('fontSize', e.target.value)} className="select-field text-xs h-8 px-3">
                <option value="14">小 14px</option>
                <option value="16">默认 16px</option>
                <option value="18">大 18px</option>
                <option value="20">超大 20px</option>
              </select>
            </SettingRow>
            <SettingRow label="行距">
              <select value={settings.lineHeight} onChange={(e) => handleSettingChange('lineHeight', e.target.value)} className="select-field text-xs h-8 px-3">
                <option value="1.4">紧凑 1.4</option>
                <option value="1.6">默认 1.6</option>
                <option value="1.8">宽松 1.8</option>
                <option value="2.0">很宽松 2.0</option>
              </select>
            </SettingRow>
          </Section>

          {/* 抓取与清理 */}
          <Section title="抓取与清理">
            <SettingRow label="抓取模式">
              <select
                value={settings.fetchScheduleMode || 'interval'}
                onChange={(e) => handleSettingChange('fetchScheduleMode', e.target.value)}
                className="select-field text-xs h-8 px-3"
              >
                <option value="interval">间隔拉取</option>
                <option value="times">定时拉取</option>
              </select>
            </SettingRow>

            {(settings.fetchScheduleMode || 'interval') === 'interval' ? (
              <SettingRow label="抓取间隔">
                <select value={settings.fetchInterval} onChange={(e) => handleSettingChange('fetchInterval', e.target.value)} className="select-field text-xs h-8 px-3">
                  <option value="15">15 分钟</option>
                  <option value="30">30 分钟</option>
                  <option value="60">1 小时</option>
                  <option value="0">手动</option>
                </select>
              </SettingRow>
            ) : (
              <ScheduleTimePicker
                value={settings.fetchScheduleTimes || ''}
                onChange={(v) => handleSettingChange('fetchScheduleTimes', v)}
              />
            )}

            <SettingRow label="拉取后 AI 分析">
              <select value={settings.autoAiAfterFetch || 'off'} onChange={(e) => handleSettingChange('autoAiAfterFetch', e.target.value)} className="select-field text-xs h-8 px-3">
                <option value="off">不启用</option>
                <option value="score">仅打分</option>
                <option value="tags">仅打标签</option>
                <option value="all">打分 + 标签</option>
              </select>
            </SettingRow>
            <SettingRow label="保留天数">
              <select value={settings.retentionDays} onChange={(e) => handleSettingChange('retentionDays', e.target.value)} className="select-field text-xs h-8 px-3">
                <option value="7">7 天</option>
                <option value="30">30 天</option>
                <option value="90">90 天</option>
                <option value="0">永不</option>
              </select>
            </SettingRow>
            <div className="flex items-center gap-2 pt-0.5">
              <button onClick={handleCleanupPreview} className="text-xs px-3 py-1.5 rounded-full border border-[#C8C4BB] text-[#78786C] hover:bg-[#F0EDE6] transition-all duration-200 active:scale-95 whitespace-nowrap">
                预览待清理
              </button>
              {cleanPreview !== null && cleanPreview > 0 && (
                <button onClick={handleCleanup} disabled={cleaning} className="text-xs px-3 py-1.5 rounded-full bg-[#A85448] text-white hover:bg-[#963D31] transition-all duration-200 active:scale-95 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap">
                  {cleaning && <Loader2 size={11} className="animate-spin" />}
                  删除 {cleanPreview} 篇
                </button>
              )}
              {cleanPreview === 0 && (
                <span className="text-xs text-[#78786C]/70">无需清理</span>
              )}
            </div>
          </Section>
        </div>

        {/* ── 阅读记录 ── */}
        <Section title="阅读记录">
          <ReadingHeatmap />
        </Section>

        {/* ── AI 分析 ── */}
        <Section title="AI 分析">
          <SettingRow label="API 地址">
            <input
              type="text"
              value={settings.aiBaseUrl || ''}
              onChange={(e) => handleSettingChange('aiBaseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="input-field h-8 text-xs px-3 w-52"
            />
          </SettingRow>
          <SettingRow label="API 密钥">
            <input
              type="password"
              value={settings.aiApiKey || ''}
              onChange={(e) => handleSettingChange('aiApiKey', e.target.value)}
              placeholder="sk-..."
              className="input-field h-8 text-xs px-3 w-52"
            />
          </SettingRow>
          <SettingRow label="模型">
            <input
              type="text"
              value={settings.aiModel || ''}
              onChange={(e) => handleSettingChange('aiModel', e.target.value)}
              placeholder="gpt-4o-mini"
              className="input-field h-8 text-xs px-3 w-52"
            />
          </SettingRow>

          {aiMsg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
              aiMsg.type === 'success'
                ? 'bg-[#5D7052]/10 border border-[#5D7052]/20 text-[#5D7052]'
                : 'bg-[#A85448]/10 border border-[#A85448]/20 text-[#A85448]'
            }`}>
              {aiMsg.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
              {aiMsg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-0.5">
            <button
              onClick={handleAiTest}
              disabled={aiTesting || !!aiTriggering}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#C8C4BB] text-[#78786C] hover:bg-[#F0EDE6] transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {aiTesting ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              测试连通
            </button>
            <button
              onClick={() => handleAiAnalyze('score')}
              disabled={!!aiTriggering || aiTesting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#5D7052] text-white hover:bg-[#4A5E42] transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {aiTriggering === 'score' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              质量打分
            </button>
            <button
              onClick={() => handleAiAnalyze('tags')}
              disabled={!!aiTriggering || aiTesting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#C18C5D] text-white hover:bg-[#A8784F] transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {aiTriggering === 'tags' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              标签提取
            </button>
            <button
              onClick={() => handleAiAnalyze('all')}
              disabled={!!aiTriggering || aiTesting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#5D7052] text-[#5D7052] hover:bg-[#5D7052]/10 transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {aiTriggering === 'all' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              全部分析
            </button>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <p className="text-[10px] text-[#78786C]/60 leading-relaxed">
              仅对未读文章分析，任务在后台执行，可在右下角查看进度或停止
            </p>
            {settings.aiTokensUsed && parseInt(settings.aiTokensUsed) > 0 && (
              <span className="text-[10px] text-[#78786C]/50 whitespace-nowrap ml-3">
                已消耗 {Number(settings.aiTokensUsed).toLocaleString()} tokens
              </span>
            )}
          </div>
        </Section>

        {/* ── 账户安全 ── */}
        <Section title="账户安全">
          <form onSubmit={handleChangePassword} className="space-y-3">
            <SettingRow label="当前密码">
              <input
                type="password"
                value={pwdCurrent}
                onChange={(e) => setPwdCurrent(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="input-field h-8 text-xs px-3 w-44"
              />
            </SettingRow>
            <SettingRow label="新密码">
              <input
                type="password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                className="input-field h-8 text-xs px-3 w-44"
              />
            </SettingRow>
            <SettingRow label="确认新密码">
              <input
                type="password"
                value={pwdNew2}
                onChange={(e) => setPwdNew2(e.target.value)}
                placeholder="再次输入"
                autoComplete="new-password"
                className="input-field h-8 text-xs px-3 w-44"
              />
            </SettingRow>

            {pwdMsg && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                pwdMsg.type === 'success'
                  ? 'bg-[#5D7052]/10 border border-[#5D7052]/20 text-[#5D7052]'
                  : 'bg-[#A85448]/10 border border-[#A85448]/20 text-[#A85448]'
              }`}>
                {pwdMsg.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                {pwdMsg.text}
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5">
              <button
                type="submit"
                disabled={pwdChanging}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#5D7052] text-white hover:bg-[#4A5E42] transition-all duration-200 active:scale-95 disabled:opacity-50"
              >
                {pwdChanging ? <Loader2 size={11} className="animate-spin" /> : <KeyRound size={11} />}
                修改密码
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[#A85448]/40 text-[#A85448] hover:bg-[#A85448]/10 transition-all duration-200 active:scale-95"
              >
                <LogOut size={11} />
                退出登录
              </button>
            </div>
          </form>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#FEFEFA] border border-[#DED8CF]/50 rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#DED8CF]/30">
        <h2 className="font-heading font-semibold text-xs text-[#78786C] uppercase tracking-wider">{title}</h2>
      </div>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-[#4A4A40]">{label}</span>
      {children}
    </div>
  );
}

// 每天整点时间点选择器（0-23 小时，多选）
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function ScheduleTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = new Set(
    value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n))
  );

  function toggle(h: number) {
    const next = new Set(selected);
    next.has(h) ? next.delete(h) : next.add(h);
    onChange([...next].sort((a, b) => a - b).join(','));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Clock size={12} className="text-[#78786C]" />
        <span className="text-sm text-[#4A4A40]">每天定时拉取</span>
        {selected.size > 0 && (
          <span className="text-[10px] text-[#78786C]/60 ml-auto">
            已选 {selected.size} 个时间点
          </span>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {ALL_HOURS.map((h) => (
          <button
            key={h}
            onClick={() => toggle(h)}
            className={`
              h-7 rounded-lg text-[11px] font-medium transition-all duration-150 active:scale-95
              ${selected.has(h)
                ? 'bg-[#5D7052] text-[#F3F4F1] shadow-[0_2px_6px_-1px_rgba(93,112,82,0.35)]'
                : 'bg-[#F0EDE6] text-[#78786C] hover:bg-[#5D7052]/15 hover:text-[#5D7052]'}
            `}
          >
            {String(h).padStart(2, '0')}:00
          </button>
        ))}
      </div>
      {selected.size === 0 && (
        <p className="text-[10px] text-[#A85448]/80">请至少选择一个时间点</p>
      )}
    </div>
  );
}
