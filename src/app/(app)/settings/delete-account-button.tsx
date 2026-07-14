"use client";

import { useT } from "@/components/i18n-provider";
import { deleteUserAccount } from "@/app/actions/trainer";
import { Button } from "@/components/ui";

/**
 * Admin-only: permanently delete a user account (all their data cascades). Confirms first,
 * naming the member, so a mis-tap can't wipe someone's history.
 */
export function DeleteAccountButton({ userId, name }: { userId: string; name: string }) {
  const { t } = useT();
  return (
    <form
      action={deleteUserAccount}
      onSubmit={(e) => {
        if (!confirm(t("teams.deleteAccountConfirm", { name }))) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="danger" size="sm">
        {t("teams.deleteAccount")}
      </Button>
    </form>
  );
}
