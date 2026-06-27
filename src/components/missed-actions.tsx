"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n-provider";
import { setMissedReason } from "@/app/actions/training";
import { Button, Textarea } from "@/components/ui";

/**
 * Resolve affordances for an auto-MISSED row (both buckets). Auto-missed rows are NOT deletable;
 * they're resolved by logging the real session (which flips/shrinks them via reconcile) or
 * explained with a team-visible reason.
 *
 *  - `resolveHref` + `resolveLabel`: the primary action — "Add yourself" (ticked-practice row,
 *    links to /attendance) or "Log the session" (count summary, links to the logger).
 *  - "Give a reason": an inline textarea posting `setMissedReason` (owner-only on the server).
 *
 * `canGiveReason` gates the reason form to the owner (a trainer viewing someone else can't write
 * their reason). The existing reason is shown read-only above when present.
 */
export function MissedActions({
  logId,
  resolveHref,
  resolveLabel,
  reason,
  canGiveReason,
}: {
  logId: string;
  resolveHref: string;
  resolveLabel: string;
  reason: string | null;
  canGiveReason: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={resolveHref}>
          <Button variant="secondary" size="sm">
            {resolveLabel}
          </Button>
        </Link>
        {canGiveReason && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {t("missed.giveReason")}
          </Button>
        )}
      </div>

      {open && canGiveReason && (
        <form action={setMissedReason} className="space-y-2">
          <input type="hidden" name="id" value={logId} />
          <Textarea
            name="missReason"
            rows={2}
            defaultValue={reason ?? ""}
            placeholder={t("missed.reasonPlaceholder")}
          />
          <Button type="submit" size="sm">
            {t("missed.reasonSave")}
          </Button>
        </form>
      )}
    </div>
  );
}
