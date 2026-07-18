"use client";

import { useT } from "@/components/i18n-provider";
import { downgradeOwnAccount } from "@/app/actions/settings";
import { Button } from "@/components/ui";

/**
 * Self-service account deletion. Deliberately NOT a data wipe: it removes only the login
 * (the row becomes an account-less roster member again), which the copy and the confirm
 * dialog both spell out — full deletion means mailing the admin.
 */
export function DeleteOwnAccount({ adminMail }: { adminMail: string }) {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("set.deleteOwnIntro", { mail: adminMail })}</p>
      <form
        action={downgradeOwnAccount}
        onSubmit={(e) => {
          if (!confirm(t("set.deleteOwnConfirm", { mail: adminMail }))) e.preventDefault();
        }}
      >
        <Button type="submit" variant="danger" className="w-full">
          {t("set.deleteOwnButton")}
        </Button>
      </form>
    </div>
  );
}
