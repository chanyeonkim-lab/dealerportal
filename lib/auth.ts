import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { database, audit } from "./db";
import { AppError } from "./errors";
import type { Actor } from "./model-types";
export const SESSION_COOKIE = "dealer_session";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function actorById(id: string): Actor {
  const row = database()
    .prepare(
      `SELECT u.*,a.name AS account_name,a.market_code FROM app_users u LEFT JOIN accounts a ON a.id=u.dealer_account_id WHERE u.id=? AND u.status='ACTIVE'`,
    )
    .get(id);
  if (!row) throw new AppError("Sign in to continue.", 401);
  if (
    row.role === "DEALER_SALES" &&
    !database()
      .prepare(
        `SELECT r.id FROM account_contact_relations r JOIN contacts c ON c.id=r.contact_id JOIN accounts a ON a.id=r.account_id WHERE r.contact_id=? AND r.account_id=? AND r.relationship_role='EMPLOYEE' AND r.job_role='SALES_CONSULTANT' AND r.is_active=1 AND c.status='ACTIVE' AND a.status='ACTIVE'`,
      )
      .get(row.contact_id, row.dealer_account_id)
  )
    throw new AppError("This dealer membership is inactive.", 403);
  return {
    id: String(row.id),
    name: String(row.display_name),
    email: String(row.email),
    role: row.role as Actor["role"],
    contactId: row.contact_id ? String(row.contact_id) : null,
    accountId: row.dealer_account_id ? String(row.dealer_account_id) : null,
    accountName: row.account_name ? String(row.account_name) : null,
    market: row.market_code ? String(row.market_code) : "AU",
  };
}
export function tokenFromRequest(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(SESSION_COOKIE + "="))
      ?.slice(SESSION_COOKIE.length + 1) || ""
  );
}
export function currentActor(req: Request): Actor {
  const token = tokenFromRequest(req);
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError("Sign in to continue.", 401);
  const session = database()
    .prepare(
      "SELECT user_id FROM user_sessions WHERE token_hash=? AND expires_at>?",
    )
    .get(hash(token), new Date().toISOString());
  if (!session)
    throw new AppError("Your session has expired. Please sign in.", 401);
  return actorById(String(session.user_id));
}
export function requireAdmin(actor: Actor) {
  if (actor.role !== "INTERNAL_ADMIN")
    throw new AppError("This action requires an internal user.", 403);
}
export function requireDealer(actor: Actor) {
  if (actor.role !== "DEALER_SALES")
    throw new AppError("Use the dealer account for this action.", 403);
}
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin"),
    url = new URL(req.url),
    expected =
      process.env.APP_ORIGIN ||
      `${url.protocol}//${req.headers.get("host") || url.host}`;
  if (
    req.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expected)
  )
    throw new AppError("Cross-site request rejected.", 403);
}
const attempts = new Map<string, { count: number; until: number }>();
export function signIn(email: string, password: string, client: string) {
  const now = Date.now();
  if (attempts.size > 256) attempts.clear();
  let entry = attempts.get(client);
  if (!entry || entry.until < now) {
    entry = { count: 0, until: now + 600000 };
    attempts.set(client, entry);
  }
  if (++entry.count > 12)
    throw new AppError("Too many sign-in attempts. Try again later.", 429);
  const row = database()
    .prepare(
      "SELECT id,password_hash FROM app_users WHERE email=? AND status='ACTIVE'",
    )
    .get(email.toLowerCase());
  const [salt, digest] = String(
    row?.password_hash || "invalid:" + "00".repeat(64),
  ).split(":");
  const calculated = scryptSync(password, salt, 64),
    expected = Buffer.from(digest, "hex");
  if (
    !row ||
    expected.length !== calculated.length ||
    !timingSafeEqual(expected, calculated)
  )
    throw new AppError("Email or password is incorrect.", 401);
  const actor = actorById(String(row.id)),
    token = randomBytes(32).toString("hex");
  database()
    .prepare("DELETE FROM user_sessions WHERE expires_at<=?")
    .run(new Date().toISOString());
  database()
    .prepare("INSERT INTO user_sessions VALUES(?,?,?)")
    .run(hash(token), actor.id, new Date(now + 12 * 3600000).toISOString());
  attempts.delete(client);
  audit(actor, "session.signed_in", actor.id);
  return { actor, token };
}
export function signOut(req: Request) {
  database()
    .prepare("DELETE FROM user_sessions WHERE token_hash=?")
    .run(hash(tokenFromRequest(req)));
}
