import { opportunities, quizQuestions } from "./domain";
import type { Actor, LearnerCourse } from "./model-types";
const previewActor: Actor = {
  id: "preview-dealer",
  name: "Olivia Bennett",
  email: "dealer@demo.local",
  role: "DEALER_SALES",
  contactId: "preview-olivia",
  accountId: "preview-dealer-a",
  accountName: "Melbourne Central",
  market: "AU",
};
const previewCourse: LearnerCourse = {
  id: "preview-enrollment",
  courseId: "preview-course",
  code: "EV01",
  version: 1,
  title: "EV sales essentials",
  body: "Prepare a needs-led EV conversation.",
  lessons: [
    {
      id: "charging",
      title: "Rapid charging and home charging",
      body: "Distinguish public DC rapid charging from home AC charging. Check the exact vehicle and the installation before quoting a time. A driveway does not confirm installation suitability.",
    },
  ],
  questions: quizQuestions,
  passMark: 80,
  status: "ASSIGNED",
  progress: 0,
  completedLessons: [],
  dueAt: "2026-11-11T00:00:00.000Z",
  reasons: ["Read-only design example"],
  latestScore: null,
  bestScore: null,
  passed: false,
  attempts: [],
};
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (process.env.NEXT_PUBLIC_STATIC_PREVIEW !== "1")
    return fetch(input, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
    });
  const url = new URL(input, window.location.origin),
    method = init?.method || "GET";
  if (method !== "GET")
    return Response.json(
      {
        error:
          "This is a read-only screen preview. Start the server application to sign in, save records, submit quizzes or use the chatbot.",
      },
      { status: 503 },
    );
  if (url.pathname === "/api/session")
    return Response.json({ user: previewActor });
  if (url.pathname === "/api/dashboard")
    return Response.json({
      user: previewActor,
      opportunities,
      contracts: [],
      liveAI: false,
    });
  if (url.pathname === "/api/training")
    return Response.json({ courses: [previewCourse] });
  if (url.pathname === "/api/assistant")
    return Response.json({ sessionId: null, messages: [] });
  if (url.pathname === "/api/crm")
    return Response.json({
      accounts: [],
      contacts: [],
      assets: [],
      warranties: [],
      leads: [],
    });
  return Response.json(
    { error: "Screen not included in this static preview." },
    { status: 404 },
  );
}
