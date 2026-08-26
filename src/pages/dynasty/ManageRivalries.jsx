/**
 * ManageRivalries — lives at `/dynasty/:id/rivalries`. Renders the exact
 * same RivalriesTab component/UI the Team Dashboard's own "Rivalries" tab
 * uses, scoped to the user's own current team (dynasty.currentTid) — the
 * same view you'd get by opening your own Team Dashboard and clicking
 * Rivalries. Both surfaces read and write the identical `dynasty.rivalries`
 * data through the identical component, so there is nothing to keep in
 * sync: an edit made from either page is the same edit.
 *
 * Previously a separate dynasty-wide CRUD (add/edit/remove an arbitrary
 * multi-team rivalry, unrelated to any one team) with its own
 * `{ id, name, teamTids, imageUrl }` shape. That page is gone — rivalries
 * are now auto-imported from the save, and RivalriesTab already covers
 * adding/naming/trophying a new one for this team (see its own "+ Add
 * Rival" and per-card edit UI). RivalriesTab migrates any old-shape entry
 * it finds for this team into its own shape on load, so nothing already
 * set up is lost.
 */

import { useDynasty } from '../../context/DynastyContext'
import { PageHero } from '../../components/ui'
import RivalriesTab from '../../components/RivalriesTab'

export default function ManageRivalries() {
  const { currentDynasty, saveRivalries } = useDynasty()

  if (!currentDynasty) return null

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHero
        title="Rivalries"
        subtitle="Synced automatically from your save and your own games. Add one if it's missing, and name a trophy once it's earned one."
      />
      <RivalriesTab
        dynasty={currentDynasty}
        tid={currentDynasty.currentTid}
        selectedYear={currentDynasty.currentYear}
        dynastyId={currentDynasty.id}
        saveRivalries={saveRivalries}
      />
    </div>
  )
}
