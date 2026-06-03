"use client";

import { useT } from "@/components/i18n-provider";
import { createStrengthProgram } from "@/app/actions/strength";
import { ProgramForm } from "@/components/program-form";
import { defaultDay } from "@/lib/strength";

export function StrengthWizard({ includePull }: { includePull: boolean }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("strength.wizardIntro")}</p>
      <ProgramForm
        action={createStrengthProgram}
        mode="create"
        submitLabelKey="strength.create"
        initialEquipment="WEIGHTS"
        initialDays={[defaultDay("WEIGHTS", includePull)]}
        includePull={includePull}
      />
    </div>
  );
}
