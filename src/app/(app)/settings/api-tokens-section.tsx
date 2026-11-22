import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/dal";
import { listApiTokens } from "@/lib/api-token-store";
import { revokeApiToken } from "@/app/actions/api-tokens";
import { ApiTokenCreateForm } from "@/components/api-token-create-form";
import { Badge, Button } from "@/components/ui";

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/**
 * Admin: read-only API tokens for machine clients (e.g. the team's chat bot). A token reads
 * ONE team's activity feed via GET /api/v1/feed and nothing else.
 */
export async function ApiTokensSection({ user }: { user: CurrentUser }) {
  const { t } = await getServerT();
  const [tokens, teams] = await Promise.all([
    listApiTokens(),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t("apiTokens.intro")}</p>
      <p className="text-xs text-slate-500">
        <code className="rounded bg-slate-100 px-1">GET /api/v1/feed?since=YYYY-MM-DD&amp;until=YYYY-MM-DD</code>
        {" · "}
        <code className="rounded bg-slate-100 px-1">GET /api/v1/goals?period=month&amp;date=YYYY-MM-DD</code>
        {" · "}
        <code className="rounded bg-slate-100 px-1">Authorization: Bearer uwr_…</code>
      </p>

      <ApiTokenCreateForm teams={teams} defaultTeamId={user.activeTeamId} />

      {tokens.length === 0 ? (
        <p className="text-sm text-slate-500">{t("apiTokens.none")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tokens.map((tok) => (
            <li key={tok.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                  <span className="truncate">{tok.name}</span>
                  {tok.revokedAt ? (
                    <Badge tone="red">{t("apiTokens.revoked")}</Badge>
                  ) : (
                    <Badge tone="green">{t("apiTokens.active")}</Badge>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  <code>{tok.prefix}…</code> · {tok.team.name} · {tok.scope}
                </p>
                <p className="text-xs text-slate-400">
                  {t("apiTokens.createdAt", { date: fmt(tok.createdAt), by: tok.createdBy?.name ?? "—" })}
                  {" · "}
                  {t("apiTokens.lastUsed", { date: fmt(tok.lastUsedAt) })}
                  {tok.revokedAt ? ` · ${t("apiTokens.revokedAt", { date: fmt(tok.revokedAt) })}` : ""}
                </p>
              </div>
              {!tok.revokedAt && (
                <form action={revokeApiToken}>
                  <input type="hidden" name="id" value={tok.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {t("apiTokens.revoke")}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
