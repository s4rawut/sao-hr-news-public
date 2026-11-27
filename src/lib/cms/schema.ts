/**
 * Collection and field definitions, read from _emdash_collections / _emdash_fields. The admin
 * builds its lists and forms from these, so every collection is editable without custom code.
 */
import { all, dataVersion } from "./db";

export type FieldType =
	| "string"
	| "text"
	| "number"
	| "integer"
	| "boolean"
	| "datetime"
	| "image"
	| "file"
	| "select"
	| "url"
	| "portableText"
	| "repeater"
	| "reference"
	| "json";

export interface SubField {
	slug: string;
	label: string;
	type: FieldType;
	required?: boolean;
	options?: string[];
}

export interface FieldDef {
	id: string;
	slug: string;
	label: string;
	type: FieldType;
	required: boolean;
	widget: string | null;
	sortOrder: number;
	/** select: choices; reference: targetCollection/relation; repeater: subFields; file: allowedMimeTypes */
	validation: {
		options?: string[];
		targetCollection?: string;
		relation?: string;
		relationSide?: string;
		subFields?: SubField[];
		allowedMimeTypes?: string[];
		[k: string]: unknown;
	};
	options: Record<string, unknown>;
	defaultValue: unknown;
}

export interface CollectionDef {
	id: string;
	slug: string;
	label: string;
	labelSingular: string;
	description: string | null;
	icon: string | null;
	supports: string[];
	urlPattern: string | null;
	sortOrder: number | null;
	navGroup: string | null;
	hidden: boolean;
	fields: FieldDef[];
	/** set of boolean field slugs, for mapping 0/1 to true/false */
	booleanFields: Set<string>;
}

const parse = <T>(v: unknown, fallback: T): T => {
	if (typeof v !== "string" || !v) return fallback;
	try {
		return JSON.parse(v) as T;
	} catch {
		return fallback;
	}
};

let cache: { version: number; byslug: Map<string, CollectionDef> } | undefined;

function load(): Map<string, CollectionDef> {
	const cols = all<Record<string, unknown>>(
		`SELECT * FROM _emdash_collections ORDER BY coalesce(sort_order, 9999), label`,
	);
	const fields = all<Record<string, unknown>>(`SELECT * FROM _emdash_fields ORDER BY sort_order, created_at`);
	const map = new Map<string, CollectionDef>();
	for (const c of cols) {
		const own = fields
			.filter((f) => f.collection_id === c.id)
			.map(
				(f): FieldDef => ({
					id: String(f.id),
					slug: String(f.slug),
					label: String(f.label),
					type: String(f.type) as FieldType,
					required: !!f.required,
					widget: (f.widget as string) || null,
					sortOrder: Number(f.sort_order ?? 0),
					validation: parse(f.validation, {}),
					options: parse(f.options, {}),
					defaultValue: parse(f.default_value, f.default_value ?? null),
				}),
			);
		map.set(String(c.slug), {
			id: String(c.id),
			slug: String(c.slug),
			label: String(c.label),
			labelSingular: String(c.label_singular || c.label),
			description: (c.description as string) || null,
			icon: (c.icon as string) || null,
			supports: parse<string[]>(c.supports, []),
			urlPattern: (c.url_pattern as string) || null,
			sortOrder: (c.sort_order as number) ?? null,
			navGroup: (c.nav_group as string) || null,
			hidden: !!c.hidden,
			fields: own,
			booleanFields: new Set(own.filter((f) => f.type === "boolean").map((f) => f.slug)),
		});
	}
	return map;
}

function collections(): Map<string, CollectionDef> {
	if (!cache || cache.version !== dataVersion()) cache = { version: dataVersion(), byslug: load() };
	return cache.byslug;
}

export const getCollectionDef = (slug: string) => collections().get(slug);
export const listCollectionDefs = () => [...collections().values()];
