/** Editing the site menus (_emdash_menus / _emdash_menu_items). */
import { all, get, nowIso, run, touch, tx, ulid } from "../cms/db";

export interface MenuItemInput {
	id?: string;
	label: string;
	type: "custom" | "page";
	url?: string;
	pageId?: string;
	newTab?: boolean;
	children?: MenuItemInput[];
}

export const listMenus = () => all<{ id: string; name: string; label: string }>(`SELECT id, name, label FROM _emdash_menus ORDER BY name`);

export function loadMenuItems(menuId: string): MenuItemInput[] {
	const rows = all<{ id: string; parent_id: string | null; type: string; reference_collection: string | null; reference_id: string | null; custom_url: string | null; label: string; target: string | null }>(
		`SELECT id, parent_id, type, reference_collection, reference_id, custom_url, label, target FROM _emdash_menu_items WHERE menu_id = ? ORDER BY sort_order, created_at`,
		menuId,
	);
	const toItem = (r: (typeof rows)[number]): MenuItemInput => ({
		id: r.id,
		label: r.label,
		type: r.type === "page" || (r.reference_collection === "pages" && r.reference_id) ? "page" : "custom",
		url: r.custom_url ?? "",
		pageId: r.reference_id ?? undefined,
		newTab: r.target === "_blank",
		children: [],
	});
	const byId = new Map(rows.map((r) => [r.id, toItem(r)]));
	const roots: MenuItemInput[] = [];
	for (const r of rows) {
		const item = byId.get(r.id)!;
		const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
		if (parent) parent.children!.push(item);
		else roots.push(item);
	}
	return roots;
}

/** Replace a menu's items with the edited tree (existing ids are kept). */
export function saveMenuItems(menuId: string, items: MenuItemInput[]) {
	tx(() => {
		const keep = new Set<string>();
		const write = (item: MenuItemInput, parentId: string | null, order: number) => {
			const label = String(item.label ?? "").trim();
			if (!label) throw new Error("เมนูทุกรายการต้องมีชื่อ");
			const exists = item.id && get(`SELECT 1 FROM _emdash_menu_items WHERE id = ? AND menu_id = ?`, item.id, menuId);
			const id = exists ? item.id! : ulid();
			keep.add(id);
			const isPage = item.type === "page" && item.pageId;
			const values = [
				parentId,
				order,
				isPage ? "page" : "custom",
				isPage ? "pages" : null,
				isPage ? item.pageId : null,
				isPage ? null : String(item.url ?? "").trim() || "#",
				label,
				item.newTab ? "_blank" : null,
			];
			if (exists)
				run(
					`UPDATE _emdash_menu_items SET parent_id = ?, sort_order = ?, type = ?, reference_collection = ?, reference_id = ?, custom_url = ?, label = ?, target = ? WHERE id = ?`,
					...values,
					id,
				);
			else
				run(
					`INSERT INTO _emdash_menu_items (parent_id, sort_order, type, reference_collection, reference_id, custom_url, label, target, id, menu_id, created_at, locale, translation_group)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en', ?)`,
					...values,
					id,
					menuId,
					nowIso(),
					id,
				);
			(item.children ?? []).forEach((c, i) => write(c, id, i));
		};
		items.forEach((it, i) => write(it, null, i));
		for (const r of all<{ id: string }>(`SELECT id FROM _emdash_menu_items WHERE menu_id = ?`, menuId)) {
			if (!keep.has(r.id)) run(`DELETE FROM _emdash_menu_items WHERE id = ?`, r.id);
		}
	});
	touch();
}
