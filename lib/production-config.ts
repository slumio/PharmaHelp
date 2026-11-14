/** Shared by Edge middleware and server readiness checks; never returns secret values. */
export function productionIssues(env: Record<string, string | undefined> = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (!env.APP_USERNAME) issues.push("APP_USERNAME is required");
  if (!env.APP_PASSWORD || env.APP_PASSWORD.length < 16) issues.push("APP_PASSWORD must contain at least 16 characters");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) issues.push("AUTH_SECRET must contain at least 32 characters");
  if (env.VERCEL) issues.push("SQLite needs persistent storage. Deploy this build on a Docker host with a persistent disk.");
  if (env.APP_ORIGIN && !env.APP_ORIGIN.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.APP_ORIGIN)) issues.push("APP_ORIGIN must use HTTPS outside localhost");
  return issues;
}
