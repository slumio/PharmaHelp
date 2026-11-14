import { run, rows, transaction, STORE_ID } from "@/db/sqlite";
export async function rateLimit(
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  try {
    const now = Date.now(),
      duration = windowSeconds * 1000,
      bucket = Math.floor(now / duration),
      expires = (bucket + 1) * duration,
      id = `${STORE_ID}:${scope}:${bucket}`;
    const count = transaction(() => {
      run("DELETE FROM rate_limits WHERE expires_at<?", [now]);
      run(
        "INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1",
        [id, expires],
      );
      return rows<{ count: number }>(
        "SELECT count FROM rate_limits WHERE id=?",
        [id],
      )[0].count;
    });
    return count <= limit
      ? null
      : Response.json(
          {
            error: {
              code: "rate_limited",
              message: "Too many requests. Please wait and try again.",
            },
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(1, Math.ceil((expires - now) / 1000)),
              ),
              "Cache-Control": "no-store",
            },
          },
        );
  } catch {
    return Response.json(
      {
        error: {
          code: "unavailable",
          message: "The database is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
