import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { database } from "../lib/db";
import {
  actorById,
  signIn,
  currentActor,
  signOut,
  assertSameOrigin,
} from "../lib/auth";
import { crmData, updateAccount } from "../lib/crm";
import {
  courses,
  addCourse,
  addAssignment,
  applyAssignments,
  previewAssignment,
  publicCourses,
  submitAttempt,
  completeLesson,
  accountSummaries,
  trainingReport,
  setAssignmentStatus,
} from "../lib/training";
import {
  retrieveKnowledge,
  openChat,
  saveChatMessage,
  chatHistory,
  availableArticles,
  publishArticle,
  managedArticles,
} from "../lib/knowledge";
process.env.DEALER_DATA_DIR = mkdtempSync(
  path.join(tmpdir(), "dealer-model-test-"),
);
const dealer = () => actorById("user-dealer"),
  admin = () => actorById("user-internal");
const input = (code: string, passMark = 80) => ({
  courseCode: code,
  title: "Testing course " + code,
  body: "Check the vehicle and charging installation before giving the customer a charging estimate.",
  passMark,
  questions: [0, 1, 2].map((i) => ({
    question: "Which option is correct for question " + i + "?",
    options: ["First", "Second", "Third"],
    correct: i,
  })),
});
const assignToDealer = (id: string) => {
  addAssignment(
    { courseId: id, targetType: "CONTACT", contactId: "contact-olivia" },
    admin(),
  );
  return publicCourses(dealer()).find((c) => c.courseId === id)!;
};
test("schema seeds linked Accounts, Contacts, Users, products, assets, warranties and learning once", () => {
  const db = database();
  for (const [table, count] of [
    ["accounts", 2],
    ["contacts", 7],
    ["app_users", 2],
    ["products", 3],
    ["assets", 2],
    ["asset_warranties", 4],
    ["opportunities", 5],
    ["learning_courses", 3],
    ["enrollments", 4],
    ["quiz_attempts", 2],
  ] as const)
    assert.equal(
      db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n,
      count,
      table,
    );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  for (const row of db
    .prepare("SELECT * FROM quiz_attempts WHERE source='PREPARED'")
    .all()) {
    const grading = JSON.parse(String(row.grading_json)) as {
      correct: boolean;
    }[];
    assert.equal(grading.filter((answer) => answer.correct).length, row.score);
  }
  assert.ok(trainingReport(admin()).every((r) => Number.isFinite(r.progress)));
});
test("dealer scope excludes both another dealer and colleagues in the same dealer", () => {
  const data = crmData(dealer());
  assert.equal(data.accounts.length, 1);
  assert.deepEqual(
    data.opportunities.map((x) => x.id),
    ["opp-001", "opp-002", "opp-005"],
  );
  assert.ok(
    !data.contacts.some((c) =>
      [
        "contact-ben",
        "contact-priya",
        "contact-noah",
        "contact-oliver",
      ].includes(String(c.id)),
    ),
  );
  assert.deepEqual(
    data.assets.map((a) => a.id),
    ["asset-001"],
  );
  assert.equal(data.warranties.length, 2);
  assert.equal(crmData(admin()).assets.length, 2);
});
test("password authentication issues opaque revocable sessions, not client roles", () => {
  assert.throws(() =>
    signIn("dealer@demo.local", "wrong", crypto.randomUUID()),
  );
  const { token, actor } = signIn(
      "dealer@demo.local",
      process.env.DEALER_DEMO_PASSWORD || "DealerDemo!2026",
      crypto.randomUUID(),
    ),
    request = new Request("http://demo.test/api", {
      headers: { cookie: "dealer_session=" + token },
    });
  assert.equal(actor.id, "user-dealer");
  assert.equal(currentActor(request).role, "DEALER_SALES");
  assert.throws(() =>
    currentActor(
      new Request("http://demo.test/api", {
        headers: { cookie: "dealer_session=user-internal" },
      }),
    ),
  );
  signOut(request);
  assert.throws(() => currentActor(request));
});
test("cross-site mutations are rejected", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://localhost:3001/api", {
        headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" },
      }),
    ),
  );
  assert.throws(() =>
    assertSameOrigin(
      new Request("http://demo.test/api", {
        headers: { origin: "https://evil.test" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://demo.test/api", {
        headers: { origin: "http://demo.test" },
      }),
    ),
  );
});
test("dealers cannot create courses or assignments, change tiers or read report definitions", () => {
  assert.throws(() => addCourse(input("DENIED"), dealer()));
  assert.throws(() =>
    previewAssignment(
      {
        courseId: "course-ev-v1",
        targetType: "ACCOUNT",
        accountId: "dealer-a",
      },
      dealer(),
    ),
  );
  assert.throws(() => courses(dealer()));
  assert.throws(() =>
    updateAccount(
      { accountId: "dealer-a", tier: "TIER_3", lifecycle: "NEW" },
      dealer(),
    ),
  );
});
test("assignment previews exclude buyer Contacts and never change the database", () => {
  const before = database()
    .prepare("SELECT count(*) AS n FROM enrollments")
    .get()?.n;
  assert.equal(
    previewAssignment(
      {
        courseId: "course-ev-v1",
        targetType: "ACCOUNT",
        accountId: "dealer-a",
      },
      admin(),
    ).staffCount,
    2,
  );
  assert.equal(
    previewAssignment(
      {
        courseId: "course-ev-v1",
        targetType: "CONTACT",
        contactId: "contact-alex",
      },
      admin(),
    ).staffCount,
    0,
  );
  assert.throws(() =>
    addAssignment(
      {
        courseId: "course-ev-v1",
        targetType: "CONTACT",
        contactId: "contact-alex",
      },
      admin(),
    ),
  );
  assert.equal(
    database().prepare("SELECT count(*) AS n FROM enrollments").get()?.n,
    before,
  );
});
test("Tier 1 and NEW overlap creates one enrollment with two reasons and reapplication is idempotent", () => {
  updateAccount(
    { accountId: "dealer-b", tier: "TIER_1", lifecycle: "NEW" },
    admin(),
  );
  addAssignment(
    {
      courseId: "course-ev-v1",
      targetType: "DEALER_SEGMENT",
      criteria: { lifecycle: "NEW" },
    },
    admin(),
  );
  const rows = database()
    .prepare(
      "SELECT id FROM enrollments WHERE learner_contact_id='contact-priya' AND course_id='course-ev-v1'",
    )
    .all();
  assert.equal(rows.length, 1);
  assert.equal(
    database()
      .prepare(
        "SELECT count(*) AS n FROM enrollment_sources WHERE enrollment_id=?",
      )
      .get(rows[0].id)?.n,
    2,
  );
  const result = applyAssignments(admin());
  assert.equal(result.added, 0);
  assert.equal(result.sourcesAdded, 0);
});
test("segment changes do not erase existing progress and paused rules preserve obligations", () => {
  setAssignmentStatus("assignment-tier1", "PAUSED", admin());
  updateAccount(
    { accountId: "dealer-a", tier: "TIER_3", lifecycle: "ESTABLISHED" },
    admin(),
  );
  assert.ok(publicCourses(dealer()).some((c) => c.courseId === "course-ev-v1"));
  assert.equal(
    database()
      .prepare("SELECT status FROM enrollments WHERE id='enrollment-ben-ev'")
      .get()?.status,
    "COMPLETED",
  );
  assert.ok(
    accountSummaries(admin()).find((a) => a.id === "dealer-a")!.required >= 3,
  );
});
test("foreign learner enrollment and unassigned course IDs cannot be submitted", () => {
  assert.throws(() =>
    submitAttempt(
      "enrollment-priya-onboarding",
      [0, 0, 0],
      crypto.randomUUID(),
      dealer(),
    ),
  );
  assert.throws(() =>
    completeLesson("enrollment-ben-ev", "discover", dealer()),
  );
  assert.throws(() =>
    submitAttempt("course-ev-v1", [0, 0, 0], crypto.randomUUID(), dealer()),
  );
});
test("published course versions and quiz attempts are immutable; revisions are separate", () => {
  const id = addCourse(input("VERSIONED"), admin());
  assert.throws(() =>
    database()
      .prepare("UPDATE learning_courses SET title=? WHERE id=?")
      .run("Changed", id),
  );
  const next = addCourse(input("VERSIONED"), admin());
  assert.equal(courses(admin()).find((c) => c.id === next)?.version, 2);
  assert.notEqual(next, id);
  assert.throws(() =>
    database()
      .prepare(
        "UPDATE quiz_attempts SET score=0 WHERE id='attempt-ben-prepared'",
      )
      .run(),
  );
});
test("draft courses cannot be assigned and are not exposed to learners", () => {
  const id = addCourse(input("DRAFTONLY"), admin(), false);
  assert.throws(() =>
    addAssignment(
      { courseId: id, targetType: "ACCOUNT", accountId: "dealer-a" },
      admin(),
    ),
  );
  assert.ok(!publicCourses(dealer()).some((c) => c.courseId === id));
});
test("submission retries are idempotent but a changed payload with the same ID is rejected", () => {
  const e = assignToDealer(addCourse(input("RETRIES"), admin())),
    requestId = crypto.randomUUID();
  assert.equal(submitAttempt(e.id, [0, 1, 2], requestId, dealer()).score, 3);
  assert.equal(
    submitAttempt(e.id, [0, 1, 2], requestId, dealer()).replayed,
    true,
  );
  assert.throws(() => submitAttempt(e.id, [2, 2, 2], requestId, dealer()));
  assert.equal(
    publicCourses(dealer()).find((c) => c.id === e.id)?.attempts.length,
    1,
  );
});
test("quiz pass does not complete unread lessons, and a later failed retry preserves a previous pass", () => {
  const e = assignToDealer(addCourse(input("COMPLETION"), admin()));
  submitAttempt(e.id, [0, 1, 2], crypto.randomUUID(), dealer());
  assert.notEqual(
    publicCourses(dealer()).find((c) => c.id === e.id)?.status,
    "COMPLETED",
  );
  completeLesson(e.id, "lesson-1", dealer());
  submitAttempt(e.id, [2, 2, 0], crypto.randomUUID(), dealer());
  const record = publicCourses(dealer()).find((c) => c.id === e.id)!;
  assert.equal(record.status, "COMPLETED");
  assert.equal(record.progress, 100);
  assert.equal(record.latestScore, 0);
  assert.equal(record.bestScore, 100);
  assert.equal(record.passed, true);
});
test("pass threshold compares before rounding and quiz length is not fixed to three", () => {
  const e = assignToDealer(addCourse(input("THRESHOLD", 67), admin()));
  assert.equal(
    submitAttempt(e.id, [0, 1, 0], crypto.randomUUID(), dealer()).passed,
    false,
  );
  const five = publicCourses(dealer()).find(
    (c) => c.courseId === "course-ev-v1",
  )!;
  assert.equal(five.questions.length, 5);
  assert.equal(
    submitAttempt(five.id, [1, 0, 2, 1, 0], crypto.randomUUID(), dealer())
      .passed,
    true,
  );
  assert.throws(() =>
    submitAttempt(five.id, [1, 0, 2], crypto.randomUUID(), dealer()),
  );
});
test("learner payload contains neither answer keys nor other staff scorecards", () => {
  const result = publicCourses(dealer());
  assert.ok(result.every((c) => c.id !== "enrollment-ben-ev"));
  assert.ok(
    result.every((c) => c.questions.every((q) => !Object.hasOwn(q, "correct"))),
  );
  assert.ok(!JSON.stringify(result).includes("contact-priya"));
});
test("chat histories persist for their owner and are private even from the internal account", () => {
  const id = openChat(dealer());
  saveChatMessage(id, "user", "How do I explain winter range?", [], "user");
  saveChatMessage(
    id,
    "assistant",
    "Conditions matter.",
    [{ id: "AU-TRAIN-01-v1", title: "Range", version: 1, status: "Demo" }],
    "sample",
  );
  const history = chatHistory(dealer(), id);
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[1].sources[0].version, 1);
  assert.throws(() => chatHistory(admin(), id));
  assert.throws(() => openChat(admin(), id));
});
test("knowledge retrieval filters audience and uses current eligible versions", () => {
  assert.ok(
    !availableArticles(dealer()).some((a) => a.audience === "INTERNAL"),
  );
  assert.ok(
    retrieveKnowledge(admin(), "allocation policy").some(
      (a) => a.id === "INT-POLICY-01-v1",
    ),
  );
  publishArticle(
    {
      key: "AU-TRAIN-02",
      title: "Charging confidence revised",
      body: "Charging installation requires checking the power supply and the exact vehicle before quoting a home charging time.",
      audience: "BOTH",
    },
    admin(),
  );
  const docs = retrieveKnowledge(dealer(), "charging");
  assert.ok(docs.some((d) => d.version === 2));
  assert.ok(!docs.some((d) => d.id === "AU-TRAIN-02-v1"));
});

