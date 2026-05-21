import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { parentPort, workerData } from "node:worker_threads";

type BackupKind = "incremental" | "full";

interface BackupWorkerData {
  kind: BackupKind;
  dbPath: string;
  targetPath: string;
  since?: string;
  previousManifestPath?: string;
}

interface BackupWorkerResult {
  status: "Successful" | "Skipped" | "Corrupted" | "Partial";
  fileSize: number;
  changedRows: number;
  details: string;
}

const ignoredTables = new Set([
  "sqlite_sequence",
  "backup_history",
  "system_logs"
]);

function ensureDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function gzipFile(sourcePath: string, targetPath: string) {
  ensureDirectory(targetPath);
  const compressed = zlib.gzipSync(fs.readFileSync(sourcePath), { level: 6 });
  fs.writeFileSync(targetPath, compressed);
}

function gzipJson(targetPath: string, value: unknown) {
  ensureDirectory(targetPath);
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(value)), { level: 6 });
  fs.writeFileSync(targetPath, compressed);
}

function validateFullBackup(targetPath: string) {
  const inflated = zlib.gunzipSync(fs.readFileSync(targetPath));
  const tempPath = `${targetPath}.validate.sqlite`;
  fs.writeFileSync(tempPath, inflated);
  const database = new Database(tempPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = database.prepare("PRAGMA integrity_check").pluck().get() as string;
    if (integrity !== "ok") return `Integrity check returned: ${integrity}`;
    const requiredTables = ["users", "inventory", "sales", "sale_items", "job_orders"];
    const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
    const missing = requiredTables.filter((table) => !tables.has(table));
    return missing.length ? `Missing tables: ${missing.join(", ")}` : "";
  } finally {
    database.close();
    fs.rmSync(tempPath, { force: true });
  }
}

function validateIncrementalBackup(targetPath: string) {
  const inflated = zlib.gunzipSync(fs.readFileSync(targetPath));
  const parsed = JSON.parse(inflated.toString("utf8")) as { kind?: string; tables?: unknown };
  if (parsed.kind !== "incremental" || !parsed.tables || typeof parsed.tables !== "object") return "Incremental backup manifest is invalid.";
  return "";
}

function previousHighWaterMarks(filePath?: string) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    const inflated = zlib.gunzipSync(fs.readFileSync(filePath));
    const parsed = JSON.parse(inflated.toString("utf8")) as { highWaterMarks?: Record<string, number> };
    return parsed.highWaterMarks ?? {};
  } catch {
    return {};
  }
}

async function createFullBackup(input: BackupWorkerData): Promise<BackupWorkerResult> {
  const tempPath = `${input.targetPath}.sqlite`;
  ensureDirectory(input.targetPath);
  const database = new Database(input.dbPath, { readonly: true, fileMustExist: true, timeout: 10000 });
  try {
    database.pragma("busy_timeout = 10000");
    await database.backup(tempPath);
  } finally {
    database.close();
  }

  gzipFile(tempPath, input.targetPath);
  fs.rmSync(tempPath, { force: true });
  const validationError = validateFullBackup(input.targetPath);
  const stats = fs.statSync(input.targetPath);
  return {
    status: validationError ? "Corrupted" : "Successful",
    fileSize: stats.size,
    changedRows: 0,
    details: validationError || "Full backup completed."
  };
}

function createIncrementalBackup(input: BackupWorkerData): BackupWorkerResult {
  const database = new Database(input.dbPath, { readonly: true, fileMustExist: true, timeout: 10000 });
  const tables: Record<string, unknown[]> = {};
  const highWaterMarks: Record<string, number> = {};
  const previousMarks = previousHighWaterMarks(input.previousManifestPath);
  let changedRows = 0;
  try {
    database.pragma("busy_timeout = 10000");
    const tableNames = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
      .map((row) => row.name)
      .filter((name) => !ignoredTables.has(name));

    for (const tableName of tableNames) {
      const columns = database.prepare(`PRAGMA table_info("${tableName.replace(/"/g, "\"\"")}")`).all() as Array<{ name: string }>;
      const hasUpdatedAt = columns.some((column) => column.name === "updated_at");
      const hasCreatedAt = columns.some((column) => column.name === "created_at");
      const hasId = columns.some((column) => column.name === "id");
      const orderBy = hasId ? " ORDER BY id" : "";
      const timestampColumn = hasUpdatedAt ? "updated_at" : hasCreatedAt ? "created_at" : "";
      const escapedTable = tableName.replace(/"/g, "\"\"");
      const rows = timestampColumn && input.since
        ? database.prepare(`SELECT * FROM "${escapedTable}" WHERE "${timestampColumn}" > ?${orderBy}`).all(input.since)
        : hasId && previousMarks[tableName]
          ? database.prepare(`SELECT * FROM "${escapedTable}" WHERE id > ?${orderBy}`).all(previousMarks[tableName])
        : database.prepare(`SELECT * FROM "${escapedTable}"${orderBy}`).all();
      if (hasId) highWaterMarks[tableName] = Number(database.prepare(`SELECT COALESCE(MAX(id), 0) FROM "${escapedTable}"`).pluck().get() || 0);
      if (rows.length) {
        tables[tableName] = rows;
        changedRows += rows.length;
      }
    }
  } finally {
    database.close();
  }

  if (changedRows === 0) {
    return {
      status: "Skipped",
      fileSize: 0,
      changedRows,
      details: "No changed records found since the previous incremental backup."
    };
  }

  gzipJson(input.targetPath, {
    kind: "incremental",
    createdAt: new Date().toISOString(),
    since: input.since || "",
    highWaterMarks,
    tables
  });
  const validationError = validateIncrementalBackup(input.targetPath);
  const stats = fs.statSync(input.targetPath);
  return {
    status: validationError ? "Corrupted" : "Successful",
    fileSize: stats.size,
    changedRows,
    details: validationError || `Incremental backup captured ${changedRows} changed record(s).`
  };
}

async function run() {
  const input = workerData as BackupWorkerData;
  const result = input.kind === "full" ? await createFullBackup(input) : createIncrementalBackup(input);
  parentPort?.postMessage(result);
}

run().catch((caught) => {
  parentPort?.postMessage({
    status: "Failed",
    fileSize: 0,
    changedRows: 0,
    details: caught instanceof Error ? caught.message : "Backup worker failed."
  });
});
