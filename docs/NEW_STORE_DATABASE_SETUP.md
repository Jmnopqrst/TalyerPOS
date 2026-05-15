# New Store Database Setup

This guide explains how to deploy TalyerPOS for multiple shops while keeping each shop database separate.

## 1. Database Model

TalyerPOS is local-first. Each shop database is a SQLite file.

Default path:

```txt
<Electron userData>/talyer-pos.sqlite
```

Custom path environment variable:

```txt
TALYER_POS_DB_PATH=<absolute path to sqlite file>
```

If `TALYER_POS_DB_PATH` is set, the app uses that database file instead of the default userData path.

## 2. Recommended Deployment Options

### Option A: One Shop, One Windows User

Use the default database path.

Best for:

- single workstation
- one shop
- simple deployment

Each Windows user profile has its own database.

### Option B: One Shop, Shared Store Folder

Set `TALYER_POS_DB_PATH` to a specific store folder.

Example:

```txt
C:\TalyerPOS\Stores\ShopA\talyer-pos.sqlite
```

Best for:

- controlled deployments
- easier backup location
- support technician access

### Option C: Multiple Shops on One Support Machine

Create one database path per shop:

```txt
C:\TalyerPOS\Stores\ShopA\talyer-pos.sqlite
C:\TalyerPOS\Stores\ShopB\talyer-pos.sqlite
C:\TalyerPOS\Stores\ShopC\talyer-pos.sqlite
```

Launch each shop instance with the correct `TALYER_POS_DB_PATH`.

Do not point multiple unrelated shops to the same database.

## 3. Creating a Fresh Database for a New Store

Steps:

1. Choose database folder.
2. Make sure the folder exists.
3. Set `TALYER_POS_DB_PATH` to a new `.sqlite` file path.
4. Launch TalyerPOS.
5. The app creates tables, migrations, seed data, and defaults automatically.
6. Complete store setup.
7. Create first backup.

Example PowerShell launch:

```powershell
$env:TALYER_POS_DB_PATH="C:\TalyerPOS\Stores\ShopA\talyer-pos.sqlite"
Start-Process "C:\Users\<User>\AppData\Local\Programs\TalyerPOS\TalyerPOS.exe"
```

For permanent store setup, configure this environment variable through:

- Windows user environment variables
- a shop-specific launcher script
- deployment tooling

## 4. Store Onboarding Checklist

For each new store:

- assign shop name and branch name
- set database path
- install application
- launch and initialize fresh database
- change default passwords
- set receipt/business identity
- add users
- add mechanics
- print mechanic QR IDs
- add services
- add inventory categories
- add suppliers
- add starting inventory
- configure payment methods
- configure backup folder
- create manual backup
- run test sale
- run test job order
- run test QR attendance scan
- verify receipt/PDF output

## 5. Backup Folder Per Store

Each shop should have its own backup folder.

Recommended:

```txt
D:\TalyerPOS Backups\ShopA
D:\TalyerPOS Backups\ShopB
```

or:

```txt
OneDrive\TalyerPOS Backups\ShopA
Google Drive\TalyerPOS Backups\ShopA
```

Avoid storing backups only on the same drive as the database.

## 6. Moving a Store Database

To move a database:

1. Close TalyerPOS.
2. Copy the `.sqlite` file and any related backup files.
3. Set `TALYER_POS_DB_PATH` to the new location.
4. Launch TalyerPOS.
5. Confirm records are present.
6. Create a new manual backup.

## 7. Restoring a Store Database

Use Super Admin restore preview before restore.

Rules:

- never restore a backup from another shop unless the owner requests it
- always create a restore point before applying restore
- verify business name and record counts after restore

## 8. Support Notes for Selling to Multiple Shops

For each customer, keep a support record:

- shop name
- owner contact
- installation date
- database path
- backup folder path
- app version
- license/trial status
- hardware used
- receipt printer model
- QR scanner model
- last support visit

