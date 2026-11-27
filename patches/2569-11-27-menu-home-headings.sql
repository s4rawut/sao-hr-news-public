-- เมนูและหัวข้อหน้าแรก (รุ่น 2569-11-27)
-- 1) ย้าย "ประกาศคณะกรรมการคัดเลือกฯ" (/recruitments) ออกจากเมนูย่อย "ข้อมูลข่าวสาร" ขึ้นเป็นเมนูหลัก
--    ต่อจาก "หน้าหลัก" และเปลี่ยนชื่อเป็น "ข่าวรับสมัครสอบ"
-- 2) เมนูย่อย "คลังข้อมูล" (/posts) เปลี่ยนชื่อเป็น "ประกาศ/คำสั่ง/ระเบียบ/หลักเกณฑ์/บันทึกข้อความ/คู่มือ"
-- 3) หัวข้อหน้าแรกเปลี่ยนตามกัน
-- แก้เฉพาะรายการที่ยังเป็นชื่อเดิม ถ้าผู้ดูแลเปลี่ยนชื่อเองแล้ว จะไม่เขียนทับ

-- 1) เลื่อนเมนูหลักลำดับ 1 เป็นต้นไปถอยหนึ่งช่อง (เฉพาะเมื่อยังไม่เคยย้าย)
UPDATE _emdash_menu_items SET sort_order = sort_order + 1
WHERE menu_id = (SELECT id FROM _emdash_menus WHERE name = 'primary')
	AND parent_id IS NULL AND sort_order >= 1
	AND EXISTS (
		SELECT 1 FROM _emdash_menu_items
		WHERE menu_id = (SELECT id FROM _emdash_menus WHERE name = 'primary')
			AND parent_id IS NOT NULL AND custom_url = '/recruitments'
	);

UPDATE _emdash_menu_items SET parent_id = NULL, sort_order = 1, label = 'ข่าวรับสมัครสอบ'
WHERE menu_id = (SELECT id FROM _emdash_menus WHERE name = 'primary')
	AND parent_id IS NOT NULL AND custom_url = '/recruitments';

-- 2)
UPDATE _emdash_menu_items SET label = 'ประกาศ/คำสั่ง/ระเบียบ/หลักเกณฑ์/บันทึกข้อความ/คู่มือ'
WHERE menu_id = (SELECT id FROM _emdash_menus WHERE name = 'primary')
	AND custom_url = '/posts' AND label = 'คลังข้อมูล';

-- 3)
UPDATE ec_site_info SET heading_recruitments = 'ข่าวรับสมัครสอบ'
WHERE heading_recruitments = 'ประกาศคณะกรรมการคัดเลือกฯ';
UPDATE ec_site_info SET heading_documents = 'ประกาศ/คำสั่ง/ระเบียบ/หลักเกณฑ์/บันทึกข้อความ/คู่มือ'
WHERE heading_documents = 'คลังข้อมูล';
