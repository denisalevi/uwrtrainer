import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import {
  isTrainer,
  SETTING_INCLUDE_PULL,
  DEFAULT_INCLUDE_PULL,
  SETTING_WARMUP_SCHEME,
  SETTING_BBB,
  parseWarmupScheme,
  parseBbbConfig,
} from "@/lib/constants";
import { setLocale } from "@/app/actions/settings";
import {
  updateLeaderboards,
  updateStrengthIncludePull,
  updateStrengthWarmup,
  updateStrengthBbb,
} from "@/app/actions/trainer";
import { logout } from "@/app/actions/auth";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Button, Card, CardBody, Input, Label, Select, SectionTitle } from "@/components/ui";
import { versionLabel } from "@/lib/version";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t, locale } = await getServerT();
  const trainer = isTrainer(user.role);
  const boards = trainer
    ? await prisma.leaderboard.findMany({ orderBy: { sortOrder: "asc" } })
    : [];
  const [pullSetting, warmupSetting, bbbSetting] = trainer
    ? await Promise.all([
        prisma.setting.findUnique({ where: { key: SETTING_INCLUDE_PULL } }),
        prisma.setting.findUnique({ where: { key: SETTING_WARMUP_SCHEME } }),
        prisma.setting.findUnique({ where: { key: SETTING_BBB } }),
      ])
    : [null, null, null];
  const includePull = pullSetting ? pullSetting.value !== "false" : DEFAULT_INCLUDE_PULL;
  // Pad the parsed scheme to a fixed 3 rows for the form (blank rows are dropped on save).
  const warmup = parseWarmupScheme(warmupSetting?.value);
  const warmupRows = Array.from({ length: 3 }, (_, i) => warmup[i] ?? null);
  const bbb = parseBbbConfig(bbbSetting?.value);

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

          {/* Warm-up ramp (prepended before the working sets when logging weighted lifts) */}
          <form action={updateStrengthWarmup}>
            <Card>
              <CardBody className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t("set.warmupTitle")}</p>
                  <p className="text-xs text-slate-500">{t("set.warmupHint")}</p>
                </div>
                {warmupRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-slate-500">
                      {t("strength.set")} {i + 1}
                    </span>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      inputMode="numeric"
                      className="w-20"
                      name={`warmupPct${i + 1}`}
                      defaultValue={row ? String(row.pct) : ""}
                      aria-label={t("set.warmupPct")}
                    />
                    <span className="text-xs text-slate-500">% × </span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      inputMode="numeric"
                      className="w-20"
                      name={`warmupReps${i + 1}`}
                      defaultValue={row ? String(row.reps) : ""}
                      aria-label={t("set.warmupReps")}
                    />
                    <span className="text-xs text-slate-500">{t("strength.reps").toLowerCase()}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Button type="submit" className="mt-3 w-full">
              {t("common.save")}
            </Button>
          </form>

          {/* "Boring But Big" — the assistance set the logger adds one-per-click */}
          <form action={updateStrengthBbb}>
            <Card>
              <CardBody className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t("set.bbbTitle")}</p>
                  <p className="text-xs text-slate-500">{t("set.bbbHint")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    className="w-20"
                    name="bbbPct"
                    defaultValue={String(bbb.pct)}
                    aria-label={t("set.bbbPct")}
                  />
                  <span className="text-xs text-slate-500">% × </span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    inputMode="numeric"
                    className="w-20"
                    name="bbbReps"
                    defaultValue={String(bbb.reps)}
                    aria-label={t("set.bbbReps")}
                  />
                  <span className="text-xs text-slate-500">{t("strength.reps").toLowerCase()}</span>
                </div>
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
