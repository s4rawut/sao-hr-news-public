-- หลังบ้านเข้าด้วยอีเมล + รหัสผ่าน (รุ่น 2569-11-27-4)
-- เก็บรหัสผ่านแบบ hash (scrypt) ในตาราง users ไม่มีรหัสผ่านจริงเก็บไว้ที่ใด
ALTER TABLE users ADD COLUMN password_hash TEXT;
-- นับการใส่รหัสผิด เพื่อล็อกชั่วคราว (กันการเดารหัส)
CREATE TABLE IF NOT EXISTS _hr_login_attempts (
	key TEXT PRIMARY KEY,
	failures INTEGER NOT NULL DEFAULT 0,
	locked_until TEXT,
	updated_at TEXT
);
