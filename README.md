# TalyerPOS Documentation

TalyerPOS is a local-first desktop system for motorcycle and auto repair shop operations. It includes POS, job orders, inventory, payroll, reporting, users, settings, audit logs, backup tools, and Super Admin controls.

Start here:

- [Documentation Index](docs/INDEX.md)
- [User Guide](docs/USER_GUIDE.md)
- [Installation and Fresh Start Guide](docs/INSTALLATION_AND_FRESH_START.md)
- [New Store Database Setup](docs/NEW_STORE_DATABASE_SETUP.md)
- [Admin Operations Guide](docs/ADMIN_OPERATIONS.md)
- [Seller Deployment Checklist](docs/SELLER_DEPLOYMENT_CHECKLIST.md)
- [Technical Reference](docs/TECHNICAL_REFERENCE.md)

## Development Commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run dist
```

## Default Database

By default, each Windows user profile gets a separate local SQLite database:

```txt
<Electron userData>/talyer-pos.sqlite
```

For controlled multi-store deployments, set:

```txt
TALYER_POS_DB_PATH=<absolute path to store database>
```

See [New Store Database Setup](docs/NEW_STORE_DATABASE_SETUP.md) for the recommended deployment model.

