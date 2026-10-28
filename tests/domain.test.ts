import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sampleExtraction, saveContractSchema } from "../lib/domain";
import { createContract, listContracts, database } from "../lib/db";
import { actorById } from "../lib/auth";
import {
  addCourse,
  courseSchema,
  publicCourses,
  recordParticipation,
  submitAttempt,
  trainingReport,
  addAssignment,
  completeLesson,
} from "../lib/training";
import { retrieveKnowledge } from "../lib/knowledge";
process.env.DEALER_DATA_DIR = mkdtempSync(path.join(tmpdir(), "dealer-test-"));
const valid = {
  opportunityId: "opp-001",
  fields: sampleExtraction.fields,
  reviewed: true,
  source: "sample",
};
test("contract requires human review and reviewed financial data", () => {
  assert.equal(
    saveContractSchema.safeParse({ ...valid, reviewed: false }).success,
    false,
  );
  assert.equal(saveContractSchema.safeParse(valid).success, true);
  for (const fields of [
    { ...valid.fields, deposit: 80000 },
    { ...valid.fields, totalPrice: -1 },
    { ...valid.fields, customerName: null },
    { ...valid.fields, vin: "INVALID" },
    { ...valid.fields, signedDate: "2026-02-31" },
  ])
    assert.equal(
      saveContractSchema.safeParse({ ...valid, fields }).success,
      false,
    );
});
test("reviewed contract persists with an authorized opportunity and audit actor", () => {
  const dealer = actorById("user-dealer"),
    id = createContract(saveContractSchema.parse(valid), dealer),
    saved = listContracts(dealer).find((c) => c.id === id);
  assert.equal(saved?.opportunityId, "opp-001");
  assert.equal(saved?.fields.customerName, "Alex Morgan");
  assert.equal(
    database()
      .prepare("SELECT actor_user_id FROM audit_events WHERE record_id=?")
      .get(id)?.actor_user_id,
    dealer.id,
  );
  assert.throws(() =>
    createContract(
      { ...saveContractSchema.parse(valid), opportunityId: "opp-004" },
      dealer,
    ),
  );
  assert.throws(() =>
    createContract(
      { ...saveContractSchema.parse(valid), opportunityId: "opp-003" },
      dealer,
    ),
  );
});
test("knowledge retrieval stays market and audience scoped and has no unrelated fallback", () => {
  const docs = retrieveKnowledge(actorById("user-dealer"), "winter range");
  assert.ok(docs.length);
  assert.ok(docs.every((d) => d.id.startsWith("AU-")));
  assert.match(docs[0].text!, /No Australian trim-specific range/);
  assert.deepEqual(
    retrieveKnowledge(actorById("user-dealer"), "allocation policy"),
    [],
  );
  assert.deepEqual(
    retrieveKnowledge(actorById("user-dealer"), "penguin geology"),
    [],
  );
});
test("published course needs assignment, hides answer keys and retains both attempts", () => {
  const admin = actorById("user-internal"),
    dealer = actorById("user-dealer"),
    input = courseSchema.parse({
      title: "Test course",
      body: "Ask about driving needs and home charging before making a recommendation.",
      questions: [0, 1, 2].map((i) => ({
        question: `Test question ${i}?`,
        options: ["A", "B", "C"],
        correct: i,
      })),
      passMark: 80,
    }),
    id = addCourse(input, admin);
  assert.ok(!publicCourses(dealer).some((c) => c.courseId === id));
  addAssignment(
    { courseId: id, targetType: "CONTACT", contactId: dealer.contactId },
    admin,
  );
  const exposed = publicCourses(dealer).find((c) => c.courseId === id)!;
  assert.ok(exposed);
  assert.equal("correct" in exposed.questions[0], false);
  recordParticipation(exposed.id, dealer);
  assert.equal(
    submitAttempt(exposed.id, [2, 2, 0], crypto.randomUUID(), dealer).score,
    0,
  );
  assert.equal(
    submitAttempt(exposed.id, [0, 1, 2], crypto.randomUUID(), dealer).score,
    3,
  );
  assert.notEqual(
    publicCourses(dealer).find((c) => c.id === exposed.id)!.status,
    "COMPLETED",
  );
  completeLesson(exposed.id, "lesson-1", dealer);
  const report = trainingReport(admin).find((e) => e.id === exposed.id)!;
  assert.equal(report.attempts.length, 2);
  assert.equal(report.status, "COMPLETED");
});
test("course validation rejects empty quizzes and missing answer options", () => {
  assert.equal(
    courseSchema.safeParse({
      title: "Test",
      body: "x".repeat(40),
      questions: [],
    }).success,
    false,
  );
  assert.equal(
    courseSchema.safeParse({
      title: "Test",
      body: "x".repeat(40),
      questions: [{ question: "Question?", options: ["A", "B"], correct: 2 }],
    }).success,
    false,
  );
});
