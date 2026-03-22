import { db, pool } from "../server/db";
import { accounts, contacts } from "@shared/schema";
import {
  indexAccounts,
  indexContacts,
  indexCallTranscripts,
} from "../server/services/vertex-ai/vertex-vector-search";

const parseEnvInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const BATCH_SIZE = parseEnvInt(process.env.VECTOR_BACKFILL_BATCH_SIZE, 500);
const CALL_BATCH_SIZE = parseEnvInt(process.env.VECTOR_CALL_BACKFILL_BATCH_SIZE, 100);

async function backfillAccounts() {
  let offset = 0;
  let total = 0;

  while (true) {
    const rows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) {
      break;
    }

    const ids = rows.map((row) => row.id);
    const indexed = await indexAccounts(ids);
    total += indexed;
    offset += rows.length;

    console.log(`[Vector Backfill] Accounts indexed: ${total}`);
  }
}

async function backfillContacts() {
  let offset = 0;
  let total = 0;

  while (true) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) {
      break;
    }

    const ids = rows.map((row) => row.id);
    const indexed = await indexContacts(ids);
    total += indexed;
    offset += rows.length;

    console.log(`[Vector Backfill] Contacts indexed: ${total}`);
  }
}

async function backfillCalls() {
  let offset = 0;
  let total = 0;

  while (true) {
    const indexed = await indexCallTranscripts(CALL_BATCH_SIZE, offset);
    if (indexed === 0) {
      break;
    }

    total += indexed;
    offset += CALL_BATCH_SIZE;

    console.log(`[Vector Backfill] Calls indexed: ${total}`);
    if (indexed  {
    console.error("[Vector Backfill] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });