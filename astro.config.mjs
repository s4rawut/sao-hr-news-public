import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

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
	],
	// ไม่ใช้ EmDash แล้ว: ข้อมูลอ่านจาก data.db ด้วยโค้ดของเว็บเอง (src/lib/cms) หลังบ้านอยู่ที่ /admin
	vite: {
		ssr: { external: ["node:sqlite"] },
	},
	devToolbar: { enabled: false },
	// โดเมนที่เชื่อถือได้: ให้ระบบใช้โดเมนที่ผู้ใช้เปิดเข้ามา (Host / X-Forwarded-Host / X-Forwarded-Proto จาก reverse proxy)
	// แทนการเด้งไป http://localhost:4321 เมื่อไม่ได้ตั้ง EMDASH_SITE_URL (ถ้าตั้งไว้ ค่าใน .env มีผลก่อน)
	security: {
		allowedDomains: [
			{ hostname: "audit.go.th" },
			{ hostname: "**.audit.go.th" },
			{ hostname: "localhost" },
			{ hostname: "127.0.0.1" },
			// the public demo copy on Render (render.yaml); a browser has to open that address to use it
			{ hostname: "**.onrender.com" },
		],
	},
});
