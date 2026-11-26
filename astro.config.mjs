import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { thaiDatePlugin } from "./src/plugins/thai-date/index.ts";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			// ขนาดอัปโหลดสูงสุด 200 MB (ดีฟอลต์เดิม 50 MB) — รองรับไฟล์วิดีโอ MP4
			maxUploadSize: 200 * 1024 * 1024,
			// ช่องเลือกวันที่ภาษาไทย (ไม่มีเวลา) ในหลังบ้าน — ใช้กับฟิลด์ที่ตั้ง widget = "thai-date:date"
			plugins: [thaiDatePlugin()],
		}),
	],
	devToolbar: { enabled: false },
	// โดเมนที่เชื่อถือได้: ให้ระบบใช้โดเมนที่ผู้ใช้เปิดเข้ามา (Host / X-Forwarded-Host / X-Forwarded-Proto จาก reverse proxy)
	// แทนการเด้งไป http://localhost:4321 เมื่อไม่ได้ตั้ง EMDASH_SITE_URL (ถ้าตั้งไว้ ค่าใน .env มีผลก่อน)
	security: {
		allowedDomains: [
			{ hostname: "audit.go.th" },
			{ hostname: "**.audit.go.th" },
			{ hostname: "localhost" },
			{ hostname: "127.0.0.1" },
		],
	},
});
