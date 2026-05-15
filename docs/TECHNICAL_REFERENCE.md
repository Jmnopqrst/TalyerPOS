# Technical Reference

This document summarizes implementation and maintenance details.

## 1. Technology Stack

- Electron
- React
- TypeScript
- SQLite through `better-sqlite3`
- Vite
- Electron Builder

## 2. Runtime Architecture

```txt
Electron Main
-> SQLite, filesystem, print/PDF, backup, restore, IPC handlers

Preload Bridge
-> secure window.talyer API

React Renderer
-> UI modules, forms, tables, reports, global QR scanner listener
```

## 3. Database Location

Default:

```txt
app.getPath("userData")/talyer-pos.sqlite
```

Override:

```txt
TALYER_POS_DB_PATH=<absolute sqlite path>
```

Use the override when deploying multiple stores or when you want database files in a controlled support folder.

## 4. Database Initialization

The app automatically:

- creates missing tables
- applies migration columns
- creates indexes
- seeds default users and demo data when empty
- creates Super Admin account
- creates default settings

Migration logic currently lives mainly in:

```txt
src/main/database.ts
src/main/db/*
```

## 5. Important Modules

Renderer:

```txt
src/renderer/src/App.tsx
src/renderer/src/features/*
src/renderer/src/hooks/useGlobalQrAttendanceScanner.ts
src/renderer/src/lib/*
src/renderer/types/global.d.ts
```

Main:

```txt
src/main/main.ts
src/main/database.ts
src/main/db/*
src/main/ipcValidation.ts
```

Preload:

```txt
src/preload/preload.ts
```

Docs:

```txt
docs/
```

## 6. Build Commands

Development:

```bash
npm run dev
```

Type checking:

```bash
npm run typecheck
```

Tests:

```bash
npm test
```

Production build:

```bash
npm run build
```

Windows installer:

```bash
npm run dist
```

SQLite native rebuild:

```bash
npm run rebuild:sqlite
```

## 7. Global QR Attendance Scanner

The scanner is renderer-based and listens for fast keyboard input followed by Enter.

Supported:

- USB keyboard-wedge QR scanners
- Bluetooth keyboard-wedge QR scanners

Not supported:

- camera scanning
- browser scanning
- webcam QR detection

Business recording still goes through:

```txt
window.talyer.recordMechanicAttendance
```

This keeps the scanner modular for future input sources such as NFC or biometrics.

## 8. IPC Safety

IPC payloads are validated in:

```txt
src/main/ipcValidation.ts
```

When adding a new API:

1. Add database/business function.
2. Add IPC handler in `src/main/main.ts`.
3. Add validation schema.
4. Add preload method.
5. Add renderer type.
6. Add tests.

## 9. Testing Strategy

Current tests cover:

- sale stock deduction
- void/refund stock restoration
- job payment stock deduction
- payroll computation
- migration safety
- rollback behavior
- backup inspection
- audit coverage
- renderer logic utilities
- shared commission allocation

Recommended additional tests:

- global QR scanner timing logic
- attendance duplicate scan rejection
- payroll role permissions
- backup restore end-to-end package test

## 10. Troubleshooting

### App Opens With Empty Data

Check:

- correct Windows user profile
- `TALYER_POS_DB_PATH`
- database path exists
- restore correct backup if needed

### Cannot Save or Backup

Check:

- folder permissions
- antivirus blocking writes
- disk space
- backup folder availability

### QR Scanner Does Not Work

Check:

- scanner works in Notepad
- scanner sends Enter
- scanner output matches mechanic QR code
- user is logged in
- mechanic is active

### Build Fails on Native SQLite

Run:

```bash
npm run rebuild:sqlite
```

