"use client";

import { useT } from "@/components/i18n-provider";
import { createStrengthProgram } from "@/app/actions/strength";
import { ProgramForm } from "@/components/program-form";

export function StrengthWizard() {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("strength.wizardIntro")}</p>
      <ProgramForm
        action={createStrengthProgram}
        mode="create"
        submitLabelKey="strength.create"
        initialDays={[{ id: "d0", name: "", tools: [], minutes: 45 }]}
      />
    </div>
  );
}
