// Scouted players accumulate across every dynasty the user owns by default, so the
// Recruiting Database / Player Count thresholds get smarter the more dynasties you've
// played — a dynasty can opt out via `recruitingDbIsolated` to start from scratch.
//
// `recruitingDbIsolated` only controls what a dynasty PULLS IN for its own view — it's
// purely visual for that dynasty. A dynasty's own scouted players still flow OUT into
// every other non-isolated dynasty's shared pool even while isolated itself.
export async function getSiblingScoutedPlayers(currentDynasty, allDynasties, getDynastyPlayers) {
  if (!currentDynasty || currentDynasty.recruitingDbIsolated) return [];

  const siblings = (allDynasties || []).filter(d =>
    String(d.id) !== String(currentDynasty.id) &&
    d.userId === currentDynasty.userId
  );

  const lists = await Promise.all(
    siblings.map(async d => {
      const list = await getDynastyPlayers(d).catch(() => []);
      // pid is only unique within a single dynasty (a small per-dynasty counter), so
      // every cross-dynasty player needs its origin dynasty tagged alongside it to
      // form a globally unique identity.
      return list.map(pl => ({ ...pl, _sourceDynastyId: d.id }));
    })
  );

  return lists.flat();
}
