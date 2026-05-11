# RSS-Reader

RSS 阅读器，RSS 资讯获取、展示、阅读一站式应用。支持多平台使用，帮助用户高效聚合、管理和阅读来自不同网站的 RSS/Atom 订阅内容。

---

## 目标用户

- 信息获取效率需求较高的用户（科技爱好者、研究人员、内容创作者）
- 希望摆脱算法推荐、主动掌控信息源的用户
- 需要跨设备同步阅读进度的用户

---

## 核心功能

### 1. RSS 订阅管理
- 添加/删除/编辑订阅源（支持 RSS 2.0、Atom、JSON Feed）
- 订阅源分组/标签管理
- 订阅源健康状态检测（可用/不可用/更新频率）
- 支持批量操作（批量删除、批量移动分组）

### 2. RSS 导入与导出
- 支持 OPML 格式导入/导出，与主流 RSS 阅读器互通
- 导入时自动去重，支持预览确认后再导入

### 3. 拉取 RSS 资讯
- 后台定时自动拉取（可配置间隔：15分钟 / 30分钟 / 1小时 / 手动）
- 支持手动刷新单个订阅源或全部
- 增量拉取，避免重复条目
- 拉取失败自动重试，记录错误日志

### 4. 时间线（文章流）
- 全部订阅的文章统一时间线，按发布时间倒序排列
- 支持按订阅源/分组筛选时间线
- 文章已读/未读状态标记，支持一键全部已读
- 支持标记星标（收藏）、稍后阅读

### 5. 文章阅读
- 内置阅读视图，对文章内容进行排版优化（去广告、去干扰元素）
- 支持跳转原文链接
- 字体大小、行距、主题（亮色/暗色/自动）可调
- 文章内图片懒加载，支持图片全屏预览
- 文章内代码块高亮显示

### 6. 收藏与稍后阅读
- 收藏文章永久保存，不随清理策略删除
- 稍后阅读列表，支持手动清除
- 收藏支持添加备注标签

### 7. 搜索
- 全文搜索已拉取的文章（标题 + 摘要 + 正文）
- 支持按时间范围、订阅源、已读状态筛选

### 8. 自动清理 / 手动清理
- 按保留天数自动清理旧文章（可配置：7天 / 30天 / 90天 / 永不）
- 收藏和稍后阅读的文章不参与自动清理
- 支持手动触发清理，预览待删除条目后确认

### 9. AI 内容质量分析与打分
- 使用大模型对文章内容进行质量分析，输出 0–10 的整数质量分（0 = 极低质量，10 = 极高质量）
- 评分维度参考：内容深度、信息密度、原创性、可读性、广告/垃圾内容占比
- **手动触发（异步）**：用户可在设置页或文章列表页一键触发全量（或按订阅源）AI 打分任务；任务在后台异步执行，不阻塞页面操作；未打分文章默认不过滤
- **进度展示**：触发后 Web 端展示进度条/状态浮层，显示「已处理 n / 共 m 篇」及当前处理文章标题；支持最小化后继续在角标处显示进度
- **终止任务**：用户可随时点击「停止」按钮终止正在进行的打分任务；已完成的文章保留结果，未处理的文章保持原状
- **分数过滤**：Web 端在筛选栏提供「最低质量分」滑块/输入框（范围 0–10），实时过滤低于阈值的文章；阈值存储于用户设置中，刷新后保持
- 文章列表卡片展示质量分标签（已打分时显示，未打分时不显示）
- 打分结果存储在文章记录中，不影响原文内容

### 10. AI 自动打标签
- 使用大模型为每篇文章自动提取最多 3 个语义标签（如「AI」「产品设计」「开源」）
- **手动触发（异步）**：用户可在设置页或文章列表页一键触发全量（或按订阅源）AI 打标任务；任务在后台异步执行，与质量打分任务可独立触发，但同类型任务同时只允许一个运行
- **进度展示**：与打分任务共用同一进度浮层，分别显示各自的处理进度
- **终止任务**：用户可随时点击「停止」按钮终止正在进行的打标任务；已完成的文章保留标签，未处理的文章保持原状
- **标签筛选**：Web 端侧边栏或筛选栏展示所有已有标签（按文章数量排序），支持单选/多选标签筛选时间线
- 标签以逗号分隔字符串存储在文章记录中，支持后端索引检索
- 已打标签的文章在卡片上展示标签气泡；未打标签时不展示

