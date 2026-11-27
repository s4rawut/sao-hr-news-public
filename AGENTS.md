# HR SAO website — notes for developers / AI agents

Astro (server-rendered, Node adapter) + SQLite. The admin is part of this project — **EmDash is no
longer used** (removed in 2569-11-27-3). The database still has EmDash's table layout
(`ec_<collection>`, `_emdash_collections`, `_emdash_fields`, `taxonomies`, `content_taxonomies`,
`_emdash_menu_items`, `media`, `users`, `credentials` …) so live data needed no migration.

## Commands

```bash
npm run dev       # http://localhost:4321  (admin: /admin)
npm run build     # production build → dist/
node scripts/admin-set-password.mjs <username>            # set an admin password (hash in users.password_hash)
node scripts/apply-patches.mjs                            # database patches in patches/
```

## Where things are

| Path | What |
| --- | --- |
| `src/lib/cms/` | reading content: `getEmDashCollection`, `getEmDashEntry`, taxonomies, menus, settings, media serving, Portable Text → HTML. Names kept from EmDash so pages did not change. |
| `src/lib/admin/` | admin logic: username + password sign-in (scrypt hashes, lockout, signed session cookie — all state in the DB), saving entries, media uploads, menus |
| `src/pages/admin/` | admin pages (list / edit any collection, media, menus, categories, users, settings) |
| `src/admin/` | admin layout, CSS, field widgets (`FieldInput.astro`, `fields-client.ts`) |
| `src/lib/cms/home-layout.ts` | homepage arrangement (order / shown / width) in options `hr:home_layout`, edited at /admin/home |
| `src/middleware.ts` | serves uploads at `/_emdash/api/media/file/<key>`, guards `/admin` |
| `patches/` | SQL patches applied once on container start (see patches/README.md) |

## Rules

- Collections and fields are defined in `_emdash_collections` / `_emdash_fields`; the admin builds its
  forms from them. Add a field = a patch that adds the column to `ec_<collection>` and a row in
  `_emdash_fields`.
- Saving an entry without changes must not change stored values (tested); keep that when editing
  `src/lib/admin/content.ts`.
- Dates from the date widget are stored as the calendar day at 00:00 UTC (`2026-11-15T00:00:00.000Z`).
- IT runs live data: ship code as a patch image, database changes as `patches/*.sql`, never a new data.db.
