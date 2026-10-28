import { database, audit } from "./db";
import { requireAdmin } from "./auth";
import type { Actor, Source } from "./model-types";
import { AppError } from "./errors";
import { z } from "zod";
export function availableArticles(actor: Actor) {
  return database()
    .prepare(
      `SELECT * FROM knowledge_articles WHERE market_code=? AND status='PUBLISHED' AND (effective_from IS NULL OR effective_from<=?) AND (effective_to IS NULL OR effective_to>?) AND audience IN (?, 'BOTH') AND version=(SELECT MAX(k.version) FROM knowledge_articles k WHERE k.article_key=knowledge_articles.article_key AND k.market_code=knowledge_articles.market_code AND k.status='PUBLISHED' AND k.audience IN (?, 'BOTH') AND (k.effective_from IS NULL OR k.effective_from<=?) AND (k.effective_to IS NULL OR k.effective_to>?)) ORDER BY title`,
    )
    .all(
      actor.market,
      new Date().toISOString(),
      new Date().toISOString(),
      actor.role === "INTERNAL_ADMIN" ? "INTERNAL" : "DEALER",
      actor.role === "INTERNAL_ADMIN" ? "INTERNAL" : "DEALER",
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .map((r) => ({
      id: String(r.id),
      key: String(r.article_key),
      title: String(r.title),
      version: Number(r.version),
      text: String(r.body),
      status: "Demo training guidance",
      audience: String(r.audience),
    }));
}
export function retrieveKnowledge(actor: Actor, query: string): Source[] {
  let q = query.toLowerCase();
  for (const [re, words] of [
    [/주행|겨울/, " winter range "],
    [/충전/, " charging charger "],
    [/고객|니즈/, " customer needs "],
    [/등급|할당/, " allocation tier "],
  ] as const)
    if (re.test(q)) q += words;
  const words =
    q
      .match(/[a-z0-9]+/g)
      ?.filter(
        (x) =>
          /^[a-z]{3,}$/.test(x) &&
          ![
            "the",
            "and",
            "how",
            "what",
            "with",
            "for",
            "can",
            "you",
            "should",
            "please",
            "about",
            "does",
            "that",
            "this",
            "have",
            "would",
            "could",
            "want",
            "tell",
            "your",
            "from",
            "into",
            "more",
          ].includes(x),
      ) || [];
  return availableArticles(actor)
    .map((a) => ({
      ...a,
      score: words.reduce(
        (sum, w) =>
          sum +
          (new Set(a.title.toLowerCase().match(/[a-z]{3,}/g) || []).has(w)
            ? 3
            : new Set(a.text.toLowerCase().match(/[a-z]{3,}/g) || []).has(w)
              ? 1
              : 0),
        0,
      ),
    }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, title, version, text, status }) => ({
      id,
      title,
      version,
      text,
      status,
    }));
}
const articleSchema = z
  .object({
    key: z.string().regex(/^[A-Z0-9_-]{3,60}$/),
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(30).max(12000),
    audience: z.enum(["DEALER", "INTERNAL", "BOTH"]),
  })
  .strict();
export function publishArticle(input: unknown, actor: Actor) {
  requireAdmin(actor);
  const value = articleSchema.parse(input),
    id = crypto.randomUUID(),
    version =
      Number(
        database()
          .prepare(
            "SELECT MAX(version) AS v FROM knowledge_articles WHERE article_key=?",
          )
          .get(value.key)?.v || 0,
      ) + 1;
  database()
    .prepare(
      "INSERT INTO knowledge_articles(id,article_key,version,title,body,market_code,audience,status) VALUES(?,?,?,?,?,?,?,'PUBLISHED')",
    )
    .run(
      id,
      value.key,
      version,
      value.title,
      value.body,
      actor.market,
      value.audience,
    );
  audit(actor, "knowledge.published", id);
  return { id, version };
}
export function ownedSession(actor: Actor, id: string) {
  const row = database()
    .prepare(
      "SELECT id FROM chat_sessions WHERE id=? AND user_id=? AND account_id IS ?",
    )
    .get(id, actor.id, actor.accountId);
  if (!row) throw new AppError("Conversation not found.", 404);
  return id;
}
export function openChat(actor: Actor, id?: string) {
  if (id) return ownedSession(actor, id);
  const newId = crypto.randomUUID();
  database()
    .prepare("INSERT INTO chat_sessions VALUES(?,?,?,?)")
    .run(newId, actor.id, actor.accountId, new Date().toISOString());
  return newId;
}
export function chatHistory(actor: Actor, id?: string) {
  if (!id) {
    const latest = database()
      .prepare(
        "SELECT id FROM chat_sessions WHERE user_id=? AND account_id IS ? ORDER BY created_at DESC,id DESC LIMIT 1",
      )
      .get(actor.id, actor.accountId);
    if (!latest) return { sessionId: null, messages: [] };
    id = String(latest.id);
  }
  ownedSession(actor, id);
  const messages = database()
    .prepare(
      "SELECT * FROM (SELECT rowid AS seq,* FROM chat_messages WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 50) ORDER BY created_at,seq",
    )
    .all(id);
  return {
    sessionId: id,
    messages: messages.map((r) => ({
      role: r.role as "user" | "assistant",
      text: String(r.text),
      sources: JSON.parse(String(r.sources_json)) as Source[],
      mode: String(r.mode),
    })),
  };
}
export function saveChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  text: string,
  sources: Source[],
  mode: string,
  model?: string,
) {
  database()
    .prepare("INSERT INTO chat_messages VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      crypto.randomUUID(),
      sessionId,
      role,
      text,
      JSON.stringify(
        sources.map(({ id, title, version, status }) => ({
          id,
          title,
          version,
          status,
        })),
      ),
      mode,
      model || null,
      "knowledge-v2",
      new Date().toISOString(),
    );
}

export function managedArticles(actor: Actor) {
  requireAdmin(actor);
  return database()
    .prepare(
      `SELECT * FROM knowledge_articles k WHERE market_code=? AND status='PUBLISHED' AND version=(SELECT MAX(version) FROM knowledge_articles n WHERE n.article_key=k.article_key AND n.market_code=k.market_code AND n.status='PUBLISHED') ORDER BY title`,
    )
    .all(actor.market)
    .map((r) => ({
      id: String(r.id),
      key: String(r.article_key),
      title: String(r.title),
      version: Number(r.version),
      text: String(r.body),
      audience: String(r.audience),
    }));
}
