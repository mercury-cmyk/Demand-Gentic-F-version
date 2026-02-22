import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";

import dotenv from "dotenv";
import pgPkg from "pg";
import pgCopyStreams from "pg-copy-streams";

type EnvMap = Record<string, string>;

type TableDependency = {
  child: string;
  parent: string;
};

type ParseArgs = {
  sourceUrl?: string;
  targetUrl?: string;
  yes: boolean;
};

const { Pool } = pgPkg;
const { from: copyFrom, to: copyTo } = pgCopyStreams as {
  from: (sql: string) => any;
  to: (sql: string) => any;
};

function qi(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function qt(schema: string, table: string): string {
  return `${qi(schema)}.${qi(table)}`;
}

function parseArgs(argv: string[]): ParseArgs {
  const parsed: ParseArgs = { yes: false };
  for (const arg of argv) {
    if (arg === "--yes") {
      parsed.yes = true;
      continue;
    }
    if (arg.startsWith("--source=")) {
      parsed.sourceUrl = arg.slice("--source=".length);
      continue;
    }
    if (arg.startsWith("--target=")) {
      parsed.targetUrl = arg.slice("--target=".length);
    }
  }
  return parsed;
}

function loadEnvFiles(): EnvMap {
  const files = [
    ".env",
    ".env.development",
    ".env.local",
    ".env.development.local",
  ];

  const env: EnvMap = {};
  for (const file of files) {
    const absolute = path.resolve(process.cwd(), file);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    const parsed = dotenv.parse(fs.readFileSync(absolute));
    Object.assign(env, parsed);
  }
  return env;
}

function parseHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return "unknown-host";
  }
}

async function getTables(client: InstanceType<typeof Pool>): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
  );
  return result.rows.map((row) => row.table_name);
}

async function getDependencies(client: InstanceType<typeof Pool>): Promise<TableDependency[]> {
  const result = await client.query<TableDependency>(
    `
      SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE c.contype = 'f'
        AND child_ns.nspname = 'public'
        AND parent_ns.nspname = 'public'
    `,
  );
  return result.rows;
}

function topoSortTables(tables: string[], deps: TableDependency[]): string[] {
  const tableSet = new Set(tables);
  const graph = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const table of tables) {
    graph.set(table, new Set());
    indegree.set(table, 0);
  }

  for (const dep of deps) {
    if (!tableSet.has(dep.parent) || !tableSet.has(dep.child) || dep.parent === dep.child) {
      continue;
    }

    const children = graph.get(dep.parent)!;
    if (!children.has(dep.child)) {
      children.add(dep.child);
      indegree.set(dep.child, (indegree.get(dep.child) ?? 0) + 1);
    }
  }

  const queue = [...tables].filter((table) => (indegree.get(table) ?? 0) === 0).sort();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const table = queue.shift()!;
    ordered.push(table);

    const children = [...(graph.get(table) ?? [])].sort();
    for (const child of children) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  if (ordered.length !== tables.length) {
    const unresolved = tables.filter((table) => !ordered.includes(table));
    throw new Error(
      `Foreign key cycle detected across tables: ${unresolved.join(", ")}. ` +
        "Use pg_dump/pg_restore for cyclic schemas.",
    );
  }

  return ordered;
}

async function getColumns(client: pgPkg.PoolClient, table: string): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function getCount(client: pgPkg.PoolClient, table: string): Promise<bigint> {
  const result = await client.query<{ c: string }>(`SELECT COUNT(*)::bigint AS c FROM ${qt("public", table)}`);
  return BigInt(result.rows[0].c);
}

