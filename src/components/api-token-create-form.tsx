"use client";

import { useActionState } from "react";
import { createApiToken, type CreateApiTokenState } from "@/app/actions/api-tokens";
import { useT } from "@/components/i18n-provider";
import { API_TOKEN_NAME_MAX } from "@/lib/api-tokens";
import { Button, Input, Label, Select } from "@/components/ui";

/**
 * Create an API token. The raw token comes back from the action exactly once and is shown
 * here until the page is left — it is never stored or retrievable afterwards.
 */
export function ApiTokenCreateForm({
  teams,
  defaultTeamId,
}: {
  teams: Array<{ id: string; name: string }>;
  defaultTeamId: string | null;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<CreateApiTokenState, FormData>(
    createApiToken,
    undefined,
  );

  if (state && "token" in state) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-medium text-amber-900">
          {t("apiTokens.createdTitle", { name: state.name })}
        </p>
        <p className="text-xs text-amber-800">{t("apiTokens.createdOnce")}</p>
        <Input
          readOnly
          value={state.token}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
          aria-label={t("apiTokens.tokenLabel")}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void navigator.clipboard?.writeText(state.token)}
        >
          {t("apiTokens.copy")}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 border-b border-slate-100 pb-4">
      <div>
        <Label htmlFor="apiTokenName">{t("apiTokens.name")}</Label>
        <Input
          id="apiTokenName"
          name="name"
          maxLength={API_TOKEN_NAME_MAX}
          placeholder={t("apiTokens.namePlaceholder")}
          required
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor="apiTokenTeam">{t("apiTokens.team")}</Label>
        <Select id="apiTokenTeam" name="teamId" defaultValue={defaultTeamId ?? teams[0]?.id}>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
      </div>
      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(state.error === "name" ? "apiTokens.errorName" : "apiTokens.errorTeam")}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending || teams.length === 0}>
        {pending ? t("common.loading") : t("apiTokens.create")}
      </Button>
    </form>
  );
}
