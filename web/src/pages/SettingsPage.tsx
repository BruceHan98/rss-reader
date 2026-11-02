import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { Upload, Download, CheckCircle, AlertCircle, Loader2, Clock, LogOut, KeyRound, Zap } from 'lucide-react';
import ReadingHeatmap from '../components/ReadingHeatmap';
import { cn } from '../lib/utils';

export default function SettingsPage({ onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate();
  const { settings, updateSettings, loadFeeds, loadGroups, loadSettings } = useStore();

  useEffect(() => {
    function onAiDone() { loadSettings(); }
    window.addEventListener('ai-job-done', onAiDone);
    return () => window.removeEventListener('ai-job-done', onAiDone);
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  // AI 配置使用本地草稿，避免每输入一个字符就触发异步保存并用旧响应覆盖输入内容。
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');

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
    setPwdChanging(true); setPwdMsg(null);
    try {
      await api.changePassword(pwdCurrent, pwdNew);
      setPwdMsg({ type: 'success', text: '密码已修改' });
      setPwdCurrent(''); setPwdNew(''); setPwdNew2('');
      setTimeout(() => setPwdMsg(null), 4000);
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err.message || '修改失败' });
    } finally { setPwdChanging(false); }
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
    setImporting(true); setImportResult(null);
    try {
      const result = await api.importOpml(file);
      setImportResult(result);
      if (result.imported > 0) await Promise.all([loadFeeds(), loadGroups()]);
    } catch (err: any) {
      setSuccessMsg('导入失败：' + err.message);
    } finally { setImporting(false); e.target.value = ''; }
  }

  useEffect(() => {
    setAiBaseUrl(settings?.aiBaseUrl || '');
    setAiApiKey(settings?.aiApiKey || '');
    setAiModel(settings?.aiModel || '');
  }, [settings?.aiBaseUrl, settings?.aiApiKey, settings?.aiModel]);

  async function saveAiSetting(key: 'aiBaseUrl' | 'aiApiKey' | 'aiModel', value: string) {
    if (settings?.[key] !== value) await updateSettings({ [key]: value });
  }

  async function handleAiTest() {
    if (aiTesting) return;
    setAiTesting(true); setAiMsg(null);
    try {
      // 测试前保存尚未失焦的草稿，确保测试使用用户当前看到的配置。
      await updateSettings({ aiBaseUrl, aiApiKey, aiModel });
      const res = await api.aiTest();
      setAiMsg(res.ok
        ? { type: 'success', text: '连通成功，AI 服务正常响应' }
        : { type: 'error', text: res.error || '连通失败' }
      );
    } catch (err: any) {
      setAiMsg({ type: 'error', text: err.message || '连通失败，请检查配置' });
    } finally {
      setAiTesting(false);
      setTimeout(() => setAiMsg(null), 6000);
    }
  }

  if (!settings) return null;

  const selectCls = 'settings-select';
  const inputCls = 'settings-input';

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-card)]">
      {/* Header */}
      <header className="page-header ios-pwa-top-bar">
        <div className="page-header-row">
          <h1 className="page-title">设置</h1>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="page-content-gutter max-w-3xl w-full py-[20px] space-y-[24px] page-text">

        {successMsg && (
          <Toast type="success" text={successMsg} />
        )}

        {/* ── 外观 ── */}
        <Section title="外观">
          <Row label="主题">
            <select value={settings.theme} onChange={(e) => handleSettingChange('theme', e.target.value)} className={selectCls}>
              <option value="auto">跟随系统</option>
              <option value="light">亮色</option>
              <option value="dark">暗色</option>
            </select>
          </Row>
          <Divider />
          <Row label="正文字号">
            <select value={settings.fontSize} onChange={(e) => handleSettingChange('fontSize', e.target.value)} className={selectCls}>
              <option value="14">小 14px</option>
              <option value="16">默认 16px</option>
              <option value="18">大 18px</option>
              <option value="20">超大 20px</option>
            </select>
          </Row>
          <Divider />
          <Row label="正文行距">
            <select value={settings.lineHeight} onChange={(e) => handleSettingChange('lineHeight', e.target.value)} className={selectCls}>
              <option value="1.4">紧凑</option>
              <option value="1.6">标准</option>
              <option value="1.8">宽松</option>
              <option value="2.0">很宽松</option>
            </select>
          </Row>
          <Divider />
          <Row label="滚动标记已读" hint="文章滚出屏幕时自动标为已读">
            <Toggle
              checked={settings.markReadOnScroll === 'true'}
              onChange={(v) => handleSettingChange('markReadOnScroll', v ? 'true' : 'false')}
            />
          </Row>
        </Section>

        {/* ── 抓取与清理 ── */}
        <Section title="抓取与清理">
          <Row label="抓取模式">
            <select
              value={settings.fetchScheduleMode || 'interval'}
              onChange={(e) => handleSettingChange('fetchScheduleMode', e.target.value)}
              className={selectCls}
            >
              <option value="interval">间隔拉取</option>
              <option value="times">定时拉取</option>
            </select>
          </Row>
          <Divider />
          {(settings.fetchScheduleMode || 'interval') === 'interval' ? (
            <Row label="抓取间隔">
              <select value={settings.fetchInterval} onChange={(e) => handleSettingChange('fetchInterval', e.target.value)} className={selectCls}>
                <option value="15">15 分钟</option>
                <option value="30">30 分钟</option>
                <option value="60">1 小时</option>
                <option value="0">手动</option>
              </select>
            </Row>
          ) : (
            <div className="py-4">
              <ScheduleTimePicker
                value={settings.fetchScheduleTimes || ''}
                onChange={(v) => handleSettingChange('fetchScheduleTimes', v)}
              />
            </div>
          )}
          <Divider />
          <Row label="拉取后 AI 分析">
            <select value={settings.autoAiAfterFetch || 'off'} onChange={(e) => handleSettingChange('autoAiAfterFetch', e.target.value)} className={selectCls}>
              <option value="off">不启用</option>
              <option value="score">仅打分</option>
              <option value="tags">仅打标签</option>
              <option value="all">打分 + 标签</option>
            </select>
          </Row>
          <Divider />
          <Row label="文章保留时长">
            <select value={settings.retentionDays} onChange={(e) => handleSettingChange('retentionDays', e.target.value)} className={selectCls}>
              <option value="7">7 天</option>
              <option value="30">30 天</option>
              <option value="90">90 天</option>
              <option value="0">永久保留</option>
            </select>
          </Row>
        </Section>

        {/* ── 订阅源 ── */}
        <Section title="订阅源">
          <div className="grid grid-cols-2 gap-3 py-4">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="settings-action"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              导入 OPML
            </button>
            <input ref={fileRef} type="file" accept=".opml,.xml" className="hidden" onChange={handleImport} />
            <button
              onClick={() => api.exportOpml()}
              className="settings-action"
            >
              <Download size={14} />
              导出 OPML
            </button>
          </div>
          {importResult && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#3478F6]/10 border border-[#3478F6]/20 list-meta text-[#3478F6] font-medium">
              <CheckCircle size={13} />
              导入完成：成功 <strong>{importResult.imported}</strong> 个，跳过重复 <strong>{importResult.skipped}</strong> 个
            </div>
          )}
        </Section>

        {/* ── 阅读记录 ── */}
        <Section title="阅读记录">
          <div className="py-4">
            <ReadingHeatmap />
          </div>
        </Section>

        {/* ── AI 分析 ── */}
        <Section title="AI 分析">
          <Row label="API 地址" field>
            <input
              type="text"
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              onBlur={() => saveAiSetting('aiBaseUrl', aiBaseUrl)}
              placeholder="https://api.openai.com/v1"
              className={inputCls}
            />
          </Row>
          <Divider />
          <Row label="API 密钥" field>
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              onBlur={() => saveAiSetting('aiApiKey', aiApiKey)}
              placeholder="sk-..."
              className={inputCls}
            />
          </Row>
          <Divider />
          <Row label="模型" field>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              onBlur={() => saveAiSetting('aiModel', aiModel)}
              placeholder="gpt-4o-mini"
              className={inputCls}
            />
          </Row>
          <Divider />
          <Row label="连通测试">
            <button
              onClick={handleAiTest}
              disabled={aiTesting}
              className="settings-action"
            >
              {aiTesting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              测试连通
            </button>
          </Row>

          {aiMsg && <Toast type={aiMsg.type} text={aiMsg.text} />}
        </Section>

        {/* ── 账户安全 ── */}
        <Section title="账户安全">
          <form onSubmit={handleChangePassword} className="space-y-0">
            <Row label="当前密码" field>
              <input
                type="password"
                value={pwdCurrent}
                onChange={(e) => setPwdCurrent(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className={inputCls}
              />
            </Row>
            <Divider />
            <Row label="新密码" field>
              <input
                type="password"
                value={pwdNew}
                onChange={(e) => setPwdNew(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                className={inputCls}
              />
            </Row>
            <Divider />
            <Row label="确认新密码" field>
              <input
                type="password"
                value={pwdNew2}
                onChange={(e) => setPwdNew2(e.target.value)}
                placeholder="再次输入"
                autoComplete="new-password"
                className={inputCls}
              />
            </Row>

            {pwdMsg && (
              <div className="pt-3">
                <Toast type={pwdMsg.type} text={pwdMsg.text} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 py-4">
              <button
                type="submit"
                disabled={pwdChanging}
                className="settings-action settings-action-primary"
              >
                {pwdChanging ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                修改密码
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="settings-action !text-[#A85448]"
              >
                <LogOut size={14} />
                退出登录
              </button>
            </div>
          </form>
        </Section>

        </div>
      </div>
    </div>
  );
}

/* ─── 基础组件 ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Row({ label, hint, field, children }: { label: string; hint?: string; field?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('settings-row', field && 'settings-row-field')}>
      <div className="min-w-0">
        <span className="page-text">{label}</span>
        {hint && <p className="list-meta mt-1">{hint}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[var(--color-border)]" />;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
        checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

function Toast({ type, text }: { type: 'success' | 'error'; text: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3.5 py-2.5 rounded-xl list-meta font-medium',
      type === 'success'
        ? 'bg-[#3478F6]/10 border border-[#3478F6]/20 text-[#3478F6]'
        : 'bg-[#A85448]/10 border border-[#A85448]/20 text-[#A85448]'
    )}>
      {type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
      {text}
    </div>
  );
}

/* ─── 定时拉取时间选择器 ─── */

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
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock size={12} className="text-[#717784]/70" />
        <span className="page-text font-medium">每天定时拉取</span>
        {selected.size > 0 && (
          <span className="ml-auto list-meta text-[#717784]/60">已选 {selected.size} 个时间点</span>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {ALL_HOURS.map((h) => (
          <button
            key={h}
            onClick={() => toggle(h)}
            className={cn(
              'h-7 rounded-lg list-meta font-medium transition-all duration-150 active:scale-95',
              selected.has(h)
                ? 'bg-[#3478F6] text-[#FFFFFF] shadow-[0_2px_6px_-1px_rgba(52,120,246,0.35)]'
                : 'bg-[#EAF2FF] dark:bg-[#283449] text-[#717784] dark:text-[#959CA8] hover:bg-[#3478F6]/15 hover:text-[#3478F6] dark:hover:text-[#82AEFF]'
            )}
          >
            {String(h).padStart(2, '0')}
          </button>
        ))}
      </div>
      {selected.size === 0 && (
        <p className="list-meta text-[#A85448]/80">请至少选择一个时间点</p>
      )}
    </div>
  );
}
