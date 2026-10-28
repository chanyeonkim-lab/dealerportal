import { NextResponse } from "next/server";
import { currentActor, assertSameOrigin } from "@/lib/auth";
import { crmData, updateAccount } from "@/lib/crm";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return NextResponse.json(crmData(currentActor(req)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    return NextResponse.json(
      updateAccount(await req.json(), currentActor(req)),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