test("required deadlines take priority over earlier optional assignment dates", () => {
  const id = addCourse(input("DEADLINE"), admin());
  addAssignment(
    {
      courseId: id,
      targetType: "CONTACT",
      contactId: "contact-olivia",
      required: false,
      dueDays: 1,
    },
    admin(),
  );
  addAssignment(
    {
      courseId: id,
      targetType: "ACCOUNT",
      accountId: "dealer-a",
      required: true,
      dueDays: 14,
    },
    admin(),
  );
  const course = publicCourses(dealer()).find((c) => c.courseId === id)!;
  assert.equal(course.reasons.length, 2);
  assert.ok(Date.parse(course.dueAt) > Date.now() + 13 * 86400000);
});

test("internal article management includes dealer-only material without changing chatbot audience", () => {
  const article = publishArticle(
    {
      key: "DEALER-ONLY",
      title: "Dealer welcome guidance",
      body: "Welcome dealer colleagues. Review your assigned learning before meeting your next customer.",
      audience: "DEALER",
    },
    admin(),
  );
  assert.ok(managedArticles(admin()).some((a) => a.key === "DEALER-ONLY"));
  assert.ok(availableArticles(dealer()).some((a) => a.key === "DEALER-ONLY"));
  assert.ok(!availableArticles(admin()).some((a) => a.key === "DEALER-ONLY"));
  assert.throws(() => managedArticles(dealer()));
});
