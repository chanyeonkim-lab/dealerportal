import { NextResponse } from "next/server";
import { listOpportunities } from "@/lib/crm";
import { listContracts } from "@/lib/db";
import { currentActor } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = currentActor(req);
    return NextResponse.json(
      {
        user: actor,
        opportunities: listOpportunities(actor),
        contracts: listContracts(actor),
        liveAI: Boolean(
          process.env.OPENAI_API_KEY || process.env.DEALER_OPENAI_API_KEY,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
