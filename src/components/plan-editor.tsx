import { prisma } from "@/lib/db";
import { getServerT } from "@/lib/i18n/server";
import { savePlan } from "@/app/actions/training";
import { CATEGORIES, MAX_PLAN_TARGET, type Category, type PlanCadence } from "@/lib/constants";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Button, Card, CardBody, Input, Label, Textarea, Badge, SectionTitle } from "@/components/ui";
import { CustomActivities } from "@/components/custom-activities";

/**
 * Server-rendered plan form. Works without JS (plain form -> savePlan action).
 * Used by the player's own /plan page and by trainers editing a player.
 */
export async function PlanEditor({ userId }: { userId: string }) {
  const { t } = await getServerT();

  const [slots, user, activePlan] = await Promise.all([
    prisma.practiceSlot.findMany({
      where: { active: true, team: { memberships: { some: { userId } } } },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { availabilityNote: true, trainerNote: true },
    }),
    prisma.plan.findFirst({
      where: { userId, validTo: null },
      orderBy: { validFrom: "desc" },
      include: { items: true },
    }),
  ]);

  const items = activePlan?.items ?? [];
  const committedSlotIds = new Set(
    items.filter((i) => i.practiceSlotId).map((i) => i.practiceSlotId as string),
  );
  // No plan yet -> pre-select the mandatory practices.
  if (!activePlan) {
    for (const s of slots) if (s.tier === "PRIMARY") committedSlotIds.add(s.id);
  }
  const catItem = (c: Category) => items.find((i) => i.category === c && !i.practiceSlotId);
  const catTarget = (c: Category) => catItem(c)?.targetPerWeek ?? 0;
  const catCadence = (c: Category): PlanCadence =>
    catItem(c)?.cadence === "MONTH" ? "MONTH" : "WEEK";
  const cadenceSelect = (name: string, value: PlanCadence) => (
    <select
      name={name}
      defaultValue={value}
      aria-label={t("plan.cadence")}
      className="rounded-lg border border-slate-300 bg-white px-1.5 py-2 text-xs text-slate-600"
    >
      <option value="WEEK">{t("plan.perWeek")}</option>
      <option value="MONTH">{t("plan.perMonth")}</option>
    </select>
  );

  // Saved custom OTHER activities (label in `note`) seed the dynamic rows below.
  const otherItems = items
    .filter((i) => i.category === "OTHER")
    .map((i) => ({
      name: i.note ?? "",
      n: i.targetPerWeek,
      cadence: (i.cadence === "MONTH" ? "MONTH" : "WEEK") as PlanCadence,
    }));

  return (
    <form action={savePlan} className="space-y-5">
      <input type="hidden" name="userId" value={userId} />

      <section className="space-y-2">
        <SectionTitle>{t("plan.sessionsPerWeek")}</SectionTitle>
        <p className="text-xs text-slate-500">{t("plan.cadenceHint")}</p>
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex-1">{t("plan.rugbyPerWeek")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  name="cat_RUGBY"
                  min={0}
                  max={MAX_PLAN_TARGET.MONTH}
                  defaultValue={catTarget("RUGBY")}
                  inputMode="numeric"
                  className="w-20 text-center"
                />
                {cadenceSelect("cad_RUGBY", catCadence("RUGBY"))}
              </div>
            </div>
            {CATEGORIES.filter((c) => c !== "RUGBY" && c !== "OTHER").map((c) => (
              <div key={c} className="flex items-center justify-between gap-3">
                <Label className="flex-1">{t(`cat.${c}` as DictKey)}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    name={`cat_${c}`}
                    min={0}
                    max={MAX_PLAN_TARGET.MONTH}
                    defaultValue={catTarget(c)}
                    inputMode="numeric"
                    className="w-20 text-center"
                  />
                  {cadenceSelect(`cad_${c}`, catCadence(c))}
                </div>
              </div>
            ))}
            <CustomActivities initial={otherItems} />
          </CardBody>
        </Card>
      </section>

      <section className="space-y-2">
        <SectionTitle>{t("plan.committedPractices")}</SectionTitle>
        <p className="text-xs text-slate-500">{t("plan.committedPracticesHint")}</p>
        <Card>
          <CardBody className="space-y-1">
            {slots.length === 0 && <p className="text-sm text-slate-500">{t("slots.none")}</p>}
            {slots.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 rounded-lg px-1 py-2.5 active:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name={`slot_${s.id}`}
                  defaultChecked={committedSlotIds.has(s.id)}
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                />
                <span className="flex-1 text-sm text-slate-800">
                  {s.label}
                  <span className="ml-2 text-slate-400">
                    {t(`day.${s.dayOfWeek}` as DictKey)}
                    {s.time ? ` · ${s.time}` : ""}
                  </span>
                </span>
                <Badge tone={s.tier === "PRIMARY" ? "teal" : "slate"}>
                  {t(`tier.${s.tier}` as DictKey)}
                </Badge>
              </label>
            ))}
          </CardBody>
        </Card>
      </section>

      <section className="space-y-2">
        <SectionTitle>{t("plan.availability")}</SectionTitle>
        <p className="text-xs text-slate-500">{t("plan.teamVisibleHint")}</p>
        <Textarea
          name="availabilityNote"
          defaultValue={user?.availabilityNote ?? ""}
          placeholder={t("plan.availabilityPlaceholder")}
        />
      </section>

      <section className="space-y-2">
        <SectionTitle>{t("plan.trainerNote")}</SectionTitle>
        <p className="text-xs text-slate-500">{t("plan.trainerNoteHint")}</p>
        <Textarea
          name="trainerNote"
          defaultValue={user?.trainerNote ?? ""}
          placeholder={t("plan.trainerNotePlaceholder")}
        />
      </section>

      <Button type="submit" className="w-full">
        {t("common.save")}
      </Button>
    </form>
  );
}
