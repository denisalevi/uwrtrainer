"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { createStrengthProgram } from "@/app/actions/strength";
import {
  EQUIPMENT_LEVELS,
  SESSION_DAY_OPTIONS,
  SESSION_TIME_OPTIONS,
  MOVEMENT_LEVELS,
  type EquipmentLevel,
} from "@/lib/constants";
import { modeForEquipment, programMovements, movementLabel } from "@/lib/strength";
import { Button, Card, CardBody, Input, Label, Select, SectionTitle } from "@/components/ui";

export function StrengthWizard() {
  const { t } = useT();
  const [equipment, setEquipment] = useState<EquipmentLevel>("NONE");
  const mode = modeForEquipment(equipment);
  const movements = programMovements(mode);

  return (
    <form action={createStrengthProgram} className="space-y-5">
      <p className="text-sm text-slate-600">{t("strength.wizardIntro")}</p>

      {/* Equipment */}
      <div>
        <Label htmlFor="equipment">{t("strength.equipment")}</Label>
        <Select
          id="equipment"
          name="equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as EquipmentLevel)}
        >
          {EQUIPMENT_LEVELS.map((eq) => (
            <option key={eq} value={eq}>
              {t(`strength.eq.${eq}` as DictKey)}
            </option>
          ))}
        </Select>
      </div>

      {/* Days & minutes */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="daysPerWeek">{t("strength.days")}</Label>
          <Select id="daysPerWeek" name="daysPerWeek" defaultValue="2">
            {SESSION_DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="minutesPerSession">{t("strength.minutes")}</Label>
          <Select id="minutesPerSession" name="minutesPerSession" defaultValue="45">
            {SESSION_TIME_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} {t("common.minutes")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Optional starting point */}
      <Card>
        <CardBody className="space-y-3">
          <SectionTitle>{t("strength.startTitle")}</SectionTitle>
          <p className="text-sm text-slate-500">
            {mode === "WEIGHTED" ? t("strength.startHintWeighted") : t("strength.startHintBody")}
          </p>

          {mode === "WEIGHTED"
            ? movements.map((m) => (
                <div key={m} className="space-y-1">
                  <Label>{movementLabel(mode, m)}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      name={`weight_${m}`}
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder={t("strength.weight")}
                    />
                    <Input
                      name={`reps_${m}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder={t("strength.reps")}
                    />
                  </div>
                </div>
              ))
            : movements.map((m) => (
                <div key={m} className="space-y-1">
                  <Label>{t(`mv.${m}` as DictKey)}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {mode === "LEVELS" ? (
                      <Select name={`level_${m}`} defaultValue="1">
                        {MOVEMENT_LEVELS[m].map((lvl, i) => (
                          <option key={i} value={i}>
                            {lvl}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <div className="flex items-center text-sm text-slate-600">
                        {movementLabel(mode, m)}
                      </div>
                    )}
                    <Input
                      name={`repmax_${m}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder={t("strength.repMax")}
                    />
                  </div>
                </div>
              ))}
        </CardBody>
      </Card>

      <Button type="submit" className="w-full">
        {t("strength.create")}
      </Button>
    </form>
  );
}
