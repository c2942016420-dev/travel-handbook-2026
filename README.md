# 2026 Travel Handbook — Cloudflare Workers Static Assets

The deployed website is a single self-contained HTML file at `public/index.html`.
It has no runtime framework, package manager, external stylesheet, external font, or external JavaScript dependency.

The repository stores the compressed HTML in `.source/` only to make connector-safe uploads deterministic. `build.sh` reconstructs `public/index.html` and verifies its SHA-256 before deployment.

## Cloudflare Workers Builds

- Build command: `bash build.sh`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Worker name: `travel-handbook-2026`

After the one-time GitHub integration is connected in Cloudflare Workers, every push to `main` can rebuild and deploy automatically.
