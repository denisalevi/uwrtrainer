import { prisma } from "@/lib/db";
import { getServerT } from "@/lib/i18n/server";
import { DEFAULT_TEAM_ID } from "@/lib/constants";
import type { CurrentUser } from "@/lib/dal";
import { joinTeam } from "@/app/actions/settings";
import { addUserToTeam, removeUserFromTeam } from "@/app/actions/trainer";
import { Badge, Button, Input, Label, Select } from "@/components/ui";

/**
 * The teams list every user sees: all teams, with a fold-open join form per team.
 * Members (and admins, for every team) also see the team's join code.
 */
export async function TeamsSection({
  user,
  joinErrorTeamId,
}: {
  user: CurrentUser;
  joinErrorTeamId?: string;
}) {
  const { t } = await getServerT();
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, registrationCode: true },
    orderBy: { createdAt: "asc" },
  });
  const envCode = process.env.REGISTRATION_CODE?.trim() || null;
  const admin = user.role === "ADMIN";

  return (
    <ul className="divide-y divide-slate-100">
      {teams.map((team) => {
        const member = user.teamIds.includes(team.id);
        const code =
          team.registrationCode?.trim() || (team.id === DEFAULT_TEAM_ID ? envCode : null);
        const openTeam = code === null && team.id === DEFAULT_TEAM_ID;
        const codeLine =
          member || admin ? (
            <p className="mt-1 text-xs text-slate-500">
              {code ? (
                <>
                  {t("teams.code")}:{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
                    {code}
                  </code>
                </>
              ) : openTeam ? (
                t("teams.openTeam")
              ) : (
                t("teams.noCodeSet")
              )}
            </p>
          ) : null;

        if (member) {
          return (
            <li key={team.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium text-slate-800">{team.name}</span>
                <Badge tone="teal">{t("teams.member")}</Badge>
              </div>
              {codeLine}
            </li>
          );
        }

        // Admins can join any team directly (no code needed).
        if (admin) {
          return (
            <li key={team.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium text-slate-800">{team.name}</span>
                <form action={joinTeam}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {t("teams.joinButton")}
                  </Button>
                </form>
              </div>
              {codeLine}
            </li>
          );
        }

        return (
          <li key={team.id} className="py-3 first:pt-0 last:pb-0">
            <details open={joinErrorTeamId === team.id}>
              <summary className="flex cursor-pointer select-none items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-sm font-medium text-slate-800">{team.name}</span>
                <span className="text-xs font-medium text-teal-700">
                  {t("teams.joinButton")} →
                </span>
              </summary>
              <div className="mt-2">
                {code !== null ? (
                  <form action={joinTeam} className="flex items-end gap-2">
                    <input type="hidden" name="teamId" value={team.id} />
                    <div className="flex-1">
                      <Label htmlFor={`code-${team.id}`}>{t("teams.code")}</Label>
                      <Input id={`code-${team.id}`} name="code" autoComplete="off" required />
                    </div>
                    <Button type="submit" variant="secondary">
                      {t("teams.joinButton")}
                    </Button>
                  </form>
                ) : openTeam ? (
                  <form action={joinTeam} className="space-y-2">
                    <input type="hidden" name="teamId" value={team.id} />
                    <p className="text-xs text-slate-500">{t("teams.openTeam")}</p>
                    <Button type="submit" variant="secondary" size="sm">
                      {t("teams.joinButton")}
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-slate-500">{t("teams.noCodeSet")}</p>
                )}
                {joinErrorTeamId === team.id && (
                  <p className="mt-2 text-xs font-medium text-red-600">{t("teams.wrongCode")}</p>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** Admin-only: every team with its member list — remove members or add any existing user. */
export async function AdminTeamMembers() {
  const { t } = await getServerT();
  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        memberships: {
          select: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      {teams.map((team) => {
        const memberIds = new Set(team.memberships.map((m) => m.user.id));
        const addable = users.filter((u) => !memberIds.has(u.id));
        return (
          <div key={team.id} className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{team.name}</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {team.memberships.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-400">{t("teams.noMembers")}</li>
              )}
              {team.memberships.map(({ user: m }) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{m.name}</span>
                  {m.role !== "PLAYER" && <Badge tone="teal">{m.role}</Badge>}
                  <form action={removeUserFromTeam}>
                    <input type="hidden" name="userId" value={m.id} />
                    <input type="hidden" name="teamId" value={team.id} />
                    <Button type="submit" variant="danger" size="sm">
                      {t("teams.removeFromTeam")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            {addable.length > 0 ? (
              <form action={addUserToTeam} className="flex items-end gap-2">
                <input type="hidden" name="teamId" value={team.id} />
                <div className="flex-1">
                  <Label htmlFor={`addUser-${team.id}`}>{t("teams.addUserLabel")}</Label>
                  <Select id={`addUser-${team.id}`} name="userId">
                    {addable.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" variant="secondary">
                  {t("common.add")}
                </Button>
              </form>
            ) : (
              <p className="text-xs text-slate-400">{t("teams.noOtherUsers")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
