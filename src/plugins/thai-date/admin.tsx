import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Thai date picker for datetime fields (widget "thai-date:date").
 * Shows and picks a calendar day only — "15 พฤศจิกายน 2569" — with no time.
 * Saves "2026-11-15T00:00:00.000Z" for 15 Nov — the same wall-clock-as-UTC form the site already
 * reads back (adminDateTime) as that day in Bangkok.
 */

const MONTHS = [
	"มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
	"กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

type Ymd = { y: number; m: number; d: number };

// The site stores the admin's wall-clock date/time with a "Z" suffix (see adminDateTime in
// utils/thai-date.ts), so the calendar day is simply the UTC date of the stored value.
const toYmd = (value: unknown): Ymd | null => {
	if (typeof value !== "string" || !value) return null;
	const t = Date.parse(value);
	if (Number.isNaN(t)) return null;
	const d = new Date(t);
	return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const toValue = ({ y, m, d }: Ymd) => new Date(Date.UTC(y, m, d)).toISOString();
const label = (v: Ymd) => `${v.d} ${MONTHS[v.m]} ${v.y + 543}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const todayYmd = (): Ymd => toYmd(new Date(Date.now() + 7 * 3_600_000).toISOString())!;

interface Props {
	value: unknown;
	onChange: (value: unknown) => void;
	label: string;
	id: string;
	required?: boolean;
	minimal?: boolean;
}

function ThaiDateField({ value, onChange, label: fieldLabel, id, required, minimal }: Props) {
	const selected = useMemo(() => toYmd(value), [value]);
	const [open, setOpen] = useState(false);
	const [view, setView] = useState<{ y: number; m: number }>(() => {
		const base = selected ?? todayYmd();
		return { y: base.y, m: base.m };
	});
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const base = selected ?? todayYmd();
		setView({ y: base.y, m: base.m });
		const close = (e: MouseEvent) => {
			if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
		};
		const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", esc);
		return () => {
			document.removeEventListener("mousedown", close);
			document.removeEventListener("keydown", esc);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
	const cells: (number | null)[] = [
		...Array.from({ length: first }, () => null),
		...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1),
	];
	const today = todayYmd();
	const shift = (n: number) => {
		const m = view.m + n;
		setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
	};
	const pick = (d: number) => {
		onChange(toValue({ y: view.y, m: view.m, d }));
		setOpen(false);
	};
	// พ.ศ. 2500 (ค.ศ. 1957) up to 10 years ahead, newest first so recent years are at the top
	const FIRST_YEAR = 2500 - 543;
	const years = Array.from({ length: today.y + 10 - FIRST_YEAR + 1 }, (_, i) => today.y + 10 - i);

	const btn: React.CSSProperties = {
		border: 0,
		background: "transparent",
		cursor: "pointer",
		font: "inherit",
		color: "inherit",
	};

	return (
		<div className="grid gap-2" ref={box} style={{ position: "relative" }}>
			<label htmlFor={id} className={minimal ? "text-kumo-subtle/50 text-xs font-normal" : "text-base font-medium"}>
				{fieldLabel}
				{required && <span aria-hidden="true"> *</span>}
			</label>
			<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<button
					type="button"
					id={id}
					onClick={() => setOpen((o) => !o)}
					aria-haspopup="dialog"
					aria-expanded={open}
					style={{
						...btn,
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
						padding: "8px 12px",
						border: "1px solid var(--color-kumo-line, #d4d4d8)",
						borderRadius: 8,
						background: "var(--color-kumo-base, #fff)",
						textAlign: "left",
						minHeight: 38,
					}}
				>
					<span style={{ opacity: selected ? 1 : 0.55 }}>{selected ? label(selected) : "เลือกวันที่"}</span>
					<span aria-hidden="true">📅</span>
				</button>
				{selected && !required && (
					<button type="button" onClick={() => onChange(null)} style={{ ...btn, padding: "6px 8px", opacity: 0.7 }} aria-label="ล้างวันที่">
						ล้าง
					</button>
				)}
			</div>

			{open && (
				<div
					role="dialog"
					aria-label={`เลือก${fieldLabel}`}
					style={{
						position: "absolute",
						top: "100%",
						left: 0,
						zIndex: 50,
						marginTop: 4,
						width: 300,
						padding: 12,
						border: "1px solid var(--color-kumo-line, #d4d4d8)",
						borderRadius: 12,
						background: "var(--color-kumo-base, #fff)",
						boxShadow: "0 10px 30px rgb(0 0 0 / 15%)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
						<button type="button" onClick={() => shift(-1)} style={{ ...btn, padding: "4px 8px" }} aria-label="เดือนก่อน">
							‹
						</button>
						<select
							value={view.m}
							onChange={(e) => setView({ ...view, m: Number(e.target.value) })}
							aria-label="เดือน"
							style={{ flex: 1, font: "inherit", padding: 4, borderRadius: 6 }}
						>
							{MONTHS.map((name, i) => (
								<option key={name} value={i}>
									{name}
								</option>
							))}
						</select>
						<select
							value={view.y}
							onChange={(e) => setView({ ...view, y: Number(e.target.value) })}
							aria-label="ปี พ.ศ."
							style={{ font: "inherit", padding: 4, borderRadius: 6 }}
						>
							{(years.includes(view.y) ? years : [...years, view.y].sort((a, b) => b - a)).map((y) => (
								<option key={y} value={y}>
									{y + 543}
								</option>
							))}
						</select>
						<button type="button" onClick={() => shift(1)} style={{ ...btn, padding: "4px 8px" }} aria-label="เดือนถัดไป">
							›
						</button>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
						{WEEKDAYS.map((w) => (
							<div key={w} style={{ fontSize: 12, opacity: 0.6, padding: "4px 0" }}>
								{w}
							</div>
						))}
						{cells.map((d, i) => {
							if (!d) return <div key={`b${i}`} />;
							const isSel = selected && selected.y === view.y && selected.m === view.m && selected.d === d;
							const isToday = today.y === view.y && today.m === view.m && today.d === d;
							return (
								<button
									key={d}
									type="button"
									onClick={() => pick(d)}
									aria-label={label({ y: view.y, m: view.m, d })}
									aria-pressed={!!isSel}
									style={{
										...btn,
										padding: "7px 0",
										borderRadius: 8,
										background: isSel ? "#0f6f87" : "transparent",
										color: isSel ? "#fff" : "inherit",
										fontWeight: isSel || isToday ? 700 : 400,
										outline: isToday && !isSel ? "1px solid #0f6f87" : undefined,
									}}
								>
									{d}
								</button>
							);
						})}
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
						<button type="button" onClick={() => { onChange(toValue(today)); setOpen(false); }} style={{ ...btn, color: "#0f6f87", fontWeight: 600 }}>
							วันนี้
						</button>
						<button type="button" onClick={() => setOpen(false)} style={{ ...btn, opacity: 0.7 }}>
							ปิด
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

/* ---------- "ประเภทกิจกรรม" dropdown (widget "thai-date:eventtype") ----------
 * Lists the entries of admin → "ประเภทกิจกรรม (สีในปฏิทิน)" with a colour dot each and stores the
 * chosen type's name. A type added there shows up here without any code change. */
type EventType = { title: string; color: string; order: number };
const HEX = /^#[0-9a-f]{6}$/i;

function EventTypeField({ value, onChange, label: fieldLabel, id }: Props) {
	const [types, setTypes] = useState<EventType[] | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let alive = true;
		fetch("/_emdash/api/content/event_types?limit=100", { headers: { "X-EmDash-Request": "1" }, credentials: "same-origin" })
			.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
			.then((j) => {
				if (!alive) return;
				const items = (j?.data?.items ?? []) as { status?: string; data?: { title?: string; color?: string; sort_order?: number | null } }[];
				setTypes(
					items
						.filter((i) => i.status !== "trashed" && i.data?.title)
						.map((i) => ({ title: String(i.data!.title), color: HEX.test(i.data?.color ?? "") ? i.data!.color! : "#2bb3d6", order: i.data?.sort_order ?? 999 }))
						.sort((a, b) => a.order - b.order),
				);
			})
			.catch(() => alive && setFailed(true));
		return () => {
			alive = false;
		};
	}, []);
	const current = typeof value === "string" ? value : "";
	const list = types ?? [];
	const known = list.some((t) => t.title === current);
	const color = list.find((t) => t.title === current)?.color;
	return (
		<div style={{ display: "grid", gap: 6 }}>
			<label htmlFor={id} style={{ fontWeight: 600, fontSize: 14 }}>
				{fieldLabel}
			</label>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 999, background: color ?? "transparent", border: "1px solid #c9d6dc", flexShrink: 0 }} />
				<select
					id={id}
					value={current}
					onChange={(e) => onChange(e.target.value || null)}
					style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: "1px solid #c9d6dc", minWidth: 240 }}
				>
					<option value="">— ไม่ระบุ —</option>
					{list.map((t) => (
						<option key={t.title} value={t.title}>
							{t.title}
						</option>
					))}
					{current && !known && <option value={current}>{current} (ไม่มีในเมนูประเภทกิจกรรม)</option>}
				</select>
			</div>
			<small style={{ opacity: 0.7 }}>
				{failed ? "โหลดรายการประเภทไม่ได้ ลองรีเฟรชหน้า" : "เพิ่ม/แก้ชื่อและสีได้ที่เมนู ประเภทกิจกรรม (สีในปฏิทิน)"}
			</small>
		</div>
	);
}

/* ---------- colour picker (widget "thai-date:color") ---------- */
function ColorField({ value, onChange, label: fieldLabel, id, required }: Props) {
	const current = typeof value === "string" ? value : "";
	const [text, setText] = useState(current);
	useEffect(() => setText(current), [current]);
	const valid = HEX.test(current);
	return (
		<div style={{ display: "grid", gap: 6 }}>
			<label htmlFor={id} style={{ fontWeight: 600, fontSize: 14 }}>
				{fieldLabel}
				{required && " *"}
			</label>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<input
					type="color"
					aria-label="เลือกสี"
					value={valid ? current : "#2bb3d6"}
					onChange={(e) => onChange(e.target.value)}
					style={{ width: 48, height: 36, padding: 0, border: "1px solid #c9d6dc", borderRadius: 8, background: "none", cursor: "pointer" }}
				/>
				<input
					id={id}
					type="text"
					value={text}
					placeholder="#1d7a46"
					onChange={(e) => {
						const v = e.target.value.trim();
						setText(v);
						if (HEX.test(v)) onChange(v.toLowerCase());
					}}
					style={{ font: "inherit", padding: "8px 10px", borderRadius: 8, border: `1px solid ${text && !HEX.test(text) ? "#d64545" : "#c9d6dc"}`, width: 130 }}
				/>
				<span style={{ padding: "4px 14px", borderRadius: 999, background: valid ? current : "#eee", color: "#fff", fontSize: 13, fontWeight: 600 }}>ตัวอย่างแถบสี</span>
			</div>
			{text && !HEX.test(text) && <small style={{ color: "#d64545" }}>รหัสสีต้องเป็นแบบ #RRGGBB เช่น #1d7a46</small>}
		</div>
	);
}

export const fields = {
	date: ThaiDateField,
	eventtype: EventTypeField,
	color: ColorField,
};
