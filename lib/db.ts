import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
let db: DatabaseSync;
export function database() {
  if (!db) {
    const dir=process.env.DEALER_DATA_DIR || path.join(process.cwd(),'.data');
    mkdirSync(dir,{recursive:true});
    db=new DatabaseSync(path.join(dir,'dealer.sqlite'));
    db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY, opportunity_id TEXT NOT NULL, fields TEXT NOT NULL,
      source TEXT NOT NULL, reviewed_at TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, action TEXT NOT NULL, record_id TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
  }
  return db;
}
export function listContracts() {
  return database().prepare('SELECT * FROM contracts ORDER BY reviewed_at DESC').all().map(r=>({id:r.id,opportunityId:r.opportunity_id,fields:JSON.parse(String(r.fields)),source:r.source,reviewedAt:r.reviewed_at}));
}
export function createContract(input:{opportunityId:string;fields:unknown;source:string}) {
  const id=crypto.randomUUID(),now=new Date().toISOString(),conn=database();
  conn.exec('BEGIN IMMEDIATE');
  try {
    conn.prepare('INSERT INTO contracts VALUES (?, ?, ?, ?, ?)').run(id,input.opportunityId,JSON.stringify(input.fields),input.source,now);
    conn.prepare('INSERT INTO audit_events VALUES (?, ?, ?, ?)').run(crypto.randomUUID(),'contract.reviewed_and_saved',id,now);
    conn.exec('COMMIT');
    return id;
  } catch(e) {conn.exec('ROLLBACK'); throw e;}
}