### 11. 移动端（iOS & Android 原生应用）
- 基于 React Native（Expo）开发，共享 Web 端核心业务逻辑
- 支持 iOS 14+ 和 Android 8.0+
- 原生手势操作（左滑标记已读、右滑收藏、下拉刷新）
- 底部 Tab 导航：时间线 / 订阅源 / 收藏 / 设置
- 系统级深色模式跟随
- 推送通知：订阅源有新文章时推送（可按订阅源配置开关）
- 后台静默刷新（Background Fetch）
- 本地 SQLite 存储（expo-sqlite），支持离线阅读
- 应用内浏览器打开原文（WebView），支持分享到系统分享菜单
- 图片离线缓存，流量优化模式（仅 Wi-Fi 下加载图片）
- 通过 App Store 和 Google Play 分发

---

## 技术栈

| 层级 | 技术选型 |
|------|---------|
#### Web 端
| 层级 | 技术选型 |
|------|----------|
| 前端框架 | React 18 + TypeScript |
| 前端构建 | Vite |
| 前端状态管理 | Zustand |
| UI 组件库 | shadcn/ui + Tailwind CSS |
| 后端框架 | Node.js + Fastify |
| 数据库 | SQLite（单机） |
| ORM | Drizzle ORM |
| RSS 解析 | rss-parser（Node.js） |
| 任务调度 | node-cron |
| AI 大模型调用 | OpenAI-compatible API（可配置 base_url + api_key，兼容 OpenAI / DeepSeek / 本地 Ollama 等） |
| 部署 | Docker + Docker Compose |

#### 移动端（iOS & Android）
| 层级 | 技术选型 |
|------|----------|
| 跨平台框架 | React Native + Expo（SDK 51+） |
| 语言 | TypeScript |
| 状态管理 | Zustand（与 Web 共享 Store 逻辑） |
| 本地数据库 | expo-sqlite + Drizzle ORM |
| 网络请求 | axios |
| 导航 | Expo Router（文件路由） |
| 推送通知 | Expo Notifications + FCM（Android）/ APNs（iOS） |
| 后台刷新 | expo-background-fetch |
| 应用内浏览器 | expo-web-browser / react-native-webview |
| 打包发布 | EAS Build（Expo Application Services） |

---

## 架构

### 整体架构

```
┌──────────────────────┐   ┌──────────────────────────┐
│   Web 客户端          │   │   移动端（iOS / Android）  │
│   React SPA          │   │   React Native（Expo）     │
│   Zustand Store      │   │   Zustand Store            │
│                      │   │   本地 SQLite（离线）       │
└──────────┬───────────┘   └────────────┬─────────────┘
           │                            │
           │       REST API             │
           └──────────────┬─────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                  后端服务（Node.js + Fastify）         │
│   API 路由层  →  Service 层  →  数据访问层（Drizzle）  │
│   定时任务（node-cron）  │  推送服务（FCM / APNs）      │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                     数据存储                          │
│                  SQLite（单机部署）                    │
└─────────────────────────────────────────────────────┘
```

### 后端

- **API 层**：RESTful API，提供订阅源 CRUD、文章查询、用户偏好设置等接口
- **Service 层**：业务逻辑处理，包含订阅管理、文章拉取与解析、清理策略
- **Scheduler（定时任务）**：周期性调用 RSS 抓取服务，更新文章数据库
- **Feed Fetcher**：负责 HTTP 请求 + RSS/Atom/JSON Feed 解析 + 去重入库
- **AI Analyzer**：调用大模型 API 对文章进行质量打分与标签提取，结果写回数据库；支持按需（手动触发）批量处理

### Web 前端

- **路由结构**：`/` 时间线 | `/feed/:id` 单订阅源 | `/article/:id` 文章阅读 | `/settings` 设置
- **全局状态**：订阅列表、未读计数、当前筛选条件、用户设置
- **组件划分**：侧边栏（订阅树）、文章列表、文章阅读视图、设置面板

