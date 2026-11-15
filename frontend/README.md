# ShieldRay frontend

React UI for ShieldRay, built with Next.js (static export), Tailwind CSS v4, HeroUI v3 and HeroUI Pro
with the ShieldRay design system (theme "mouve", see `../DESIGN.md`). Persian, right-to-left, light and dark.

It contains the Telegram Mini App (`/miniapp`, `/miniapp/s/<shop key>/`), the web panel (every staff page:
`/home`, `/users`, `/finance`, `/pg/...`, `/settings`, ...), the login page and the first-run setup wizard. The
FastAPI backend serves the exported pages through `spa_response(...)`, so authentication, redirects and the CSP
nonce stay on the server; there is no Node.js process in production. The server-rendered error page
(`app/web/templates/panel_status.html`) stays in Jinja so it works even without a build.

## Build and ship

```bash
cd frontend
npm ci                 # needs HEROUI_AUTH_TOKEN (HeroUI Pro licence) in the environment
npm run export         # next build + copy out/ to ../app/web/static/spa
```

`app/web/static/spa/` is committed: servers install and update with git and do not build the frontend.
Run `npm run export` and commit the result whenever `frontend/src` changes.

## Develop

1. Start the backend on port 8000 (the API the screens call).
2. `npm run dev` — Next.js on port 3000 proxies `/api/*` and `/media/*` to the backend
   (`SHIELDRAY_BACKEND_URL` overrides the target).
3. Open `http://127.0.0.1:3000/miniapp/#tgWebAppData=<signed initData>`; outside Telegram the app reads the
   signed launch data from the address, exactly as Telegram passes it.
4. Panel pages: sign in on the backend (port 8000) and open them there after `npm run export`, or on port 3000;
   requests marked `X-Panel-Fetch: 1` are proxied to the backend.

## Conventions

- HeroUI v3 compound components, `onPress`, design-system tokens only (no per-mode colours).
- Icons: `<Icon name="solar:..." />`; `npm run icons` bundles the names found in `src/` (no runtime fetch).
- Every Mini App request goes through `src/miniapp/core/api.ts` (signed with Telegram initData).
- Panel pages read `GET /api/panel/...` JSON (one endpoint module per area in `app/api/panel_*_api.py`, same
  permission and shop scope as the old page) and post the existing form handlers with `run(...)`; the
  `X-Panel-Fetch` header turns their redirects into `{ok, message, location}` (`app/api/panel_fetch.py`).
- Panel building blocks live in the shared kit: `src/panel/core` (`data.ts` loading and URL state,
  `actions.ts` posting with confirmation, `format.ts` Persian numbers and dates) and `src/panel/ui` (page
  header and sections, loading/error/empty states, tables, form fields, section tabs). Settings tabs shared by
  `/settings` and `/shop-settings` live in `src/panel/settings-ui`. Reuse them; a page package
  (`src/panel/pages/<area>`) holds only what is specific to its screens.
- Checks: `npm run typecheck`, `npm run lint`, `npm test`.
