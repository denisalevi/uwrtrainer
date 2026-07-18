"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { reassignAccount } from "@/app/actions/trainer";
import { Button, Label, Select } from "@/components/ui";

/**
 * Admin: move a login onto a different (account-less) roster row — the fix for someone
 * having claimed the wrong name at signup. Confirms with both names before submitting.
 */
export function ReassignAccountForm({
  accounts,
  claimables,
}: {
  accounts: { id: string; name: string; email: string }[];
  claimables: { id: string; name: string }[];
}) {
  const { t } = useT();
  const [sourceId, setSourceId] = useState(accounts[0]?.id ?? "");
  const [targetId, setTargetId] = useState(claimables[0]?.id ?? "");

  if (!accounts.length || !claimables.length) {
    return <p className="text-sm text-slate-600">{t("users.reassignNoTargets")}</p>;
  }

  const sourceName = accounts.find((a) => a.id === sourceId)?.name ?? "";
  const targetName = claimables.find((c) => c.id === targetId)?.name ?? "";

  return (
    <form
      action={reassignAccount}
      onSubmit={(e) => {
        if (!confirm(t("users.reassignConfirm", { source: sourceName, target: targetName })))
          e.preventDefault();
      }}
      className="space-y-3"
    >
      <p className="text-sm text-slate-600">{t("users.reassignIntro")}</p>
      <div>
        <Label htmlFor="sourceId">{t("users.reassignSource")}</Label>
        <Select
          id="sourceId"
          name="sourceId"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.email}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="targetId">{t("users.reassignTarget")}</Label>
        <Select
          id="targetId"
          name="targetId"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          {claimables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        {t("users.reassignButton")}
      </Button>
    </form>
  );
}
