import { NextResponse } from "next/server";
import { z } from "zod";
import {
  currentActor,
  signIn,
  signOut,
  assertSameOrigin,
  SESSION_COOKIE,
} from "@/lib/auth";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return NextResponse.json(
      { user: currentActor(req) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        user: null,
        defaultDemoPasswords: !(
          process.env.INTERNAL_DEMO_PASSWORD || process.env.DEALER_DEMO_PASSWORD
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const input = z
      .object({
        email: z.email().max(200),
        password: z.string().min(1).max(200),
      })
      .parse(await req.json());
    const { actor, token } = signIn(
      input.email,
      input.password,
      req.headers.get("x-forwarded-for")?.split(",")[0] || "local",
    );
    const res = NextResponse.json({ user: actor });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 12 * 3600,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    signOut(req);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
