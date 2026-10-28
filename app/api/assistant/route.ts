import { NextResponse } from "next/server";
import { z } from "zod";
import { answerSalesQuestion } from "@/lib/ai";
import { currentActor, assertSameOrigin } from "@/lib/auth";
import {
  retrieveKnowledge,
  openChat,
  chatHistory,
  saveChatMessage,
} from "@/lib/knowledge";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("sessionId") || undefined;
    return NextResponse.json(chatHistory(currentActor(req), id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = currentActor(req),
      input = z
        .object({
          question: z.string().trim().min(1).max(2000),
          sessionId: z.string().min(1).max(100).optional(),
        })
        .strict()
        .parse(await req.json()),
      sessionId = openChat(actor, input.sessionId),
      history = chatHistory(actor, sessionId).messages,
      sources = retrieveKnowledge(actor, input.question),
      live = Boolean(
        process.env.OPENAI_API_KEY || process.env.DEALER_OPENAI_API_KEY,
      );
    saveChatMessage(sessionId, "user", input.question, [], "user");
    const result = !sources.length
      ? {
          mode: "no_sources",
          answer:
            "I could not find approved guidance for that question. Please check the exact vehicle and market with the training team. This assistant answers training questions; it cannot access individual customer records, determine warranty eligibility or change business data.",
          sources: [],
        }
      : live
        ? {
            mode: "live",
            ...(await answerSalesQuestion(input.question, actor, history)),
          }
        : {
            mode: "sample",
            answer:
              "Prepared coaching guidance — not a live AI response.\n\n" +
              sources.map((s) => `${s.text} [${s.id}]`).join("\n\n"),
            sources: sources.map(({ id, title, version, status }) => ({
              id,
              title,
              version,
              status,
            })),
          };
    saveChatMessage(
      sessionId,
      "assistant",
      result.answer,
      result.sources,
      result.mode,
      live && result.mode === "live"
        ? process.env.OPENAI_MODEL || "gpt-4.1-mini"
        : undefined,
    );
    return NextResponse.json({ ...result, sessionId });
  } catch (e) {
    return errorResponse(e);
  }
}
