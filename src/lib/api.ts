import { NextResponse } from "next/server";
import { HttpError } from "./session";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a route handler so thrown HttpErrors and DB errors become clean JSON. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      const pg = err as { code?: string; constraint?: string; message?: string };
      if (pg?.code === "23505") return fail(409, "That record already exists.");
      if (pg?.code === "23503") {
        // Distinguish "you pointed at something that is gone" from "something
        // else still points at this" — they need very different fixes.
        const missing = pg.constraint?.includes("image")
          ? "That image is no longer available. Upload it again."
          : "A record this refers to no longer exists. Refresh the page and try again.";
        return fail(409, missing);
      }
      if (pg?.code === "23514") return fail(400, "One of the values is outside the allowed range.");
      console.error("[api]", err);
      return fail(500, pg?.message ?? "Something went wrong");
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
