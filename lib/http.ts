import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { ZodError } from "zod";
export function errorResponse(error: unknown) {
  const status =
    error instanceof AppError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 500;
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof ZodError
        ? error.issues.map((x) => x.message).join(" ")
        : "The request could not be completed. Please retry.";
  return NextResponse.json({ error: message }, { status });
}
