## Architecture

Vue 3 + Vite SPA (TypeScript, Options API). Pinia for state, MSAL B2C for auth. All source under `ShiftPay/src` (import alias `@/*`). Deployed to Netlify.

**Boot sequence** (`src/main.ts`): Pinia is created → `useAuthStore().init()` is awaited → app mounts. `App.vue` `mounted()` then calls `enableAutoPersist()` and `fetch()` on every store. Do not break this order.

**Data flow**: Stores are the single source of truth. Each store has a dual-path pattern — when `useAuthStore().isAuthenticated` is true (and no `syncPending` flag), it fetches from the API; otherwise it reads/writes localStorage. Both paths normalize data through model `parse()` methods.

## Commands (run from `ShiftPay/ShiftPay`)

- `npm run dev` — Vite dev server on port 8080
- `npm run build` — runs `vue-tsc --build --force` then `vite build` (type errors block build)
- `npm run type-check` — fast type-only check
- `npm run lint` / `npm run format` — ESLint fix + Prettier

## Key conventions

### API client (`src/api.ts`)

All HTTP goes through the `api` object. Never call `fetch()` directly. To add an endpoint:

```ts
// Add to the api object in src/api.ts
async newThing(id?: string) {
  return createRequest(`newResource/${id ?? ''}`, { method: 'GET' });
}
```

`createRequest` handles auth token injection, URL building (via `VITE_API_URL`), JSON parsing, write-operation tracking, and error normalization. The `ApiResource` union type must be extended when adding new resource paths.

### Store pattern (`src/stores/*`)

Every store follows the same structure — study `shiftsStore.ts` as the canonical example:

1. State includes a `status: Status` field managed by `withStatus()` (from `src/utils.ts`)
2. `fetch()` reads localStorage first, then overwrites from API if authenticated (respecting `syncPending`)
3. Write actions (`add`, `update`, `delete`) validate via model `parse()`, then branch on `isAuthenticated`
4. `enableAutoPersist()` uses `$subscribe({ detached: true })` to write to localStorage on every mutation

### Models (`src/models/`)

- `Shift.parse(data)` accepts multiple shapes: camelCase, `_underscored` private fields, and `from`/`to` aliases for time fields. Always parse incoming data.
- `Shift.toDTO()` returns `{ workplace, payRate, startTime: ISO string, endTime: ISO string, unpaidBreaks: ["H:M", ...] }`
- `Duration.toDTO()` returns `"H:M"` string; constructor accepts `{hours, minutes}`, `{_hours, _minutes}`, time range, or `"H:M"` string
- IDs: `crypto.randomUUID()` for local; server assigns IDs for authenticated flows

### Component style

Components use **Options API** (not `<script setup>`). `App.vue` uses `mapStores()` from Pinia. Dialog components expose `showModal()` called via `$refs`.

This project follows **mobile-first design**. Write CSS with base styles targeting small screens, then use `min-width` media queries to layer on tablet/desktop adjustments. Touch targets, readability, and vertical layouts should be the default.

### Icons

Avoid inline SVG for icons. Prefer in order:

1. **Native text** — Unicode symbols/emoji (e.g. `✕`, `⚙`, `▶`) when a suitable character exists
2. **Icons8** — use `<img>` tags referencing Icons8 URLs (e.g. `https://img.icons8.com/...`)
3. **SVG** — only as a last resort when neither option above works

## localStorage keys (protected)

| Key              | Store               | Notes                                                |
| ---------------- | ------------------- | ---------------------------------------------------- |
| `shifts`         | shiftsStore         | Also reads legacy `entries` key (then deletes it)    |
| `shiftTemplates` | shiftTemplatesStore |                                                      |
| `workInfos`      | workInfosStore      | Also reads legacy `prevWorkInfos` key                |
| `startTime`      | shiftSessionStore   | Also cleans legacy `checkInTime` key                 |
| `syncPending`    | App.vue             | `"true"` while user defers sync decision after login |

**Never rename or remove these keys without a migration path** — they hold user data.

## Environment & integration

- `VITE_API_URL` — API base URL, set in `.env.local` or Netlify env vars. Never hard-code.
- `VITE_ALLOWED_HOSTS` — comma-separated allowed dev server hosts (used in `vite.config.ts`)
- Auth B2C config (clientId, authority) is in `src/stores/authStore.ts`. Changes require matching Azure B2C and Netlify config updates.
- Build target: ES2022 (configured in both `vite.config.ts` and `tsconfig.app.json`)

## Safety rules

- Maintain the offline/local fallback in every store — unauthenticated users must always work via localStorage
- Wrap store action bodies in `withStatus(this, async () => { ... })` to manage Loading/Error/Ready lifecycle
- Validate inputs through model `parse()` before persisting or sending to API
- Use `@/*` import alias for all new imports (configured in `tsconfig.app.json` and `vite.config.ts`)
- Error handling: `console.error` + throw human-readable `Error` messages — no silent swallowing

## Debugging starting points

- Network / auth: `src/api.ts` → `src/stores/authStore.ts`
- Shift data flow: `src/stores/shiftsStore.ts` → `src/models/Shift.ts`
- App bootstrap: `src/main.ts` → `src/App.vue` (mounted lifecycle)
- Types & utility: `src/types.ts` (Status, WorkInfo, ShiftTemplate) → `src/utils.ts` (withStatus, currencyFormat)
