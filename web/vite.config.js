import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 공유 미리보기(og:image)와 canonical 은 절대 주소가 필요하다. 빌드 때 SITE_URL 로 채운다.
const siteUrl = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const siteUrlPlugin = () => ({
  name: "site-url",
  transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
});

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
