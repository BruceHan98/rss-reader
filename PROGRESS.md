# RSS Reader — 开发进度

> 最后更新：2026-05-12

---

## 里程碑总览

| 阶段 | 目标 | 状态 |
|------|------|------|
| MVP | Web 端：订阅管理 + 文章拉取 + 时间线阅读 + 已读状态 | ✅ 已完成 |
| V1.0 | Web 端：收藏 + 搜索 + OPML 导入导出 + 自动清理 + 阅读视图优化 | ✅ 已完成 |
| V1.1 | Web 端：登录鉴权 + AI 内容质量打分 + AI 自动打标签 + 标签筛选 + 分数过滤 + AI 设置配置 | ✅ 已完成 |
| V1.1.x | Web 端：沉浸阅读 + 阅读热力图 + 图片代理 + 安全加固 + 稳定性优化 | ✅ 已完成 |
| V1.2 | 移动端（React Native）：本地 RSS 引擎 + 时间线 + 订阅管理 + 本地存储 + 离线阅读 | 🔲 未开始 |
| V1.3 | 移动端：推送通知（本地）+ 后台刷新 + 手势操作 + Google Play 上架 | 🔲 未开始 |

---

## 已实现功能

### 后端（Node.js + Fastify）

#### 数据层
- [x] SQLite 数据库初始化（WAL 模式 + 外键约束）
- [x] Drizzle ORM Schema：`users`、`groups`、`feeds`、`articles`、`settings` 五张表
- [x] `articles` 表新增 `ai_score`（INTEGER）和 `ai_tags`（TEXT）字段
- [x] `articles` 表新增 `read_at`（TEXT）字段，用于记录实际阅读时间（支持热力图统计）
- [x] 默认设置写入（首次启动自动初始化）
- [x] 首次启动自动创建 admin 用户，随机密码打印到日志

#### API — 身份认证
- [x] `POST /api/auth/login` — 用户名+密码登录，颁发 JWT，写入 httpOnly Cookie（30 天有效）
- [x] `POST /api/auth/logout` — 清除 Cookie
- [x] `GET /api/auth/me` — 验证 token，返回当前用户信息
- [x] `PUT /api/auth/password` — 修改密码（校验当前密码，新密码至少 6 位）
- [x] 统一鉴权 Hook：所有 `/api/*` 路由（除 `/api/auth/login`、`/api/health`）均需有效 token

#### API — 订阅源管理
- [x] `GET /api/feeds` — 获取所有订阅源（含未读数）
- [x] `POST /api/feeds` — 添加订阅源（添加后立即触发首次拉取）
- [x] `PUT /api/feeds/:id` — 更新订阅源信息
- [x] `DELETE /api/feeds/:id` — 删除订阅源（级联删除文章）
- [x] `POST /api/feeds/:id/refresh` — 手动刷新单个订阅源
- [x] `POST /api/feeds/refresh-all` — 手动全量刷新所有订阅源

#### API — 分组管理
- [x] `GET /api/feeds/groups` — 获取分组列表
- [x] `POST /api/feeds/groups` — 创建分组
- [x] `PUT /api/feeds/groups/:id` — 更新分组名称
- [x] `DELETE /api/feeds/groups/:id` — 删除分组

#### API — 文章管理
- [x] `GET /api/articles` — 文章列表（分页、按 feed/group/starred/read-later/unread/minScore/tags 筛选）
- [x] `GET /api/articles/:id` — 文章详情（自动标记已读）
- [x] `PUT /api/articles/:id/read` — 标记已读（同步写入 `read_at` 时间戳）
- [x] `PUT /api/articles/:id/star` — 切换收藏
- [x] `PUT /api/articles/:id/read-later` — 切换稍后阅读
- [x] `POST /api/articles/mark-all-read` — 全部标记已读（支持按 feed_id 限定范围，保留已有 read_at）

#### API — 统计
- [x] `GET /api/stats/reading` — 按天统计实际阅读文章数（近 6 个月，基于 `read_at` 字段）

#### API — 搜索
- [x] `GET /api/search` — 全文搜索（标题 + 摘要 + 内容，支持时间范围、订阅源、已读状态筛选）

#### API — OPML 导入导出
- [x] `POST /api/opml/import` — 导入 OPML 文件（multipart 上传，自动去重，XML 格式校验）
- [x] `GET /api/opml/export` — 导出 OPML 文件

