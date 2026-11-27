/**
 * Demo mode (DEMO_MODE=1, only for a public test copy such as Render — never on IT's server):
 * a "เข้าสู่ระบบแบบทดลอง" button signs anyone in as a demo admin, uploads are capped, and pages
 * are kept out of search engines. The data resets whenever the host restarts the container.
 */
import { get, nowIso, run, ulid } from "../cms/db";

export const isDemo = () => process.env.DEMO_MODE === "1";
export const DEMO_MAX_UPLOAD = 5 * 1024 * 1024;
const DEMO_EMAIL = "demo@hr-sao.local";

export function demoUserId(): string {
	const u = get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, DEMO_EMAIL);
	if (u) {
		run(`UPDATE users SET role = 50, disabled = 0, username = coalesce(username, 'demo') WHERE id = ?`, u.id);
		return u.id;
	}
	const id = ulid();
	run(
		`INSERT INTO users (id, email, username, name, role, email_verified, created_at, updated_at, disabled) VALUES (?, ?, 'demo', 'ผู้ทดลองใช้', 50, 1, ?, ?, 0)`,
		id,
		DEMO_EMAIL,
		nowIso(),
		nowIso(),
	);
	return id;
}
