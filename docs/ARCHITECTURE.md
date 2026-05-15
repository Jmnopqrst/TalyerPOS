# TalyerPOS Architecture

TalyerPOS is a local-first Electron desktop application. It uses an Electron main process for SQLite, filesystem, printing, backups, and native dialogs, and a React renderer for the user interface.

## Runtime Layers

### Electron Main

Location: `src/main`

Responsibilities:

- SQLite database migrations and CRUD operations
- receipt printing and PDF export
- backup, restore, reset, and automatic backup scheduling
- IPC handlers exposed to the renderer through preload

Important files:

- `src/main/main.ts`: Electron app lifecycle, IPC handlers, printing, automatic backups
- `src/main/database.ts`: SQLite schema, migrations, seed data, business operations

### Preload Bridge

Location: `src/preload/preload.ts`

Responsibilities:

- exposes safe `window.talyer` methods to the renderer
- keeps the renderer isolated from direct Node/Electron access

When adding a backend operation, update:

1. `src/main/main.ts`
2. `src/preload/preload.ts`
3. `src/renderer/types/global.d.ts`
4. the relevant renderer feature

### React Renderer

Location: `src/renderer`

Responsibilities:

- app shell and role-aware navigation
- POS, job orders, inventory, payroll, reports, settings, and Super Admin UI
- local form state and validation
- toast messages, modals, pagination, and empty states
- global keyboard-wedge QR attendance listener

Important files:

- `src/renderer/src/App.tsx`: app shell plus feature modules
- `src/renderer/src/lib`: shared formatting, date, API, and normalization helpers
- `src/renderer/src/hooks`: shared React hooks
- `src/renderer/components`: reusable UI components
- `src/renderer/data/permissions.ts`: role/module access rules
- `src/renderer/types/global.d.ts`: renderer and preload API types

## Current Refactor State

`App.tsx` now mostly owns the app shell, login, navigation, routing, global search, global QR attendance listener wiring, and shared session state. Feature UIs live under `src/renderer/src/features`.

Shared non-UI helpers live in:

- `src/renderer/src/lib/api.ts`
- `src/renderer/src/lib/appData.ts`
- `src/renderer/src/lib/date.ts`
- `src/renderer/src/lib/format.ts`
- `src/renderer/src/hooks/useFilteredPagination.ts`

Feature modules live in:

- `src/renderer/src/features/audit/Audit.tsx`
- `src/renderer/src/features/dashboard/Dashboard.tsx`
- `src/renderer/src/features/inventory/Inventory.tsx`
- `src/renderer/src/features/jobs/Jobs.tsx`
- `src/renderer/src/features/payroll/Payroll.tsx`
- `src/renderer/src/features/pos/Pos.tsx`
- `src/renderer/src/features/reports/Reports.tsx`
- `src/renderer/src/features/services/Services.tsx`
- `src/renderer/src/features/settings/SettingsModule.tsx`
- `src/renderer/src/features/staff/Staff.tsx`
- `src/renderer/src/features/super-admin/SuperAdminConsole.tsx`
- `src/renderer/src/features/suppliers/Suppliers.tsx`
- `src/renderer/src/features/users/UsersModule.tsx`

Shared UI pieces now live in:

- `src/renderer/components/Brand.tsx`
- `src/renderer/components/PaginationControls.tsx`
- `src/renderer/components/Toast.tsx`

## Recommended Next Refactor

Continue moving implementation details out of the large backend `src/main/database.ts` into real domain modules under `src/main/db`. Keep `database.ts` as the migration/compatibility boundary until each module has dedicated tests.

## Data Safety Notes

The app is local-first, so backup and restore are critical. Always verify these after schema changes:

- manual backup
- automatic backup
- restore backup
- clear database with backup
- database migration on an existing database

## Verification Commands

```bash
npm run typecheck
npm run build
```