async function resetSequences(targetClient: pgPkg.PoolClient): Promise<void> {
  const serialCols = await targetClient.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_default LIKE 'nextval(%'
      ORDER BY table_name, column_name
    `,
  );

  for (const row of serialCols.rows) {
    const seqRes = await targetClient.query<{ seq: string | null }>(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [`public.${row.table_name}`, row.column_name],
    );
    const seq = seqRes.rows[0]?.seq;
    if (!seq) {
      continue;
    }

    const maxRes = await targetClient.query<{ max: string }>(
      `SELECT COALESCE(MAX(${qi(row.column_name)}), 0)::bigint AS max FROM ${qt("public", row.table_name)}`,
    );
    const max = BigInt(maxRes.rows[0].max);
    if (max > 0n) {
      await targetClient.query(`SELECT setval($1, $2, true)`, [seq, max.toString()]);
    } else {
      await targetClient.query(`SELECT setval($1, 1, false)`, [seq]);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fileEnv = loadEnvFiles();

  const sourceUrl =
    args.sourceUrl ||
    fileEnv.SOURCE_DATABASE_URL ||
    fileEnv.DATABASE_URL ||
    fileEnv.DATABASE_URL_PROD ||
    process.env.SOURCE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PROD;

  const targetUrl =
    args.targetUrl ||
    fileEnv.DATABASE_URL_DEV ||
    process.env.DATABASE_URL_DEV;

  const confirmed =
    args.yes ||
    fileEnv.CONFIRM_DEV_DB_RESET === "true" ||
    process.env.CONFIRM_DEV_DB_RESET === "true";

  if (!sourceUrl) {
    throw new Error("Missing source URL. Set DATABASE_URL or SOURCE_DATABASE_URL.");
  }
  if (!targetUrl) {
    throw new Error("Missing target URL. Set DATABASE_URL_DEV or pass --target=...");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Source and target URLs are identical. Refusing to continue.");
  }
  if (!confirmed) {
    throw new Error(
      "This command truncates the dev database. Re-run with --yes or set CONFIRM_DEV_DB_RESET=true.",
    );
  }

  console.log(`[Clone] Source host: ${parseHost(sourceUrl)}`);
  console.log(`[Clone] Target host: ${parseHost(targetUrl)}`);
  console.log("[Clone] Starting guarded clone (prod -> dev)...");

  const sourcePool = new Pool({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  const targetPool = new Pool({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  const sourceClient = await sourcePool.connect();
  const targetClient = await targetPool.connect();

  try {
    const sourceTables = await getTables(sourcePool);
    const targetTables = await getTables(targetPool);

    if (sourceTables.length === 0) {
      throw new Error("Source database has no public tables.");
    }

    const targetSet = new Set(targetTables);
    const missingTables = sourceTables.filter((table) => !targetSet.has(table));
    if (missingTables.length > 0) {
      throw new Error(
        `Target is missing ${missingTables.length} source tables: ${missingTables.join(", ")}. ` +
          "Initialize schema first (e.g. DATABASE_URL=<dev> npm run db:push).",
      );
    }

    const dependencies = await getDependencies(sourcePool);
    const orderedTables = topoSortTables(sourceTables, dependencies);

    console.log(`[Clone] Tables to copy: ${orderedTables.length}`);

    await sourceClient.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await targetClient.query("BEGIN");
    await targetClient.query("SET LOCAL statement_timeout = 0");
    await targetClient.query("SET LOCAL lock_timeout = 0");

    const truncateSql = `TRUNCATE TABLE ${orderedTables
      .map((table) => qt("public", table))
      .join(", ")} RESTART IDENTITY CASCADE`;
    await targetClient.query(truncateSql);
    console.log("[Clone] Target truncated.");

    const mismatchTables: string[] = [];
    const rowTotals = { copied: 0n };

    for (const table of orderedTables) {
      const sourceCols = await getColumns(sourceClient, table);
      const targetCols = await getColumns(targetClient, table);

      if (sourceCols.join("|") !== targetCols.join("|")) {
        throw new Error(`Column mismatch for table ${table}. Refusing to copy inconsistent schema.`);
      }

      const sourceCount = await getCount(sourceClient, table);
      if (sourceCount === 0n) {
        continue;
      }

      const colList = sourceCols.map(qi).join(", ");
      const copyOutSql = `COPY (SELECT ${colList} FROM ${qt("public", table)}) TO STDOUT WITH (FORMAT csv, NULL '\\N')`;
      const copyInSql = `COPY ${qt("public", table)} (${colList}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;

      const readStream = sourceClient.query(copyTo(copyOutSql));
      const writeStream = targetClient.query(copyFrom(copyInSql));
      await pipeline(readStream, writeStream);

      const targetCount = await getCount(targetClient, table);
      if (targetCount !== sourceCount) {
        mismatchTables.push(`${table} (${sourceCount.toString()} != ${targetCount.toString()})`);
      }

      rowTotals.copied += targetCount;
      console.log(`[Clone] Copied ${table}: ${targetCount.toString()} rows`);
    }

    await resetSequences(targetClient);

    if (mismatchTables.length > 0) {
      throw new Error(`Row count mismatch after copy: ${mismatchTables.join("; ")}`);
    }

    await targetClient.query("COMMIT");
    await sourceClient.query("COMMIT");
    console.log(`[Clone] Completed successfully. Total rows copied: ${rowTotals.copied.toString()}`);
  } catch (error) {
    await targetClient.query("ROLLBACK").catch(() => undefined);
    await sourceClient.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    sourceClient.release();
    targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((error) => {
  console.error("[Clone] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
