import { NextResponse } from "next/server";
import { z } from "zod";
import { currentActor, assertSameOrigin, requireAdmin } from "@/lib/auth";
import {
  addCourse,
  courses,
  publicCourses,
  recordParticipation,
  completeLesson,
  submitAttempt,
  trainingReport,
  previewAssignment,
  addAssignment,
  applyAssignments,
  listAssignments,
  setAssignmentStatus,
  publishCourse,
  accountSummaries,
} from "@/lib/training";
import { errorResponse } from "@/lib/http";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = currentActor(req);
    if (new URL(req.url).searchParams.get("view") === "admin")
      requireAdmin(actor);
    return NextResponse.json(
      actor.role === "INTERNAL_ADMIN"
        ? {
            courses: courses(actor),
            enrollments: trainingReport(actor),
            assignments: listAssignments(actor),
            accounts: accountSummaries(actor),
          }
        : { courses: publicCourses(actor) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = currentActor(req),
      body = await req.json();
    if (body.action === "publish" || body.action === "draft")
      return NextResponse.json(
        { id: addCourse(body.course, actor, body.action === "publish") },
        { status: 201 },
      );
    if (body.action === "publishDraft") {
      publishCourse(z.string().parse(body.courseId), actor);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "previewAssignment")
      return NextResponse.json(previewAssignment(body.assignment, actor));
    if (body.action === "assign")
      return NextResponse.json(addAssignment(body.assignment, actor), {
        status: 201,
      });
    if (body.action === "reapply")
      return NextResponse.json(applyAssignments(actor));
    if (body.action === "assignmentStatus") {
      setAssignmentStatus(
        z.string().parse(body.id),
        z.enum(["ACTIVE", "PAUSED"]).parse(body.status),
        actor,
      );
      return NextResponse.json({ ok: true });
    }
    const value = z
      .object({
        action: z.enum(["open", "completeLesson", "submit"]),
        enrollmentId: z.string().min(1).max(100),
        lessonId: z.string().optional(),
        answers: z.array(z.number().int()).max(20).optional(),
        requestId: z.string().uuid().optional(),
      })
      .strict()
      .parse(body);
    if (value.action === "open") {
      recordParticipation(value.enrollmentId, actor);
      return NextResponse.json({ ok: true });
    }
    if (value.action === "completeLesson") {
      completeLesson(
        value.enrollmentId,
        z.string().min(1).parse(value.lessonId),
        actor,
      );
      return NextResponse.json({ ok: true });
    }
    if (!value.answers || !value.requestId)
      throw new AppError("Answers and a submission ID are required.");
    return NextResponse.json(
      submitAttempt(value.enrollmentId, value.answers, value.requestId, actor),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
