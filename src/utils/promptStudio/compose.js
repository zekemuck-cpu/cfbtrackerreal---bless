/**
 * Compose function — stitch a template's slot data + the user's knob
 * selections + custom notes into the final prompt string.
 *
 * Templates are responsible for producing the DATA section + the TASK
 * section + any template-specific CONSTRAINTS. This composer wraps
 * those with a HEADER block (built from knob fragments) and a footer
 * with universal constraints.
 *
 * The result is a single string the user copies and pastes into their
 * AI tool of choice.
 */

import { resolveFragment } from './knobFragments'
import { KNOB_ORDER, KNOB_DEFS, CUSTOM_OPTION_ID } from './knobs'

/**
 * Compose the final prompt.
 *
 * @param {Object} template — the template definition (see templates/)
 * @param {Object} slotValues — { [slotId]: value } the user picked
 * @param {Object} knobValues — { [knobId]: optionId } (resolved — already
 *   merged with template defaults + user overrides via getResolvedKnobs)
 * @param {string} customNotes — free-text user additions (or '')
 * @param {Object} ctx — { dynasty, teamA, teamB } for fragment substitution
 * @returns {string} composed prompt
 */
export function composePrompt(template, slotValues, knobValues, customNotes, ctx = {}) {
  const { teamA, teamB } = ctx

  // ── HEADER (knob fragments) ──────────────────────────────────────────────
  const headerParts = []
  for (const knobId of KNOB_ORDER) {
    if (!template.knobWhitelist?.includes(knobId)) continue
    const val = knobValues[knobId]
    if (!val) continue
    let frag = ''
    // The resolver returns `{ optionId: 'custom', customText: '…' }` for
    // user-typed values; otherwise it returns the option id as a string.
    if (typeof val === 'object' && val.optionId === CUSTOM_OPTION_ID) {
      const text = (val.customText || '').trim()
      if (text) {
        const knobLabel = KNOB_DEFS[knobId]?.label || knobId
        frag = `${knobLabel}: ${text}`
      }
    } else {
      frag = resolveFragment(knobId, val, { teamA, teamB })
    }
    if (frag) headerParts.push(frag)
  }
  const header = headerParts.length
    ? `# Voice, audience, and style\n\n${headerParts.map(f => `- ${f}`).join('\n')}\n`
    : ''

  // ── DATA + TASK + CONSTRAINTS (template render) ───────────────────────────
  // Template's render function receives:
  //   - slot values (already validated)
  //   - resolved knob values
  //   - the dynasty
  //   - any other ctx
  // It must return { data, task, constraints? } — strings.
  const rendered = template.render({
    slots: slotValues,
    knobs: knobValues,
    customNotes,
    ctx,
  })
  const data = rendered.data || ''
  const task = rendered.task || ''
  const constraints = rendered.constraints || ''

  // ── FOOTER constraints (universal — match existing prompt conventions) ───
  const universalConstraints = [
    'Use only the data provided in this prompt. Do not invent stats, dates, names, or facts.',
    'Refer to teams by the names provided in the data block.',
    "If a stat or detail isn't in the data, say so explicitly rather than guessing.",
    'No real-world college-football knowledge — this is a dynasty simulation. Conferences, rosters, results may differ from reality.',
    'Game-mechanic data — overall ratings (e.g. "83 overall"), development traits ("Normal/Impact/Star/Elite"), player archetypes, and recruit star counts — is INTERNAL signal only. Never state these numbers or labels in the writing; they are not real-world football terms and break the fourth wall. Use them only to gauge a player and translate into natural scouting language (describe form, trajectory, role, or ceiling instead).',
  ]

  // ── CUSTOM NOTES ─────────────────────────────────────────────────────────
  const notesBlock = customNotes && customNotes.trim()
    ? `# Additional context from the dynasty owner\n\n${customNotes.trim()}\n`
    : ''

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────
  const sections = [
    header,
    data ? `# Data\n\n${data}\n` : '',
    notesBlock,
    task ? `# Task\n\n${task}\n` : '',
    `# Constraints\n\n${[...universalConstraints, ...(constraints ? [constraints] : [])].map(c => `- ${c}`).join('\n')}\n`,
  ].filter(Boolean)

  return sections.join('\n').trim() + '\n'
}

/**
 * Merge template defaults + user overrides into the final knob values
 * that will be passed to composePrompt. Knobs the user checked (in
 * `enabledKnobs`) use the user's `userKnobValues`; unchecked knobs
 * use the template's `knobDefaults`.
 *
 * If the user picked the sentinel 'custom' option, we return an object
 * `{ optionId: 'custom', customText }` so composePrompt knows to inline
 * the user's typed text in place of a canned fragment.
 */
export function getResolvedKnobs(template, enabledKnobs, userKnobValues, userKnobCustom = {}) {
  const out = {}
  for (const knobId of template.knobWhitelist || []) {
    if (enabledKnobs[knobId]) {
      const optionId = userKnobValues[knobId] ?? template.knobDefaults[knobId]
      if (optionId === CUSTOM_OPTION_ID) {
        out[knobId] = { optionId, customText: userKnobCustom[knobId] || '' }
      } else {
        out[knobId] = optionId
      }
    } else {
      out[knobId] = template.knobDefaults[knobId]
    }
  }
  return out
}
