-- 1) เข้าหลังบ้านด้วย username + รหัสผ่าน (รุ่น 2569-11-27-5)
--    บัญชีเดิมได้ username จากส่วนหน้าของอีเมล (admin@hr-sao.local → admin) ถ้าซ้ำกันจะต่อท้ายด้วยเลข
ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username =
	CASE WHEN instr(email, '@') > 1 THEN lower(substr(email, 1, instr(email, '@') - 1)) ELSE lower(email) END
	|| CASE WHEN (
		SELECT count(*) FROM users u2
		WHERE (CASE WHEN instr(u2.email, '@') > 1 THEN lower(substr(u2.email, 1, instr(u2.email, '@') - 1)) ELSE lower(u2.email) END)
		    = (CASE WHEN instr(users.email, '@') > 1 THEN lower(substr(users.email, 1, instr(users.email, '@') - 1)) ELSE lower(users.email) END)
		  AND u2.rowid < users.rowid
	) > 0 THEN '-' || users.rowid ELSE '' END
WHERE username IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- 2) การจัดหน้าแรก (ลำดับ แสดง/ซ่อน ความกว้างของแต่ละส่วน) แก้ได้ที่หลังบ้าน → จัดหน้าแรก
INSERT OR IGNORE INTO options (name, value) VALUES ('hr:home_layout', '[
	{"key":"quick_links","visible":true,"width":"full"},
	{"key":"recruit","visible":true,"width":"full"},
	{"key":"news","visible":true,"width":"left"},
	{"key":"calendar","visible":true,"width":"right"},
	{"key":"documents","visible":true,"width":"full"}
]');