#### API — 图片代理
- [x] `GET /api/img-proxy?url=` — 图片代理（绕过防盗链，SSRF 防护，仅转发 image/* 类型，24h 缓存）

#### API — 设置与清理
- [x] `GET /api/settings` — 获取用户设置
- [x] `PUT /api/settings` — 更新用户设置（Settings key 白名单校验，防止参数污染）
- [x] `POST /api/cleanup` — 手动触发文章清理（支持 `preview=true` 仅预览数量）

#### API — AI 分析
- [x] `POST /api/ai/analyze` — 启动异步 AI 分析任务（type: `score` / `tags` / `all`，支持按 feedId/groupId 限定范围）
- [x] `GET /api/ai/status` — 查询当前 score / tags 任务运行状态（进度、当前处理标题）
- [x] `DELETE /api/ai/analyze/:jobId` — 终止指定任务
- [x] `GET /api/ai/tags` — 获取全量标签及频次列表
- [x] `POST /api/ai/test` — AI 服务连通性测试

#### 后台服务
- [x] RSS/Atom/JSON Feed 解析（rss-parser）
- [x] 增量拉取（按 GUID 去重）
- [x] 定时任务：**间隔模式** — 每 15 分钟检查并拉取到期订阅源（node-cron）
- [x] 定时任务：**定时模式** — 每分钟检查，命中用户配置的整点时间列表时触发（每小时内只触发一次）
- [x] 定时任务：每日凌晨 3 点自动清理过期文章
- [x] 拉取完成后可选自动触发 AI 分析（`autoAiAfterFetch` 设置项）
- [x] 拉取错误记录（`error_count` 字段）
- [x] AI 分析服务：并发度 5，支持打分 + 打标签，自动跳过已处理文章，仅处理未读文章
- [x] AI 分析：自动过滤 `<think>…</think>` 推理标签（兼容 thinking 模型）
- [x] AI Token 用量统计（写入 `settings` 表 `aiTokensUsed` 字段，原子自增）
- [x] SSRF 防护：`isPublicUrl()` 校验，禁止请求内网/localhost 地址
- [x] 首次启动自动生成 JWT_SECRET（写入 `server/data/.jwt_secret`，无需手动配置）

#### 安全加固
- [x] CORS 白名单（仅允许配置的来源）
- [x] 接口限流（rate-limit，防暴力请求）
- [x] Cookie 安全标志（HTTPS 环境下 `Secure` 标志）
- [x] OPML 文件 XML 格式严格校验，拒绝非法内容
- [x] Settings key 白名单，防止未授权字段写入
- [x] SQL 注入防护（Drizzle ORM 参数化查询）

---

### 前端（React 18 + Vite + Tailwind CSS）

#### 基础设施
- [x] Vite 构建配置（路径别名、API 代理、分包优化）
- [x] Tailwind CSS 主题扩展（Organic 设计系统：色板、字体、圆角、阴影）
- [x] Zustand 全局状态管理（feeds、groups、settings、UI 状态、`unread` 筛选类型）
- [x] 主题实时切换（跟随系统 / 亮色 / 暗色，`applyTheme` 写入 `document.documentElement`）
- [x] 字体大小 / 行距实时应用（CSS 变量 `--font-size`、`--line-height`）
- [x] API 客户端封装（统一错误处理、204 空响应处理、全局 401 自动跳转登录页）
- [x] 工具函数：`cn`（class 合并）、`relativeTime`、`formatDate`、`getFaviconUrl`

#### 身份认证
- [x] 启动时调用 `GET /api/auth/me` 验证 Cookie，自动判断登录态（`checking → logged-in / logged-out`）
- [x] 全局 401 处理器：任意 API 返回 401 时自动退回登录页
- [x] `LoginPage` — 登录页（自动填入 `admin`，密码明文/隐藏切换，错误提示）

#### 页面与路由
- [x] `/` — 时间线页（空状态引导，桌面端显示选择文章提示）
- [x] `/article/:id` — 文章阅读页
- [x] `/search` — 搜索页
- [x] `/settings` — 设置页

#### 组件
- [x] `Layout` — 整体布局（侧边栏 + 主内容区，移动端响应式）
- [x] `Sidebar` — 导航侧边栏（订阅树、分组折叠、未读计数、刷新/删除操作）
- [x] `ArticleList` — 文章卡片列表（无限滚动、AI 筛选面板、快捷 AI 触发按钮、一键全部已读、全量刷新）
- [x] `ArticleReader` — 文章阅读视图（HTML 净化、代码高亮、原文链接、沉浸阅读模式）
- [x] `AddFeedModal` — 添加订阅源弹窗
- [x] `AiProgressFloat` — AI 任务进度悬浮层（右下角固定，支持最小化、进度条展示、停止任务；任务完成后触发列表刷新）
- [x] `ReadingHeatmap` — 阅读热力图（GitHub 风格日历热图，近 6 个月每日阅读量可视化，支持前后月份翻页）

#### 文章卡片 AI 信息展示
- [x] AI 质量分数徽章（绿/橙/红三档配色：≥7 / ≥4 / <4）
- [x] AI 标签气泡（最多显示 3 个）

#### AI 筛选面板（ArticleList 顶部展开）
- [x] 最低分滑块（0–10，实时过滤）
- [x] 标签多选（展示 TOP 20 标签及文章数，激活态高亮）
- [x] 激活筛选条件的 chip 展示 + 单个清除

#### 交互体验
- [x] 文章阅读时自动标记已读
- [x] 滚动自动已读：阅读器滚动到底部自动标记已读（可在设置中开关）
- [x] 收藏 / 稍后阅读切换
- [x] 手动刷新订阅源（显示新文章数或错误信息）
- [x] 手动全量刷新（`ArticleList` 顶部刷新按钮）
- [x] 删除订阅源 / 分组（确认弹窗 + Toast 反馈）
- [x] 文章发布时间显示（相对时间 + 绝对时间）
- [x] Favicon 展示（降级到首字母占位）
- [x] 无文章时空状态引导（AI 筛选激活时提示调整条件）
- [x] AI 任务事件总线（`ai-job-done` / `ai-job-started` CustomEvent，驱动列表刷新和标签更新）
- [x] 未读数量实时更新（标记已读后侧边栏计数同步修正，避免重复计数）
- [x] 沉浸阅读模式（隐藏侧边栏 + 控件，全宽阅读体验）
- [x] 图片代理加载（通过 `/api/img-proxy` 绕过防盗链），图片加载失败自动重试最多 2 次（800ms/1600ms 退避）

#### 设置页
- [x] 外观配置：主题（跟随系统/亮色/暗色）、字体大小（14/16/18/20px）、行距（1.4/1.6/1.8/2.0）
- [x] 抓取配置：抓取模式（间隔/定时）、抓取间隔（15分/30分/1小时/手动）、定时时间点多选（0–23 时网格）
- [x] 拉取后自动 AI 分析（不启用/仅打分/仅打标签/打分+标签）
- [x] 滚动自动已读开关
- [x] 文章保留天数配置（7/30/90天/永不）
- [x] 手动清理触发（预览待删数量 → 确认删除）
- [x] 分组管理（创建 / 删除）
- [x] OPML 导入 / 导出
- [x] AI 配置：API 地址、API 密钥、模型名称、连通测试、手动触发打分/打标/全量分析
- [x] AI Token 消耗统计展示
- [x] 阅读热力图展示（近 6 个月日历热图）
- [x] 账户安全：修改密码（校验当前密码、确认新密码）、退出登录

---

### 部署
- [x] 后端 Dockerfile
- [x] 前端 Dockerfile（Nginx 静态托管）
- [x] Nginx 反向代理配置（`/api` 转发至后端）
- [x] `docker-compose.yml`（一键启动前后端）

---

## 待实现功能

### V1.2 — 移动端（未开始）
- [ ] React Native + Expo 项目初始化
- [ ] 本地 SQLite 存储（expo-sqlite + Drizzle ORM）
- [ ] RSSService：本地 RSS/Atom/JSON Feed 抓取与解析
- [ ] feedDetector：从网页 URL 自动探测 Feed 地址
- [ ] 本地 AI 评分引擎（规则引擎，无需外部 API）
- [ ] 首次使用引导页（添加订阅源 / 导入 OPML）
- [ ] 时间线页
- [ ] 订阅管理页
- [ ] 文章阅读页
- [ ] 搜索页（本地 FTS5 全文搜索）
- [ ] 设置页（含 OPML 导入导出）
- [ ] 离线阅读支持

### V1.3 — 移动端增强（未开始）
- [ ] 本地推送通知（expo-notifications，无需 FCM）
- [ ] 后台静默刷新（Background Fetch）
- [ ] 原生手势操作（左滑已读、右滑收藏、下拉刷新）
- [ ] 图片离线缓存（expo-image 磁盘缓存）
- [ ] Google Play 上架（EAS Build）
