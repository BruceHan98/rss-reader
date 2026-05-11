# RSS Reader

RSS 资讯获取、展示、阅读一站式应用。支持订阅管理、AI 内容分析、Docker 一键部署。

## 功能

- RSS 2.0 / Atom / JSON Feed 订阅管理，支持分组与 OPML 导入导出
- 定时自动拉取，增量去重
- 内置阅读视图，支持代码高亮、亮/暗主题
- 收藏、稍后阅读、全文搜索
- AI 质量打分（0–10）+ 自动打标签，兼容 OpenAI / DeepSeek / Ollama
- JWT 登录鉴权，Docker Compose 一键部署

## 快速开始

```bash
git clone https://github.com/BruceHan98/rss-reader.git
cd rss-reader
docker compose up -d
```

启动后访问 `http://localhost:8080`，初始密码查看后端日志：

```bash
docker logs rss-reader-server | grep "Initial password"
```

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS
- **后端**：Node.js + Fastify + SQLite + Drizzle ORM
- **部署**：Docker + Nginx
