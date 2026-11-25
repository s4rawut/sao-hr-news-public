-- ลำดับระดับตำแหน่งใน "ประกาศคณะกรรมการคัดเลือกฯ" (กรณีไม่มีประกาศ)
-- บริหาร: ต้น, สูง | อำนวยการ: สูง, ต้น | วิชาการ: ปฏิบัติการ → ทรงคุณวุฒิ | ทั่วไป: ปฏิบัติงาน → อาวุโส
-- changes only these level terms; nothing else in the database is touched
UPDATE taxonomies SET sort_order = CASE slug
	WHEN 'executive-early' THEN 0 WHEN 'executive-high' THEN 1
	WHEN 'director-high' THEN 0 WHEN 'director-early' THEN 1
	WHEN 'academic-operational' THEN 0 WHEN 'academic-pro' THEN 1 WHEN 'academic-senior-pro' THEN 2
	WHEN 'academic-expert' THEN 3 WHEN 'academic-advisory' THEN 4
	WHEN 'general-operational' THEN 0 WHEN 'general-skilled' THEN 1 WHEN 'general-senior' THEN 2
	ELSE sort_order END
WHERE name = 'recruit_level' AND slug IN (
	'executive-early', 'executive-high', 'director-high', 'director-early',
	'academic-operational', 'academic-pro', 'academic-senior-pro', 'academic-expert', 'academic-advisory',
	'general-operational', 'general-skilled', 'general-senior'
);
