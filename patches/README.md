# Database patches

Small SQL changes to the live database that a new version of the site needs (for example a new
order of terms). The container applies them on start, before the site runs:

- files run in name order (name them `YYYY-MM-DD-what.sql`, Thai year is fine: `2569-11-25-…`)
- each file runs **once**; applied names are stored in the table `_hr_patches`
- a file runs inside a transaction: if it fails, nothing from it is kept and the container stops
  with the error, so the old data is safe

Rules for writing a patch: change only the rows the new version needs (match by slug / id), never
delete or overwrite content people add in admin, and keep it safe to run on a database that
already has the change. Never edit a file that has been shipped; add a new one instead.

Without Docker: `node scripts/apply-patches.mjs` in the site folder (stop the site first).
