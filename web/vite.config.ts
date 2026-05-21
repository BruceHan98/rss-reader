import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "RSS Reader",
        short_name: "RSS",
        description: "自托管 RSS 阅读器",
        theme_color: "#5D7052",
        background_color: "#FDFCF8",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // 只预缓存带 hash 的静态资源（JS/CSS/图片），不预缓存 index.html
        // index.html 由 nginx 的 no-cache 头控制，SW 不干预，确保每次都能拿到最新 HTML
        globPatterns: ["**/*.{js,css,ico,png,svg}"],
        // 导航请求（HTML）始终走网络，保证 index.html 版本是最新的
        navigateFallback: null,
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "highlight": ["highlight.js"],
          "dompurify": ["dompurify"],
        },
      },
    },
  },
});