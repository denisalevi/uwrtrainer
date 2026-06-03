import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { isTrainer, SETTING_INCLUDE_PULL, DEFAULT_INCLUDE_PULL } from "@/lib/constants";
import { setLocale } from "@/app/actions/settings";
import { updateLeaderboards, updateStrengthIncludePull } from "@/app/actions/trainer";
import { logout } from "@/app/actions/auth";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Button, Card, CardBody, Label, Select, SectionTitle } from "@/components/ui";
import { versionLabel } from "@/lib/version";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t, locale } = await getServerT();
  const trainer = isTrainer(user.role);
  const boards = trainer
    ? await prisma.leaderboard.findMany({ orderBy: { sortOrder: "asc" } })
    : [];
  const pullSetting = trainer
    ? await prisma.setting.findUnique({ where: { key: SETTING_INCLUDE_PULL } })
    : null;
  const includePull = pullSetting ? pullSetting.value !== "false" : DEFAULT_INCLUDE_PULL;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t("set.title")}</h1>

      {/* Language */}
      <section className="space-y-2">
        <SectionTitle>{t("set.language")}</SectionTitle>
        <Card>
          <CardBody>
            <form action={setLocale} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="locale">{t("set.language")}</Label>
                <Select id="locale" name="locale" defaultValue={locale}>
                  <option value="en">{t("set.english")}</option>
                  <option value="de">{t("set.german")}</option>
                </Select>
              </div>
              <Button type="submit">{t("common.save")}</Button>
            </form>
          </CardBody>
        </Card>
      </section>

      {/* Leaderboard settings (trainers) */}
      {trainer && (
        <section className="space-y-2">
          <SectionTitle>{t("set.leaderboards")}</SectionTitle>
          <p className="text-xs text-slate-500">{t("set.leaderboardsIntro")}</p>
          <form action={updateLeaderboards}>
            <Card>
              <CardBody className="space-y-4">
                {boards.map((b) => (
                  <div key={b.id} className="space-y-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        name={`enabled_${b.id}`}
                        defaultChecked={b.enabled}
                        className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                      />
                      <span className="flex-1 text-sm font-medium text-slate-800">
                        {t(`lb.metric.${b.metric}` as DictKey)}
                      </span>
                    </label>
                    <div className="pl-8">
                      <Label htmlFor={`visibility_${b.id}`}>{t("set.visibility")}</Label>
                      <Select id={`visibility_${b.id}`} name={`visibility_${b.id}`} defaultValue={b.visibility}>
                        <option value="TRAINERS_ONLY">{t("set.trainersOnly")}</option>
                        <option value="EVERYONE">{t("set.everyone")}</option>
                      </Select>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Button type="submit" className="mt-3 w-full">
              {t("common.save")}
            </Button>
          </form>
          <Link href="/team/practices" className="block">
            <Button variant="secondary" className="w-full">
              {t("slots.title")} →
            </Button>
          </Link>
        </section>
      )}

      {/* Strength program settings (trainers) */}
      {trainer && (
        <section className="space-y-2">
          <SectionTitle>{t("set.strengthSection")}</SectionTitle>
          <form action={updateStrengthIncludePull}>
            <Card>
              <CardBody className="space-y-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="includePull"
                    defaultChecked={includePull}
                    className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                  />
                  <span className="flex-1 text-sm font-medium text-slate-800">{t("set.includePull")}</span>
                </label>
                <p className="pl-8 text-xs text-slate-500">{t("set.includePullHint")}</p>
              </CardBody>
            </Card>
            <Button type="submit" className="mt-3 w-full">
              {t("common.save")}
            </Button>
          </form>
        </section>
      )}

      {/* Account */}
      <section className="space-y-2">
        <SectionTitle>{t("set.account")}</SectionTitle>
        <Card>
          <CardBody className="space-y-3">
            <div>
              <p className="font-medium text-slate-800">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
            <form action={logout}>
              <Button type="submit" variant="danger" className="w-full">
                {t("auth.logout")}
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>

      <p className="pt-2 text-center text-xs text-slate-400">UWR Trainer {versionLabel()}</p>
    </div>
  );
}
