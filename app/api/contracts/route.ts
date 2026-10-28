import { NextResponse } from "next/server";
import { createContract, listContracts, opportunityAllowed } from "@/lib/db";
import { sampleExtraction, saveContractSchema } from "@/lib/domain";
import { extractContract } from "@/lib/ai";
import { currentActor, assertSameOrigin } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return NextResponse.json(
      { contracts: listContracts(currentActor(req)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = currentActor(request);
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      if (body.action === "sample") {
        if (!opportunityAllowed(actor, body.opportunityId || "opp-001"))
          throw new AppError("Opportunity not found.", 404);
        return NextResponse.json({
          result: sampleExtraction,
          source: "sample",
        });
      }
      const parsed = saveContractSchema.parse(body);
      return NextResponse.json(
        { id: createContract(parsed, actor) },
        { status: 201 },
      );
    }
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new AppError("Maximum document size is 10 MB.", 413);
    const form = await request.formData();
    if (
      !opportunityAllowed(actor, String(form.get("opportunityId") || "opp-001"))
    )
      throw new AppError("Opportunity not found.", 404);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    )
      throw new AppError("Choose a JPG, PNG or PDF up to 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer()),
      mime =
        bytes.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
            ? "image/jpeg"
            : bytes
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              ? "image/png"
              : null;
    if (!mime)
      throw new AppError("Unsupported document. Use a valid JPG, PNG or PDF.");
    if (!(process.env.OPENAI_API_KEY || process.env.DEALER_OPENAI_API_KEY))
      throw new AppError(
        "Live extraction needs an API key on the server. Use the prepared example.",
        503,
      );
    return NextResponse.json({
      result: await extractContract(bytes, mime),
      source: "live",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
