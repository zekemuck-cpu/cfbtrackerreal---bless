// Scouted players accumulate across every dynasty the user owns — the Recruiting
// Database / Player Count thresholds get smarter the more dynasties you've played.
// Every dynasty on the account participates; there's no per-dynasty opt-out (the
// Recruiting Database itself is now one account-wide shared database — see
// recruitingDatabasePool.js — so isolating just the VIEW here would be inconsistent
// with that).
export async function getSiblingScoutedPlayers(currentDynasty, allDynasties, getDynastyPlayers) {
  if (!currentDynasty) return [];

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
