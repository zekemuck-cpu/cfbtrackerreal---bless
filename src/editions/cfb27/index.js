// CFB 27 edition bundle.
//
// IMPORTANT: this file is the DIFF from cfb26, not a standalone config.
// It declares `extends: 'cfb26'` and only lists what changes. The
// registry (../index.js) deep-merges this on top of the resolved cfb26
// bundle, so anything NOT mentioned here automatically inherits cfb26's
// behavior. When CFB 28 arrives it will `extends: 'cfb27'` the same way,
// inheriting everything below for free and overriding only its own deltas.

export default {
  key: 'cfb27',
  label: 'CFB 27',
  shortLabel: '27',
  releaseYear: 2026,
  extends: 'cfb26',

  // Turn on the CFB 27 subsystems. Only the flags that differ from cfb26
  // need to appear; the merge keeps cfb26's values for the rest.
  features: {
    dynastyPoints: true,
    nil: true,
    wearAndTear: true,
    coachingCarousel: true,
    scoutingWeek: true,
    commitLadder: true,
    // Full per-player attribute entry (Training Results / Recruit Overalls can
    // capture the whole ~50-attribute set, not just Overall).
    attributes: true,
  },

  // Dynasty Points economy — reference data for the input-driven Blueprint
  // tracker. We do NOT simulate EA's math; these just label the spend lanes
  // and surface the in-game "suggested allocation" percentages so the
  // tracker can compare what the user actually allocated against them.
  dynastyPoints: {
    // The four spend lanes on the allocation wheel, in display order.
    // suggestedPct mirrors the in-game suggested split (Program Overview).
    lanes: [
      { key: 'staff', label: 'Staff', suggestedPct: 20 },
      { key: 'facilities', label: 'Facilities', suggestedPct: 10 },
      { key: 'recruitingNil', label: 'Recruiting NIL', suggestedPct: 20 },
      { key: 'rosterNil', label: 'Roster NIL', suggestedPct: 30 },
    ],
    // Where points come from each year — used to label the optional
    // "earned" breakdown the user can record. Not required to use the page.
    earnSources: [
      { key: 'conferencePrestige', label: 'Conference Prestige' },
      { key: 'brandExposure', label: 'Brand Exposure' },
      { key: 'stadiumAtmosphere', label: 'Stadium Atmosphere' },
      { key: 'programTradition', label: 'Program Tradition' },
      { key: 'seasonPayouts', label: 'Season Payouts' },
      { key: 'adExpectations', label: 'AD Expectations' },
    ],
    // Support staff — the 5 effect categories EA published (each available in
    // 4 tiers; 1 per type; preseason-only). We don't hardcode prices — the
    // user records the DP cost they see. Their costs feed the Staff lane.
    supportStaff: {
      // Exact in-game TYPE names. Keys are internal/stable (don't rename — stored
      // entries reference them); only labels are shown in the UI.
      effects: [
        { key: 'hireCostReduction', label: 'Support Staff Discounts' },
        { key: 'nilExpectations', label: 'Reduce NIL Expectations' },
        { key: 'recruitingHours', label: 'Recruiting Hours Increase' },
        { key: 'offseasonProgression', label: 'Offseason Progression Increase' },
        { key: 'fundraising', label: 'Dynasty Points Increase' },
      ],
      tiers: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    },

    // Facilities — the 5 facility tiers (fixed game data from the Facility
    // Management screen). Each sets the grade ceiling, # equipment slots,
    // annual maintenance cost, and the player-progression bonus. `grades` is
    // the in-band grade range that tier can hold (a tier upgrade is the only
    // way out of the band) — drives the Current Grade dropdown.
    facilities: {
      tiers: [
        { key: 'basic', label: 'Basic Facility', slots: 1, maxGrade: 'F', annualCost: 0, progression: 0, grades: ['F'] },
        { key: 'competitive', label: 'Competitive Facility', slots: 2, maxGrade: 'D+', annualCost: 50, progression: 0, grades: ['D-', 'D', 'D+'] },
        { key: 'premier', label: 'Premier Facility', slots: 3, maxGrade: 'C+', annualCost: 150, progression: 4, grades: ['C-', 'C', 'C+'] },
        { key: 'elite', label: 'Elite Facility', slots: 4, maxGrade: 'B+', annualCost: 400, progression: 10, grades: ['B-', 'B', 'B+'] },
        { key: 'nationalPowerhouse', label: 'National Powerhouse', slots: 5, maxGrade: 'A+', annualCost: 750, progression: 16, grades: ['A-', 'A', 'A+'] },
      ],
      // The 5 equipment effect categories EA published (Campus Huddle). Keys are
      // stable; only labels show. Tiers mirror support staff (Bronze→Platinum).
      // We don't enumerate equipment ITEM names — that catalog is open-ended and
      // tier/school-dependent, so the item name stays a free field.
      equipmentEffects: [
        { key: 'facilityGrade', label: 'Increase Facility Grade' },
        { key: 'effectDuration', label: 'Increase Effect Duration' },
        { key: 'wearAndTear', label: 'Reduce Practice Wear & Tear' },
        { key: 'seasonHealth', label: 'Reduce Season Health Usage' },
        { key: 'practiceInjury', label: 'Reduce Practice Injury Chance' },
      ],
      equipmentTiers: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    },
  },
}
