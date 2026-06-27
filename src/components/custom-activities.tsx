"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { Button, Input } from "@/components/ui";

export type CustomActivity = { name: string; n: number };

let uid = 0;
const nextKey = () => `ca${Date.now()}_${uid++}`;

type Row = { key: string; name: string; n: string };

/**
 * Dynamic list of custom "OTHER" activity rows, embedded inside the server plan
 * <form>. Each row is a plain name + per-week number input named
 * `other_name_<i>` / `other_n_<i>` with contiguous indices, so the existing
 * `savePlan` action (which scans those field names) keeps working unchanged.
 * Saved activities seed the initial rows; "+ Add custom activity" appends more.
 */
export function CustomActivities({ initial }: { initial: CustomActivity[] }) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((a) => ({ key: nextKey(), name: a.name, n: a.n ? String(a.n) : "" })),
  );

  const addRow = () => setRows((rs) => [...rs, { key: nextKey(), name: "", n: "" }]);
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const setField = (key: string, field: "name" | "n", val: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: val } : r)));

  return (
    <>
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-2">
          <Input
            type="text"
            name={`other_name_${i}`}
            value={row.name}
            onChange={(e) => setField(row.key, "name", e.target.value)}
            maxLength={60}
            placeholder={t("plan.customActivityPlaceholder")}
            className="flex-1"
          />
          <Input
            type="number"
            name={`other_n_${i}`}
            min={0}
            max={21}
            value={row.n}
            onChange={(e) => setField(row.key, "n", e.target.value)}
            inputMode="numeric"
            className="w-20 text-center"
          />
          <span className="text-xs text-slate-500">{t("plan.perWeek")}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
            ✕
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={addRow}>
        {t("plan.addCustomActivity")}
      </Button>
    </>
  );
}
