# 2026 Travel Handbook — Cloudflare Workers Static Assets

The website itself is a single self-contained HTML file at `public/index.html`.
It has no runtime framework, package manager, external stylesheet, external font, or external JavaScript dependency.

## Cloudflare Workers Builds

- Build command: leave blank
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Worker name: `travel-handbook-2026`

Cloudflare Workers Git integration will deploy on every push to the production branch.
