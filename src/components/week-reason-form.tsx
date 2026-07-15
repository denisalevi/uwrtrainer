"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { saveWeekReason } from "@/app/actions/training";
import { Button, Input } from "@/components/ui";

/**
 * The ONE free-text reason for a week whose goals weren't all reached (owner only).
 * Saving it removes the week's red "no reason given" tag — the box stays calmly grey.
 */
export function WeekReasonForm({
  weekStart,
  initialReason,
}: {
  /** yyyy-mm-dd of the week's Monday. */
  weekStart: string;
  initialReason: string;
}) {
  const { t } = useT();
  const [reason, setReason] = useState(initialReason);
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={async (fd) => {
        await saveWeekReason(fd);
        setSaved(true);
      }}
      className="flex items-center gap-2 pt-1"
    >
      <input type="hidden" name="weekStart" value={weekStart} />
      <Input
        name="reason"
        value={reason}
        maxLength={300}
        onChange={(e) => {
          setReason(e.target.value);
          setSaved(false);
        }}
        placeholder={t("week.reasonPlaceholder")}
        className="flex-1"
      />
      <Button type="submit" size="sm" variant="secondary">
        {saved ? `✓ ${t("common.saved")}` : t("common.save")}
      </Button>
    </form>
  );
}
