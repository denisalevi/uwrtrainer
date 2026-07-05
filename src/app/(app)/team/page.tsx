import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { isTrainer } from "@/lib/constants";
import { addRosterMember } from "@/app/actions/trainer";
import { getServerT } from "@/lib/i18n/server";
import { getTeamSummary } from "@/lib/stats";
import { Card, CardBody, Badge, ProgressBar, Button, Input, Label, SectionTitle } from "@/components/ui";

export default async function TeamPage() {
  const user = await requireUser();
  const { t } = await getServerT();
  const summary = (await getTeamSummary(user.activeTeamId)).sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("team.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("team.players")}</p>
      </header>

      <Card>
        <ul className="divide-y divide-slate-100">
          {summary.map((p) => (
            <li key={p.userId}>
              <Link href={`/team/${p.userId}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-800">{p.name}</span>
                    {p.role !== "PLAYER" && <Badge tone="teal">{p.role}</Badge>}
                    {!p.claimed && <Badge tone="slate">{t("team.noAccount")}</Badge>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="w-24">
                      <ProgressBar value={p.adherencePct} />
                    </div>
                    <span className="text-xs text-slate-500">
                      {p.hasPlan ? `${Math.round(p.adherencePct * 100)}%` : t("team.noPlan")}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-teal-700">{p.points}</div>
                  <div className="text-[11px] text-slate-400">{t("team.points")}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {isTrainer(user.role) && (
        <section className="space-y-2">
          <SectionTitle>{t("teams.addMember")}</SectionTitle>
          <Card>
            <CardBody>
              <p className="mb-2 text-xs text-slate-500">{t("teams.addMemberHint")}</p>
              <form action={addRosterMember} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="memberName">{t("teams.memberName")}</Label>
                  <Input id="memberName" name="name" required />
                </div>
                <Button type="submit" variant="secondary">
                  {t("teams.addMemberButton")}
                </Button>
              </form>
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}
