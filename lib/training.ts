import { z } from "zod";
import { database, atomic, audit } from "./db";
import { requireAdmin, requireDealer } from "./auth";
import { AppError } from "./errors";
import {
  courseSchema,
  assignmentSchema,
  type AssignmentInput,
  type Course,
} from "./training-schema";
import type {
  Actor,
  Lesson,
  Question,
  LearnerCourse,
  Grade,
  AccountSummary,
} from "./model-types";
export { courseSchema };
export type { Course };
const str = (v: unknown) => String(v ?? "");
export function courses(actor: Actor): Course[] {
  requireAdmin(actor);
  return database()
    .prepare(
      "SELECT * FROM learning_courses ORDER BY created_at DESC,version DESC",
    )
    .all()
    .map((r) => ({
      id: str(r.id),
      code: str(r.course_code),
      courseCode: str(r.course_code),
      version: Number(r.version),
      title: str(r.title),
      body: str(r.body),
      questions: JSON.parse(str(r.quiz_json)),
      passMark: Number(r.pass_mark_percent),
      status: str(r.status),
      market: str(r.market_code),
    }));
}
export function addCourse(
  input: z.input<typeof courseSchema>,
  actor: Actor,
  publish = true,
) {
  requireAdmin(actor);
  const value = courseSchema.parse(input);
  return atomic(() => {
    const code =
        value.courseCode ||
        "COURSE-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      version =
        Number(
          database()
            .prepare(
              "SELECT MAX(version) AS n FROM learning_courses WHERE course_code=?",
            )
            .get(code)?.n || 0,
        ) + 1,
      id = crypto.randomUUID();
    database()
      .prepare(
        `INSERT INTO learning_courses(id,course_code,version,title,body,lessons_json,quiz_json,pass_mark_percent,market_code,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        code,
        version,
        value.title,
        value.body,
        JSON.stringify([
          { id: "lesson-1", title: value.title, body: value.body },
        ]),
        JSON.stringify(value.questions),
        value.passMark,
        actor.market,
        publish ? "PUBLISHED" : "DRAFT",
        actor.id,
        new Date().toISOString(),
      );
    audit(actor, publish ? "course.published" : "course.draft_created", id);
    return id;
  });
}
export function publishCourse(id: string, actor: Actor) {
  requireAdmin(actor);
  const result = database()
    .prepare(
      "UPDATE learning_courses SET status='PUBLISHED' WHERE id=? AND status='DRAFT'",
    )
    .run(id);
  if (!result.changes) throw new AppError("Draft course not found.", 404);
  audit(actor, "course.published", id);
}
function targetEmployees(value: AssignmentInput) {
  const course = database()
    .prepare("SELECT * FROM learning_courses WHERE id=? AND status='PUBLISHED'")
    .get(value.courseId);
  if (!course) throw new AppError("Choose a published course.", 400);
  let where = "a.market_code=?",
    params: (string | number)[] = [str(course.market_code)];
  if (value.targetType === "ACCOUNT") {
    where += " AND a.id=?";
    params.push(value.accountId!);
  } else if (value.targetType === "CONTACT") {
    where += " AND c.id=?";
    params.push(value.contactId!);
  } else {
    if (value.criteria?.tier) {
      where += " AND a.tier=?";
      params.push(value.criteria.tier);
    }
    if (value.criteria?.lifecycle) {
      where += " AND a.lifecycle_status=?";
      params.push(value.criteria.lifecycle);
    }
  }
  return database()
    .prepare(
      `SELECT c.id AS contact_id,c.display_name,a.id AS account_id,a.name AS account_name FROM account_contact_relations r JOIN contacts c ON c.id=r.contact_id JOIN accounts a ON a.id=r.account_id WHERE r.relationship_role='EMPLOYEE' AND r.job_role='SALES_CONSULTANT' AND r.is_active=1 AND c.status='ACTIVE' AND a.status='ACTIVE' AND ${where}`,
    )
    .all(...params);
}
export function previewAssignment(input: unknown, actor: Actor) {
  requireAdmin(actor);
  const rows = targetEmployees(assignmentSchema.parse(input));
  return {
    staffCount: rows.length,
    accountCount: new Set(rows.map((r) => r.account_id)).size,
    employees: rows.map((r) => ({
      id: r.contact_id,
      name: r.display_name,
      account: r.account_name,
    })),
  };
}
export function applyAssignments(actor: Actor) {
  requireAdmin(actor);
  return atomic(() => {
    let added = 0,
      sourcesAdded = 0;
    const rules = database()
      .prepare(
        "SELECT a.* FROM learning_assignments a JOIN learning_courses c ON c.id=a.course_id WHERE a.status='ACTIVE' AND c.status='PUBLISHED'",
      )
      .all();
    for (const rule of rules) {
      const value: AssignmentInput = {
        courseId: str(rule.course_id),
        targetType: rule.target_type as AssignmentInput["targetType"],
        accountId: rule.account_id ? str(rule.account_id) : undefined,
        contactId: rule.contact_id ? str(rule.contact_id) : undefined,
        criteria: rule.criteria_json
          ? JSON.parse(str(rule.criteria_json))
          : undefined,
        required: !!rule.required,
        dueDays: Number(rule.due_in_days),
      };
      for (const person of targetEmployees(value)) {
        let enrollment = database()
          .prepare(
            "SELECT * FROM enrollments WHERE learner_contact_id=? AND course_id=?",
          )
          .get(person.contact_id, rule.course_id);
        if (enrollment?.status === "CANCELLED") continue;
        if (enrollment && enrollment.account_id !== person.account_id) continue;
        if (!enrollment) {
          const id = crypto.randomUUID();
          database()
            .prepare(
              "INSERT INTO enrollments(id,account_id,learner_contact_id,course_id,status) VALUES(?,?,?,?,'ASSIGNED')",
            )
            .run(id, person.account_id, person.contact_id, rule.course_id);
          enrollment = { id };
          added++;
        }
        const result = database()
          .prepare("INSERT OR IGNORE INTO enrollment_sources VALUES(?,?,?,?)")
          .run(
            enrollment.id,
            rule.id,
            new Date().toISOString(),
            new Date(Date.now() + value.dueDays * 86400000).toISOString(),
          );
        sourcesAdded += Number(result.changes);
      }
    }
    audit(actor, "learning.assignments_applied", "network");
    return { added, sourcesAdded };
  });
}
export function addAssignment(input: unknown, actor: Actor) {
  requireAdmin(actor);
  const value = assignmentSchema.parse(input),
    preview = previewAssignment(value, actor);
  if (!preview.staffCount)
    throw new AppError("No eligible sales consultants match this target.");
  return atomic(() => {
    const id = crypto.randomUUID();
    database()
      .prepare("INSERT INTO learning_assignments VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        value.courseId,
        value.targetType,
        value.accountId || null,
        value.contactId || null,
        value.criteria ? JSON.stringify(value.criteria) : null,
        Number(value.required),
        value.dueDays,
        "ACTIVE",
        actor.id,
        new Date().toISOString(),
      );
    audit(actor, "learning.assignment_created", id);
    return { id, ...applyAssignments(actor) };
  });
}
export function setAssignmentStatus(
  id: string,
  status: "ACTIVE" | "PAUSED",
  actor: Actor,
) {
  requireAdmin(actor);
  return atomic(() => {
    if (
      !database()
        .prepare("UPDATE learning_assignments SET status=? WHERE id=?")
        .run(status, id).changes
    )
      throw new AppError("Assignment not found.", 404);
    audit(actor, "learning.assignment_" + status.toLowerCase(), id);
    if (status === "ACTIVE") applyAssignments(actor);
  });
}
export function listAssignments(actor: Actor) {
  requireAdmin(actor);
  return database()
    .prepare(
      `SELECT a.*,c.title AS course_title,c.version FROM learning_assignments a JOIN learning_courses c ON c.id=a.course_id ORDER BY a.created_at DESC`,
    )
    .all()
    .map((r) => ({
      id: r.id,
      courseTitle: r.course_title,
      version: r.version,
      targetType: r.target_type,
      accountId: r.account_id,
      contactId: r.contact_id,
      criteria: r.criteria_json ? JSON.parse(str(r.criteria_json)) : null,
      required: !!r.required,
      dueDays: r.due_in_days,
      status: r.status,
    }));
}
function getEnrollment(id: string, actor: Actor) {
  const e = database().prepare("SELECT * FROM enrollments WHERE id=?").get(id);
  if (
    !e ||
    (actor.role !== "INTERNAL_ADMIN" &&
      (e.learner_contact_id !== actor.contactId ||
        e.account_id !== actor.accountId))
  )
    throw new AppError("Enrollment not found.", 404);
  return e;
}
function attemptView(r: Record<string, unknown>) {
  return {
    id: str(r.id),
    number: Number(r.attempt_number),
    score: Number(r.score),
    total: Number(r.total),
    passed: !!r.passed,
    submittedAt: str(r.submitted_at),
    source: str(r.source),
  };
}
export function publicCourses(actor: Actor): LearnerCourse[] {
  requireDealer(actor);
  return database()
    .prepare(
      `SELECT e.*,c.course_code,c.version,c.title,c.body,c.lessons_json,c.quiz_json,c.pass_mark_percent FROM enrollments e JOIN learning_courses c ON c.id=e.course_id WHERE e.learner_contact_id=? AND e.account_id=? AND e.status!='CANCELLED' ORDER BY c.course_code`,
    )
    .all(actor.contactId!, actor.accountId!)
    .map((r) => {
      const attempts = database()
          .prepare(
            "SELECT * FROM quiz_attempts WHERE enrollment_id=? ORDER BY attempt_number DESC",
          )
          .all(r.id)
          .map(attemptView),
        completed = JSON.parse(str(r.lesson_progress_json)) as string[],
        lessons = JSON.parse(str(r.lessons_json)) as Lesson[],
        passed = attempts.some((a) => a.passed),
        reasons = database()
          .prepare(
            "SELECT a.target_type,a.criteria_json,a.required,s.due_at FROM enrollment_sources s JOIN learning_assignments a ON a.id=s.assignment_id WHERE s.enrollment_id=? ORDER BY s.due_at",
          )
          .all(r.id);
      return {
        id: str(r.id),
        courseId: str(r.course_id),
        code: str(r.course_code),
        version: Number(r.version),
        title: str(r.title),
        body: str(r.body),
        lessons,
        questions: (JSON.parse(str(r.quiz_json)) as Question[]).map(
          ({ question, options }) => ({ question, options }),
        ),
        passMark: Number(r.pass_mark_percent),
        status: str(r.status),
        progress: Math.round(
          ((completed.length + Number(passed)) / (lessons.length + 1)) * 100,
        ),
        completedLessons: completed,
        dueAt: str((reasons.find((x) => x.required) || reasons[0])?.due_at),
        reasons: reasons.map((x) =>
          x.target_type === "CONTACT"
            ? "Assigned to you"
            : x.target_type === "ACCOUNT"
              ? "Dealer assignment"
              : Object.entries(JSON.parse(str(x.criteria_json)))
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · "),
        ),
        latestScore: attempts.length
          ? (attempts[0].score / attempts[0].total) * 100
          : null,
        bestScore: attempts.length
          ? Math.max(...attempts.map((a) => (a.score / a.total) * 100))
          : null,
        passed,
        attempts,
      };
    });
}
export function recordParticipation(id: string, actor: Actor) {
  requireDealer(actor);
  const e = getEnrollment(id, actor);
  if (e.status === "CANCELLED")
    throw new AppError("This enrollment is cancelled.", 403);
  database()
    .prepare(
      "UPDATE enrollments SET first_opened_at=COALESCE(first_opened_at,?),status=CASE WHEN status='ASSIGNED' THEN 'IN_PROGRESS' ELSE status END WHERE id=?",
    )
    .run(new Date().toISOString(), id);
}
function recompute(id: string) {
  const e = database()
    .prepare(
      "SELECT e.*,c.lessons_json FROM enrollments e JOIN learning_courses c ON c.id=e.course_id WHERE e.id=?",
    )
    .get(id)!;
  const done = JSON.parse(str(e.lesson_progress_json)) as string[],
    lessons = JSON.parse(str(e.lessons_json)) as Lesson[],
    passed = !!database()
      .prepare(
        "SELECT id FROM quiz_attempts WHERE enrollment_id=? AND passed=1 LIMIT 1",
      )
      .get(id),
    complete = passed && lessons.every((l) => done.includes(l.id));
  database()
    .prepare(
      "UPDATE enrollments SET status=?,completed_at=CASE WHEN ?=1 THEN COALESCE(completed_at,?) ELSE completed_at END WHERE id=? AND status!='CANCELLED'",
    )
    .run(
      complete ? "COMPLETED" : "IN_PROGRESS",
      Number(complete),
      new Date().toISOString(),
      id,
    );
}
export function completeLesson(id: string, lessonId: string, actor: Actor) {
  requireDealer(actor);
  return atomic(() => {
    const e = getEnrollment(id, actor);
    if (e.status === "CANCELLED")
      throw new AppError("This enrollment is cancelled.", 403);
    const c = database()
      .prepare("SELECT lessons_json FROM learning_courses WHERE id=?")
      .get(e.course_id)!;
    if (
      !(JSON.parse(str(c.lessons_json)) as Lesson[]).some(
        (l) => l.id === lessonId,
      )
    )
      throw new AppError("Lesson not found.", 404);
    const done = new Set(JSON.parse(str(e.lesson_progress_json)) as string[]);
    done.add(lessonId);
    recordParticipation(id, actor);
    database()
      .prepare("UPDATE enrollments SET lesson_progress_json=? WHERE id=?")
      .run(JSON.stringify([...done]), id);
    recompute(id);
    audit(actor, "learning.lesson_completed", id);
  });
}
export function submitAttempt(
  id: string,
  answers: number[],
  requestId: string,
  actor: Actor,
): Grade {
  requireDealer(actor);
  return atomic(() => {
    const e = getEnrollment(id, actor);
    if (e.status === "CANCELLED")
      throw new AppError("This enrollment is cancelled.", 403);
    const old = database()
      .prepare(
        "SELECT * FROM quiz_attempts WHERE enrollment_id=? AND request_id=?",
      )
      .get(id, requestId);
    if (old) {
      if (str(old.answers_json) !== JSON.stringify(answers))
        throw new AppError(
          "This submission ID was already used for different answers.",
          409,
        );
      return {
        score: Number(old.score),
        total: Number(old.total),
        passed: !!old.passed,
        feedback: JSON.parse(str(old.grading_json)),
        replayed: true,
      };
    }
    const c = database()
      .prepare(
        "SELECT quiz_json,pass_mark_percent FROM learning_courses WHERE id=?",
      )
      .get(e.course_id)!;
    const questions = JSON.parse(str(c.quiz_json)) as Question[];
    if (
      answers.length !== questions.length ||
      answers.some(
        (a, i) =>
          !Number.isInteger(a) || a < 0 || a >= questions[i].options.length,
      )
    )
      throw new AppError("Answer every question with a valid option.");
    const feedback = questions.map((q, i) => ({
        correct: answers[i] === q.correct,
        answer: q.correct,
      })),
      score = feedback.filter((f) => f.correct).length,
      passed = score * 100 >= Number(c.pass_mark_percent) * questions.length,
      number =
        Number(
          database()
            .prepare(
              "SELECT MAX(attempt_number) AS n FROM quiz_attempts WHERE enrollment_id=?",
            )
            .get(id)?.n || 0,
        ) + 1;
    database()
      .prepare("INSERT INTO quiz_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        id,
        number,
        JSON.stringify(answers),
        JSON.stringify(feedback),
        score,
        questions.length,
        Number(passed),
        new Date().toISOString(),
        requestId,
        "LIVE_SUBMISSION",
      );
    recordParticipation(id, actor);
    recompute(id);
    audit(actor, "learning.quiz_submitted", id);
    return { score, total: questions.length, passed, feedback };
  });
}
export function trainingReport(actor: Actor) {
  requireAdmin(actor);
  return database()
    .prepare(
      `SELECT e.*,c.title,c.course_code,c.version,c.lessons_json,p.display_name,a.name AS account_name FROM enrollments e JOIN learning_courses c ON c.id=e.course_id JOIN contacts p ON p.id=e.learner_contact_id JOIN accounts a ON a.id=e.account_id ORDER BY a.name,p.display_name,c.title`,
    )
    .all()
    .map((r) => {
      const attempts = database()
          .prepare(
            "SELECT * FROM quiz_attempts WHERE enrollment_id=? ORDER BY attempt_number DESC",
          )
          .all(r.id)
          .map(attemptView),
        lessons = JSON.parse(str(r.lessons_json)) as Lesson[],
        done = JSON.parse(str(r.lesson_progress_json)) as string[];
      return {
        id: r.id,
        learnerId: r.learner_contact_id,
        learner: r.display_name,
        accountId: r.account_id,
        account: r.account_name,
        courseId: r.course_id,
        course: r.title,
        version: r.version,
        status: r.status,
        progress: Math.round(
          ((done.length + Number(attempts.some((a) => a.passed))) /
            (lessons.length + 1)) *
            100,
        ),
        attempts,
      };
    });
}
export function accountSummaries(actor: Actor): AccountSummary[] {
  requireAdmin(actor);
  return database()
    .prepare("SELECT * FROM accounts ORDER BY name")
    .all()
    .map((a) => {
      const staff = database()
        .prepare(
          "SELECT contact_id FROM account_contact_relations WHERE account_id=? AND relationship_role='EMPLOYEE' AND job_role='SALES_CONSULTANT' AND is_active=1",
        )
        .all(a.id);
      const enrollments = database()
          .prepare(
            `SELECT e.*,EXISTS(SELECT 1 FROM enrollment_sources s JOIN learning_assignments r ON r.id=s.assignment_id WHERE s.enrollment_id=e.id AND r.required=1) AS required,(SELECT MIN(s.due_at) FROM enrollment_sources s JOIN learning_assignments r ON r.id=s.assignment_id WHERE s.enrollment_id=e.id AND r.required=1) AS due FROM enrollments e WHERE e.account_id=? AND e.status!='CANCELLED'`,
          )
          .all(a.id),
        required = enrollments.filter((e) => e.required),
        completed = required.filter((e) => e.status === "COMPLETED").length;
      return {
        id: str(a.id),
        name: str(a.name),
        tier: str(a.tier),
        lifecycle: str(a.lifecycle_status),
        market: str(a.market_code),
        staff: staff.length,
        required: required.length,
        completed,
        overdue: required.filter(
          (e) =>
            e.status !== "COMPLETED" && str(e.due) < new Date().toISOString(),
        ).length,
        unassigned: staff.filter(
          (c) =>
            !enrollments.some((e) => e.learner_contact_id === c.contact_id),
        ).length,
        completionRate: required.length
          ? (completed / required.length) * 100
          : null,
      };
    });
}
