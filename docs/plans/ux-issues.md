# UX issues batch — plan (branch `claude/fix-ux-issues`)

Base: `origin/claude/github-repo-pr-review-pm3thx` (all pending PRs merged; includes
multi-team scoping + attendance-date validation). Verify each increment with
`npx vitest run` + `npm run build` (webpack).

- [x] **#7** Remove "record attendance" buttons from feed header
      (`src/app/(app)/feed/page.tsx`) and dashboard (`src/app/(app)/dashboard/page.tsx`).
- [x] **#8** /log: add prominent "Record a team practice (who came)" card linking to
      `/attendance` above the form (`src/app/(app)/log/page.tsx`). Personal rugby: add a
      "No practice — on my own" (`value=""`) option to the RUGBY slot select in
      `src/components/log-form.tsx` (schema/`sessionFields` already treat empty slot as null).
- [x] **#9** `src/components/missed-actions.tsx`: keep the collapsible inline reason form for
      auto rows (auto rows are blocked from `/log/[id]`), add save feedback — pending state via
      `useFormStatus` + success tick (`missed.reasonSaved`) via a client wrapper around
      `setMissedReason`. Manual missed rows already route to `/log/[id]` (MissedActions is only
      rendered for auto rows).
- [x] **#15** Reword `feed.didNotCome`: en "Didn't come (of those signed up)" /
      de "Nicht da (von den Zugesagten)" in `src/lib/i18n/dictionaries.ts`.
- [x] **#16** Feed practice expansion: if the viewer is in the didn't-come list, render
      `MissedActions` for their auto-missed row (id available from `missedRows`) — resolve
      link `/attendance?slot&date` + inline give-a-reason.
- [x] **#14** Feed practice events: add an edit link per event →
      `/attendance?slot=<id>&date=<yyyy-mm-dd>&edit=1` (page already accepts slot/date params;
      prefill existing attendees). Attendance action: in edit-mode submits, delete slot-tied
      DONE rugby rows for roster members explicitly unticked (attendance-created rows only),
      then reconcile (verified: current action is additive — removal must be added).
