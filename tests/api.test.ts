import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { signIn } from "../lib/auth";
import { GET as dashboard } from "../app/api/dashboard/route";
import {
  GET as training,
  POST as updateTraining,
} from "../app/api/training/route";
import { GET as crm } from "../app/api/crm/route";
import { GET as knowledge } from "../app/api/knowledge/route";
import { GET as history, POST as chat } from "../app/api/assistant/route";
process.env.DEALER_DATA_DIR = mkdtempSync(
  path.join(tmpdir(), "dealer-api-test-"),
);
delete process.env.OPENAI_API_KEY;
delete process.env.DEALER_OPENAI_API_KEY;
function request(path: string, role: "dealer" | "internal", body?: unknown) {
  const token = signIn(
    role + "@demo.local",
    role === "dealer"
      ? process.env.DEALER_DEMO_PASSWORD || "DealerDemo!2026"
      : process.env.INTERNAL_DEMO_PASSWORD || "InternalDemo!2026",
    crypto.randomUUID(),
  ).token;
  return new Request("http://demo.test" + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: "dealer_session=" + token,
      "Content-Type": "application/json",
      origin: "http://demo.test",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("all shared data endpoints require a server session", async () => {
  for (const route of [dashboard, training, crm, knowledge, history])
    assert.equal(
      (await route(new Request("http://demo.test/api"))).status,
      401,
    );
});
test("dealer cannot use admin view or publication actions through HTTP", async () => {
  assert.equal(
    (await training(request("/api/training?view=admin", "dealer"))).status,
    403,
  );
  assert.equal(
    (
      await updateTraining(
        request("/api/training", "dealer", { action: "publish", course: {} }),
      )
    ).status,
    403,
  );
});
test("HTTP responses are scoped and never include quiz answer keys for learners", async () => {
  const d = await (await crm(request("/api/crm", "dealer"))).json();
  assert.ok(!JSON.stringify(d).includes("Geelong"));
  assert.ok(!JSON.stringify(d).includes("Priya"));
  assert.equal(d.assets.length, 1);
  const r = await (await training(request("/api/training", "dealer"))).json();
  assert.ok(r.courses.length);
  assert.ok(
    r.courses.every((c: { questions: unknown[] }) =>
      c.questions.every((q) => !Object.hasOwn(q as object, "correct")),
    ),
  );
  const k = await (await knowledge(request("/api/knowledge", "dealer"))).json();
  assert.ok(
    !k.articles.some((a: { audience: string }) => a.audience === "INTERNAL"),
  );
});
test("HTTP ignores forged learner identity and rejects foreign enrollment IDs", async () => {
  assert.equal(
    (
      await updateTraining(
        request("/api/training", "dealer", {
          action: "submit",
          enrollmentId: "enrollment-priya-onboarding",
          answers: [1, 0, 2],
          requestId: crypto.randomUUID(),
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await updateTraining(
        request("/api/training", "dealer", {
          action: "submit",
          enrollmentId: "enrollment-olivia-ev",
          learner_contact_id: "contact-priya",
          answers: [1, 0, 2, 1, 2],
          requestId: crypto.randomUUID(),
        }),
      )
    ).status,
    400,
  );
});
test("sample chatbot persists cited versions and another user cannot open its session", async () => {
  const response = await chat(
    request("/api/assistant", "dealer", { question: "winter range" }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "sample");
  assert.ok(
    result.sources.some(
      (s: { id: string; version: number }) =>
        s.id === "AU-TRAIN-01-v1" && s.version === 1,
    ),
  );
  assert.match(result.answer, /not a live AI response/);
  const own = await (
    await history(
      request("/api/assistant?sessionId=" + result.sessionId, "dealer"),
    )
  ).json();
  assert.equal(own.messages.length, 2);
  assert.equal(
    (
      await history(
        request("/api/assistant?sessionId=" + result.sessionId, "internal"),
      )
    ).status,
    404,
  );
});
test("no-source chatbot questions do not invent evidence or query private CRM", async () => {
  const response = await chat(
    request("/api/assistant", "dealer", {
      question: "Determine warranty eligibility for VIN DEMO0000000000002",
    }),
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.mode, "no_sources");
  assert.deepEqual(result.sources, []);
  assert.match(result.answer, /cannot access individual customer records/);
});