### 移动端

- **路由结构（Expo Router）**：`/(tabs)/index` 时间线 | `/(tabs)/feeds` 订阅源 | `/(tabs)/starred` 收藏 | `/(tabs)/settings` 设置 | `/article/[id]` 文章阅读
- **本地优先**：文章数据优先读取本地 SQLite，后台同步服务端增量数据
- **共享逻辑**：订阅源管理、文章状态变更等核心 Service 逻辑与 Web 端共享（抽取为独立 `core` 包）
- **离线策略**：已下载文章内容可完全离线阅读；订阅源变更在恢复网络后自动同步

---

## 模块设计

### 数据模型

#### Feed（订阅源）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| title | string | 订阅源标题 |
| url | string | Feed URL |
| site_url | string | 原站地址 |
| favicon | string | 图标 URL |
| group_id | UUID | 所属分组 |
| last_fetched_at | datetime | 最近抓取时间 |
| fetch_interval | int | 抓取间隔（分钟） |
| error_count | int | 连续失败次数 |
| created_at | datetime | 创建时间 |

#### Article（文章）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| feed_id | UUID | 所属订阅源 |
| guid | string | 原始 GUID（去重用） |
| title | string | 标题 |
| summary | string | 摘要 |
| content | text | 全文内容 |
| author | string | 作者 |
| url | string | 原文链接 |
| published_at | datetime | 发布时间 |
| is_read | boolean | 是否已读 |
| is_starred | boolean | 是否收藏 |
| is_read_later | boolean | 稍后阅读 |
| ai_score | int \| null | AI 质量分（0–10），未打分为 null |
| ai_tags | string \| null | AI 标签（逗号分隔，最多 3 个），未打标为 null |
| created_at | datetime | 入库时间 |

#### Group（分组）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | string | 分组名称 |
| sort_order | int | 排序权重 |

---

## 功能设计

### API 接口设计

#### 订阅源管理
```
GET    /api/feeds              获取所有订阅源（含分组）
POST   /api/feeds              添加订阅源
PUT    /api/feeds/:id          更新订阅源信息
DELETE /api/feeds/:id          删除订阅源（级联删除文章）
POST   /api/feeds/:id/refresh  手动刷新某订阅源
GET    /api/feeds/groups       获取分组列表
POST   /api/feeds/groups       创建分组
PUT    /api/feeds/groups/:id   更新分组
DELETE /api/feeds/groups/:id   删除分组
```

#### 文章管理
```
GET    /api/articles           获取文章列表（支持分页、筛选）
                               筛选参数：feed_id, group_id, is_read, is_starred,
                               min_score（最低质量分过滤）, tags（标签筛选，逗号分隔）
GET    /api/articles/:id       获取文章详情
PUT    /api/articles/:id/read      标记已读
PUT    /api/articles/:id/star      切换收藏
PUT    /api/articles/:id/read-later 切换稍后阅读
POST   /api/articles/mark-all-read 全部标记已读（支持按 feed_id 范围）
```

#### AI 分析
```
POST   /api/ai/analyze         启动异步 AI 分析任务
                               请求体：{ type: "score" | "tags" | "all", feed_id?: string }
                               type=score 仅打分，type=tags 仅打标签，type=all 同时执行
                               响应：{ jobId: string }（立即返回，任务后台执行）
                               同类型任务已在运行时返回 409，并附带当前 jobId
GET    /api/ai/status          获取当前 AI 分析任务状态
                               响应：{
                                 score: { status: "running"|"idle", jobId, total, processed, current_title },
                                 tags:  { status: "running"|"idle", jobId, total, processed, current_title }
                               }
DELETE /api/ai/analyze/:jobId  终止指定 AI 分析任务
                               已完成的文章保留结果，未处理的文章保持原状
                               响应：{ cancelled: true, processed }  
GET    /api/ai/tags            获取全量标签列表（含每个标签的文章数量，按数量降序）
```

#### 导入导出
```
POST   /api/opml/import        导入 OPML 文件
GET    /api/opml/export        导出 OPML 文件
```

#### 搜索
```
GET    /api/search?q=关键词&from=&to=&feed_id=   全文搜索
```

