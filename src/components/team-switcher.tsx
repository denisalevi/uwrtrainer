"use client";

import { useTransition } from "react";
import { switchTeam } from "@/app/actions/settings";

/**
 * Active-team dropdown in the app header. With a single team it renders the name only;
 * with several it becomes a select that persists the choice via the switchTeam action.
 */
export function TeamSwitcher({
  teams,
  activeTeamId,
}: {
  teams: { id: string; name: string }[];
  activeTeamId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  if (teams.length === 0) return null;
  if (teams.length === 1) {
    return <span className="text-sm font-medium text-slate-600">{teams[0].name}</span>;
  }
  return (
    <select
      aria-label="Team"
      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-700 disabled:opacity-50"
      value={activeTeamId ?? teams[0].id}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("teamId", e.target.value);
        startTransition(() => switchTeam(fd));
      }}
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
