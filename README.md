# EmDash Starter Template

A general-purpose starting point for building sites with [EmDash](https://github.com/emdash-cms/emdash). Runs on any Node.js server with SQLite and local file storage. Includes posts, pages, categories, and tags with minimal styling -- designed as a base you can build on rather than a finished theme.

## What's Included

- Posts with category and tag archives
- Static pages via slug routing
- Seed data with demo content
- Minimal layout and styling

## Pages

| Page | Route |
|---|---|
| Homepage | `/` |
| All posts | `/posts` |
| Single post | `/posts/:slug` |
| Category archive | `/category/:slug` |
| Tag archive | `/tag/:slug` |
| Static pages | `/:slug` |
| 404 | fallback |

## Infrastructure

- **Runtime:** Node.js
- **Database:** SQLite (local file)
- **Storage:** Local filesystem
- **Framework:** Astro with `@astrojs/node`

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:4321/_emdash/admin and complete the setup wizard. EmDash runs database migrations and applies the starter seed during setup. The site is available at http://localhost:4321.

## See Also

- [All templates](../)
- [EmDash documentation](https://docs.emdashcms.com/)
