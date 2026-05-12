# RSS Reader — 移动端（Android）设计文档

> 版本：V2.0
> 创建日期：2026-05-12
> 对应里程碑：V1.2（基础功能）+ V1.3（推送与手势增强）

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型与架构](#2-技术选型与架构)
3. [目录结构](#3-目录结构)
4. [数据架构](#4-数据架构)
5. [RSS 抓取与解析策略](#5-rss-抓取与解析策略)
6. [导航结构与路由](#6-导航结构与路由)
7. [页面与组件设计](#7-页面与组件设计)
8. [手势交互](#8-手势交互)
9. [推送通知](#9-推送通知)
10. [后台刷新](#10-后台刷新)
11. [离线与缓存策略](#11-离线与缓存策略)
12. [设计风格](#12-设计风格)
13. [状态管理](#13-状态管理)
14. [RSS 服务层](#14-rss-服务层)
15. [错误处理与边界情况](#15-错误处理与边界情况)
16. [性能指标与优化](#16-性能指标与优化)
17. [打包与发布](#17-打包与发布)
18. [开发里程碑拆解](#18-开发里程碑拆解)

---

## 1. 项目概述

### 1.1 目标

开发完全独立的 RSS Reader Android 原生应用。应用**不依赖任何后端服务**，所有功能（RSS 抓取、解析、存储、搜索、AI 分析）均在 App 本地实现，可在无服务器环境下独立运行。

### 1.2 核心功能范围

| 功能模块 | V1.2（基础） | V1.3（增强） |
|--------|:-----------:|:-----------:|
| 添加订阅源（RSS/Atom URL） | ✅ | — |
| 本地 RSS 抓取与解析 | ✅ | — |
| 时间线（文章流） | ✅ | — |
| 文章阅读视图 | ✅ | — |
| 订阅源管理（分组/编辑/删除） | ✅ | — |
| 收藏 / 稍后阅读 | ✅ | — |
| 全文搜索（本地 FTS5） | ✅ | — |
| 本地 SQLite 存储 | ✅ | — |
| 设置页（外观 + 刷新策略） | ✅ | — |
| AI 打分/标签（本地推断） | ✅ | — |
| 原生手势（左滑/右滑/下拉刷新） | — | ✅ |
| 本地推送通知（新文章提醒） | — | ✅ |
| 后台静默刷新 | — | ✅ |
| 图片离线缓存 | — | ✅ |

### 1.3 系统兼容性

- **Android**：8.0（API 26）及以上
- **目标 SDK**：Android 14（API 34）
- **屏幕适配**：支持手机（360dp+）和平板（600dp+，考虑双栏布局）

---

## 2. 技术选型与架构

### 2.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 跨平台框架 | React Native 0.74 + Expo SDK 51 | 与 Web 端共享 TypeScript 生态 |
| 语言 | TypeScript 5.x | 严格类型模式 |
| 导航 | Expo Router v3（文件路由） | 基于 React Navigation |
| 状态管理 | Zustand 4.x | 与 Web 端 Store 结构对齐 |
| 本地数据库 | expo-sqlite + Drizzle ORM | 唯一数据存储层，含 FTS5 全文搜索 |
| RSS 解析 | react-native-rss-parser / fast-xml-parser | 解析 RSS 2.0 / Atom 1.0 / JSON Feed |
| HTTP 抓取 | expo-fetch（内置）/ axios 1.x | 直接请求订阅源 URL，无需认证 |
| 推送通知 | expo-notifications | 本地通知（无需 FCM），新文章后台提醒 |
| 后台刷新 | expo-background-fetch | 静默更新文章（V1.3） |
| 应用内浏览器 | expo-web-browser | 打开原文，支持系统分享 |
| HTML 渲染 | react-native-render-html | 文章正文 HTML 渲染 |
| 图片缓存 | expo-image（内置磁盘缓存） | 流量优化 + 离线图片（V1.3） |
| 手势处理 | react-native-gesture-handler + Reanimated 3 | 滑动手势（V1.3） |
| 打包发布 | EAS Build + EAS Submit | Expo Application Services |

### 2.2 整体架构

```
+---------------------------------------------------+
|               Android 应用（Expo）                  |
|                                                     |
|  +---------------+    +----------------------+      |
|  |   UI 层        |    |  本地 SQLite           |      |
|  |  Expo Router   |    |  (唯一数据存储)         |      |
|  |  + 组件        |    |  FTS5 全文搜索          |      |
|  +-------+-------+    +-----------+----------+      |
|          |                        |                  |
|  +-------v------------------------v--------+         |
|  |            Zustand Store 层              |         |
|  |   (feeds / articles / settings)         |         |
|  +-------------------+---------------------+         |
|                      |                               |
|  +-------------------v---------------------+         |
|  |          RSSService（本地 RSS 引擎）        |         |
|  |  fetchFeed(url) -> 解析 XML/JSON           |         |
|  |  upsert 文章到本地 SQLite                  |         |
|  |  本地 AI 评分/标签推断                      |         |
|  +-------------------+---------------------+         |
|                      |                               |
|          HTTP 直连订阅源 URL（互联网）                 |
+---------------------------------------------------+
```

> **无服务器依赖**：所有数据流均在设备本地闭环，不需要任何中间后端服务。

### 2.3 关键设计决策

**1. 完全本地化（Fully Local）**
App 直接通过 HTTP 请求订阅源 URL，在本地完成 XML/Atom/JSON Feed 解析、去重、存储，无需外部服务器。UI 始终从本地 SQLite 读取。

**2. 无账户体系**
不需要用户名/密码登录。所有数据存储在设备本地，可选支持导出/导入 OPML 备份。

**3. 本地 AI 评分**
基于关键词规则或轻量本地模型（ONNX Runtime Mobile）对文章质量打分并添加标签，无需调用外部 API。

**4. 订阅源直连**
每个订阅源 URL 直接由 App 发起 HTTP 请求。支持 `If-Modified-Since` / `ETag` 条件请求节省流量。

---

## 3. 目录结构

```
mobile/
├── app/                          # Expo Router 文件路由
│   ├── _layout.tsx               # 根布局（字体加载、主题）
│   ├── onboarding.tsx            # 首次使用引导页（添加第一个订阅源）
│   ├── (tabs)/                   # 底部 Tab 导航组
│   │   ├── _layout.tsx           # Tab 布局（图标、标题、未读徽章）
│   │   ├── index.tsx             # 时间线页（默认首页）
│   │   ├── feeds.tsx             # 订阅源管理页
│   │   ├── starred.tsx           # 收藏页
│   │   └── settings.tsx          # 设置页
│   ├── article/
│   │   └── [id].tsx              # 文章阅读页（全屏堆叠）
│   ├── search.tsx                # 搜索页（堆叠）
│   └── feed/
│       └── [id].tsx              # 单订阅源文章列表（堆叠）
├── components/                   # 通用 UI 组件
│   ├── ArticleCard.tsx           # 文章卡片
│   ├── FeedItem.tsx              # 订阅源列表行
│   ├── SwipeableRow.tsx          # 左右滑动操作包装器（V1.3）
│   ├── EmptyState.tsx            # 空状态组件
│   ├── LoadingSpinner.tsx        # 加载指示器
│   ├── TagBadge.tsx              # AI 标签气泡
│   ├── ScoreBadge.tsx            # AI 质量分徽章
│   ├── FaviconImage.tsx          # 订阅源图标（含降级占位）
│   ├── AddFeedSheet.tsx          # 添加订阅源底部 Sheet
│   └── ThemedView.tsx            # 主题感知容器
```

```
├── store/                        # Zustand Store
│   ├── feedsStore.ts
│   ├── articlesStore.ts
│   └── settingsStore.ts
├── services/                     # 业务服务层
│   ├── rssService.ts             # RSS 抓取 + 解析核心引擎
│   ├── aiScorer.ts               # 本地 AI 评分/标签推断
│   ├── opmlService.ts            # OPML 导入/导出
│   ├── backgroundFetch.ts        # 后台刷新任务（V1.3）
│   └── pushNotification.ts       # 本地推送通知（V1.3）
├── db/                           # 本地数据库
│   ├── index.ts                  # SQLite 连接初始化
│   ├── schema.ts                 # Drizzle Schema
│   └── migrations/               # 本地迁移文件
├── hooks/                        # 自定义 Hook
│   ├── useArticles.ts
│   ├── useFeeds.ts
│   ├── useRefresh.ts
│   └── useTheme.ts
├── lib/                          # 工具函数
│   ├── relativeTime.ts
│   ├── htmlSanitize.ts
│   ├── feedDetector.ts           # 从网页 URL 自动探测 Feed 地址
│   └── constants.ts
├── assets/                       # 静态资源
│   ├── icon.png                  # 应用图标 1024x1024
│   ├── splash.png                # 启动图
│   └── adaptive-icon.png         # Android 自适应图标前景层
├── app.json
├── eas.json
├── babel.config.js
├── tsconfig.json
└── package.json
```

---

## 4. 数据架构

### 4.1 本地 SQLite Schema

所有数据均存储在设备本地 SQLite，无需与任何服务端同步。

```typescript
// db/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const articles = sqliteTable("articles", {
  id:            text("id").primaryKey(),          // guid 的 SHA-256 哈希
  feedId:        text("feed_id").notNull(),
  guid:          text("guid").notNull().unique(),
  title:         text("title").notNull(),
  summary:       text("summary"),
  content:       text("content"),
  author:        text("author"),
  url:           text("url").notNull(),
  publishedAt:   integer("published_at", { mode: "timestamp" }),
  isRead:        integer("is_read", { mode: "boolean" }).default(false),
  isStarred:     integer("is_starred", { mode: "boolean" }).default(false),
  isReadLater:   integer("is_read_later", { mode: "boolean" }).default(false),
  aiScore:       integer("ai_score"),
  aiTags:        text("ai_tags"),                  // JSON 数组字符串
  createdAt:     integer("created_at", { mode: "timestamp" }),
  fetchedAt:     integer("fetched_at", { mode: "timestamp" }),
  contentCached: integer("content_cached", { mode: "boolean" }).default(false),
});
```

```typescript
export const feeds = sqliteTable("feeds", {
  id:             text("id").primaryKey(),          // URL 的 SHA-256 哈希
  title:          text("title").notNull(),
  url:            text("url").notNull().unique(),   // RSS Feed URL
  siteUrl:        text("site_url"),
  favicon:        text("favicon"),
  groupId:        text("group_id"),
  lastFetchedAt:  integer("last_fetched_at", { mode: "timestamp" }),
  lastEtag:       text("last_etag"),               // HTTP ETag 缓存
  lastModified:   text("last_modified"),           // HTTP Last-Modified 缓存
  errorCount:     integer("error_count").default(0),
  lastError:      text("last_error"),
});

export const groups = sqliteTable("groups", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
});
```

### 4.2 FTS5 全文搜索

```sql
-- 在 db/migrations/0001_fts.sql 中创建
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title,
  summary,
  content,
  content='articles',
  content_rowid='rowid'
);

-- 触发器保持 FTS 与主表同步
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, summary, content)
    VALUES (new.rowid, new.title, new.summary, new.content);
END;
CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary, content)
    VALUES ('delete', old.rowid, old.title, old.summary, old.content);
END;
```

### 4.3 本地数据库索引

```sql
CREATE INDEX idx_articles_feed_pub  ON articles(feed_id, published_at DESC);
CREATE INDEX idx_articles_read_pub  ON articles(is_read, published_at DESC);
CREATE INDEX idx_articles_starred   ON articles(is_starred, published_at DESC);
CREATE INDEX idx_articles_score     ON articles(ai_score DESC);
CREATE UNIQUE INDEX idx_articles_guid ON articles(guid);
```

---

## 5. RSS 抓取与解析策略

### 5.1 RSSService 核心流程

```
触发：用户下拉刷新 / 定时 Background Fetch / 手动刷新单源

1. 读取本地 feeds 表（含 lastEtag / lastModified）
2. 发起 HTTP GET {feedUrl}
   - 请求头：If-None-Match: {etag}，If-Modified-Since: {lastModified}
   - 超时：10s，User-Agent: RSSReaderApp/1.0
3. 响应 304 Not Modified -> 跳过，更新 lastFetchedAt
4. 响应 200 -> 解析 XML/Atom/JSON Feed
5. 逐条文章按 guid 去重 -> upsert articles 表
6. 调用 aiScorer.score(article) -> 写入 ai_score / ai_tags
7. 更新 feeds.lastEtag / lastModified / lastFetchedAt / errorCount
8. 更新 FTS5 索引
9. 刷新 Zustand Store -> UI 自动响应
```

### 5.2 Feed 格式支持

| 格式 | 解析方式 |
|------|---------|
| RSS 2.0 | fast-xml-parser，映射 `<item>` 字段 |
| Atom 1.0 | fast-xml-parser，映射 `<entry>` 字段 |
| JSON Feed 1.1 | 原生 JSON.parse，映射 `items` 数组 |

### 5.3 自动探测 Feed 地址

用户输入的是普通网站 URL 时，`feedDetector.ts` 自动探测：

```
1. 请求网页 HTML
2. 解析 <link rel="alternate" type="application/rss+xml"> / type="application/atom+xml"
3. 找到则自动填充 Feed URL
4. 未找到则提示用户手动输入 Feed 地址
```

### 5.4 并发控制

```typescript
// 最多同时抓取 3 个订阅源，避免占满网络
const CONCURRENCY = 3;
await pLimit(CONCURRENCY)(feeds.map(feed => () => rssService.fetchFeed(feed)));
```

### 5.5 错误处理

| 错误 | 处理 |
|------|------|
| 无网络 | 展示本地数据，显示 OfflineBanner |
| 超时（>10s） | errorCount + 1，下次降级刷新频率 |
| HTTP 4xx | errorCount + 1，记录 lastError，Toast 提示 |
| 解析失败 | 记录 lastError，跳过该源，继续其他源 |
| errorCount >= 5 | 自动暂停该订阅源，UI 标记为「异常」 |

---

## 6. 导航结构与路由

### 6.1 路由树

```
/
├── onboarding           首次使用引导（无订阅源时自动跳转）
└── (tabs)               主界面
    ├── index            时间线（默认 Tab）
    ├── feeds            订阅源管理
    ├── starred          收藏
    └── settings         设置

/article/[id]            文章阅读（全屏堆叠）
/search                  搜索（堆叠）
/feed/[id]               单订阅源文章列表（堆叠）
```

> 移除了 `server-setup` 和 `login` 路由，无需任何认证流程。

### 6.2 底部 Tab 设计

| Tab | 图标 | 标题 | 徽章 |
|-----|------|------|------|
| index | list | 时间线 | 未读总数（>0 时红点） |
| feeds | rss | 订阅源 | — |
| starred | star | 收藏 | — |
| settings | settings | 设置 | — |

---

## 7. 页面与组件设计

### 7.1 首次使用引导页（onboarding.tsx）

首次安装且无任何订阅源时跳转此页。

```
+-----------------------------------+
|  [Logo]  RSS Reader               |
|  添加你的第一个订阅源              |
|                                   |
|  订阅源地址（RSS/Atom/网页URL）    |
|  [ https://...               ]    |
|  [错误提示，内联]                  |
|                                   |
|  [ 添 加 订 阅 源 ]               |
|                                   |
|  或 [导入 OPML 文件]              |
+-----------------------------------+
```

交互：
- 输入 URL -> 自动探测 Feed 地址 -> 显示订阅源名称预览
- 点击「添加」-> 首次抓取 -> 进入时间线
- 「导入 OPML」-> 文件选择器 -> 批量添加

---

### 7.2 时间线页（tabs/index.tsx）

顶部：`时间线 [筛选▼] [搜索] [刷新]`
快速筛选 Tab：`[全部] [未读] [星标] [稍后阅读]`

筛选面板（点击「筛选」展开）：
- 按分组 / 按订阅源筛选（Picker）
- AI 最低质量分（Slider，0–10）
- AI 标签多选（横向列表）
- 「清除全部筛选」

文章列表：FlatList，每页 30 条，下拉刷新（触发 RSS 抓取），上拉加载更多。

---

### 7.3 文章卡片（ArticleCard.tsx）

```
+-----------------------------------------------+
| [favicon] 订阅源名称              2小时前      |
| 文章标题（最多 2 行，粗体）                      |
| 摘要（最多 3 行，muted 色）                      |
| [AI:8]  [标签1]  [标签2]                      |
+-----------------------------------------------+
```

- 已读：opacity 0.55
- 点击 -> /article/[id]
- 左滑（V1.3）：标记已读；右滑（V1.3）：收藏

---

### 7.4 文章阅读页（article/[id].tsx）

导航栏：`[←]  文章阅读  [☆] [书签] [分享] [更多]`

正文区（ScrollView）：
- 标题（Fraunces 字体）+ 作者/时间/订阅源（muted）
- AI 分数 + 标签
- HTML 正文（react-native-render-html）：图片懒加载/全屏、代码块高亮、外链系统浏览器
- 底部固定「打开原文」按钮

阅读设置 Sheet（更多）：字体大小 / 行距 / 主题

进入时自动标记文章为已读（本地 SQLite 更新，无需网络）。

---

### 7.5 订阅源管理页（tabs/feeds.tsx）

SectionList 按分组展示，操作：
- 点击订阅源 -> /feed/[id]
- 长按 -> ActionSheet（编辑/立即刷新/删除）
- 点击 `+` -> AddFeedSheet 添加订阅源
- 点击刷新按钮 -> 全量刷新所有订阅源
- 长按分组 -> 重命名/删除

订阅源状态指示：
- 正常：绿点
- 异常（errorCount ≥ 5）：红点 + 错误描述

---

### 7.6 收藏页（tabs/starred.tsx）

is_starred=true 的文章列表，同 ArticleCard 样式。右上角「全部标记已读」。

---

### 7.7 搜索页（search.tsx）

输入防抖 300ms，使用本地 FTS5 全文搜索（标题 + 摘要 + 正文），历史搜索词（本地持久化，最多 10 条），关键词高亮（secondary 色）。

---

### 7.8 设置页（tabs/settings.tsx）

**外观**：主题（跟随系统/亮色/暗色）、字体大小、行距
**刷新策略**：后台刷新开关、刷新间隔、仅 Wi-Fi 刷新/加载图片
**通知**（V1.3）：本地推送开关、按订阅源配置
**存储**：文章保留天数、清理图片缓存、当前占用磁盘空间
**数据管理**：导出 OPML、导入 OPML、清除所有数据

> 移除了账户/服务器相关设置项，新增数据管理（OPML 导入/导出）。

---

## 8. 手势交互（V1.3）

### 8.1 文章列表滑动手势

| 方向 | 阈值 | 操作 | 背景色 |
|------|------|------|--------|
| 向左滑 | 60dp | 切换已读/未读 | #4A90D9（蓝） |
| 向右滑 | 60dp | 切换收藏 | #C18C5D（橙） |

动效：卡片跟随手指，超阈值图标放大 1.2x + Haptics.impactAsync(Medium)，松手 spring 复位。

### 8.2 下拉刷新

RefreshControl，触发所有订阅源的 RSS 抓取，指示器颜色 primary #5D7052，刷新完成 Toast 3 秒显示新增文章数。

### 8.3 文章阅读手势

- 双指捏合：调整字体大小（±2px，haptic 反馈）
- 下滑关闭：拖拽超过屏幕 30% 触发返回

---

## 9. 推送通知（V1.3）

### 9.1 本地通知流程

使用 `expo-notifications` 本地通知，**无需 FCM，无需后端**。

```
1. 设置页开启通知
2. requestPermissionsAsync()
3. Background Fetch 拉取新文章后
   -> 统计新文章数量
   -> 调用 scheduleNotificationAsync() 发送本地通知
4. 前台：Banner 提示；后台：系统通知栏
5. 点击通知 -> 深链接 -> 时间线（高亮新文章）或 /article/[id]
```

### 9.2 通知内容规范

- 标题：RSS Reader — 有 N 篇新文章
- 正文：[订阅源名称] 最新文章标题
- 大图标：应用图标
- 点击：打开时间线并滚动至最新文章

> 不依赖 FCM，完全使用本地调度通知，无需网络和后端配合。

---

## 10. 后台刷新（V1.3）

```typescript
// services/backgroundFetch.ts
TaskManager.defineTask("rss-background-fetch", async () => {
  const settings = await loadLocalSettings();

  if (settings.wifiOnlyFetch) {
    const net = await NetInfo.fetch();
    if (net.type !== "wifi") return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  const feeds = await db.select().from(feedsTable).where(eq(feedsTable.paused, false));
  const newCount = await rssService.refreshAll(feeds);

  if (newCount > 0 && settings.pushEnabled) {
    await scheduleNewArticlesNotification(newCount);
  }

  return newCount > 0
    ? BackgroundFetch.BackgroundFetchResult.NewData
    : BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function registerBackgroundFetch(intervalSeconds: number) {
  await BackgroundFetch.registerTaskAsync("rss-background-fetch", {
    minimumInterval: intervalSeconds,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
```

刷新间隔：15分钟=900s，30分钟=1800s，1小时=3600s。

---

## 11. 离线与缓存策略

### 11.1 文章内容缓存

RSS 抓取时 content 字段写入本地 SQLite，完全离线可读。content 为空时展示摘要 + 「打开原文」按钮。

### 11.2 图片缓存（V1.3）

expo-image 磁盘缓存（cachePolicy: disk）。
仅 Wi-Fi：移动数据时图片替换为灰色占位（NetInfo 检测）。
清理：`Image.clearDiskCache()`，设置页显示缓存占用大小。

### 11.3 离线状态 UI

- 无网络：顶部橙色 OfflineBanner「离线模式，显示本地数据」
- 所有已抓取文章仍可正常阅读
- 离线时的已读/收藏/稍后阅读操作直接写本地 SQLite，无需同步

### 11.4 文章保留策略

设置页可配置文章保留天数（7 / 30 / 90 / 永久）。超期未收藏、未稍后阅读的文章自动清理，释放磁盘空间。

---

## 12. 设计风格

### 12.1 设计哲学

延续 Web 端的 **Organic / Natural** 设计系统。核心：柔和、温暖、纸质质感。

### 12.2 颜色系统

| Token | 亮色 | 深色 |
|-------|------|------|
| background | #FDFCF8 | #1A1A14 |
| surface | #FEFEFA | #252520 |
| foreground | #2C2C24 | #E8E6E0 |
| primary | #5D7052 | #7A9A6B |
| secondary | #C18C5D | #C18C5D |
| muted | #78786C | #9A9A8E |
| border | #DED8CF | #3A3A30 |
| destructive | #A85448 | #C06858 |

### 12.3 字体

- 文章标题：Fraunces（expo-font）
- 正文/UI：Nunito（expo-font，降级系统字体）
- 代码：JetBrains Mono（expo-font）

### 12.4 圆角

卡片 16 / 按钮+输入+Badge 9999 / Sheet+Modal 顶角 24

### 12.5 间距（8pt 栅格）

页面水平 padding 16 / 卡片内 padding 16 / 组件间距 8~12 / Section 间距 24

### 12.6 阴影

- 卡片：shadowColor #5D7052，elevation 3
- 浮层：elevation 8
- 深色模式：仅 elevation

### 12.7 动效

- 按钮 scale spring 0.96→1.0（150ms）
- 列表项 FadeIn（200ms，Reanimated）
- 手势实时跟随，spring 复位

---

## 13. 状态管理

### 13.1 Store 设计

```typescript
interface FeedsStore {
  feeds: Feed[];
  groups: Group[];
  isLoading: boolean;
  isRefreshing: boolean;
  fetchFeeds: () => Promise<void>;
  addFeed: (url: string, groupId?: string) => Promise<Feed>;
  deleteFeed: (id: string) => Promise<void>;
  refreshFeed: (id: string) => Promise<{ newCount: number }>;
  refreshAll: () => Promise<{ newCount: number }>;
  importOpml: (opmlContent: string) => Promise<{ added: number; failed: number }>;
  exportOpml: () => Promise<string>;
}
```

```typescript
interface ArticlesStore {
  articles: Article[];
  hasMore: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  filterType: "all" | "unread" | "starred" | "read_later";
  filterFeedId: string | null;
  filterGroupId: string | null;
  filterMinScore: number;
  filterTags: string[];
  loadArticles: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  toggleReadLater: (id: string) => Promise<void>;
  markAllRead: (feedId?: string) => Promise<void>;
  setFilter: (filter: Partial<FilterState>) => void;
  resetFilter: () => void;
}

interface SettingsStore {
  theme: "system" | "light" | "dark";
  fontSize: 14 | 16 | 18 | 20;
  lineHeight: 1.4 | 1.6 | 1.8 | 2.0;
  backgroundFetchEnabled: boolean;
  fetchInterval: 15 | 30 | 60;
  wifiOnlyFetch: boolean;
  wifiOnlyImages: boolean;
  pushEnabled: boolean;
  articleRetentionDays: 7 | 30 | 90 | 0;
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
}
```

> 移除了 `AuthStore`（无账户体系），`FeedsStore` 新增 `importOpml` / `exportOpml`。

### 13.2 本地操作策略

所有操作（已读/收藏/稍后阅读）直接写本地 SQLite 并更新 Zustand Store，立即生效，无需网络，无需回滚逻辑。

---

## 14. RSS 服务层

### 14.1 RSSService 核心实现

```typescript
// services/rssService.ts
export class RSSService {
  async fetchFeed(feed: Feed): Promise<{ newCount: number }> {
    const headers: Record<string, string> = {
      "User-Agent": "RSSReaderApp/1.0",
    };
    if (feed.lastEtag) headers["If-None-Match"] = feed.lastEtag;
    if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

    const res = await fetch(feed.url, { headers });

    if (res.status === 304) {
      await db.update(feedsTable).set({ lastFetchedAt: new Date() }).where(eq(feedsTable.id, feed.id));
      return { newCount: 0 };
    }

    const xml = await res.text();
    const parsed = parseFeed(xml);           // 自动识别 RSS / Atom / JSON Feed
    const items = parsed.items;

    let newCount = 0;
    for (const item of items) {
      const exists = await db.select().from(articlesTable)
        .where(eq(articlesTable.guid, item.guid)).limit(1);
      if (exists.length === 0) {
        const scored = await aiScorer.score(item);
        await db.insert(articlesTable).values({ ...item, ...scored, feedId: feed.id });
        newCount++;
      }
    }

    await db.update(feedsTable).set({
      lastFetchedAt: new Date(),
      lastEtag: res.headers.get("etag") ?? feed.lastEtag,
      lastModified: res.headers.get("last-modified") ?? feed.lastModified,
      errorCount: 0,
      lastError: null,
    }).where(eq(feedsTable.id, feed.id));

    return { newCount };
  }
}
```

### 14.2 本地 AI 评分（aiScorer.ts）

基于规则引擎进行轻量评分，无需外部 API：

```typescript
// services/aiScorer.ts
export async function score(item: ParsedItem): Promise<{ aiScore: number; aiTags: string[] }> {
  const tags: string[] = [];
  let score = 5;  // 基础分

  // 关键词规则
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/tutorial|guide|how.?to/.test(text))     { tags.push("教程");  score += 1; }
  if (/opinion|rant|thoughts/.test(text))       { tags.push("观点");             }
  if (/research|paper|study/.test(text))        { tags.push("研究");  score += 2; }
  if (/breaking|urgent|alert/.test(text))       { tags.push("速报");             }

  // 内容长度加分
  if ((item.content?.length ?? 0) > 2000)       score += 1;
  if ((item.content?.length ?? 0) > 5000)       score += 1;

  return { aiScore: Math.min(10, score), aiTags: JSON.stringify(tags) };
}
```

---

## 15. 错误处理与边界情况

### 15.1 错误分类

| 错误 | 处理 |
|------|------|
| 无网络 | OfflineBanner，读本地缓存，操作正常可用 |
| RSS 抓取超时 | 重试 1 次，失败跳过该源，Toast 提示 |
| Feed 解析失败 | 记录 lastError，跳过，Toast |
| DB 写入错误 | 日志 + Toast，不影响其他源 |
| OPML 格式错误 | 内联错误提示，逐条解析跳过无效项 |
| 推送权限拒绝 | 引导至系统设置 |

### 15.2 边界情况

| 情况 | 处理 |
|------|------|
| 无订阅源 | 强制 onboarding 引导页 |
| 订阅源异常（errorCount ≥ 5） | 自动暂停 + 红点标记 + 提示修复 |
| content 为空 | 摘要 + 打开原文按钮 |
| Favicon 失败 | 首字母彩色圆形占位 |
| 标题超长 | 2 行省略 |
| 列表为空 | EmptyState 组件（含添加引导） |
| 磁盘空间不足 | 提示清理缓存或减少保留天数 |

---

## 16. 性能指标与优化

### 16.1 目标指标

| 指标 | 目标 |
|------|------|
| 冷启动首屏可交互 | < 2s |
| 时间线首屏渲染 | < 500ms |
| 滑动帧率 | 60fps |
| 内存 | < 150MB |
| APK 大小 | < 50MB |
| RSS 单源抓取耗时 | < 3s |

### 16.2 FlatList 优化

```typescript
<FlatList
  getItemLayout={(_, index) => ({ length: CARD_HEIGHT, offset: CARD_HEIGHT * index, index })}
  windowSize={5}
  maxToRenderPerBatch={10}
  initialNumToRender={15}
  removeClippedSubviews={true}
  renderItem={({ item }) => <ArticleCard article={item} />}
/>
// ArticleCard 使用 React.memo
```

### 16.3 其他优化

- Hermes JS 引擎（Expo 默认）
- Drizzle 复合索引覆盖常用查询
- FTS5 虚拟表支持全文搜索
- RSS 并发抓取上限 3，防止网络阻塞
- 字体子集化，react-native-render-html 按需引入插件
- 文章内容按需懒加载（列表只存 summary，阅读时读 content）

---

## 17. 打包与发布

### 17.1 eas.json

```json
{
  "build": {
    "development": { "developmentClient": true, "android": { "buildType": "apk" } },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "android": { "buildType": "aab" } }
  }
}
```

### 17.2 app.json（Android 关键配置）

```json
{
  "android": {
    "package": "com.rssreader.app",
    "versionCode": 1,
    "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#5D7052" },
    "permissions": ["RECEIVE_BOOT_COMPLETED", "VIBRATE", "POST_NOTIFICATIONS", "INTERNET", "ACCESS_NETWORK_STATE"]
  },
  "plugins": ["expo-router", "expo-font", "expo-notifications", "expo-background-fetch"]
}
```

> 移除了 `expo-secure-store`（无 Token 需存储）和 `googleServicesFile`（无 FCM）。

### 17.3 发布流程

```
1. 本地调试：npx expo start
2. 内测 APK：eas build --platform android --profile preview
3. 生产 AAB：eas build --platform android --profile production
4. 提交 Google Play：eas submit --platform android
5. OTA 热更新：eas update --branch production
```

---

## 18. 开发里程碑拆解

### V1.2 — 基础功能（预计 2 周）

**第 1 周**
- [ ] mobile/ 目录初始化（Expo、expo-router、TypeScript、ESLint）
- [ ] 本地 SQLite 初始化（Drizzle Schema + Migration + FTS5）
- [ ] RSSService：HTTP 抓取 + RSS/Atom/JSON Feed 解析 + ETag 缓存
- [ ] feedDetector：从网页 URL 自动探测 Feed 地址
- [ ] aiScorer：本地规则引擎评分
- [ ] Zustand Store（feeds / articles / settings）
- [ ] onboarding 引导页（添加第一个订阅源 / 导入 OPML）
- [ ] 时间线页（FlatList + 刷新触发抓取 + 加载更多 + 筛选 Tab）
- [ ] ArticleCard（AI 分数 + 标签）

**第 2 周**
- [ ] 文章阅读页（HTML 渲染 + 图片预览 + 阅读设置 Sheet + 自动标记已读）
- [ ] 文章操作（收藏 / 稍后阅读，全本地操作）
- [ ] 订阅源管理页（分组 + 添加/删除/刷新 + 异常状态展示）
- [ ] 单订阅源文章列表（/feed/[id]）
- [ ] 收藏页
- [ ] 搜索页（FTS5 + 防抖 + 历史词）
- [ ] 设置页（含 OPML 导入/导出 + 文章保留策略）
- [ ] 深色模式适配
- [ ] OfflineBanner + EmptyState 组件

### V1.3 — 增强功能（预计 2 周）

**第 3 周**
- [ ] SwipeableRow（left/right 手势，Reanimated）
- [ ] 左滑已读 / 右滑收藏 + Haptics
- [ ] expo-image 磁盘缓存
- [ ] 仅 Wi-Fi 图片加载
- [ ] Background Fetch 任务（定时抓取所有订阅源）
- [ ] 后台刷新后本地推送通知

**第 4 周**
- [ ] 按订阅源配置推送开关
- [ ] 通知点击深链接跳转
- [ ] 文章内容懒加载优化（列表 summary / 阅读页按需加载 content）
- [ ] 磁盘使用量展示 + 一键清理
- [ ] 应用图标 + Splash 设计
- [ ] EAS Build 生产测试
- [ ] Google Play 内测发布

---
