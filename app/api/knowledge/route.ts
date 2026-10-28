import { NextResponse } from "next/server";
import { currentActor, assertSameOrigin } from "@/lib/auth";
import {
  availableArticles,
  publishArticle,
  managedArticles,
} from "@/lib/knowledge";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = currentActor(req);
    return NextResponse.json(
      {
        articles:
          actor.role === "INTERNAL_ADMIN"
            ? managedArticles(actor)
            : availableArticles(actor),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json(
      publishArticle(await req.json(), currentActor(req)),
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
