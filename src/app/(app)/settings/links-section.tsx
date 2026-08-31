import { getServerT } from "@/lib/i18n/server";
import { isTrainer } from "@/lib/constants";
import type { CurrentUser } from "@/lib/dal";
import { getLinkLibrary } from "@/lib/saved-links-store";
import { addSavedLink, deleteSavedLink, setSavedLinkShared, setShowTeamLinks } from "@/app/actions/links";
import { Badge, Button, Input, Label } from "@/components/ui";
import { SAVED_LINK_LABEL_MAX } from "@/lib/saved-links";

/**
 * The member's saved-link library: everything they ever named as a warm-up/cool-down link
 * (auto-remembered) plus manual additions, each shareable with the team — and, below, the
 * links teammates shared, with who shared them. Trainers can pull any shared link back out
 * of the team; a link's owner is the only one who can delete it outright.
 */
export async function LinksSection({ user }: { user: CurrentUser }) {
  const { t } = await getServerT();
  const { own, shared } = await getLinkLibrary(user);
  const trainer = isTrainer(user.role);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t("links.intro")}</p>

      {/* Add a link by hand (adding one while logging saves it here automatically). */}
      <form action={addSavedLink} className="space-y-2 border-b border-slate-100 pb-4">
        <div>
          <Label htmlFor="linkLabel">{t("routines.linkLabel")}</Label>
          <Input id="linkLabel" name="label" maxLength={SAVED_LINK_LABEL_MAX} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="linkUrl">{t("links.url")}</Label>
          <Input id="linkUrl" name="url" inputMode="url" placeholder="https://…" required autoComplete="off" />
        </div>
        <Button type="submit" variant="secondary">
          {t("common.add")}
        </Button>
      </form>

      {/* My links */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("links.mine")}</h3>
        {own.length === 0 ? (
          <p className="text-sm text-slate-500">{t("links.noneOwn")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {own.map((link) => (
              <li key={link.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-teal-700 underline decoration-dotted"
                >
                  🔗 {link.label}
                </a>
                {link.teamId && <Badge tone="teal">{t("links.sharedBadge")}</Badge>}
                <form action={setSavedLinkShared}>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="share" value={link.teamId ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm" disabled={!link.teamId && !user.activeTeamId}>
                    {link.teamId ? t("links.unshare") : t("links.share")}
                  </Button>
                </form>
                <form action={deleteSavedLink}>
                  <input type="hidden" name="id" value={link.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={t("common.delete")}>
                    ✕
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Links teammates shared — attributed, and hideable via the toggle below. */}
      <div className="space-y-2 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("links.team")}</h3>
        {shared.length === 0 ? (
          <p className="text-sm text-slate-500">{t("links.noneTeam")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shared.map((link) => (
              <li key={link.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-teal-700 underline decoration-dotted"
                  >
                    🔗 {link.label}
                  </a>
                  <p className="truncate text-xs text-slate-500">
                    {t("links.sharedBy", { name: link.user.name })}
                  </p>
                </div>
                {trainer && (
                  <form action={deleteSavedLink}>
                    <input type="hidden" name="id" value={link.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("links.removeFromTeam")}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={setShowTeamLinks} className="space-y-2 pt-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="showTeamLinks"
              defaultChecked={user.showTeamLinks}
              className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
            />
            <span className="flex-1 text-sm font-medium text-slate-800">{t("links.showTeam")}</span>
          </label>
          <p className="pl-8 text-xs text-slate-500">{t("links.showTeamHint")}</p>
          <Button type="submit" variant="secondary" size="sm">
            {t("common.save")}
          </Button>
        </form>
      </div>
    </div>
  );
}
