import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { requireTrainer } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { addSlot, setSlotActive, updateSlot } from "@/app/actions/trainer";
import { PRACTICE_TIERS } from "@/lib/constants";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Card, CardBody, Button, Badge, Input, Label, Select, SectionTitle, cn } from "@/components/ui";

/** A Date -> yyyy-mm-dd (local) for a <input type="date"> default value; "" when null. */
function toInputDate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function PracticesPage() {
  const user = await requireTrainer();
  const { t } = await getServerT();
  const slots = await prisma.practiceSlot.findMany({
    where: { teamId: user.activeTeamId ?? "" },
    orderBy: [{ active: "desc" }, { dayOfWeek: "asc" }],
  });

  return (
    <div className="space-y-5">
      <header>
        <Link href="/settings" className="text-sm text-teal-700">
          ← {t("set.title")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t("slots.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("slots.intro")}</p>
      </header>

      <section className="space-y-2">
        <SectionTitle>{t("slots.add")}</SectionTitle>
        <Card>
          <CardBody>
            <form action={addSlot} className="space-y-3">
              <div>
                <Label htmlFor="label">{t("slots.label")}</Label>
                <Input id="label" name="label" placeholder={t("slots.labelPlaceholder")} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="dayOfWeek">{t("slots.day")}</Label>
                  <Select id="dayOfWeek" name="dayOfWeek" defaultValue="2">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {t(`day.${d}` as DictKey)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="time">{t("slots.time")}</Label>
                  <Input id="time" name="time" placeholder="19:00" />
                </div>
              </div>
              <div>
                <Label htmlFor="tier">{t("slots.tier")}</Label>
                <Select id="tier" name="tier" defaultValue="SECONDARY">
                  {PRACTICE_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {t(`tier.${tier}` as DictKey)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="validFrom">{t("slots.from")}</Label>
                  <Input id="validFrom" name="validFrom" type="date" />
                </div>
                <div>
                  <Label htmlFor="validTo">{t("slots.until")}</Label>
                  <Input id="validTo" name="validTo" type="date" />
                </div>
              </div>
              <p className="text-xs text-slate-400">{t("slots.dateHint")}</p>
              <Button type="submit" className="w-full">
                {t("common.add")}
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>

      <section className="space-y-2">
        <SectionTitle>{t("slots.title")}</SectionTitle>
        {slots.length === 0 ? (
          <p className="text-sm text-slate-500">{t("slots.none")}</p>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {slots.map((s) => (
                <li key={s.id} className={cn("flex flex-col gap-3 px-4 py-3", !s.active && "opacity-50")}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{s.label}</span>
                        <Badge tone={s.tier === "PRIMARY" ? "teal" : "slate"}>
                          {t(`tier.${s.tier}` as DictKey)}
                        </Badge>
                        {!s.active && <Badge tone="red">{t("slots.paused")}</Badge>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t(`day.${s.dayOfWeek}` as DictKey)}
                        {s.time ? ` · ${s.time}` : ""}
                      </div>
                      <div className="text-xs text-slate-400">
                        {!s.validFrom && !s.validTo
                          ? t("slots.allSeason")
                          : s.validFrom && s.validTo
                            ? `${fmtDate(s.validFrom)} – ${fmtDate(s.validTo)}`
                            : s.validFrom
                              ? `${t("slots.from")} ${fmtDate(s.validFrom)}`
                              : `${t("slots.until")} ${fmtDate(s.validTo as Date)}`}
                      </div>
                    </div>
                    <form action={setSlotActive}>
                      <input type="hidden" name="slotId" value={s.id} />
                      <input type="hidden" name="active" value={(!s.active).toString()} />
                      <Button type="submit" variant={s.active ? "ghost" : "secondary"} size="sm">
                        {s.active ? t("slots.deactivate") : t("slots.activate")}
                      </Button>
                    </form>
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-teal-700">
                      {t("common.edit")}
                    </summary>
                    <form action={updateSlot} className="mt-3 space-y-3">
                      <input type="hidden" name="slotId" value={s.id} />
                      <div>
                        <Label htmlFor={`label-${s.id}`}>{t("slots.label")}</Label>
                        <Input
                          id={`label-${s.id}`}
                          name="label"
                          defaultValue={s.label}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`dayOfWeek-${s.id}`}>{t("slots.day")}</Label>
                          <Select
                            id={`dayOfWeek-${s.id}`}
                            name="dayOfWeek"
                            defaultValue={String(s.dayOfWeek)}
                          >
                            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                              <option key={d} value={d}>
                                {t(`day.${d}` as DictKey)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`time-${s.id}`}>{t("slots.time")}</Label>
                          <Input
                            id={`time-${s.id}`}
                            name="time"
                            placeholder="19:00"
                            defaultValue={s.time ?? ""}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`tier-${s.id}`}>{t("slots.tier")}</Label>
                        <Select id={`tier-${s.id}`} name="tier" defaultValue={s.tier}>
                          {PRACTICE_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {t(`tier.${tier}` as DictKey)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`validFrom-${s.id}`}>{t("slots.from")}</Label>
                          <Input
                            id={`validFrom-${s.id}`}
                            name="validFrom"
                            type="date"
                            defaultValue={toInputDate(s.validFrom)}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`validTo-${s.id}`}>{t("slots.until")}</Label>
                          <Input
                            id={`validTo-${s.id}`}
                            name="validTo"
                            type="date"
                            defaultValue={toInputDate(s.validTo)}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{t("slots.dateHint")}</p>
                      <Button type="submit" size="sm" className="w-full">
                        {t("common.save")}
                      </Button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
