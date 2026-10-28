import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { initializeModel } from "./model-schema";
import type { Actor } from "./model-types";
import { AppError } from "./errors";
let db: DatabaseSync;
export function database() {
  if (!db) {
    const dir =
      process.env.DEALER_DATA_DIR || path.join(process.cwd(), ".data");
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(path.join(dir, "dealer.sqlite"));
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL,fields TEXT NOT NULL,source TEXT NOT NULL,reviewed_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,action TEXT NOT NULL,record_id TEXT NOT NULL,created_at TEXT NOT NULL);`);
    initializeModel(db);
  }
  return db;
}
let depth = 0;
export function atomic<T>(fn: () => T): T {
  const conn = database();
  if (depth) return fn();
  conn.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}
export function audit(actor: Actor, action: string, recordId: string) {
  database()
    .prepare(
      "INSERT INTO audit_events(id,action,record_id,created_at,actor_user_id) VALUES(?,?,?,?,?)",
    )
    .run(
      crypto.randomUUID(),
      action,
      recordId,
      new Date().toISOString(),
      actor.id,
    );
}
export function opportunityAllowed(actor: Actor, id: string) {
  const row = database()
    .prepare("SELECT * FROM opportunities WHERE id=?")
    .get(id);
  return (
    !!row &&
    (actor.role === "INTERNAL_ADMIN" ||
      (row.dealer_account_id === actor.accountId &&
        row.sales_consultant_contact_id === actor.contactId))
  );
}
export function listContracts(actor: Actor) {
  const query =
    actor.role === "INTERNAL_ADMIN"
      ? "SELECT c.* FROM contracts c ORDER BY reviewed_at DESC"
      : "SELECT c.* FROM contracts c JOIN opportunities o ON o.id=c.opportunity_id WHERE o.dealer_account_id=? AND o.sales_consultant_contact_id=? ORDER BY reviewed_at DESC";
  return database()
    .prepare(query)
    .all(
      ...(actor.role === "INTERNAL_ADMIN"
        ? []
        : [actor.accountId!, actor.contactId!]),
    )
    .map((r) => ({
      id: String(r.id),
      opportunityId: String(r.opportunity_id),
      fields: JSON.parse(String(r.fields)),
      source: String(r.source),
      reviewedAt: String(r.reviewed_at),
    }));
}
export function createContract(
  input: { opportunityId: string; fields: unknown; source: string },
  actor: Actor,
) {
  if (!opportunityAllowed(actor, input.opportunityId))
    throw new AppError("Opportunity not found.", 404);
  return atomic(() => {
    const id = crypto.randomUUID();
    database()
      .prepare(
        "INSERT INTO contracts(id,opportunity_id,fields,source,reviewed_at) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        input.opportunityId,
        JSON.stringify(input.fields),
        input.source,
        new Date().toISOString(),
      );
    audit(actor, "contract.reviewed_and_saved", id);
    return id;
  });
}
