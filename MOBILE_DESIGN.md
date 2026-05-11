# RSS Reader — 移动端（Android）设计文档

> 版本：V1.0
> 创建日期：2026-05-11
> 对应里程碑：V1.2（基础功能）+ V1.3（推送与手势增强）

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型与架构](#2-技术选型与架构)
3. [目录结构](#3-目录结构)
4. [数据架构](#4-数据架构)
5. [网络与同步策略](#5-网络与同步策略)
6. [导航结构与路由](#6-导航结构与路由)
7. [页面与组件设计](#7-页面与组件设计)
8. [手势交互](#8-手势交互)
9. [推送通知](#9-推送通知)
10. [后台刷新](#10-后台刷新)
11. [离线与缓存策略](#11-离线与缓存策略)
12. [设计风格](#12-设计风格)
13. [状态管理](#13-状态管理)
14. [API 对接层](#14-api-对接层)
15. [错误处理与边界情况](#15-错误处理与边界情况)
16. [性能指标与优化](#16-性能指标与优化)
17. [打包与发布](#17-打包与发布)
18. [开发里程碑拆解](#18-开发里程碑拆解)

---

## 1. 项目概述

### 1.1 目标

基于现有后端 REST API，开发 RSS Reader Android 原生应用。应用运行在用户自托管的后端服务之上（Docker 部署），通过局域网或公网地址访问。

### 1.2 核心功能范围

| 功能模块 | V1.2（基础） | V1.3（增强） |
|--------|:-----------:|:-----------:|
| 服务器地址配置 + 登录 | ✅ | — |
| 时间线（文章流） | ✅ | — |
| 文章阅读视图 | ✅ | — |
| 订阅源管理 | ✅ | — |
| 收藏 / 稍后阅读 | ✅ | — |
| 搜索 | ✅ | — |
| 本地 SQLite 离线存储 | ✅ | — |
| 设置页（外观 + 同步） | ✅ | — |
| AI 打分/标签展示 | ✅ | — |
| 原生手势（左滑/右滑/下拉刷新） | — | ✅ |
| 推送通知（FCM） | — | ✅ |
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
| 本地数据库 | expo-sqlite + Drizzle ORM | 与后端 Schema 保持一致 |
| 网络请求 | axios 1.x | 统一拦截器，Bearer Token 注入 |
| 推送通知 | expo-notifications + FCM | Android 推送（V1.3） |
| 后台刷新 | expo-background-fetch | 静默更新文章（V1.3） |
| 应用内浏览器 | expo-web-browser | 打开原文，支持系统分享 |
| HTML 渲染 | react-native-render-html | 文章正文 HTML 渲染 |
| 图片缓存 | expo-image（内置磁盘缓存） | 流量优化 + 离线图片（V1.3） |
| 安全存储 | expo-secure-store | 存储 JWT Token 和服务器地址 |
| 手势处理 | react-native-gesture-handler + Reanimated 3 | 滑动手势（V1.3） |
| 打包发布 | EAS Build + EAS Submit | Expo Application Services |

### 2.2 整体架构

```
+---------------------------------------------------+
|               Android 应用（Expo）                  |
|                                                     |
|  +---------------+    +----------------------+      |
|  |   UI 层        |    |  本地 SQLite           |      |
|  |  Expo Router   |    |  (离线存储)             |      |
|  |  + 组件        |    |                      |      |
|  +-------+-------+    +-----------+----------+      |
|          |                        |                  |
|  +-------v------------------------v--------+         |
|  |            Zustand Store 层              |         |
|  |   (feeds / articles / settings / auth)  |         |
|  +-------------------+---------------------+         |
|                      |                               |
|  +-------------------v---------------------+         |
|  |          SyncService 同步服务              |         |
|  |  在线：调用后端 API -> upsert 本地 SQLite   |         |
|  |  离线：直接读本地 SQLite，操作入 pending 队列 |         |
|  +-------------------+---------------------+         |
+----------------------+-----------------------------+
                       | REST API（HTTP/HTTPS）
                       | Authorization: Bearer {token}
+-----------------------v----------------------------+
|              后端服务（Node.js + Fastify）           |
|            用户自托管，应用内配置服务器地址              |
+-----------------------------------------------------+
```

### 2.3 关键设计决策

**1. 本地优先（Local-First）**
文章数据写入本地 SQLite，UI 始终从本地读取，后台静默向服务端同步。离线时可完整浏览已缓存文章。

**2. Bearer Token 认证**
移动端使用 `Authorization: Bearer <token>` 头，而非 Web 端的 httpOnly Cookie。后端已有 JWT 逻辑，仅需在登录接口响应体中同时返回 `token` 字段（见附录适配清单第 1 条）。

**3. 服务器地址可配**
应用内提供服务器地址输入页，Token 和地址均存储于 `expo-secure-store`，支持用户随时更换自托管实例。

**4. 离线操作队列**
离线时对文章的状态操作（已读/收藏/稍后阅读）写入本地 `pending_actions` 表，网络恢复后自动批量同步至服务端。

---

## 3. 目录结构

```
mobile/
├── app/                          # Expo Router 文件路由
│   ├── _layout.tsx               # 根布局（字体加载、鉴权守卫、主题）
│   ├── login.tsx                 # 登录页
│   ├── server-setup.tsx          # 服务器地址配置页（首次使用）
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
│   ├── OfflineBanner.tsx         # 顶部离线状态提示条
│   └── ThemedView.tsx            # 主题感知容器
```

```
├── store/                        # Zustand Store
│   ├── authStore.ts
│   ├── feedsStore.ts
│   ├── articlesStore.ts
│   └── settingsStore.ts
├── services/                     # 业务服务层
│   ├── api.ts                    # axios 实例 + 拦截器
│   ├── syncService.ts            # 增量同步逻辑
│   ├── backgroundFetch.ts        # 后台刷新任务（V1.3）
│   └── pushNotification.ts       # 推送注册与处理（V1.3）
├── db/                           # 本地数据库
│   ├── index.ts                  # SQLite 连接初始化
│   ├── schema.ts                 # Drizzle Schema（与后端对齐）
│   └── migrations/               # 本地迁移文件
├── hooks/                        # 自定义 Hook
│   ├── useArticles.ts
│   ├── useFeeds.ts
│   ├── useSync.ts
│   └── useTheme.ts
├── lib/                          # 工具函数
│   ├── relativeTime.ts
│   ├── htmlSanitize.ts
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

与后端 Schema 字段保持一致，额外增加移动端特有字段（`synced_at`、`content_cached`）。

```typescript
// db/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const articles = sqliteTable("articles", {
  id:            text("id").primaryKey(),
  feedId:        text("feed_id").notNull(),
  guid:          text("guid").notNull(),
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
  aiTags:        text("ai_tags"),
  createdAt:     integer("created_at", { mode: "timestamp" }),
  syncedAt:      integer("synced_at", { mode: "timestamp" }),
  contentCached: integer("content_cached", { mode: "boolean" }).default(false),
});
```

```typescript
export const feeds = sqliteTable("feeds", {
  id:            text("id").primaryKey(),
  title:         text("title").notNull(),
  url:           text("url").notNull(),
  siteUrl:       text("site_url"),
  favicon:       text("favicon"),
  groupId:       text("group_id"),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
  errorCount:    integer("error_count").default(0),
  syncedAt:      integer("synced_at", { mode: "timestamp" }),
});

export const groups = sqliteTable("groups", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const syncMeta = sqliteTable("sync_meta", {
  key:       text("key").primaryKey(),
  value:     text("value"),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});
```

### 4.2 离线操作队列

```typescript
export const pendingActions = sqliteTable("pending_actions", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  type:      text("type").notNull(),
  articleId: text("article_id").notNull(),
  payload:   text("payload"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});
```

### 4.3 本地数据库索引

```sql
CREATE INDEX idx_articles_feed_pub ON articles(feed_id, published_at DESC);
CREATE INDEX idx_articles_read_pub ON articles(is_read, published_at DESC);
CREATE INDEX idx_articles_starred  ON articles(is_starred, published_at DESC);
CREATE INDEX idx_articles_score    ON articles(ai_score);
```

---

## 5. 网络与同步策略

### 5.1 认证流程

```
1. 用户输入服务器地址（如 http://192.168.1.100:3000）
2. GET {serverUrl}/api/health  测试连通性（超时 5s）
3. POST {serverUrl}/api/auth/login  { username, password }
4. 响应：{ token: "eyJ..." }
5. token    -> expo-secure-store（key: auth_token）
   serverUrl -> expo-secure-store（key: server_url）
6. 后续请求：Authorization: Bearer {token}
```

> 后端适配：`/api/auth/login` 需在响应体中增加 `token` 字段（详见附录第 1 条）。

### 5.2 同步流程

```
触发：应用启动 / 用户下拉刷新 / Background Fetch

1. GET /api/feeds  ->  upsert 本地 feeds / groups
2. GET /api/articles?limit=200  ->  upsert 本地 articles
3. 处理 pending_actions（逐条调用 API，成功后删除记录）
4. 更新 syncMeta.last_articles_sync = now()
5. 刷新 Zustand Store -> UI 自动响应
```

### 5.3 离线操作同步

```
网络断开：
  操作 -> 本地 SQLite 乐观更新 + 写 pending_actions + 展示 OfflineBanner

网络恢复（NetInfo 事件）：
  -> 批量同步 pending_actions
  -> 成功：删除记录；失败：保留重试
  -> 冲突策略：本地最新状态优先
```

### 5.4 错误处理

| 错误 | 处理方式 |
|------|----------|
| 无网络 | 读本地，展示 OfflineBanner |
| 超时 | 自动重试 1 次，失败 Toast |
| HTTP 401 | 清除 Token，跳转登录 |
| HTTP 5xx | Toast 提示，保持 UI |

---

## 6. 导航结构与路由

### 6.1 路由树

```
/
├── server-setup         服务器配置（未配置时强制跳转）
├── login                登录（未登录时跳转）
└── (tabs)               主界面（已登录）
    ├── index            时间线（默认 Tab）
    ├── feeds            订阅源管理
    ├── starred          收藏
    └── settings         设置

/article/[id]            文章阅读（全屏堆叠）
/search                  搜索（堆叠）
/feed/[id]               单订阅源文章列表（堆叠）
```

### 6.2 底部 Tab 设计

| Tab | 图标 | 标题 | 徽章 |
|-----|------|------|------|
| index | list | 时间线 | 未读总数（>0 时红点） |
| feeds | rss | 订阅源 | — |
| starred | star | 收藏 | — |
| settings | settings | 设置 | — |

---

## 7. 页面与组件设计

### 7.1 服务器配置页（server-setup.tsx）

首次安装或服务器配置被清除时强制跳转此页。

```
+-----------------------------------+
|  [Logo]  RSS Reader               |
|  连接你的 RSS 服务器                |
|                                   |
|  服务器地址                        |
|  [ http://...                 ]   |
|  [错误提示，内联]                   |
|                                   |
|  [ 连 接 服 务 器 ]                |
+-----------------------------------+
```

交互：GET /api/health 测试连通 -> 成功存储跳转登录，失败内联错误。

---

### 7.2 登录页（login.tsx）

```
+-----------------------------------+
|  RSS Reader  欢迎回来              |
|  [ 用户名输入框 ]                  |
|  [ 密码输入框  [眼睛图标] ]         |
|  [错误提示，内联]                   |
|  [ 登 录 ]                         |
|  更换服务器地址                     |
+-----------------------------------+
```

---

### 7.3 时间线页（tabs/index.tsx）

顶部：`时间线 [筛选▼] [搜索] [刷新]`
快速筛选 Tab：`[全部] [未读] [星标] [稍后阅读]`

筛选面板（点击「筛选」展开）：
- 按分组 / 按订阅源筛选（Picker）
- AI 最低质量分（Slider，0–10）
- AI 标签多选（横向列表）
- 「清除全部筛选」

文章列表：FlatList，每页 30 条，下拉刷新，上拉加载更多。

---

### 7.4 文章卡片（ArticleCard.tsx）

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

### 7.5 文章阅读页（article/[id].tsx）

导航栏：`[←]  文章阅读  [☆] [书签] [分享] [更多]`

正文区（ScrollView）：
- 标题（Fraunces 字体）+ 作者/时间/订阅源（muted）
- AI 分数 + 标签
- HTML 正文（react-native-render-html）：图片懒加载/全屏、代码块高亮、外链系统浏览器
- 底部固定「打开原文」按钮

阅读设置 Sheet（更多）：字体大小 / 行距 / 主题

进入时自动调用 `PUT /api/articles/:id/read`。

---

### 7.6 订阅源管理页（tabs/feeds.tsx）

SectionList 按分组展示，操作：
- 点击订阅源 -> /feed/[id]
- 长按 -> ActionSheet（编辑/刷新/删除）
- 点击 `+` -> 底部 Sheet 添加订阅源
- 点击刷新按钮 -> 全量刷新
- 长按分组 -> 重命名/删除

---

### 7.7 收藏页（tabs/starred.tsx）

is_starred=true 的文章列表，同 ArticleCard 样式。右上角「全部标记已读」。

---

### 7.8 搜索页（search.tsx）

输入防抖 300ms，历史搜索词（AsyncStorage，最多 10 条），关键词高亮（secondary 色）。

---

### 7.9 设置页（tabs/settings.tsx）

**外观**：主题（跟随系统/亮色/暗色）、字体大小、行距
**同步**：后台刷新开关、刷新间隔、仅 Wi-Fi 刷新/加载图片、文章保留天数
**通知**（V1.3）：推送开关、按订阅源配置
**存储**：缓存条数、清理图片缓存（V1.3）
**账户**：服务器地址、用户名、修改密码、退出登录

---

## 8. 手势交互（V1.3）

### 8.1 文章列表滑动手势

| 方向 | 阈值 | 操作 | 背景色 |
|------|------|------|--------|
| 向左滑 | 60dp | 切换已读/未读 | #4A90D9（蓝） |
| 向右滑 | 60dp | 切换收藏 | #C18C5D（橙） |

动效：卡片跟随手指，超阈值图标放大 1.2x + Haptics.impactAsync(Medium)，松手 spring 复位。

### 8.2 下拉刷新

RefreshControl，指示器颜色 primary #5D7052，刷新完成 Toast 3 秒。

### 8.3 文章阅读手势

- 双指捏合：调整字体大小（±2px，haptic 反馈）
- 下滑关闭：拖拽超过屏幕 30% 触发返回

---

## 9. 推送通知（V1.3）

### 9.1 FCM 集成流程

```
1. 设置页开启通知
2. requestPermissionsAsync()
3. getDevicePushTokenAsync() -> FCM Token
4. POST /api/devices/register { token, platform: android }
5. 后端拉取新文章 -> FCM API 推送
6. 收到推送：前台 Banner / 后台系统通知栏
7. 点击通知 -> 深链接 -> /article/[id]
```

### 9.2 需后端新增接口

| 接口 | 说明 |
|------|------|
| POST /api/devices/register | 注册 FCM Token |
| DELETE /api/devices/:token | 注销 Token |
| PUT /api/devices/:token/prefs | per-feed 通知偏好 |

### 9.3 通知内容规范

标题：[订阅源名称] 有 N 篇新文章
正文：最新文章标题
大图标：Favicon
点击：打开最新文章

---

## 10. 后台刷新（V1.3）

```typescript
// services/backgroundFetch.ts
TaskManager.defineTask("rss-background-fetch", async () => {
  const token     = await SecureStore.getItemAsync("auth_token");
  const serverUrl = await SecureStore.getItemAsync("server_url");
  if (!token || !serverUrl) return BackgroundFetch.BackgroundFetchResult.NoData;

  const settings = await loadLocalSettings();
  if (settings.wifiOnlyFetch) {
    const net = await NetInfo.fetch();
    if (net.type !== "wifi") return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  const newCount = await SyncService.sync(serverUrl, token);
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

content 字段同步时写入本地 SQLite，离线时直接读取展示全文。content 为空时展示摘要 + 「打开原文」。

### 11.2 图片缓存（V1.3）

expo-image 磁盘缓存（cachePolicy: disk）。
仅 Wi-Fi：移动数据时图片替换为灰色占位（NetInfo 检测）。
清理：Image.clearDiskCache()。

### 11.3 离线状态 UI

- 无网络：顶部橙色 OfflineBanner「离线模式，显示本地数据」
- 操作乐观更新，网络恢复后自动同步 pending_actions

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
interface AuthStore {
  token: string | null;
  username: string | null;
  serverUrl: string | null;
  status: "checking" | "authenticated" | "unauthenticated";
  checkAuth: () => Promise<void>;
  login: (serverUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface FeedsStore {
  feeds: Feed[];
  groups: Group[];
  isLoading: boolean;
  fetchFeeds: () => Promise<void>;
  addFeed: (url: string, groupId?: string) => Promise<Feed>;
  deleteFeed: (id: string) => Promise<void>;
  refreshFeed: (id: string) => Promise<{ newCount: number }>;
  refreshAll: () => Promise<void>;
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

### 13.2 乐观更新策略

操作触发 -> Store 立即更新 + 写本地 SQLite -> 发 API -> 成功无操作；失败回滚 Store + 本地 + Toast。

---

## 14. API 对接层

### 14.1 axios 实例

```typescript
export async function initApiClient() {
  const serverUrl = await SecureStore.getItemAsync("server_url") ?? "";
  const token     = await SecureStore.getItemAsync("auth_token");
  const client = axios.create({ baseURL: serverUrl, timeout: 10000 });
  client.interceptors.request.use(config => {
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  client.interceptors.response.use(
    res => res,
    async err => {
      if (err.response?.status === 401) {
        await SecureStore.deleteItemAsync("auth_token");
        useAuthStore.getState().logout();
      }
      return Promise.reject(err);
    }
  );
  return client;
}
```

### 14.2 接口清单

**直接复用（无需修改）**：

GET /api/health / GET /api/auth/me / POST /api/auth/logout / PUT /api/auth/password
GET /api/feeds / POST /api/feeds / PUT /api/feeds/:id / DELETE /api/feeds/:id
POST /api/feeds/:id/refresh / POST /api/feeds/refresh-all
GET /api/feeds/groups / POST /api/feeds/groups / PUT /api/feeds/groups/:id / DELETE /api/feeds/groups/:id
GET /api/articles / GET /api/articles/:id
PUT /api/articles/:id/read / PUT /api/articles/:id/star / PUT /api/articles/:id/read-later
POST /api/articles/mark-all-read / GET /api/search / GET /api/settings / PUT /api/settings

**需后端适配（V1.2 必须）**：
- POST /api/auth/login：响应体增加 `token: string` 字段

**需后端新增（V1.3）**：
- POST /api/devices/register
- DELETE /api/devices/:token
- PUT /api/devices/:token/prefs

---

## 15. 错误处理与边界情况

### 15.1 错误分类

| 错误 | 处理 |
|------|------|
| 无网络 | OfflineBanner，读本地 |
| 超时 | 重试 1 次，Toast |
| 401 | 清 Token，跳登录，Toast |
| 404 | Toast，刷新列表 |
| 5xx | Toast，保持 UI |
| DB 错误 | 日志 + Toast |
| 推送权限拒绝 | 引导系统设置 |

### 15.2 边界情况

| 情况 | 处理 |
|------|------|
| 无服务器配置 | 强制 server-setup |
| Token 过期 | 自动登出 + Toast |
| content 为空 | 摘要 + 打开原文按钮 |
| Favicon 失败 | 首字母彩色圆形占位 |
| 标题超长 | 2 行省略 |
| 列表为空 | EmptyState 组件 |

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
- 字体子集化，react-native-render-html 按需引入插件

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
    "permissions": ["RECEIVE_BOOT_COMPLETED", "VIBRATE", "POST_NOTIFICATIONS"],
    "googleServicesFile": "./google-services.json"
  },
  "plugins": ["expo-router", "expo-font", "expo-secure-store", "expo-notifications", "expo-background-fetch"]
}
```

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
- [ ] 本地 SQLite 初始化（Drizzle Schema + Migration）
- [ ] axios API 客户端（Bearer Token + 401 登出）
- [ ] expo-secure-store 封装
- [ ] server-setup 页
- [ ] login 页
- [ ] 根布局鉴权守卫
- [ ] Zustand Store（auth / feeds / articles / settings）
- [ ] SyncService 增量同步
- [ ] 时间线页（FlatList + 刷新 + 加载更多 + 筛选 Tab）
- [ ] ArticleCard（AI 分数 + 标签）

**第 2 周**
- [ ] 文章阅读页（HTML 渲染 + 图片预览 + 阅读设置 Sheet）
- [ ] 文章操作（自动已读 / 收藏 / 稍后阅读）
- [ ] 订阅源管理页（分组 + 添加/删除/刷新/分组管理）
- [ ] 单订阅源文章列表（/feed/[id]）
- [ ] 收藏页
- [ ] 搜索页（防抖 + 历史词）
- [ ] 设置页（含修改密码二级页）
- [ ] 离线 pending_actions 队列 + 网络恢复同步
- [ ] 深色模式适配
- [ ] OfflineBanner + EmptyState 组件

### V1.3 — 增强功能（预计 2 周）

**第 3 周**
- [ ] SwipeableRow（left/right 手势，Reanimated）
- [ ] 左滑已读 / 右滑收藏 + Haptics
- [ ] expo-image 磁盘缓存
- [ ] 仅 Wi-Fi 图片加载
- [ ] Background Fetch 任务
- [ ] 后台刷新后本地通知

**第 4 周**
- [ ] FCM 集成
- [ ] 推送 Token 注册（配合后端）
- [ ] 深链接：通知跳文章
- [ ] 按订阅源推送开关
- [ ] 应用图标 + Splash 设计
- [ ] EAS Build 生产测试
- [ ] Google Play 内测发布

---

## 附录：后端适配清单

| # | 内容 | 里程碑 | 备注 |
|---|------|--------|------|
| 1 | `POST /api/auth/login` 响应体增加 `token: string` | V1.2 必须 | 移动端无法使用 httpOnly Cookie |
| 2 | 新增 `POST /api/devices/register` | V1.3 | 存储 FCM Token |
| 3 | 新增 `DELETE /api/devices/:token` | V1.3 | 退出登录注销 Token |
| 4 | 新增 `PUT /api/devices/:token/prefs` | V1.3 | per-feed 通知偏好 |
| 5 | 文章拉取后触发 FCM 推送逻辑 | V1.3 | 调用 FCM HTTP v1 API |