#### 设置
```
GET    /api/settings           获取用户设置
PUT    /api/settings           更新用户设置
                               AI 相关配置字段：
                               ai_enabled: boolean        是否启用 AI 功能
                               ai_base_url: string        大模型 API 地址
                               ai_api_key: string         API 密钥（存储时加密）
                               ai_model: string           模型名称（如 gpt-4o-mini）
                               ai_min_score: int(0-10)    文章列表默认最低质量分过滤阈值
POST   /api/cleanup            触发手动清理
```

### 文章拉取流程

```
定时任务触发
    ↓
遍历所有订阅源（按 fetch_interval 判断是否到期）
    ↓
HTTP GET Feed URL（超时 10s，最多重试 2 次）
    ↓
解析 RSS/Atom/JSON Feed
    ↓
按 guid 去重，过滤已存在条目
    ↓
批量写入数据库
    ↓
更新 Feed.last_fetched_at / error_count
```

### 清理策略

1. **定时清理**：每天凌晨 3 点执行，删除超过保留天数且未收藏/未稍后阅读的文章
2. **手动清理**：用户在设置页触发，支持预览条目数后确认
3. **孤立文章清理**：删除订阅源时，同步删除其所有文章

### AI 分析流程

```
用户在 Web 端点击「AI 打分 / 打标签」按钮
    ↓
POST /api/ai/analyze（type, feed_id?）
后端立即返回 { jobId }，任务进入后台队列异步执行
    ↓
后端查询待处理文章（ai_score IS NULL 或 ai_tags IS NULL）
    ↓
逐篇调用大模型 API
  提示词包含：文章标题 + 摘要/正文前 1000 字
  返回 JSON：{ score: number, tags: string[] }
  每篇完成后更新内存中的 processed 计数和 current_title
    ↓
校验结果（score 范围 0–10，tags 最多 3 个非空字符串）
    ↓
写回数据库（article.ai_score, article.ai_tags）
    ↓
任务完成，status 变为 idle
```

**前端进度交互**：
- 触发后展示进度浮层，每 2 秒轮询 `GET /api/ai/status`
- 浮层显示：进度条 + 「已处理 n / 共 m 篇」+ 当前文章标题
- 支持最小化浮层，角标持续显示百分比进度
- 「停止」按钮触发 `DELETE /api/ai/analyze/:jobId`，后端收到信号后在当前篇处理完毕后退出循环
- 任务完成或被终止后，前端停止轮询并刷新文章列表

**错误处理**：
- 大模型调用失败（网络/超时/限流）：跳过当前文章，记录错误日志，继续处理下一篇
- 返回格式异常：丢弃本次结果，该文章保持未打分/未打标状态
- 未配置 AI 参数（api_key 为空）：接口返回 400，前端引导用户前往设置页配置
- 同类型任务已在运行：接口返回 409，前端提示用户当前已有任务在执行

---

## 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | 文章列表首屏加载 < 500ms（本地数据库查询） |
| 可用性 | 网络断开时可浏览已缓存文章（移动端本地 SQLite / Web PWA 离线缓存） |
| 安全性 | 内容 XSS 过滤（渲染 HTML 内容时使用 DOMPurify） |
| 扩展性 | 支持 Docker 一键部署，方便自托管 |
| 兼容性 | Web：支持 Chrome / Firefox / Safari 最新版本；移动端：iOS 14+ / Android 8.0+ |

---

## 里程碑规划

| 阶段 | 目标 | 预计工期 |
|------|------|---------|
| MVP | Web 端：订阅管理 + 文章拉取 + 时间线阅读 + 已读状态 | 2周 |
| V1.0 | Web 端：收藏 + 搜索 + OPML 导入导出 + 自动清理 + 阅读视图优化 | 1周 |
| V1.1 | Web 端：AI 内容质量打分 + AI 自动打标签 + 标签筛选 + 分数过滤 + AI 设置配置 | 1周 |
| V1.2 | 移动端（React Native）：时间线 + 订阅管理 + 本地存储 + 离线阅读 | 2周 |
| V1.3 | 移动端：推送通知 + 后台刷新 + 手势操作 + App Store / Google Play 上架 | 2周 |
