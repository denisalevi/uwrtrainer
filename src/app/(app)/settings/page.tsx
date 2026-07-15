import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { isTrainer, parseWarmupScheme, parseBbbConfig } from "@/lib/constants";
import {
  setLocale,
  setRestTimerSettings,
  setWeightRounding,
  setStrengthWarmup,
  setStrengthBbb,
  setStrengthPulls,
} from "@/app/actions/settings";
import { createTeam, updateLeaderboards, setTournamentExemption } from "@/app/actions/trainer";
import { getTournamentExemptionMode } from "@/lib/exempt-weeks";
import { logout } from "@/app/actions/auth";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Collapsible, Input, Label, Select, SectionTitle, cn } from "@/components/ui";
import { versionLabel } from "@/lib/version";
import { TeamsSection, AdminTeamMembers, AdminUserManagement } from "./teams-section";
import { PracticeSlotsSettings } from "./practice-slots";

/** A titled group of collapsible settings cards; trainer/admin groups get a coloured accent. */
function SettingsGroup({
  title,
  badge,
  accent,
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  accent?: "amber" | "red";
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <SectionTitle>{title}</SectionTitle>
        {badge}
      </div>
      <div
        className={cn(
          "space-y-2",
          accent === "amber" && "border-l-2 border-amber-300 pl-2",
          accent === "red" && "border-l-2 border-red-300 pl-2",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ joinError?: string }>;
}) {
  const user = await requireUser();
  const { joinError } = await searchParams;
  const { t, locale } = await getServerT();
  const trainer = isTrainer(user.role);
  const admin = user.role === "ADMIN";
  const boards = trainer
    ? await prisma.leaderboard.findMany({ orderBy: { sortOrder: "asc" } })
    : [];
  const tournamentExemption = trainer ? await getTournamentExemptionMode() : null;
  // Pad the parsed scheme to a fixed 3 rows for the form (blank rows are dropped on save).
  const warmup = parseWarmupScheme(user.strengthWarmup);
  const warmupRows = Array.from({ length: 3 }, (_, i) => warmup[i] ?? null);
  const bbb = parseBbbConfig(user.strengthBbb);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t("set.title")}</h1>

      {/* Personal (per-user) */}
      <SettingsGroup title={t("set.groupPersonal")}>
        <Collapsible title={t("set.language")}>
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
        </Collapsible>

        <Collapsible title={t("set.account")} hint={user.email ?? user.name}>
          <div className="space-y-3">
            <div>
              <p className="font-medium text-slate-800">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
            <form action={logout}>
              <Button type="submit" variant="danger" className="w-full">
                {t("auth.logout")}
              </Button>
            </form>
          </div>
        </Collapsible>
      </SettingsGroup>

      {/* Strength program (per-user logging prefs) */}
      <SettingsGroup title={t("set.groupStrength")}>
        <Collapsible title={t("set.restTimer")} hint={t("set.restTimerIntro")}>
          <form action={setRestTimerSettings} className="space-y-3">
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="restTimerEnabled"
                  defaultChecked={user.restTimerEnabled}
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                />
                <span className="flex-1 text-sm font-medium text-slate-800">{t("set.restTimerEnable")}</span>
              </label>
              <p className="pl-8 text-xs text-slate-500">{t("set.restTimerEnableHint")}</p>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="restTimerBeep"
                  defaultChecked={user.restTimerBeep}
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                />
                <span className="flex-1 text-sm font-medium text-slate-800">{t("set.restTimerBeep")}</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="restTimerVibrate"
                  defaultChecked={user.restTimerVibrate}
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                />
                <span className="flex-1 text-sm font-medium text-slate-800">{t("set.restTimerVibrate")}</span>
              </label>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div>
                <Label htmlFor="restWarmupSeconds">{t("set.restWarmupSeconds")}</Label>
                <Input
                  id="restWarmupSeconds"
                  type="number"
                  min={0}
                  max={900}
                  inputMode="numeric"
                  name="restWarmupSeconds"
                  defaultValue={String(user.restWarmupSeconds)}
                />
              </div>
              <div>
                <Label htmlFor="restMainSeconds">{t("set.restMainSeconds")}</Label>
                <Input
                  id="restMainSeconds"
                  type="number"
                  min={0}
                  max={900}
                  inputMode="numeric"
                  name="restMainSeconds"
                  defaultValue={String(user.restMainSeconds)}
                />
              </div>
              <div>
                <Label htmlFor="restBbbSeconds">{t("set.restBbbSeconds")}</Label>
                <Input
                  id="restBbbSeconds"
                  type="number"
                  min={0}
                  max={900}
                  inputMode="numeric"
                  name="restBbbSeconds"
                  defaultValue={String(user.restBbbSeconds)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full">
              {t("common.save")}
            </Button>
          </form>
        </Collapsible>

        <Collapsible title={t("set.weightRounding")} hint={t("set.weightRoundingIntro")}>
          <form action={setWeightRounding} className="space-y-3">
            <div>
              <Label htmlFor="weightRounding">{t("set.weightRoundingMode")}</Label>
              <Select id="weightRounding" name="weightRounding" defaultValue={user.weightRounding}>
                <option value="DOWN">{t("set.roundingDown")}</option>
                <option value="NEAREST">{t("set.roundingNearest")}</option>
                <option value="UP">{t("set.roundingUp")}</option>
                <option value="EXACT">{t("set.roundingExact")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="weightIncrement">{t("set.weightIncrement")}</Label>
              <Input
                id="weightIncrement"
                type="number"
                min={0.25}
                max={25}
                step={0.25}
                inputMode="decimal"
                name="weightIncrement"
                defaultValue={String(user.weightIncrement)}
              />
            </div>
            <Button type="submit" className="w-full">
              {t("common.save")}
            </Button>
          </form>
        </Collapsible>

        {/* Optional pull slots (vertical / horizontal) in the auto-laid-out plan */}
        <Collapsible title={t("set.pullsTitle")} hint={t("set.pullsHint")}>
          <form action={setStrengthPulls} className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="pullups"
                defaultChecked={user.strengthPullups}
                className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
              />
              <span className="flex-1 text-sm font-medium text-slate-800">{t("set.includePullups")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="rows"
                defaultChecked={user.strengthRows}
                className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
              />
              <span className="flex-1 text-sm font-medium text-slate-800">{t("set.includeRows")}</span>
            </label>
            <p className="text-xs text-slate-500">{t("set.pullsNote")}</p>
            <Button type="submit" className="w-full">
              {t("common.save")}
            </Button>
          </form>
        </Collapsible>

        {/* Warm-up ramp (prepended before the working sets when logging weighted lifts) */}
        <Collapsible title={t("set.warmupTitle")} hint={t("set.warmupHint")}>
          <form action={setStrengthWarmup} className="space-y-3">
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
            <Button type="submit" className="w-full">
              {t("common.save")}
            </Button>
          </form>
        </Collapsible>

        {/* "Boring But Big" — the assistance set the logger adds one-per-click */}
        <Collapsible title={t("set.bbbTitle")} hint={t("set.bbbHint")}>
          <form action={setStrengthBbb} className="space-y-3">
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
            <Button type="submit" className="w-full">
              {t("common.save")}
            </Button>
          </form>
        </Collapsible>
      </SettingsGroup>

      {/* Teams (all users) */}
      <SettingsGroup title={t("teams.title")}>
        <Collapsible title={t("teams.title")} hint={t("teams.sectionHint")} defaultOpen={Boolean(joinError)}>
          <TeamsSection user={user} joinErrorTeamId={joinError} />
        </Collapsible>
      </SettingsGroup>

      {/* Trainer settings (team-wide) */}
      {trainer && (
        <SettingsGroup
          title={t("set.groupTrainer")}
          badge={<Badge tone="amber">{t("set.groupTrainerBadge")}</Badge>}
          accent="amber"
        >
          <Collapsible title={t("slots.title")} hint={t("slots.intro")}>
            <PracticeSlotsSettings teamId={user.activeTeamId} />
          </Collapsible>

          <Collapsible title={t("set.leaderboards")} hint={t("set.leaderboardsIntro")}>
            <form action={updateLeaderboards} className="space-y-4">
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
              <Button type="submit" className="w-full">
                {t("common.save")}
              </Button>
            </form>
          </Collapsible>

          <Collapsible title={t("set.tournament")} hint={t("set.tournamentIntro")}>
            <form action={setTournamentExemption} className="space-y-3">
              <div>
                <Label htmlFor="tournamentExemption">{t("set.tournamentExemption")}</Label>
                <Select
                  id="tournamentExemption"
                  name="tournamentExemption"
                  defaultValue={tournamentExemption ?? "WEEK_OF"}
                >
                  <option value="WEEK_OF">{t("set.tournamentWeekOf")}</option>
                  <option value="WEEK_OF_AND_AFTER">{t("set.tournamentWeekOfAndAfter")}</option>
                  <option value="NONE">{t("set.tournamentNone")}</option>
                </Select>
              </div>
              <p className="text-xs text-slate-500">{t("set.tournamentNote")}</p>
              <Button type="submit" className="w-full">
                {t("common.save")}
              </Button>
            </form>
          </Collapsible>
        </SettingsGroup>
      )}

      {/* Admin */}
      {admin && (
        <SettingsGroup
          title={t("set.groupAdmin")}
          badge={<Badge tone="red">{t("set.groupAdminBadge")}</Badge>}
          accent="red"
        >
          <Collapsible title={t("teams.manageMembers")} hint={t("teams.manageMembersHint")}>
            <AdminTeamMembers />
          </Collapsible>

          <Collapsible title={t("users.manageTitle")} hint={t("users.manageHint")}>
            <AdminUserManagement currentUserId={user.id} />
          </Collapsible>

          <Collapsible title={t("teams.create")}>
            <form action={createTeam} className="space-y-2">
              <div>
                <Label htmlFor="teamName">{t("teams.name")}</Label>
                <Input id="teamName" name="name" required />
              </div>
              <div>
                <Label htmlFor="teamCode">{t("teams.codeOptional")}</Label>
                <Input id="teamCode" name="registrationCode" autoComplete="off" />
              </div>
              <Button type="submit" variant="secondary">
                {t("teams.create")}
              </Button>
            </form>
          </Collapsible>
        </SettingsGroup>
      )}

      <p className="pt-2 text-center text-xs text-slate-400">UWR Trainer {versionLabel()}</p>
    </div>
  );
}
