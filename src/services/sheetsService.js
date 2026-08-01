// Note: Firebase auth import removed - we use OAuth tokens from localStorage directly
// This allows Google Sheets to work with free tier (IndexedDB) users who have signed in with Google
import { teamAbbreviations, getTeamAbbreviationsList, getSelectableTeamsList, getSchedulableTeamsList } from '../data/teamAbbreviations'
import { getAbbrFromTeamName, getTidFromAbbr, getAbbrFromTid, TEAMS as DEFAULT_TEAMS, getTeamNameOptions } from '../data/teamRegistry'
import { getTidFromTeamText } from '../data/teams'
import { conferenceTeams as CANONICAL_CONFERENCES } from '../data/conferenceTeams'
import { STAT_TABS, STAT_TAB_ORDER, SCORING_SUMMARY, SCORE_TYPES, PAT_RESULTS, QUARTERS, DOWNS, PLAY_TYPES, AI_UNIFIED_TAB, computeUnifiedTabLayout } from '../data/boxScoreConstants'
import { isPlayerOnRoster, getPlayerClassForYear } from '../context/DynastyContext'
import { OAuthError, RateLimitError } from '../utils/authErrors'
import { parseRecruitingRows, parseAttributes, RECRUITING_READ_RANGE, TOTAL_COLS, PID_COL, NIL_COL, UPDATED_AT_COL, colLetter } from '../utils/recruitSheetParse'
import { normalizeWeeklyScoreRow, normalizeWeeklyScoreRows } from '../utils/weeklyScoreRealign'
import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR, attributeNamesFor, serializeAttributes } from '../utils/recruitAttributes'

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files'

// A SILENT token-refresh callback registered by AuthContext. This service
// lives outside React, so it can't call the auth context directly — the
// app registers a refresher on mount. It lets getAccessToken() recover an
// expired token with no error UI (the common "my token quietly expired
// after an hour" case heals itself). Returns a fresh token string, or null
// if a silent refresh isn't possible (then we fall back to the reauth modal).
let _tokenRefresher = null
export function registerTokenRefresher(fn) { _tokenRefresher = fn }

// Default timeout for any single Google API call. Without a timeout,
// a stalled connection can hang the modal for minutes and present as
// "the sheet never loads". 30s is generous for healthy API calls and
// short enough that the user gets a real error to retry. Override per
// call via the `timeoutMs` option when an operation legitimately needs
// longer (large prefills can run ~20s under load).
const DEFAULT_FETCH_TIMEOUT_MS = 30000

// Wrapper around fetch() that aborts the request after `timeoutMs` and
// throws a clear "Request timed out" error instead of letting the modal
// spin indefinitely. Caller still owns retry/error handling.
//
// Also throws OAuthError on HTTP 401 so every caller gets reauth
// detection for free. Without this, a 401 body like "Invalid Credentials"
// flows through as a generic Error whose message doesn't match any of
// isAuthError()'s keyword patterns — the reauth modal never fires.
// 401 from Google APIs ALWAYS means the OAuth token is expired or revoked,
// so there is no ambiguity about whether to throw here.
// Transient rate limits (HTTP 429, and 403 rateLimitExceeded) clear within
// seconds, so a short bounded backoff lets a burst-throttled call succeed on
// its own instead of dead-ending the user. This is the core of the "works for
// my team, fails for the next one" report: creating each sheet is several
// write calls and Google caps writes at ~60/user/minute, so the 2nd-3rd sheet
// in quick succession trips the burst limit. Drive-storage-full (403
// storageQuotaExceeded) is NOT retried — waiting won't free space.
// 2 retries catches the short burst spikes (the per-minute write cap clearing
// over the next few seconds). A SUSTAINED limit won't clear within any
// reasonable in-request wait, so we fail fast after this and let the toast tell
// the user to wait a minute — rather than stacking long delays across the
// several calls each sheet creation makes.
const RATE_LIMIT_MAX_RETRIES = 2
const RATE_LIMIT_BACKOFF_MS = [1000, 3000]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithTimeout(url, init = {}, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, label } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (response.status === 401) {
        throw new OAuthError('Google API returned 401 — OAuth token expired or revoked. Please re-authenticate.')
      }
      // Google returns 403 for several unrelated reasons. Peek at the body
      // (clone so the caller can still read it) and classify:
      //   - token / scope / permission   → reauth flow (OAuthError)
      //   - rate / quota                 → retriable RateLimitError
      //   - Drive storage full           → non-retriable RateLimitError
      // Previously every 403 that wasn't auth dead-ended as a generic
      // "Could not create the sheet" toast with bogus "refresh session" advice.
      if (response.status === 403) {
        let reason = ''
        try {
          const body = await response.clone().json()
          reason = String(
            body?.error?.errors?.[0]?.reason ||
            body?.error?.status ||
            body?.error?.message ||
            body?.error_description ||
            ''
          ).toLowerCase()
        } catch {
          // Unreadable/non-JSON 403 — the dominant cause here is a stale
          // token, so route it to reauth rather than a dead-end toast.
          reason = 'unreadable-treat-as-auth'
        }
        if (/storage.?quota/.test(reason)) {
          throw new RateLimitError('Google Drive storage is full.', { retriable: false })
        }
        if (/ratelimit|rate limit|userratelimit|quotaexceeded|quota exceeded|resource_exhausted/.test(reason)) {
          if (attempt < RATE_LIMIT_MAX_RETRIES) { clearTimeout(timer); await sleep(RATE_LIMIT_BACKOFF_MS[attempt]); continue }
          throw new RateLimitError('Google API rate limit (403) — too many requests in a short window.')
        }
        if (/insufficient|scope|permission|token|auth|credential|unauthor/.test(reason)) {
          throw new OAuthError('Google API returned 403 — token expired or missing the required scope. Please re-authenticate.')
        }
      }
      // Plain 429 — always a rate limit. Back off and retry, then give up.
      if (response.status === 429) {
        if (attempt < RATE_LIMIT_MAX_RETRIES) { clearTimeout(timer); await sleep(RATE_LIMIT_BACKOFF_MS[attempt]); continue }
        throw new RateLimitError('Google API rate limit (429) — too many requests in a short window.')
      }
      return response
    } catch (err) {
      if (err?.name === 'AbortError') {
        const tag = label ? ` (${label})` : ''
        throw new Error(`Google API request timed out after ${Math.round(timeoutMs / 1000)}s${tag}. Try again.`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}

// Get the current user's OAuth access token. Throws OAuthError when
// missing/expired so callers can use isAuthError(err) without falling
// back to substring matching on the message.
async function getAccessToken() {
  const storedToken = localStorage.getItem('google_access_token')
  const tokenExpiry = localStorage.getItem('google_token_expiry')

  if (storedToken && tokenExpiry) {
    const expiryTime = parseInt(tokenExpiry)
    if (Date.now() < expiryTime) {
      return storedToken
    }
  }

  // Token missing or expired — try a SILENT refresh before failing. When
  // the Google session is still alive this returns a fresh token with no
  // popup and no error UI, so the operation just proceeds. We only fall
  // through to throwing (→ the reauth modal) if a silent refresh can't get
  // one (e.g. the underlying Google session itself ended).
  if (_tokenRefresher) {
    try {
      const fresh = await _tokenRefresher()
      if (fresh) return fresh
    } catch {
      // fall through to throw below
    }
  }

  // Message preserved verbatim for any modal still on legacy
  // substring matching during the migration window.
  throw new OAuthError('OAuth access token not found or expired. Try refreshing your session or sign out and sign back in.')
}

// Share a Google Sheet with "anyone with the link can edit"
// This is required for embedding sheets in iframes since iframes can't share auth cookies
async function shareSheetPublicly(spreadsheetId, accessToken) {
  try {
    const response = await fetchWithTimeout(`${DRIVE_API_BASE}/${spreadsheetId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'writer',
        type: 'anyone'
      })
    })

    if (!response.ok) {
      const errData = await response.json()
      console.error('Failed to share sheet:', errData)
      // 403 = scope issue — sheet still works, just won't embed. Don't throw.
    }
  } catch (error) {
    // Re-throw OAuthError (from fetchWithTimeout 401 or getAccessToken) so
    // the caller's catch block can open the reauth modal instead of hiding it.
    if (error?.isAuthError) throw error
    console.error('Error sharing sheet:', error)
    // Don't throw - sheet still works, just won't embed properly
  }
}

// Create a new Google Sheet for a dynasty
export async function createDynastySheet(dynastyName, coachName, year) {
  try {
    // Get OAuth access token from localStorage (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} Dynasty - ${coachName} (${year})`
        },
        sheets: [
          {
            properties: {
              title: 'Schedule',
              gridProperties: {
                rowCount: 13,
                columnCount: 4,
                frozenRowCount: 1
              }
            }
          },
          {
            properties: {
              title: 'Roster',
              gridProperties: {
                rowCount: 86,
                columnCount: 15,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()

    // Extract actual sheet IDs from the response
    const scheduleSheetId = sheet.sheets[0].properties.sheetId
    const rosterSheetId = sheet.sheets[1].properties.sheetId

    // Initialize headers with actual sheet IDs and user's team name
    await initializeSheetHeaders(sheet.spreadsheetId, accessToken, scheduleSheetId, rosterSheetId, dynastyName)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('[SHEETS] CREATE ERROR:', error)
    throw error
  }
}

// Helper function to convert hex color to RGB object for Google Sheets API
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    red: parseInt(result[1], 16) / 255,
    green: parseInt(result[2], 16) / 255,
    blue: parseInt(result[3], 16) / 255
  } : { red: 1, green: 1, blue: 1 }
}

// Detect if teams object is tid-based (new format) or abbr-based (old format)
function isTidBasedTeams(teamsObj) {
  if (!teamsObj) return false
  const keys = Object.keys(teamsObj)
  return keys.length > 0 && keys.some(k => !isNaN(parseInt(k)))
}

// Build the abbr-keyed display map (`{ abbr: { name, backgroundColor,
// textColor } }`) from `dynasty.teams[tid]`. Single tid-based path:
// every TB slot is just an entry in dynasty.teams whose `abbr` is the
// TB's chosen one (the original FBS team's abbr is gone from that
// slot). No legacy dynastyTeams handling — that field is now dead
// schema and migrated away on load.
//
// Falls back to DEFAULT_TEAMS only when called with no dynasty context
// (e.g. some sheet-init paths during dynasty creation).
function getTeamsWithCustom(dynastyTeams = null) {
  const teams = {}
  const source = (dynastyTeams && Object.keys(dynastyTeams).length > 0)
    ? dynastyTeams
    : DEFAULT_TEAMS
  for (const team of Object.values(source)) {
    if (!team?.abbr) continue
    teams[team.abbr] = {
      name: team.name,
      tid: team.tid,
      backgroundColor: team.primaryColor || '#333333',
      textColor: team.secondaryColor || '#FFFFFF',
    }
  }
  return teams
}

// Get list of team abbreviations with dynastyTeams support
// Team-column dropdown values for the sheet builders. Charts now use team NAMES
// (and the AI prompts output names), but existing sheets/prefills may still hold
// abbreviations. Return BOTH the name labels and the abbreviations so a strict
// ONE_OF_LIST dropdown accepts either — a pasted name (the new default) OR a
// legacy/prefilled abbr. The read path resolves both back to a tid.
function getTeamAbbreviationsListWithCustom(dynastyTeams = null) {
  const teams = getTeamsWithCustom(dynastyTeams)
  const abbrs = Object.keys(teams)
  const names = getTeamNameOptions(dynastyTeams, { includeFCS: true })
  return Array.from(new Set([...names, ...abbrs])).sort()
}

// Generate conditional formatting rules for team colors (case-insensitive)
function generateTeamFormattingRules(sheetId, columnIndex, dynastyTeams = null) {
  const rules = []
  const teams = getTeamsWithCustom(dynastyTeams)

  for (const [abbr, teamData] of Object.entries(teams)) {
    // Add rule for uppercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: 17,  // 16 data rows (weeks 0-15)
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })

    // Add rule for lowercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: 17,  // 16 data rows (weeks 0-15)
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr.toLowerCase() }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })
  }

  return rules
}

// Generate conditional formatting rules for team colors with variable row range
function generateTeamFormattingRulesForRange(sheetId, columnIndex, startRowIndex, endRowIndex, dynastyTeams = null) {
  const rules = []
  const teams = getTeamsWithCustom(dynastyTeams)

  for (const [abbr, teamData] of Object.entries(teams)) {
    // Add rule for uppercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: startRowIndex,
            endRowIndex: endRowIndex,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })

    // Add rule for lowercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: startRowIndex,
            endRowIndex: endRowIndex,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr.toLowerCase() }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })
  }

  return rules
}

// Generate team abbreviation dropdown validation for a range
function generateTeamValidation(sheetId, columnIndex, startRowIndex, endRowIndex, dynastyTeams = null) {
  return {
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: startRowIndex,
        endRowIndex: endRowIndex,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: getTeamAbbreviationsListWithCustom(dynastyTeams).map(abbr => ({ userEnteredValue: abbr }))
        },
        showCustomUi: true,
        strict: true
      }
    }
  }
}

// Position list for validation dropdowns
const POSITION_LIST = [
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P'
]

// Generate position dropdown validation for a range
function generatePositionValidation(sheetId, columnIndex, startRowIndex, endRowIndex) {
  return {
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: startRowIndex,
        endRowIndex: endRowIndex,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: POSITION_LIST.map(pos => ({ userEnteredValue: pos }))
        },
        showCustomUi: true,
        strict: true
      }
    }
  }
}

// Class list for validation dropdowns
const CLASS_LIST = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

// Generate class dropdown validation for a range
function generateClassValidation(sheetId, columnIndex, startRowIndex, endRowIndex) {
  return {
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: startRowIndex,
        endRowIndex: endRowIndex,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: CLASS_LIST.map(cls => ({ userEnteredValue: cls }))
        },
        showCustomUi: true,
        strict: true
      }
    }
  }
}

// Initialize sheet headers
async function initializeSheetHeaders(spreadsheetId, accessToken, scheduleSheetId, rosterSheetId, userTeamName, dynastyTeams = null) {
  try {
    // Get user team abbreviation
    const userTeamAbbr = getAbbrFromTeamName(userTeamName, dynastyTeams)

    const requests = [
      // Schedule headers
      {
        updateCells: {
          range: {
            sheetId: scheduleSheetId, // Schedule sheet
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          rows: [{
            values: [
              { userEnteredValue: { stringValue: 'Week' } },
              { userEnteredValue: { stringValue: 'User Team' } },
              { userEnteredValue: { stringValue: 'CPU Team' } },
              { userEnteredValue: { stringValue: 'Site' } }
            ]
          }],
          fields: 'userEnteredValue'
        }
      },
      // Pre-fill Week column with weeks 1-12
      {
        updateCells: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 13,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          rows: Array.from({ length: 12 }, (_, i) => ({
            values: [{ userEnteredValue: { numberValue: i + 1 } }]
          })),
          fields: 'userEnteredValue'
        }
      },
      // Pre-fill User Team column with user's team abbreviation
      ...(userTeamAbbr ? [{
        updateCells: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 13,
            startColumnIndex: 1,
            endColumnIndex: 2
          },
          rows: Array.from({ length: 12 }, () => ({
            values: [{ userEnteredValue: { stringValue: userTeamAbbr } }]
          })),
          fields: 'userEnteredValue'
        }
      }] : []),
      // Roster headers (15 columns)
      {
        updateCells: {
          range: {
            sheetId: rosterSheetId, // Roster sheet
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 15
          },
          rows: [{
            values: [
              { userEnteredValue: { stringValue: 'First Name' } },
              { userEnteredValue: { stringValue: 'Last Name' } },
              { userEnteredValue: { stringValue: 'Position' } },
              { userEnteredValue: { stringValue: 'Class' } },
              { userEnteredValue: { stringValue: 'Dev Trait' } },
              { userEnteredValue: { stringValue: 'Jersey #' } },
              { userEnteredValue: { stringValue: 'Archetype' } },
              { userEnteredValue: { stringValue: 'Overall' } },
              { userEnteredValue: { stringValue: 'Height' } },
              { userEnteredValue: { stringValue: 'Weight' } },
              { userEnteredValue: { stringValue: 'Hometown' } },
              { userEnteredValue: { stringValue: 'State' } },
              { userEnteredValue: { stringValue: 'Image URL' } },
              { userEnteredValue: { stringValue: 'NIL' } },
              { userEnteredValue: { stringValue: 'Attributes' } }
            ]
          }],
          fields: 'userEnteredValue'
        }
      },
      // Bold headers
      {
        repeatCell: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true }
            }
          },
          fields: 'userEnteredFormat.textFormat.bold'
        }
      },
      {
        repeatCell: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true }
            }
          },
          fields: 'userEnteredFormat.textFormat.bold'
        }
      },
      // Protect Schedule header row
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: scheduleSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            description: 'Protected header row',
            warningOnly: false
          }
        }
      },
      // Protect Schedule Column A (Week)
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: scheduleSheetId,
              startRowIndex: 1,
              endRowIndex: 13,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            description: 'Protected Week column',
            warningOnly: false
          }
        }
      },
      // Protect Schedule Column B (User Team)
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: scheduleSheetId,
              startRowIndex: 1,
              endRowIndex: 13,
              startColumnIndex: 1,
              endColumnIndex: 2
            },
            description: 'Protected User Team column',
            warningOnly: false
          }
        }
      },
      // Protect Roster header row
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: rosterSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            description: 'Protected header row',
            warningOnly: false
          }
        }
      },
      // Format all cells in Schedule sheet: Bold, Italic, Center, Barlow font, size 10
      {
        repeatCell: {
          range: {
            sheetId: scheduleSheetId
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Format all cells in Roster sheet: Bold, Italic, Center, Barlow font, size 10
      {
        repeatCell: {
          range: {
            sheetId: rosterSheetId
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Add data validation dropdown for User Team column (B2:B13) - FBS only
      {
        setDataValidation: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 13,
            startColumnIndex: 1,
            endColumnIndex: 2
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [...getTeamNameOptions(dynastyTeams, { includeFCS: false }), ...getSelectableTeamsList(dynastyTeams)].map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for CPU Team column (C2:C13) - All teams including FCS
      {
        setDataValidation: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 13,
            startColumnIndex: 2,
            endColumnIndex: 3
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [...getTeamNameOptions(dynastyTeams, { includeFCS: true }), ...getSchedulableTeamsList(dynastyTeams)].map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Site column (D2:D13)
      {
        setDataValidation: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 13,
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Home' },
                { userEnteredValue: 'Road' },
                { userEnteredValue: 'Neutral' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Position column in Roster (C2:C86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 2,
            endColumnIndex: 3
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'QB' },
                { userEnteredValue: 'HB' },
                { userEnteredValue: 'FB' },
                { userEnteredValue: 'WR' },
                { userEnteredValue: 'TE' },
                { userEnteredValue: 'LT' },
                { userEnteredValue: 'LG' },
                { userEnteredValue: 'C' },
                { userEnteredValue: 'RG' },
                { userEnteredValue: 'RT' },
                { userEnteredValue: 'LEDG' },
                { userEnteredValue: 'REDG' },
                { userEnteredValue: 'DT' },
                { userEnteredValue: 'SAM' },
                { userEnteredValue: 'MIKE' },
                { userEnteredValue: 'WILL' },
                { userEnteredValue: 'CB' },
                { userEnteredValue: 'FS' },
                { userEnteredValue: 'SS' },
                { userEnteredValue: 'K' },
                { userEnteredValue: 'P' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Class column in Roster (D2:D86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Fr' },
                { userEnteredValue: 'RS Fr' },
                { userEnteredValue: 'So' },
                { userEnteredValue: 'RS So' },
                { userEnteredValue: 'Jr' },
                { userEnteredValue: 'RS Jr' },
                { userEnteredValue: 'Sr' },
                { userEnteredValue: 'RS Sr' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Dev Trait column in Roster (E2:E86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 4,
            endColumnIndex: 5
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Elite' },
                { userEnteredValue: 'Star' },
                { userEnteredValue: 'Impact' },
                { userEnteredValue: 'Normal' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Archetype column in Roster (G2:G86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 6,
            endColumnIndex: 7
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                // QB Archetypes
                { userEnteredValue: 'Backfield Creator' },
                { userEnteredValue: 'Dual Threat' },
                { userEnteredValue: 'Pocket Passer' },
                { userEnteredValue: 'Pure Runner' },
                // HB Archetypes
                { userEnteredValue: 'Backfield Threat' },
                { userEnteredValue: 'Contact Seeker' },
                { userEnteredValue: 'East/West Playmaker' },
                { userEnteredValue: 'Elusive Bruiser' },
                { userEnteredValue: 'North/South Receiver' },
                { userEnteredValue: 'North/South Blocker' },
                // FB Archetypes
                { userEnteredValue: 'Blocking' },
                { userEnteredValue: 'Utility' },
                // WR Archetypes
                { userEnteredValue: 'Contested Specialist' },
                { userEnteredValue: 'Elusive Route Runner' },
                { userEnteredValue: 'Gadget' },
                { userEnteredValue: 'Gritty Possession' },
                { userEnteredValue: 'Physical Route Runner' },
                { userEnteredValue: 'Route Artist' },
                { userEnteredValue: 'Speedster' },
                // TE Archetypes
                { userEnteredValue: 'Possession' },
                { userEnteredValue: 'Pure Blocker' },
                { userEnteredValue: 'Pure Possession' },
                { userEnteredValue: 'Vertical Threat' },
                // OL Archetypes
                { userEnteredValue: 'Agile' },
                { userEnteredValue: 'Pass Protector' },
                { userEnteredValue: 'Raw Strength' },
                { userEnteredValue: 'Ground and Pound' },
                { userEnteredValue: 'Well Rounded' },
                // DL Archetypes
                { userEnteredValue: 'Edge Setter' },
                { userEnteredValue: 'Gap Specialist' },
                { userEnteredValue: 'Power Rusher' },
                { userEnteredValue: 'Pure Power' },
                { userEnteredValue: 'Speed Rusher' },
                // LB Archetypes
                { userEnteredValue: 'Lurker' },
                { userEnteredValue: 'Signal Caller' },
                { userEnteredValue: 'Thumper' },
                // CB Archetypes
                { userEnteredValue: 'Boundary' },
                { userEnteredValue: 'Bump and Run' },
                { userEnteredValue: 'Field' },
                { userEnteredValue: 'Zone' },
                // S Archetypes
                { userEnteredValue: 'Box Specialist' },
                { userEnteredValue: 'Coverage Specialist' },
                { userEnteredValue: 'Hybrid' },
                // K/P Archetypes
                { userEnteredValue: 'Accurate' },
                { userEnteredValue: 'Power' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Height column in Roster (I2:I86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 8,
            endColumnIndex: 9
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: '5\'5"' }, { userEnteredValue: '5\'6"' }, { userEnteredValue: '5\'7"' },
                { userEnteredValue: '5\'8"' }, { userEnteredValue: '5\'9"' }, { userEnteredValue: '5\'10"' },
                { userEnteredValue: '5\'11"' }, { userEnteredValue: '6\'0"' }, { userEnteredValue: '6\'1"' },
                { userEnteredValue: '6\'2"' }, { userEnteredValue: '6\'3"' }, { userEnteredValue: '6\'4"' },
                { userEnteredValue: '6\'5"' }, { userEnteredValue: '6\'6"' }, { userEnteredValue: '6\'7"' },
                { userEnteredValue: '6\'8"' }, { userEnteredValue: '6\'9"' }, { userEnteredValue: '6\'10"' },
                { userEnteredValue: '6\'11"' }, { userEnteredValue: '7\'0"' }
              ]
            },
            showCustomUi: true,
            strict: true  // Only accept dropdown values, typing filters options
          }
        }
      },
      // Add data validation dropdown for State column in Roster (L2:L86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 11,
            endColumnIndex: 12
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'AL' }, { userEnteredValue: 'AK' }, { userEnteredValue: 'AZ' },
                { userEnteredValue: 'AR' }, { userEnteredValue: 'CA' }, { userEnteredValue: 'CO' },
                { userEnteredValue: 'CT' }, { userEnteredValue: 'DE' }, { userEnteredValue: 'FL' },
                { userEnteredValue: 'GA' }, { userEnteredValue: 'HI' }, { userEnteredValue: 'ID' },
                { userEnteredValue: 'IL' }, { userEnteredValue: 'IN' }, { userEnteredValue: 'IA' },
                { userEnteredValue: 'KS' }, { userEnteredValue: 'KY' }, { userEnteredValue: 'LA' },
                { userEnteredValue: 'ME' }, { userEnteredValue: 'MD' }, { userEnteredValue: 'MA' },
                { userEnteredValue: 'MI' }, { userEnteredValue: 'MN' }, { userEnteredValue: 'MS' },
                { userEnteredValue: 'MO' }, { userEnteredValue: 'MT' }, { userEnteredValue: 'NE' },
                { userEnteredValue: 'NV' }, { userEnteredValue: 'NH' }, { userEnteredValue: 'NJ' },
                { userEnteredValue: 'NM' }, { userEnteredValue: 'NY' }, { userEnteredValue: 'NC' },
                { userEnteredValue: 'ND' }, { userEnteredValue: 'OH' }, { userEnteredValue: 'OK' },
                { userEnteredValue: 'OR' }, { userEnteredValue: 'PA' }, { userEnteredValue: 'RI' },
                { userEnteredValue: 'SC' }, { userEnteredValue: 'SD' }, { userEnteredValue: 'TN' },
                { userEnteredValue: 'TX' }, { userEnteredValue: 'UT' }, { userEnteredValue: 'VT' },
                { userEnteredValue: 'VA' }, { userEnteredValue: 'WA' }, { userEnteredValue: 'WV' },
                { userEnteredValue: 'WI' }, { userEnteredValue: 'WY' }, { userEnteredValue: 'DC' }, { userEnteredValue: 'Non-US' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      }
    ]

    // Add conditional formatting rules for User Team column (column B, index 1)
    const userTeamFormattingRules = generateTeamFormattingRules(scheduleSheetId, 1, dynastyTeams)
    requests.push(...userTeamFormattingRules)

    // Add conditional formatting rules for CPU Team column (column C, index 2)
    const cpuTeamFormattingRules = generateTeamFormattingRules(scheduleSheetId, 2, dynastyTeams)
    requests.push(...cpuTeamFormattingRules)

    // Add auto-filter to roster header row for sorting/filtering
    requests.push({
      setBasicFilter: {
        filter: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 0,
            endRowIndex: 86,
            startColumnIndex: 0,
            endColumnIndex: 15
          }
        }
      }
    })

    const response = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('BatchUpdate failed:', error)
      throw new Error(`Failed to initialize sheet: ${error.error?.message || 'Unknown error'}`)
    }

    await response.json()
  } catch (error) {
    console.error('Error initializing headers:', error)
    throw error
  }
}

// Create a Schedule-only Google Sheet
export async function createScheduleSheet(dynastyName, year, userTeamName, existingSchedule = [], dynastyTeams = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Create the spreadsheet with just Schedule tab
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} Dynasty - ${year} Schedule`
        },
        sheets: [
          {
            properties: {
              title: 'Schedule',
              gridProperties: {
                rowCount: 17,  // 1 header + 16 data rows (weeks 0-15)
                columnCount: 4,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const scheduleSheetId = sheet.sheets[0].properties.sheetId

    // Initialize schedule headers and optionally pre-fill with existing schedule
    await initializeScheduleSheetOnly(sheet.spreadsheetId, accessToken, scheduleSheetId, userTeamName, existingSchedule, dynastyTeams)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Create schedule sheet error:', error)
    throw error
  }
}

// Create a Roster-only Google Sheet
export async function createRosterSheet(dynastyName, year) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Create the spreadsheet with just Roster tab
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} Dynasty - ${year} Roster`
        },
        sheets: [
          {
            properties: {
              title: 'Roster',
              gridProperties: {
                rowCount: 86,
                columnCount: 15,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const rosterSheetId = sheet.sheets[0].properties.sheetId

    // Initialize roster headers
    await initializeRosterSheetOnly(sheet.spreadsheetId, accessToken, rosterSheetId)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Create roster sheet error:', error)
    throw error
  }
}

// Initialize Schedule-only sheet headers and formatting
async function initializeScheduleSheetOnly(spreadsheetId, accessToken, scheduleSheetId, userTeamName, existingSchedule = [], dynastyTeams = null) {
  try {
    const userTeamAbbr = getAbbrFromTeamName(userTeamName, dynastyTeams)

    // Build schedule data rows - either from existing schedule or empty.
    // Week 0-15 = 16 weeks of regular season. Conference championship
    // week is its own phase, not a numbered regular-season week.
    const scheduleRows = Array.from({ length: 16 }, (_, i) => {
      const week = i  // Week 0-15
      const existingGame = existingSchedule.find(g => Number(g.week) === week)

      // Convert location to Site format (Home/Road/Neutral)
      let site = ''
      if (existingGame?.location) {
        const loc = existingGame.location.toLowerCase()
        if (loc === 'home') site = 'Home'
        else if (loc === 'away') site = 'Road'
        else if (loc === 'neutral') site = 'Neutral'
      }

      return {
        week,
        userTeam: existingGame?.userTeam || userTeamAbbr || '',
        opponent: existingGame?.opponent || '',
        site
      }
    })

    const requests = [
      // Schedule headers
      {
        updateCells: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          rows: [{
            values: [
              { userEnteredValue: { stringValue: 'Week' } },
              { userEnteredValue: { stringValue: 'User Team' } },
              { userEnteredValue: { stringValue: 'CPU Team' } },
              { userEnteredValue: { stringValue: 'Site' } }
            ]
          }],
          fields: 'userEnteredValue'
        }
      },
      // Pre-fill all schedule data (Week, User Team, CPU Team, Site)
      {
        updateCells: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 17,  // 16 data rows (weeks 0-15) + 1 header
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          rows: scheduleRows.map(row => ({
            values: [
              { userEnteredValue: { numberValue: Number(row.week) || 0 } },
              { userEnteredValue: { stringValue: String(row.userTeam ?? '') } },
              { userEnteredValue: { stringValue: String(row.opponent ?? '') } },
              { userEnteredValue: { stringValue: String(row.site ?? '') } }
            ]
          })),
          fields: 'userEnteredValue'
        }
      },
      // Bold headers
      {
        repeatCell: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true }
            }
          },
          fields: 'userEnteredFormat.textFormat.bold'
        }
      },
      // Protect Schedule header row
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: scheduleSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            description: 'Protected header row',
            warningOnly: false
          }
        }
      },
      // Protect Schedule Column A (Week)
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: scheduleSheetId,
              startRowIndex: 1,
              endRowIndex: 17,  // 16 data rows (weeks 0-15)
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            description: 'Protected Week column',
            warningOnly: false
          }
        }
      },
      // Protect Schedule Column B (User Team)
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: scheduleSheetId,
              startRowIndex: 1,
              endRowIndex: 17,  // 16 data rows (weeks 0-15)
              startColumnIndex: 1,
              endColumnIndex: 2
            },
            description: 'Protected User Team column',
            warningOnly: false
          }
        }
      },
      // Format all cells in Schedule sheet: Bold, Italic, Center, Barlow font, size 10
      {
        repeatCell: {
          range: {
            sheetId: scheduleSheetId
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Add data validation dropdown for User Team column (B2:B17) - FBS only
      {
        setDataValidation: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 17,  // 16 data rows (weeks 0-15)
            startColumnIndex: 1,
            endColumnIndex: 2
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [...getTeamNameOptions(dynastyTeams, { includeFCS: false }), ...getSelectableTeamsList(dynastyTeams)].map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for CPU Team column (C2:C17) - All teams including FCS and BYE
      {
        setDataValidation: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 17,  // 16 data rows (weeks 0-15)
            startColumnIndex: 2,
            endColumnIndex: 3
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: ['BYE', ...getTeamNameOptions(dynastyTeams, { includeFCS: true }), ...getSchedulableTeamsList(dynastyTeams)].map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Site column (D2:D17)
      {
        setDataValidation: {
          range: {
            sheetId: scheduleSheetId,
            startRowIndex: 1,
            endRowIndex: 17,  // 16 data rows (weeks 0-15)
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Home' },
                { userEnteredValue: 'Road' },
                { userEnteredValue: 'Neutral' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      }
    ]

    // Add conditional formatting rules for User Team column (column B, index 1)
    const userTeamFormattingRules = generateTeamFormattingRules(scheduleSheetId, 1, dynastyTeams)
    requests.push(...userTeamFormattingRules)

    // Add conditional formatting rules for CPU Team column (column C, index 2)
    const cpuTeamFormattingRules = generateTeamFormattingRules(scheduleSheetId, 2, dynastyTeams)
    requests.push(...cpuTeamFormattingRules)

    const response = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('BatchUpdate failed:', error)
      throw new Error(`Failed to initialize sheet: ${error.error?.message || 'Unknown error'}`)
    }

    await response.json()
  } catch (error) {
    console.error('Error initializing schedule headers:', error)
    throw error
  }
}

// Initialize Roster-only sheet headers and formatting
async function initializeRosterSheetOnly(spreadsheetId, accessToken, rosterSheetId) {
  try {

    const requests = [
      // Roster headers (15 columns)
      {
        updateCells: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 15
          },
          rows: [{
            values: [
              { userEnteredValue: { stringValue: 'First Name' } },
              { userEnteredValue: { stringValue: 'Last Name' } },
              { userEnteredValue: { stringValue: 'Position' } },
              { userEnteredValue: { stringValue: 'Class' } },
              { userEnteredValue: { stringValue: 'Dev Trait' } },
              { userEnteredValue: { stringValue: 'Jersey #' } },
              { userEnteredValue: { stringValue: 'Archetype' } },
              { userEnteredValue: { stringValue: 'Overall' } },
              { userEnteredValue: { stringValue: 'Height' } },
              { userEnteredValue: { stringValue: 'Weight' } },
              { userEnteredValue: { stringValue: 'Hometown' } },
              { userEnteredValue: { stringValue: 'State' } },
              { userEnteredValue: { stringValue: 'Image URL' } },
              { userEnteredValue: { stringValue: 'NIL' } },
              { userEnteredValue: { stringValue: 'Attributes' } }
            ]
          }],
          fields: 'userEnteredValue'
        }
      },
      // Bold headers
      {
        repeatCell: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true }
            }
          },
          fields: 'userEnteredFormat.textFormat.bold'
        }
      },
      // Protect Roster header row
      {
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: rosterSheetId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            description: 'Protected header row',
            warningOnly: false
          }
        }
      },
      // Format all cells in Roster sheet: Bold, Italic, Center, Barlow font, size 10
      {
        repeatCell: {
          range: {
            sheetId: rosterSheetId
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Add data validation dropdown for Position column in Roster (C2:C86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 2,
            endColumnIndex: 3
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'QB' },
                { userEnteredValue: 'HB' },
                { userEnteredValue: 'FB' },
                { userEnteredValue: 'WR' },
                { userEnteredValue: 'TE' },
                { userEnteredValue: 'LT' },
                { userEnteredValue: 'LG' },
                { userEnteredValue: 'C' },
                { userEnteredValue: 'RG' },
                { userEnteredValue: 'RT' },
                { userEnteredValue: 'LEDG' },
                { userEnteredValue: 'REDG' },
                { userEnteredValue: 'DT' },
                { userEnteredValue: 'SAM' },
                { userEnteredValue: 'MIKE' },
                { userEnteredValue: 'WILL' },
                { userEnteredValue: 'CB' },
                { userEnteredValue: 'FS' },
                { userEnteredValue: 'SS' },
                { userEnteredValue: 'K' },
                { userEnteredValue: 'P' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Class column in Roster (D2:D86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Fr' },
                { userEnteredValue: 'RS Fr' },
                { userEnteredValue: 'So' },
                { userEnteredValue: 'RS So' },
                { userEnteredValue: 'Jr' },
                { userEnteredValue: 'RS Jr' },
                { userEnteredValue: 'Sr' },
                { userEnteredValue: 'RS Sr' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Dev Trait column in Roster (E2:E86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 4,
            endColumnIndex: 5
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'Elite' },
                { userEnteredValue: 'Star' },
                { userEnteredValue: 'Impact' },
                { userEnteredValue: 'Normal' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Archetype column in Roster (G2:G86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 6,
            endColumnIndex: 7
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                // QB Archetypes
                { userEnteredValue: 'Backfield Creator' },
                { userEnteredValue: 'Dual Threat' },
                { userEnteredValue: 'Pocket Passer' },
                { userEnteredValue: 'Pure Runner' },
                // HB Archetypes
                { userEnteredValue: 'Backfield Threat' },
                { userEnteredValue: 'Contact Seeker' },
                { userEnteredValue: 'East/West Playmaker' },
                { userEnteredValue: 'Elusive Bruiser' },
                { userEnteredValue: 'North/South Receiver' },
                { userEnteredValue: 'North/South Blocker' },
                // FB Archetypes
                { userEnteredValue: 'Blocking' },
                { userEnteredValue: 'Utility' },
                // WR Archetypes
                { userEnteredValue: 'Contested Specialist' },
                { userEnteredValue: 'Elusive Route Runner' },
                { userEnteredValue: 'Gadget' },
                { userEnteredValue: 'Gritty Possession' },
                { userEnteredValue: 'Physical Route Runner' },
                { userEnteredValue: 'Route Artist' },
                { userEnteredValue: 'Speedster' },
                // TE Archetypes
                { userEnteredValue: 'Possession' },
                { userEnteredValue: 'Pure Blocker' },
                { userEnteredValue: 'Pure Possession' },
                { userEnteredValue: 'Vertical Threat' },
                // OL Archetypes
                { userEnteredValue: 'Agile' },
                { userEnteredValue: 'Pass Protector' },
                { userEnteredValue: 'Raw Strength' },
                { userEnteredValue: 'Ground and Pound' },
                { userEnteredValue: 'Well Rounded' },
                // DL Archetypes
                { userEnteredValue: 'Edge Setter' },
                { userEnteredValue: 'Gap Specialist' },
                { userEnteredValue: 'Power Rusher' },
                { userEnteredValue: 'Pure Power' },
                { userEnteredValue: 'Speed Rusher' },
                // LB Archetypes
                { userEnteredValue: 'Lurker' },
                { userEnteredValue: 'Signal Caller' },
                { userEnteredValue: 'Thumper' },
                // CB Archetypes
                { userEnteredValue: 'Boundary' },
                { userEnteredValue: 'Bump and Run' },
                { userEnteredValue: 'Field' },
                { userEnteredValue: 'Zone' },
                // S Archetypes
                { userEnteredValue: 'Box Specialist' },
                { userEnteredValue: 'Coverage Specialist' },
                { userEnteredValue: 'Hybrid' },
                // K/P Archetypes
                { userEnteredValue: 'Accurate' },
                { userEnteredValue: 'Power' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add data validation dropdown for Height column in Roster (I2:I86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 8,
            endColumnIndex: 9
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: '5\'5"' }, { userEnteredValue: '5\'6"' }, { userEnteredValue: '5\'7"' },
                { userEnteredValue: '5\'8"' }, { userEnteredValue: '5\'9"' }, { userEnteredValue: '5\'10"' },
                { userEnteredValue: '5\'11"' }, { userEnteredValue: '6\'0"' }, { userEnteredValue: '6\'1"' },
                { userEnteredValue: '6\'2"' }, { userEnteredValue: '6\'3"' }, { userEnteredValue: '6\'4"' },
                { userEnteredValue: '6\'5"' }, { userEnteredValue: '6\'6"' }, { userEnteredValue: '6\'7"' },
                { userEnteredValue: '6\'8"' }, { userEnteredValue: '6\'9"' }, { userEnteredValue: '6\'10"' },
                { userEnteredValue: '6\'11"' }, { userEnteredValue: '7\'0"' }
              ]
            },
            showCustomUi: true,
            strict: true  // Only accept dropdown values, typing filters options
          }
        }
      },
      // Add data validation dropdown for State column in Roster (L2:L86)
      {
        setDataValidation: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 1,
            endRowIndex: 86,
            startColumnIndex: 11,
            endColumnIndex: 12
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'AL' }, { userEnteredValue: 'AK' }, { userEnteredValue: 'AZ' },
                { userEnteredValue: 'AR' }, { userEnteredValue: 'CA' }, { userEnteredValue: 'CO' },
                { userEnteredValue: 'CT' }, { userEnteredValue: 'DE' }, { userEnteredValue: 'FL' },
                { userEnteredValue: 'GA' }, { userEnteredValue: 'HI' }, { userEnteredValue: 'ID' },
                { userEnteredValue: 'IL' }, { userEnteredValue: 'IN' }, { userEnteredValue: 'IA' },
                { userEnteredValue: 'KS' }, { userEnteredValue: 'KY' }, { userEnteredValue: 'LA' },
                { userEnteredValue: 'ME' }, { userEnteredValue: 'MD' }, { userEnteredValue: 'MA' },
                { userEnteredValue: 'MI' }, { userEnteredValue: 'MN' }, { userEnteredValue: 'MS' },
                { userEnteredValue: 'MO' }, { userEnteredValue: 'MT' }, { userEnteredValue: 'NE' },
                { userEnteredValue: 'NV' }, { userEnteredValue: 'NH' }, { userEnteredValue: 'NJ' },
                { userEnteredValue: 'NM' }, { userEnteredValue: 'NY' }, { userEnteredValue: 'NC' },
                { userEnteredValue: 'ND' }, { userEnteredValue: 'OH' }, { userEnteredValue: 'OK' },
                { userEnteredValue: 'OR' }, { userEnteredValue: 'PA' }, { userEnteredValue: 'RI' },
                { userEnteredValue: 'SC' }, { userEnteredValue: 'SD' }, { userEnteredValue: 'TN' },
                { userEnteredValue: 'TX' }, { userEnteredValue: 'UT' }, { userEnteredValue: 'VT' },
                { userEnteredValue: 'VA' }, { userEnteredValue: 'WA' }, { userEnteredValue: 'WV' },
                { userEnteredValue: 'WI' }, { userEnteredValue: 'WY' }, { userEnteredValue: 'DC' }, { userEnteredValue: 'Non-US' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // Add auto-filter to header row for sorting/filtering
      {
        setBasicFilter: {
          filter: {
            range: {
              sheetId: rosterSheetId,
              startRowIndex: 0,
              endRowIndex: 86,
              startColumnIndex: 0,
              endColumnIndex: 15
            }
          }
        }
      }
    ]

    const response = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('BatchUpdate failed:', error)
      throw new Error(`Failed to initialize sheet: ${error.error?.message || 'Unknown error'}`)
    }

    await response.json()
  } catch (error) {
    console.error('Error initializing roster headers:', error)
    throw error
  }
}

// Read schedule data from a Schedule-only sheet
export async function readScheduleFromScheduleSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      // Get OAuth access token (works for both free and paid tiers)
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Schedule!A2:D100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to read schedule')
      }

      const data = await response.json()
      rows = data.values || []
    }

    return rows
      .filter(row => row[2]) // Has CPU Team (opponent)
      .map((row, index) => {
        let location = (row[3] || 'Home').toLowerCase()
        if (location === 'road') {
          location = 'away'
        }

        // Resolve teams tolerantly: the cell may hold an abbreviation, a full
        // name with mascot, or a bare school name (users often paste team
        // names straight from the game). getTidFromTeamText handles all three;
        // we then normalize the stored string to the resolved abbreviation.
        const userTeamRaw = (row[1] || '').trim()
        const opponentRaw = (row[2] || '').trim()

        const userTeamTid = userTeamRaw ? getTidFromTeamText(userTeamRaw, dynastyTeams) : null
        const opponentTid = opponentRaw ? getTidFromTeamText(opponentRaw, dynastyTeams) : null

        const userTeamAbbr = userTeamTid != null
          ? (getAbbrFromTid(dynastyTeams, userTeamTid) || getAbbrFromTid(DEFAULT_TEAMS, userTeamTid) || userTeamRaw.toUpperCase())
          : userTeamRaw.toUpperCase()
        const opponentAbbr = opponentTid != null
          ? (getAbbrFromTid(dynastyTeams, opponentTid) || getAbbrFromTid(DEFAULT_TEAMS, opponentTid) || opponentRaw.toUpperCase())
          : opponentRaw.toUpperCase()

        // parseInt("0") is 0 (falsy), so a plain `|| index + 1` fallback
        // would silently re-assign Week 0 entries to the row index + 1 and
        // shift the entire schedule down. Only fall back when the parse
        // genuinely failed.
        const parsedWeek = parseInt(row[0])
        const week = Number.isFinite(parsedWeek) ? parsedWeek : (index + 1)

        return {
          week,
          userTeam: userTeamAbbr,
          userTeamTid,
          opponent: opponentAbbr,
          opponentTid,
          location
        }
      })
      // Drop any row claiming to be Week 16+: regular season is Week
      // 0-15. CCG / bowls / CFP are entered through dedicated flows.
      .filter(entry => entry.week >= 0 && entry.week <= 15)
  } catch (error) {
    console.error('Error reading schedule:', error)
    throw error
  }
}

// Read roster data from a Roster-only sheet
export async function readRosterFromRosterSheet(spreadsheetId, opts = {}) {
  try {
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      // Get OAuth access token (works for both free and paid tiers)
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:O100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to read roster')
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Helper to normalize height to 6'1" format
    const normalizeHeight = (heightStr) => {
      if (!heightStr) return ''
      let h = heightStr.toString().trim()
      h = h.replace(/['']/g, "'").replace(/[""]/g, '"')
      if (/^\d['′']\d{1,2}["″"]$/.test(h)) {
        return h.replace(/['′']/g, "'").replace(/["″"]/g, '"')
      }
      const missingQuoteMatch = h.match(/^(\d)['′'](\d{1,2})$/)
      if (missingQuoteMatch) return `${missingQuoteMatch[1]}'${missingQuoteMatch[2]}"`
      const dashMatch = h.match(/^(\d)-(\d{1,2})$/)
      if (dashMatch) return `${dashMatch[1]}'${dashMatch[2]}"`
      if (/^\d{2,3}$/.test(h)) {
        if (h.length === 2) return `${h[0]}'${h[1]}"`
        if (h.length === 3) return `${h[0]}'${h.slice(1)}"`
      }
      return h
    }

    return rows
      .filter(row => row[0]) // Has a first name (col A). Overall (col H) may be blank — it defaults to 0 below rather than dropping the player, because roster import REPLACES the roster, so a dropped row silently DELETES that player.
      .map(row => ({
        name: `${row[0] || ''} ${row[1] || ''}`.trim(),  // Combine first + last name
        firstName: row[0] || '',                          // A: First Name
        lastName: row[1] || '',                           // B: Last Name
        position: row[2] || 'QB',                         // C: Position
        year: row[3] || 'Fr',                             // D: Class
        devTrait: row[4] || '',                           // E: Dev Trait (blank stays blank)
        jerseyNumber: row[5] || '',                       // F: Jersey #
        archetype: row[6] || '',                          // G: Archetype
        overall: parseInt(row[7]) || 0,                   // H: Overall
        height: normalizeHeight(row[8]),                  // I: Height
        weight: row[9] ? parseInt(row[9]) : null,         // J: Weight
        hometown: row[10] || '',                          // K: Hometown
        state: row[11] || '',                             // L: State
        pictureUrl: row[12] || '',                         // M: Image URL
        nil: (row[13] != null && String(row[13]).trim() !== '') ? parseInt(row[13]) : null,  // N: NIL (CFB 27+)
        attributes: parseAttributes(row[14])              // O: Attributes (single-cell, CFB 27)
      }))
  } catch (error) {
    console.error('Error reading roster:', error)
    throw error
  }
}

// Pre-fill roster data into a Roster-only sheet. `year` (optional) selects which
// season's NIL to pre-fill into col N (CFB 27+); omitted → blank NIL column.
// Serialize roster players to the local-paste TSV — the SAME column order the
// Google sheet + readRosterFromRosterSheet use (First Name … NIL [, Attributes]).
// Used to pre-fill the local grid so "Edit Roster" opens on the current roster
// instead of a blank table. includeAttributes adds the 15th (col O) cell.
export function serializeRosterToTsv(players, { year = null, includeAttributes = true } = {}) {
  const splitName = (fullName) => {
    if (!fullName) return { firstName: '', lastName: '' }
    const parts = String(fullName).trim().split(/\s+/)
    if (parts.length === 1) return { firstName: parts[0], lastName: '' }
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
  }
  const nilFor = (p) => (year != null ? (p.nilByYear?.[year] ?? p.nilByYear?.[String(year)] ?? '') : '')
  const attrsFor = (p) => {
    const byYear = (year != null && p.attributesByYear)
      ? (p.attributesByYear[year] ?? p.attributesByYear[String(year)]) : null
    return serializeAttributes(byYear || p.attributes || null)
  }
  return (players || []).map((p) => {
    const { firstName, lastName } = p.firstName ? { firstName: p.firstName, lastName: p.lastName || '' } : splitName(p.name)
    const row = [
      firstName, lastName, p.position || '', p.year || '', p.devTrait || '',
      p.jerseyNumber || '', p.archetype || '', p.overall || '', p.height || '',
      p.weight || '', p.hometown || '', p.state || '', p.pictureUrl || '', nilFor(p),
    ]
    if (includeAttributes) row.push(attrsFor(p))
    return row.map((v) => (v == null ? '' : String(v))).join('\t')
  }).join('\n')
}

export async function prefillRosterSheet(spreadsheetId, players, year = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Helper to split name into first and last
    const splitName = (fullName) => {
      if (!fullName) return { firstName: '', lastName: '' }
      const parts = fullName.trim().split(/\s+/)
      if (parts.length === 1) return { firstName: parts[0], lastName: '' }
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
    }

    // Prepare roster data
    // Columns: First Name | Last Name | Position | Class | Dev Trait | Jersey # | Archetype | Overall | Height | Weight | Hometown | State | Image URL | NIL | Attributes
    const nilFor = (p) => (year != null ? (p.nilByYear?.[year] ?? p.nilByYear?.[String(year)] ?? '') : '')
    // Attributes are stored per-season; pre-fill the selected season's map (or the
    // flat recruit map as a fallback) as a single compact "AWR 88, SPD 90" cell.
    const attrsFor = (p) => {
      const byYear = (year != null && p.attributesByYear)
        ? (p.attributesByYear[year] ?? p.attributesByYear[String(year)]) : null
      return serializeAttributes(byYear || p.attributes || null)
    }
    const rosterValues = players.map(p => {
      const { firstName, lastName } = p.firstName ? { firstName: p.firstName, lastName: p.lastName || '' } : splitName(p.name)
      return [
        firstName,
        lastName,
        p.position || '',
        p.year || '',
        p.devTrait || '',
        p.jerseyNumber || '',
        p.archetype || '',
        p.overall || '',
        p.height || '',
        p.weight || '',
        p.hometown || '',
        p.state || '',
        p.pictureUrl || '',
        nilFor(p),
        attrsFor(p)
      ]
    })

    // Add 5 extra empty rows for adding new players
    const EXTRA_ROWS = 5
    for (let i = 0; i < EXTRA_ROWS; i++) {
      rosterValues.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    }

    if (rosterValues.length === 0) return

    // Write roster data starting at row 2 (after header)
    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:O${rosterValues.length + 1}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rosterValues
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to prefill roster: ${error.error?.message || 'Unknown error'}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error prefilling roster:', error)
    throw error
  }
}

// Get embed URL for a sheet
// Using usp=sharing to tell Google to treat this as a shared link access
// The sheet is shared publicly ("anyone with link can edit")
export function getSheetEmbedUrl(spreadsheetId, sheetName) {
  // Get the sheet GID (0 for Schedule, 1 for Roster in combined sheet)
  // For single-tab sheets, always use 0
  const gid = sheetName === 'Roster' ? 1 : 0
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing&rm=minimal&gid=${gid}`
  return url
}

// Get embed URL for a single-tab sheet (always gid=0)
export function getSingleSheetEmbedUrl(spreadsheetId) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing&rm=minimal&gid=0`
}

// Read schedule data from sheet
export async function readScheduleFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Schedule!A2:D100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    )

    if (!response.ok) {
      throw new Error('Failed to read schedule')
    }

    const data = await response.json()
    const rows = data.values || []

    return rows
      .filter(row => row[2]) // Has CPU Team (opponent)
      .map((row, index) => {
        // Normalize location values: "Road" -> "away", "Home" -> "home", "Neutral" -> "neutral"
        let location = (row[3] || 'Home').toLowerCase()
        if (location === 'road') {
          location = 'away'
        }

        const userTeamAbbr = (row[1] || '').toUpperCase()
        const opponentAbbr = row[2].toUpperCase()

        // Same Week-0 guard as readScheduleFromScheduleSheet: parseInt("0")
        // is 0 (falsy), so a plain `|| index + 1` fallback shifts Week 0
        // entries down. Only fall back on actual parse failure.
        const parsedWeek = parseInt(row[0])
        const week = Number.isFinite(parsedWeek) ? parsedWeek : (index + 1)

        return {
          week,
          userTeam: userTeamAbbr,
          userTeamTid: userTeamAbbr ? getTidFromAbbr(userTeamAbbr, dynastyTeams) : null,
          opponent: opponentAbbr,
          opponentTid: opponentAbbr ? getTidFromAbbr(opponentAbbr, dynastyTeams) : null,
          location
        }
      })
  } catch (error) {
    console.error('Error reading schedule:', error)
    throw error
  }
}

// Delete a Google Sheet (move to trash)
export async function deleteGoogleSheet(spreadsheetId) {
  try {
    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID provided')
    }

    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Use Drive API to trash the file
    const url = `${DRIVE_API_BASE}/${spreadsheetId}`

    const response = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trashed: true
      })
    })

    // "Already gone" counts as success — the caller wants the sheet not
    // to exist, and it doesn't. 404 = deleted; 403 = we've lost access
    // (treat like gone for regenerate purposes, where we're about to
    // create a fresh one anyway).
    if (response.status === 404 || response.status === 403) {
      return true
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = 'Unknown error'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorText
      } catch {
        errorMessage = errorText
      }
      throw new Error(`Failed to delete sheet: ${errorMessage}`)
    }

    await response.json()
    return true
  } catch (error) {
    console.error('Delete sheet error:', error)
    throw error
  }
}

/**
 * Check whether a stored sheet ID still points to a live (non-trashed) file.
 * Returns false if the file is missing (404), trashed, or we lack access (403).
 * Returns true on any successful read. On network / auth errors we return
 * true (assume-good) so we don't nuke the user's sheet ID on a transient blip.
 */
export async function sheetExists(spreadsheetId) {
  if (!spreadsheetId) return false
  try {
    const accessToken = await getAccessToken()
    const response = await fetchWithTimeout(
      `${DRIVE_API_BASE}/${spreadsheetId}?fields=id,trashed`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (response.status === 404 || response.status === 403) return false
    if (!response.ok) return true
    const data = await response.json()
    return !data.trashed
  } catch (error) {
    // Re-throw auth errors so callers can show the reauth modal.
    // For other network/parse errors, assume the sheet is still live
    // (conservative — avoids accidental "sheet not found" UX on transient failures).
    if (error?.isAuthError) throw error
    console.warn('sheetExists probe failed, assuming sheet is still live:', error?.message || error)
    return true
  }
}

// Restore a Google Sheet from trash
export async function restoreGoogleSheet(spreadsheetId) {
  try {
    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID provided')
    }

    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Use Drive API to untrash the file
    const url = `${DRIVE_API_BASE}/${spreadsheetId}`

    const response = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trashed: false
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = 'Unknown error'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorText
      } catch {
        errorMessage = errorText
      }
      throw new Error(`Failed to restore sheet: ${errorMessage}`)
    }

    await response.json()
    return true
  } catch (error) {
    console.error('Restore sheet error:', error)
    throw error
  }
}

// Read roster data from sheet (12 columns)
export async function readRosterFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:O100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    )

    if (!response.ok) {
      throw new Error('Failed to read roster')
    }

    const data = await response.json()
    const rows = data.values || []

    // Helper to normalize height to 6'1" format
    const normalizeHeight = (heightStr) => {
      if (!heightStr) return ''
      let h = heightStr.toString().trim()

      // Replace any smart quotes with standard quotes
      h = h.replace(/['']/g, "'").replace(/[""]/g, '"')

      // Already in correct format (6'1")
      if (/^\d['′']\d{1,2}["″"]$/.test(h)) {
        // Normalize quotes
        return h.replace(/['′']/g, "'").replace(/["″"]/g, '"')
      }

      // Format: 6'1 or 6′1 (missing closing quote)
      const missingQuoteMatch = h.match(/^(\d)['′'](\d{1,2})$/)
      if (missingQuoteMatch) return `${missingQuoteMatch[1]}'${missingQuoteMatch[2]}"`

      // Format: 6-1 or 6-10
      const dashMatch = h.match(/^(\d)-(\d{1,2})$/)
      if (dashMatch) return `${dashMatch[1]}'${dashMatch[2]}"`

      // Format: 61, 62, 510, 511, 610 (no separator)
      if (/^\d{2,3}$/.test(h)) {
        if (h.length === 2) {
          // 61 -> 6'1"
          return `${h[0]}'${h[1]}"`
        } else if (h.length === 3) {
          // 510 -> 5'10", 611 -> 6'11"
          return `${h[0]}'${h.slice(1)}"`
        }
      }

      // Return as-is if we can't parse
      return h
    }

    // Helper to split name into first and last
    const splitName = (fullName) => {
      if (!fullName) return { firstName: '', lastName: '' }
      const parts = fullName.trim().split(/\s+/)
      if (parts.length === 1) return { firstName: parts[0], lastName: '' }
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
    }

    return rows
      .filter(row => row[0]) // Has a first name (col A). Overall (col H) may be blank — it defaults to 0 below rather than dropping the player, because roster import REPLACES the roster, so a dropped row silently DELETES that player.
      .map(row => ({
        name: `${row[0] || ''} ${row[1] || ''}`.trim(),  // Combine first + last name
        firstName: row[0] || '',                          // A: First Name
        lastName: row[1] || '',                           // B: Last Name
        position: row[2] || 'QB',                         // C: Position
        year: row[3] || 'Fr',                             // D: Class
        devTrait: row[4] || '',                           // E: Dev Trait (blank stays blank)
        jerseyNumber: row[5] || '',                       // F: Jersey #
        archetype: row[6] || '',                          // G: Archetype
        overall: parseInt(row[7]) || 0,                   // H: Overall
        height: normalizeHeight(row[8]),                  // I: Height (auto-formats to 6'1")
        weight: row[9] ? parseInt(row[9]) : null,         // J: Weight
        hometown: row[10] || '',                          // K: Hometown
        state: row[11] || '',                             // L: State
        pictureUrl: row[12] || '',                         // M: Image URL
        nil: (row[13] != null && String(row[13]).trim() !== '') ? parseInt(row[13]) : null,  // N: NIL (CFB 27+)
        attributes: parseAttributes(row[14])              // O: Attributes (single-cell, CFB 27)
      }))
  } catch (error) {
    console.error('Error reading roster:', error)
    throw error
  }
}

// Write existing schedule and roster data to a sheet
export async function writeExistingDataToSheet(spreadsheetId, schedule, players, userTeamAbbr, year = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Prepare schedule data (rows 2-13, columns A-D)
    const scheduleValues = []
    for (let i = 0; i < 12; i++) {
      const game = schedule?.[i]
      if (game) {
        // Convert location back to sheet format
        let site = 'Home'
        if (game.location === 'away') site = 'Road'
        else if (game.location === 'neutral') site = 'Neutral'

        scheduleValues.push([
          game.week || i + 1,
          game.userTeam || userTeamAbbr || '',
          game.opponent || '',
          site
        ])
      } else {
        scheduleValues.push([i + 1, userTeamAbbr || '', '', ''])
      }
    }

    // Helper to convert number to star symbols
    const numberToStars = (num) => {
      if (!num || num < 1 || num > 5) return ''
      return '☆'.repeat(num)
    }

    // Helper to normalize height to 6'1" format
    const normalizeHeight = (heightStr) => {
      if (!heightStr) return ''
      let h = heightStr.toString().trim()
      h = h.replace(/['']/g, "'").replace(/[""]/g, '"')
      if (/^\d['′']\d{1,2}["″"]$/.test(h)) {
        return h.replace(/['′']/g, "'").replace(/["″"]/g, '"')
      }
      const missingQuoteMatch = h.match(/^(\d)['′'](\d{1,2})$/)
      if (missingQuoteMatch) return `${missingQuoteMatch[1]}'${missingQuoteMatch[2]}"`
      const dashMatch = h.match(/^(\d)-(\d{1,2})$/)
      if (dashMatch) return `${dashMatch[1]}'${dashMatch[2]}"`
      if (/^\d{2,3}$/.test(h)) {
        if (h.length === 2) return `${h[0]}'${h[1]}"`
        if (h.length === 3) return `${h[0]}'${h.slice(1)}"`
      }
      return h
    }

    // Helper to split name into first and last
    const splitName = (fullName) => {
      if (!fullName) return { firstName: '', lastName: '' }
      const parts = fullName.trim().split(/\s+/)
      if (parts.length === 1) return { firstName: parts[0], lastName: '' }
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
    }

    // Prepare roster data (rows 2-86, columns A-O, 15 columns)
    const attrsFor = (player) => {
      const byYear = (year != null && player.attributesByYear)
        ? (player.attributesByYear[year] ?? player.attributesByYear[String(year)]) : null
      return serializeAttributes(byYear || player.attributes || null)
    }
    const rosterValues = players?.map(player => {
      const { firstName, lastName } = player.firstName ? { firstName: player.firstName, lastName: player.lastName || '' } : splitName(player.name)
      return [
        firstName,                            // A: First Name
        lastName,                             // B: Last Name
        player.position || '',                // C: Position
        player.year || '',                    // D: Class
        player.devTrait || '',                // E: Dev Trait (blank stays blank)
        player.jerseyNumber || '',            // F: Jersey #
        player.archetype || '',               // G: Archetype
        player.overall || '',                 // H: Overall
        normalizeHeight(player.height),       // I: Height (normalized to 6'1" format)
        player.weight || '',                  // J: Weight
        player.hometown || '',                // K: Hometown
        player.state || '',                   // L: State
        player.pictureUrl || '',              // M: Image URL
        '',                                   // N: NIL (filled by the user; CFB 27+)
        attrsFor(player)                      // O: Attributes (single-cell, CFB 27)
      ]
    }) || []

    // Add 5 extra empty rows for adding new players
    const EXTRA_ROWS = 5
    for (let i = 0; i < EXTRA_ROWS; i++) {
      rosterValues.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    }

    // Batch update both sheets
    const requests = []

    // Write schedule data
    if (scheduleValues.length > 0) {
      requests.push(
        fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Schedule!A2:D13?valueInputOption=RAW`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: scheduleValues
          })
        })
      )
    }

    // Write roster data (15 columns)
    if (rosterValues.length > 0) {
      requests.push(
        fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:O${rosterValues.length + 1}?valueInputOption=RAW`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: rosterValues
          })
        })
      )
    }

    const responses = await Promise.all(requests)

    for (const response of responses) {
      if (!response.ok) {
        const error = await response.json()
        console.error('Failed to write data:', error)
        throw new Error(`Failed to write data: ${error.error?.message || 'Unknown error'}`)
      }
    }

    return true
  } catch (error) {
    console.error('Error writing existing data to sheet:', error)
    throw error
  }
}

// Create a Conference Championship sheet
// excludeConference: optional conference name to exclude (if user already played their CC game)
export async function createConferenceChampionshipSheet(dynastyName, year, excludeConference = null, existingData = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Conference list for CFB
    let conferences = [
      'American',
      'ACC',
      'Big 12',
      'Big Ten',
      'Conference USA',
      'MAC',
      'Mountain West',
      'Pac-12',
      'SEC',
      'Sun Belt'
    ]

    // Exclude user's conference if they already played their CC game
    if (excludeConference) {
      conferences = conferences.filter(conf =>
        conf.toLowerCase() !== excludeConference.toLowerCase()
      )
    }

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Conference Championships ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Conference Championships',
              gridProperties: {
                rowCount: conferences.length + 1,
                columnCount: 7,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create CC sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const ccSheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data
    await initializeConferenceChampionshipSheet(sheet.spreadsheetId, accessToken, ccSheetId, conferences, existingData, dynastyTeams)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating conference championship sheet:', error)
    throw error
  }
}

// Generate conditional formatting rules for team colors in CC sheet
function generateCCTeamFormattingRules(sheetId, columnIndex, rowCount, dynastyTeams = null) {
  const rules = []
  const teams = getTeamsWithCustom(dynastyTeams)

  for (const [abbr, teamData] of Object.entries(teams)) {
    // Add rule for uppercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })

    // Add rule for lowercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr.toLowerCase() }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })
  }

  return rules
}

// Initialize the Conference Championship sheet with headers and conference rows
async function initializeConferenceChampionshipSheet(spreadsheetId, accessToken, sheetId, conferences, existingData = [], dynastyTeams = null) {
  // Get team abbreviations for dropdown validation
  const teamAbbrs = getTeamAbbreviationsListWithCustom(dynastyTeams)
  const rowCount = conferences.length

  // Get existing data for a conference (guard against null entries)
  const getExistingCC = (conferenceName) => {
    return existingData.find(cc => cc && cc.conference === conferenceName) || {}
  }

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Conference' } },
            { userEnteredValue: { stringValue: 'Team 1' } },
            { userEnteredValue: { stringValue: 'Team 2' } },
            { userEnteredValue: { stringValue: 'Team 1 Score' } },
            { userEnteredValue: { stringValue: 'Team 2 Score' } },
            { userEnteredValue: { stringValue: 'T1 Rank' } },
            { userEnteredValue: { stringValue: 'T2 Rank' } },
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill conference names and existing data
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: conferences.map(conf => {
          const existing = getExistingCC(conf)
          const r1 = Number(existing.team1Rank)
          const r2 = Number(existing.team2Rank)
          return {
            values: [
              { userEnteredValue: { stringValue: String(conf ?? '') } },
              { userEnteredValue: { stringValue: String(existing.team1 ?? '') } },
              { userEnteredValue: { stringValue: String(existing.team2 ?? '') } },
              { userEnteredValue: (existing.team1Score != null && !Number.isNaN(Number(existing.team1Score))) ? { numberValue: Number(existing.team1Score) } : { stringValue: '' } },
              { userEnteredValue: (existing.team2Score != null && !Number.isNaN(Number(existing.team2Score))) ? { numberValue: Number(existing.team2Score) } : { stringValue: '' } },
              { userEnteredValue: (r1 >= 1 && r1 <= 25) ? { numberValue: r1 } : { stringValue: '' } },
              { userEnteredValue: (r2 >= 1 && r2 <= 25) ? { numberValue: r2 } : { stringValue: '' } },
            ]
          }
        }),
        fields: 'userEnteredValue'
      }
    },
    // Format all cells: Bold, Italic, Center, Barlow font, size 10
    {
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Add STRICT team dropdown validation for Team 1 column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Add STRICT team dropdown validation for Team 2 column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 2,
          endColumnIndex: 3
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Protect header row (not just warning)
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 7
          },
          description: 'Protected header row',
          warningOnly: false
        }
      }
    },
    // Protect conference column (not just warning)
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          description: 'Protected Conference column',
          warningOnly: false
        }
      }
    },
    // Rank dropdown validation — T1 Rank (col F, index 5)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 5,
          endColumnIndex: 6
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [{ userEnteredValue: '' }, ...Array.from({ length: 25 }, (_, i) => ({ userEnteredValue: String(i + 1) }))],
          },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Rank dropdown validation — T2 Rank (col G, index 6)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 6,
          endColumnIndex: 7
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [{ userEnteredValue: '' }, ...Array.from({ length: 25 }, (_, i) => ({ userEnteredValue: String(i + 1) }))],
          },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 130 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 3
        },
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3,
          endIndex: 5
        },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 5,
          endIndex: 7
        },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    // Add conditional formatting for team colors (Team 1 column)
    ...generateCCTeamFormattingRules(sheetId, 1, rowCount, dynastyTeams),
    // Add conditional formatting for team colors (Team 2 column)
    ...generateCCTeamFormattingRules(sheetId, 2, rowCount, dynastyTeams)
  ]

  // Execute batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing CC sheet:', error)
    throw new Error(`Failed to initialize CC sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read Conference Championship data from sheet
export async function readConferenceChampionshipsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      console.log('[readCCSheet] Reading from spreadsheet:', spreadsheetId)
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Conference Championships!A2:G11`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read CC data: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      console.log('[readCCSheet] Raw data from API:', data)
      rows = data.values || []
      console.log('[readCCSheet] Rows:', rows)
    }

    // Parse into structured data with tid fields for teambuilder support
    const championships = rows.map(row => {
      const team1Abbr = (row[1] || '').toUpperCase()
      const team2Abbr = (row[2] || '').toUpperCase()
      const team1Score = row[3] ? parseInt(row[3]) : null
      const team2Score = row[4] ? parseInt(row[4]) : null
      const team1Tid = team1Abbr ? getTidFromAbbr(team1Abbr, dynastyTeams) : null
      const team2Tid = team2Abbr ? getTidFromAbbr(team2Abbr, dynastyTeams) : null
      const r1 = row[5] ? parseInt(row[5], 10) : null
      const r2 = row[6] ? parseInt(row[6], 10) : null
      const team1Rank = r1 >= 1 && r1 <= 25 ? r1 : null
      const team2Rank = r2 >= 1 && r2 <= 25 ? r2 : null

      // Determine winner by score
      let winner = null
      let winnerTid = null
      if (team1Score !== null && team2Score !== null) {
        if (team1Score > team2Score) {
          winner = team1Abbr
          winnerTid = team1Tid
        } else {
          winner = team2Abbr
          winnerTid = team2Tid
        }
      }

      return {
        conference: row[0] || '',
        team1: team1Abbr,
        team2: team2Abbr,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        team1Rank,
        team2Rank,
        winner,
        winnerTid
      }
    })

    console.log('[readCCSheet] Parsed championships:', championships)
    return championships
  } catch (error) {
    console.error('[readCCSheet] Error reading CC data:', error)
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-year Conference Championships sheet — one Google Sheet, one tab per
// year. Tab title: `"YYYY Conference Championships"`. Current year tab first,
// then descending past years. Each tab uses the same 5-column layout as the
// single-year sheet (Conference, Team 1, Team 2, Team 1 Score, Team 2 Score)
// and is pre-filled with that year's existing CC games.
// ─────────────────────────────────────────────────────────────────────────────

const CC_HISTORY_CONFERENCES = [
  'American',
  'ACC',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'MAC',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt',
]
const CC_HISTORY_NUM_COLS = 5
const CC_HISTORY_NUM_ROWS = CC_HISTORY_CONFERENCES.length + 1 // header + 10 conf rows
const CC_HISTORY_TAB_RE = /^(\d{4})\s+Conference\s+Championships$/i
const CC_HISTORY_TAB_TITLE = (year) => `${year} Conference Championships`

// Walk dynasty.games[] and build a per-year, per-conference snapshot of
// existing CC games. Returns: { [year]: { [conference]: { team1, team2,
// team1Score, team2Score } } }. Used to pre-fill each tab so an unedited
// save round-trips to a no-op.
function buildCCHistoryPrefill(dynasty) {
  const teamsByTid = dynasty?.teams || {}
  const prefill = {}
  for (const g of (dynasty?.games || [])) {
    const isCCG = g?.isConferenceChampionship || g?.gameType === 'conference_championship'
    if (!isCCG) continue
    const year = Number(g.year)
    if (!Number.isFinite(year)) continue
    const conf = g.conference
    if (!conf) continue

    // Resolve abbrs preferring tid → abbr lookup; fall back to legacy
    // stored abbrs. This keeps the pre-fill correct after teambuilder
    // renames.
    let team1Abbr = g.team1
    let team2Abbr = g.team2
    if (g.team1Tid != null) {
      const t = teamsByTid[g.team1Tid] || teamsByTid[String(g.team1Tid)]
      if (t?.abbr) team1Abbr = t.abbr
    }
    if (g.team2Tid != null) {
      const t = teamsByTid[g.team2Tid] || teamsByTid[String(g.team2Tid)]
      if (t?.abbr) team2Abbr = t.abbr
    }
    if (!team1Abbr && g.userTeam) team1Abbr = g.userTeam
    if (!team2Abbr && g.opponent) team2Abbr = g.opponent

    const yearMap = prefill[year] || (prefill[year] = {})
    yearMap[conf] = {
      team1: team1Abbr || '',
      team2: team2Abbr || '',
      team1Score: g.team1Score ?? g.teamScore ?? null,
      team2Score: g.team2Score ?? g.opponentScore ?? null,
    }
  }
  return prefill
}

// Build the 11-row × 5-col value matrix for a single year's tab.
// Row 0: headers. Rows 1..10: one row per conference (in CC_HISTORY_CONFERENCES order).
function buildCCHistoryTabRows(yearPrefill) {
  const rows = [['Conference', 'Team 1', 'Team 2', 'Team 1 Score', 'Team 2 Score']]
  for (const conf of CC_HISTORY_CONFERENCES) {
    const existing = (yearPrefill && yearPrefill[conf]) || {}
    rows.push([
      conf,
      existing.team1 || '',
      existing.team2 || '',
      existing.team1Score != null ? String(existing.team1Score) : '',
      existing.team2Score != null ? String(existing.team2Score) : '',
    ])
  }
  return rows
}

/**
 * Create a multi-year Conference Championships spreadsheet. One tab per
 * year — current year first, then strictly descending past years (years
 * with at least one stored CC game). Each tab uses the same column layout
 * as the single-year CC sheet and is pre-filled with that year's existing
 * CC games. Returns `{ spreadsheetId, spreadsheetUrl, years }`.
 */
export async function createConferenceChampionshipsHistorySheet(dynastyName, dynasty) {
  if (!dynasty) throw new Error('createConferenceChampionshipsHistorySheet: dynasty is required')

  // Determine which years to render: union of every year with a stored
  // CC game and the dynasty's current year (so the active season always
  // appears even before its CCG is played).
  const yearSet = new Set()
  for (const g of (dynasty.games || [])) {
    if (g?.isConferenceChampionship || g?.gameType === 'conference_championship') {
      const y = Number(g.year)
      if (Number.isFinite(y)) yearSet.add(y)
    }
  }
  if (dynasty.currentYear != null) {
    const cy = Number(dynasty.currentYear)
    if (Number.isFinite(cy)) yearSet.add(cy)
  }
  if (yearSet.size === 0) {
    throw new Error('createConferenceChampionshipsHistorySheet: no years to render — dynasty has no CC games and no currentYear.')
  }

  // Current year first, then strictly descending past years.
  const currentYear = Number(dynasty.currentYear)
  const orderedYears = [...yearSet]
    .filter(y => Number.isFinite(y))
    .sort((a, b) => {
      if (Number.isFinite(currentYear)) {
        if (a === currentYear && b !== currentYear) return -1
        if (b === currentYear && a !== currentYear) return 1
      }
      return b - a
    })

  const accessToken = await getAccessToken()
  const prefill = buildCCHistoryPrefill(dynasty)

  // Step 1 — create the spreadsheet with one sheet (tab) per year.
  const createBody = {
    properties: { title: `${dynastyName} — Conference Championships` },
    sheets: orderedYears.map(year => ({
      properties: {
        title: CC_HISTORY_TAB_TITLE(year),
        gridProperties: {
          rowCount: CC_HISTORY_NUM_ROWS,
          columnCount: CC_HISTORY_NUM_COLS,
          frozenRowCount: 1,
        },
      },
    })),
  }
  const createRes = await fetchWithTimeout(SHEETS_API_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    throw new Error(`createConferenceChampionshipsHistorySheet: create failed — ${err.error?.message || createRes.status}`)
  }
  const sheet = await createRes.json()
  const sheetIdByYear = new Map()
  for (let i = 0; i < orderedYears.length; i++) {
    sheetIdByYear.set(orderedYears[i], sheet.sheets[i].properties.sheetId)
  }

  // Step 2 — pre-fill data for every tab via values batchUpdate.
  const valueRanges = orderedYears.map(year => ({
    range: `'${CC_HISTORY_TAB_TITLE(year)}'!A1:E${CC_HISTORY_NUM_ROWS}`,
    majorDimension: 'ROWS',
    values: buildCCHistoryTabRows(prefill[year] || {}),
  }))
  const valuesRes = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${sheet.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: valueRanges }),
    },
  )
  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}))
    throw new Error(`createConferenceChampionshipsHistorySheet: values batchUpdate failed — ${err.error?.message || valuesRes.status}`)
  }

  // Step 3 — formatting + validation + protection per tab. Split into
  // baseRequests (small, awaited) and colorRequests (per-team conditional
  // formatting, large — deferred to a background batch). Mirrors the
  // createTop25Sheet pattern.
  const baseRequests = []
  const colorRequests = []
  const teamsMap = getTeamsWithCustom(dynasty.teams)
  const teamAbbrs = Object.keys(teamsMap).sort()
  const validationValues = teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))

  for (const year of orderedYears) {
    const sId = sheetIdByYear.get(year)

    // Whole-tab text format (bold + italic + centered Barlow 10, matching
    // the single-year sheet).
    baseRequests.push({
      repeatCell: {
        range: { sheetId: sId },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, italic: true, fontFamily: 'Barlow', fontSize: 10 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)',
      },
    })

    // Header row gets a darker background.
    baseRequests.push({
      repeatCell: {
        range: { sheetId: sId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: CC_HISTORY_NUM_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.13, green: 0.14, blue: 0.18 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, italic: false },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    })

    // STRICT team dropdowns for Team 1 and Team 2 columns.
    baseRequests.push({
      setDataValidation: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: CC_HISTORY_NUM_ROWS, startColumnIndex: 1, endColumnIndex: 2 },
        rule: { condition: { type: 'ONE_OF_LIST', values: validationValues }, showCustomUi: true, strict: true },
      },
    })
    baseRequests.push({
      setDataValidation: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: CC_HISTORY_NUM_ROWS, startColumnIndex: 2, endColumnIndex: 3 },
        rule: { condition: { type: 'ONE_OF_LIST', values: validationValues }, showCustomUi: true, strict: true },
      },
    })

    // Protect header row and Conference column. Column A is the key we
    // read back against; the header is structural — neither should drift.
    baseRequests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: sId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: CC_HISTORY_NUM_COLS },
          description: 'Protected header row',
          warningOnly: false,
        },
      },
    })
    baseRequests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: sId, startRowIndex: 1, endRowIndex: CC_HISTORY_NUM_ROWS, startColumnIndex: 0, endColumnIndex: 1 },
          description: 'Protected Conference column',
          warningOnly: false,
        },
      },
    })

    // Sensible column widths.
    baseRequests.push({
      updateDimensionProperties: {
        range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 140 },
        fields: 'pixelSize',
      },
    })
    baseRequests.push({
      updateDimensionProperties: {
        range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 },
        properties: { pixelSize: 100 },
        fields: 'pixelSize',
      },
    })
    baseRequests.push({
      updateDimensionProperties: {
        range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 3, endIndex: 5 },
        properties: { pixelSize: 100 },
        fields: 'pixelSize',
      },
    })

    // Per-team conditional formatting (deferred to background — large).
    for (const [abbr, teamData] of Object.entries(teamsMap)) {
      for (const colIdx of [1, 2]) {
        colorRequests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: sId, startRowIndex: 1, endRowIndex: CC_HISTORY_NUM_ROWS, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: abbr }] },
                format: {
                  backgroundColor: hexToRgb(teamData.backgroundColor),
                  textFormat: { foregroundColor: hexToRgb(teamData.textColor), bold: true, italic: true },
                },
              },
            },
            index: 0,
          },
        })
      }
    }
  }

  const batchRes = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${sheet.spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: baseRequests }),
    },
  )
  if (!batchRes.ok) {
    const err = await batchRes.json().catch(() => ({}))
    throw new Error(`createConferenceChampionshipsHistorySheet: batchUpdate failed — ${err.error?.message || batchRes.status}`)
  }

  await shareSheetPublicly(sheet.spreadsheetId, accessToken)

  // Background: apply per-team conditional formatting. Non-fatal on
  // failure — the sheet is fully functional without team-color rules.
  if (colorRequests.length > 0) {
    fetch(
      `${SHEETS_API_BASE}/${sheet.spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: colorRequests }),
      },
    ).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('[createCCHistorySheet] background color formatting failed:', err?.error?.message || res.status)
      }
    }).catch((err) => {
      console.warn('[createCCHistorySheet] background color formatting threw:', err)
    })
  }

  return {
    spreadsheetId: sheet.spreadsheetId,
    spreadsheetUrl: sheet.spreadsheetUrl,
    years: orderedYears,
  }
}

/**
 * Read every `[YYYY] Conference Championships` tab on a multi-year CC sheet
 * and return a per-year championships list shaped like the single-year
 * `readConferenceChampionshipsFromSheet` output, but keyed by year.
 *
 * Return shape:
 *   {
 *     years: number[],              // present on the sheet, sorted desc
 *     byYear: {
 *       [year]: Array<{
 *         conference, team1, team2, team1Tid, team2Tid,
 *         team1Score, team2Score, winner, winnerTid
 *       }>
 *     },
 *   }
 *
 * Each year's array contains one entry per conference row read from the
 * sheet (up to 10). Entries with empty teams or missing scores have null
 * scores so the caller can filter them out (matching the existing
 * saveCPUConferenceChampionships filter).
 */
export async function readConferenceChampionshipsHistoryFromSheet(spreadsheetId, dynastyTeams = null) {
  const accessToken = await getAccessToken()

  // Resolve tab list so we know which years live on the sheet.
  const metaRes = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties(title)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}))
    throw new Error(`readConferenceChampionshipsHistoryFromSheet: meta fetch failed — ${err.error?.message || metaRes.status}`)
  }
  const meta = await metaRes.json()
  const tabs = (meta.sheets || []).map(s => s.properties).filter(Boolean)

  const ranges = []
  const yearByRange = new Map()
  for (const t of tabs) {
    const m = t?.title?.match(CC_HISTORY_TAB_RE)
    if (!m) continue
    const year = Number(m[1])
    if (!Number.isFinite(year)) continue
    const rng = `'${t.title}'!A2:E${CC_HISTORY_NUM_ROWS}`
    ranges.push(rng)
    yearByRange.set(rng, year)
  }
  if (ranges.length === 0) {
    return { years: [], byYear: {} }
  }

  const valuesRes = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}))
    throw new Error(`readConferenceChampionshipsHistoryFromSheet: values batchGet failed — ${err.error?.message || valuesRes.status}`)
  }
  const valuesData = await valuesRes.json()

  const byYear = {}
  for (const r of (valuesData.valueRanges || [])) {
    const year = yearByRange.get(r.range) ?? yearByRange.get(decodeURIComponent(r.range))
    if (!Number.isFinite(year)) continue
    const rows = r.values || []
    const championships = rows.map(row => {
      const team1Abbr = (row?.[1] || '').toUpperCase()
      const team2Abbr = (row?.[2] || '').toUpperCase()
      const rawT1Score = row?.[3]
      const rawT2Score = row?.[4]
      const team1Score = (rawT1Score !== '' && rawT1Score != null) ? parseInt(rawT1Score, 10) : null
      const team2Score = (rawT2Score !== '' && rawT2Score != null) ? parseInt(rawT2Score, 10) : null
      const team1Tid = team1Abbr ? getTidFromAbbr(team1Abbr, dynastyTeams) : null
      const team2Tid = team2Abbr ? getTidFromAbbr(team2Abbr, dynastyTeams) : null

      let winner = null
      let winnerTid = null
      if (team1Score != null && team2Score != null && !Number.isNaN(team1Score) && !Number.isNaN(team2Score)) {
        if (team1Score > team2Score) {
          winner = team1Abbr || null
          winnerTid = team1Tid
        } else if (team2Score > team1Score) {
          winner = team2Abbr || null
          winnerTid = team2Tid
        }
      }

      return {
        conference: row?.[0] || '',
        team1: team1Abbr,
        team2: team2Abbr,
        team1Tid,
        team2Tid,
        team1Score: Number.isFinite(team1Score) ? team1Score : null,
        team2Score: Number.isFinite(team2Score) ? team2Score : null,
        winner,
        winnerTid,
      }
    })
    byYear[year] = championships
  }

  const years = Object.keys(byYear).map(Number).filter(Number.isFinite).sort((a, b) => b - a)
  return { years, byYear }
}

// LOCAL-PASTE parse for multi-year Conference Championships History. The Google
// reader above fetches one tab PER YEAR and reads each tab's 5-column grid
// (Conference, Team1, Team2, Score1, Score2) positionally. splitTsv can't carry
// per-year tabs (blank lines + "=== … ===" labels stripped), so the local paste
// is SELF-DESCRIBING per row:
//
//   Year<TAB>Conference<TAB>Team1<TAB>Team2<TAB>Score1<TAB>Score2
//
// We group by the per-row year (col 0) and, within a year, emit the SAME
// per-conference championship objects the Google reader returns. Returns the
// SAME { years, byYear } shape, so the modal's existing guardrail + save
// (saveConferenceChampionshipsHistoryFromSheet) apply unchanged — that save is
// year-authoritative (replaces a year's CC games) and dedupes by conference, so
// omitting a year from the paste leaves it untouched and omitting a conference
// within an included year simply doesn't create that game.
export function parseConferenceChampionshipsHistoryLocal(rows, dynastyTeams = null) {
  const byYear = {}
  for (const row of (rows || [])) {
    const year = Number(String(row?.[0] || '').trim())
    if (!Number.isFinite(year)) continue
    const conference = row?.[1] || ''
    const team1Abbr = (row?.[2] || '').toUpperCase()
    const team2Abbr = (row?.[3] || '').toUpperCase()
    const rawT1Score = row?.[4]
    const rawT2Score = row?.[5]
    const team1Score = (rawT1Score !== '' && rawT1Score != null) ? parseInt(rawT1Score, 10) : null
    const team2Score = (rawT2Score !== '' && rawT2Score != null) ? parseInt(rawT2Score, 10) : null
    const team1Tid = team1Abbr ? getTidFromAbbr(team1Abbr, dynastyTeams) : null
    const team2Tid = team2Abbr ? getTidFromAbbr(team2Abbr, dynastyTeams) : null

    let winner = null
    let winnerTid = null
    if (team1Score != null && team2Score != null && !Number.isNaN(team1Score) && !Number.isNaN(team2Score)) {
      if (team1Score > team2Score) {
        winner = team1Abbr || null
        winnerTid = team1Tid
      } else if (team2Score > team1Score) {
        winner = team2Abbr || null
        winnerTid = team2Tid
      }
    }

    if (!byYear[year]) byYear[year] = []
    byYear[year].push({
      conference,
      team1: team1Abbr,
      team2: team2Abbr,
      team1Tid,
      team2Tid,
      team1Score: Number.isFinite(team1Score) ? team1Score : null,
      team2Score: Number.isFinite(team2Score) ? team2Score : null,
      winner,
      winnerTid,
    })
  }

  const years = Object.keys(byYear).map(Number).filter(Number.isFinite).sort((a, b) => b - a)
  return { years, byYear }
}

// Bowl games list for Bowl Week 1 (25 regular bowls + 4 CFP First Round = 29 games)
const BOWL_GAMES_WEEK_1 = [
  '68 Ventures Bowl',
  'Alamo Bowl',
  'Arizona Bowl',
  'Armed Forces Bowl',
  'Birmingham Bowl',
  'Boca Raton Bowl',
  'CFP First Round (#8 vs #9)',
  'CFP First Round (#7 vs #10)',
  'CFP First Round (#6 vs #11)',
  'CFP First Round (#5 vs #12)',
  'Cure Bowl',
  'Famous Idaho Potato Bowl',
  'Fenway Bowl',
  'Frisco Bowl',
  'GameAbove Sports Bowl',
  'Gasparilla Bowl',
  'Hawaii Bowl',
  'Holiday Bowl',
  'Independence Bowl',
  'LA Bowl',
  'Las Vegas Bowl',
  'Liberty Bowl',
  'Military Bowl',
  'Myrtle Beach Bowl',
  'New Mexico Bowl',
  'New Orleans Bowl',
  'Pop-Tarts Bowl',
  'Rate Bowl',
  'Salute to Veterans Bowl'
]

// CFP First Round matchups (seed pairs) - ordered: 8v9, 7v10, 6v11, 5v12
const CFP_FIRST_ROUND_MATCHUPS = [
  { game: 'CFP First Round (#8 vs #9)', seed1: 8, seed2: 9 },
  { game: 'CFP First Round (#7 vs #10)', seed1: 7, seed2: 10 },
  { game: 'CFP First Round (#6 vs #11)', seed1: 6, seed2: 11 },
  { game: 'CFP First Round (#5 vs #12)', seed1: 5, seed2: 12 }
]

// Regular bowl games for Bowl Week 2 (9 games - excludes CFP Quarterfinals)
const BOWL_GAMES_WEEK_2_REGULAR = [
  'Citrus Bowl',
  "Duke's Mayo Bowl",
  'First Responder Bowl',
  'Gator Bowl',
  'Music City Bowl',
  'Reliaquest Bowl',
  'Sun Bowl',
  'Texas Bowl',
  'Xbox Bowl'
]

// CFP Quarterfinal matchup definitions by bye seed
// The actual bowl names come from the user's cfpBowlConfig for that year
const CFP_QF_MATCHUPS_BY_SEED = {
  1: { firstRoundSeeds: [8, 9] },   // #1 seed plays winner of 8v9
  2: { firstRoundSeeds: [7, 10] },  // #2 seed plays winner of 7v10
  3: { firstRoundSeeds: [6, 11] },  // #3 seed plays winner of 6v11
  4: { firstRoundSeeds: [5, 12] }   // #4 seed plays winner of 5v12
}

// Build Bowl Week 2 games list with dynamic CFP QF bowls based on config
// cfpBowlConfig: { seed1: 'Sugar Bowl', seed2: 'Cotton Bowl', seed3: 'Rose Bowl', seed4: 'Orange Bowl', sf1: 'Peach Bowl', sf2: 'Fiesta Bowl' }
// Exported so the Bowl Week 2 modal can show the AI prompt the EXACT
// sorted row order the sheet uses (which depends on the user's QF bowl
// assignments — Cotton vs. Sugar vs. Rose vs. Orange swap positions).
export const getBowlGamesWeek2 = (cfpBowlConfig = null) => {
  // Default bowl config if not provided
  const config = cfpBowlConfig || {
    seed1: 'Sugar Bowl',
    seed2: 'Cotton Bowl',
    seed3: 'Rose Bowl',
    seed4: 'Orange Bowl'
  }

  // Get the 4 CFP QF bowl names from config (seed1-4 are QF games)
  const cfpQFBowls = [
    `${config.seed1} (CFP QF)`,
    `${config.seed2} (CFP QF)`,
    `${config.seed3} (CFP QF)`,
    `${config.seed4} (CFP QF)`
  ]

  // Combine regular bowls + CFP QF bowls, sorted alphabetically
  return [...BOWL_GAMES_WEEK_2_REGULAR, ...cfpQFBowls].sort()
}

// Legacy constant for backward compatibility (uses default config)
const BOWL_GAMES_WEEK_2 = getBowlGamesWeek2()

// CFP Quarterfinal matchup definitions (legacy - for backward compatibility)
const CFP_QF_MATCHUPS = {
  'Sugar Bowl (CFP QF)': { firstRoundSeeds: [5, 12], topSeed: 4 },
  'Orange Bowl (CFP QF)': { firstRoundSeeds: [8, 9], topSeed: 1 },
  'Rose Bowl (CFP QF)': { firstRoundSeeds: [6, 11], topSeed: 3 },
  'Cotton Bowl (CFP QF)': { firstRoundSeeds: [7, 10], topSeed: 2 }
}

// All bowl games combined (for dropdown selection)
const ALL_BOWL_GAMES = [...BOWL_GAMES_WEEK_1, ...BOWL_GAMES_WEEK_2]

// Create Bowl Week 1 sheet with all bowl games (including CFP First Round with pre-filled teams)
// excludeGames: array of game names to exclude (user's CFP First Round game, user's bowl game)
// ── Staff Moves (coaching carousel) ──────────────────────────────────
//
// A single-tab sheet mirroring the in-game Staff Moves board (minus prestige).
// Columns A–F: Name, Prev Pos, Prev School, New Pos, New School, Reason. The
// local-paste path is the default; this is the "Use Google Sheet instead"
// fallback. readStaffMovesFromSheet returns raw rows[][] so the SAME
// parseStaffMovesRows (utils/staffMoves.js) handles both paths.

async function initializeStaffMovesSheet(spreadsheetId, accessToken, sheetId, moves, rowCount, dynastyTeams = null) {
  const teamAbbrs = getTeamAbbreviationsListWithCustom(dynastyTeams)
  const roleList = ['HC', 'OC', 'DC']
  const headers = ['Name', 'Prev Pos', 'Prev School', 'New Pos', 'New School', 'Reason']
  const dataRows = (moves || []).map((m) => ({
    values: [
      { userEnteredValue: { stringValue: String(m.name ?? '') } },
      { userEnteredValue: { stringValue: String(m.prevRole ?? '') } },
      { userEnteredValue: { stringValue: String(m.prevTeamAbbr ?? '') } },
      { userEnteredValue: { stringValue: String(m.newRole ?? '') } },
      { userEnteredValue: { stringValue: String(m.newTeamAbbr ?? '') } },
      { userEnteredValue: { stringValue: String(m.reason ?? '') } },
    ],
  }))

  const requests = [
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
        rows: [{ values: headers.map((h) => ({ userEnteredValue: { stringValue: h } })) }],
        fields: 'userEnteredValue',
      },
    },
  ]
  if (dataRows.length) {
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1 + dataRows.length, startColumnIndex: 0, endColumnIndex: 6 },
        rows: dataRows,
        fields: 'userEnteredValue',
      },
    })
  }
  // Position dropdowns (Prev Pos col 1, New Pos col 3) — lenient so blanks pass.
  for (const col of [1, 3]) {
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        rule: { condition: { type: 'ONE_OF_LIST', values: roleList.map((r) => ({ userEnteredValue: r })) }, showCustomUi: true, strict: false },
      },
    })
  }
  // School dropdowns (Prev School col 2, New School col 4) — lenient so blank /
  // "---" (retired / NFL) pass without a validation error.
  for (const col of [2, 4]) {
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        rule: { condition: { type: 'ONE_OF_LIST', values: teamAbbrs.map((a) => ({ userEnteredValue: a })) }, showCustomUi: true, strict: false },
      },
    })
  }
  requests.push({
    addProtectedRange: {
      protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, description: 'Header row - do not edit', warningOnly: true },
    },
  })

  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing staff moves sheet:', error)
    throw new Error(`Failed to initialize staff moves sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

export async function createStaffMovesSheet(dynastyName, year, existingMoves = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const moves = Array.isArray(existingMoves) ? existingMoves : []
    const rowCount = Math.max(moves.length, 40)
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: `${dynastyName} - Staff Moves ${year}` },
        sheets: [{ properties: { title: 'Staff Moves', gridProperties: { rowCount: rowCount + 5, columnCount: 6, frozenRowCount: 1 } } }],
      }),
    })
    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create staff moves sheet: ${error.error?.message || 'Unknown error'}`)
    }
    const sheet = await response.json()
    const gridSheetId = sheet.sheets[0].properties.sheetId
    await initializeStaffMovesSheet(sheet.spreadsheetId, accessToken, gridSheetId, moves, rowCount, dynastyTeams)
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)
    return { spreadsheetId: sheet.spreadsheetId, spreadsheetUrl: sheet.spreadsheetUrl }
  } catch (error) {
    console.error('Error creating staff moves sheet:', error)
    throw error
  }
}

// Read Staff Moves rows. Returns raw rows[][] (data.values) so the caller runs
// the same parseStaffMovesRows used by the local-paste path.
export async function readStaffMovesFromSheet(spreadsheetId, opts = {}) {
  if (opts.rows) return opts.rows
  const accessToken = await getAccessToken()
  const response = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/Staff Moves!A2:F1000`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )
  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to read staff moves: ${error.error?.message || 'Unknown error'}`)
  }
  const data = await response.json()
  return data.values || []
}

export async function createBowlWeek1Sheet(dynastyName, year, cfpSeeds = [], excludeGames = [], existingBowlWeek1 = [], existingCFPFirstRound = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Filter out games that the user is playing in (they enter those separately)
    const bowlGames = BOWL_GAMES_WEEK_1.filter(game => !excludeGames.includes(game))
    const rowCount = bowlGames.length

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Bowl Games ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Bowl Games',
              gridProperties: {
                rowCount: rowCount + 28,
                columnCount: 7,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create bowl sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const bowlSheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data (pass cfpSeeds to pre-fill CFP First Round teams, and existing data for prefill)
    await initializeBowlWeek1Sheet(sheet.spreadsheetId, accessToken, bowlSheetId, bowlGames, cfpSeeds, existingBowlWeek1, existingCFPFirstRound, dynastyTeams)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating bowl week 1 sheet:', error)
    throw error
  }
}

// Generate conditional formatting rules for team colors in bowl sheet.
// getTeamsWithCustom is tid-based (built from dynasty.teams[tid]), so every
// team in the dynasty — FBS, FCS placeholder, and custom/teambuilder — gets a
// rule. Sheet cells now hold team NAMES (prefill + AI both output names), so we
// match on the name; we also keep an abbr rule so legacy/abbr pastes still
// color. TEXT_EQ is case-insensitive, covering "Wyoming"/"wyoming" alike.
function generateBowlTeamFormattingRules(sheetId, columnIndex, rowCount, dynastyTeams = null) {
  const rules = []
  const teams = getTeamsWithCustom(dynastyTeams)

  const range = {
    sheetId,
    startRowIndex: 1,
    endRowIndex: rowCount + 1,
    startColumnIndex: columnIndex,
    endColumnIndex: columnIndex + 1,
  }

  for (const [abbr, teamData] of Object.entries(teams)) {
    const format = {
      backgroundColor: hexToRgb(teamData.backgroundColor),
      textFormat: {
        foregroundColor: hexToRgb(teamData.textColor),
        bold: true,
        italic: true,
      },
    }
    // Match values the cell can actually contain: the team NAME (default for
    // prefills and AI output) and the ABBR (legacy pastes). Dedup so a team
    // whose name equals its abbr doesn't emit two identical rules.
    const matchValues = Array.from(
      new Set([teamData.name, abbr].filter((v) => v && String(v).trim() !== '')),
    )
    for (const matchValue of matchValues) {
      rules.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ ...range }],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: String(matchValue) }],
              },
              format,
            },
          },
          index: 0,
        },
      })
    }
  }

  return rules
}

// Initialize the Bowl Week 1 sheet with headers and bowl game rows
async function initializeBowlWeek1Sheet(spreadsheetId, accessToken, sheetId, bowlGames, cfpSeeds = [], existingBowlWeek1 = [], existingCFPFirstRound = [], dynastyTeams = null) {
  const teamAbbrs = getTeamAbbreviationsListWithCustom(dynastyTeams)
  const rowCount = bowlGames.length

  // Build pre-filled team data for CFP First Round games (tid-based lookup)
  const getTeamBySeed = (seed) => {
    const seedEntry = cfpSeeds?.find(s => s.seed === seed)
    if (!seedEntry?.tid) return ''
    // Look up in dynastyTeams first, then DEFAULT_TEAMS
    const teamData = dynastyTeams?.[seedEntry.tid] || DEFAULT_TEAMS[seedEntry.tid]
    return teamData?.abbr || ''
  }

  // Helper to get existing bowl data by bowl name
  const getExistingBowlData = (bowlName) => {
    // Check in regular bowl games (guard against null entries)
    const bowlData = existingBowlWeek1.find(b => b && b.bowlName === bowlName)
    if (bowlData) return bowlData

    // Check in CFP First Round results (different data structure)
    const cfpMatch = CFP_FIRST_ROUND_MATCHUPS.find(m => m.game === bowlName)
    if (cfpMatch) {
      const cfpData = existingCFPFirstRound.find(g => {
        // Guard against null/undefined entries
        if (!g) return false
        // Match by seeds or by teams
        return (g.seed1 === cfpMatch.seed1 && g.seed2 === cfpMatch.seed2)
      })
      if (cfpData) {
        return {
          bowlName,
          team1: cfpData.team1 || getTeamBySeed(cfpMatch.seed1),
          team2: cfpData.team2 || getTeamBySeed(cfpMatch.seed2),
          team1Score: cfpData.score1,
          team2Score: cfpData.score2
        }
      }
    }
    return null
  }

  // Create rows with bowl names and pre-filled CFP teams + existing data
  const bowlRows = bowlGames.map(bowl => {
    const existingData = getExistingBowlData(bowl)
    const matchup = CFP_FIRST_ROUND_MATCHUPS.find(m => m.game === bowl)

    // Priority: existing data > CFP seed data > empty
    let team1 = existingData?.team1 || ''
    let team2 = existingData?.team2 || ''
    let team1Score = existingData?.team1Score
    let team2Score = existingData?.team2Score

    // For CFP First Round games without existing data, use seed data
    if (!existingData && matchup && cfpSeeds.length > 0) {
      team1 = getTeamBySeed(matchup.seed1)
      team2 = getTeamBySeed(matchup.seed2)
    }

    const values = [
      { userEnteredValue: { stringValue: String(bowl ?? '') } },
      { userEnteredValue: { stringValue: String(team1 ?? '') } },
      { userEnteredValue: { stringValue: '' } },  // Team 1 Rank (blank, user fills from screenshot)
      { userEnteredValue: { stringValue: String(team2 ?? '') } },
      { userEnteredValue: { stringValue: '' } },  // Team 2 Rank (blank)
    ]

    // Add scores if we have them
    if (team1Score !== undefined && team1Score !== null && !Number.isNaN(Number(team1Score))) {
      values.push({ userEnteredValue: { numberValue: Number(team1Score) } })
    } else {
      values.push({ userEnteredValue: { stringValue: '' } })
    }
    if (team2Score !== undefined && team2Score !== null && !Number.isNaN(Number(team2Score))) {
      values.push({ userEnteredValue: { numberValue: Number(team2Score) } })
    } else {
      values.push({ userEnteredValue: { stringValue: '' } })
    }

    return { values }
  })

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Bowl Game' } },
            { userEnteredValue: { stringValue: 'Team 1' } },
            { userEnteredValue: { stringValue: 'T1 Rank' } },
            { userEnteredValue: { stringValue: 'Team 2' } },
            { userEnteredValue: { stringValue: 'T2 Rank' } },
            { userEnteredValue: { stringValue: 'Team 1 Score' } },
            { userEnteredValue: { stringValue: 'Team 2 Score' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill bowl game names, teams, and scores
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: bowlRows,
        fields: 'userEnteredValue'
      }
    },
    // Format all cells: Bold, Italic, Center, Barlow font, size 10
    {
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Add STRICT team dropdown validation for Team 1 column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Add STRICT team dropdown validation for Team 2 column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 3,
          endColumnIndex: 4
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    },
    // Protect bowl names column
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          description: 'Bowl names - do not edit',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 2,
          endIndex: 3
        },
        properties: { pixelSize: 55 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3,
          endIndex: 4
        },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 4,
          endIndex: 5
        },
        properties: { pixelSize: 55 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 5,
          endIndex: 7
        },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    // Add conditional formatting for team colors (Team 1 column)
    ...generateBowlTeamFormattingRules(sheetId, 1, rowCount, dynastyTeams),
    // Add conditional formatting for team colors (Team 2 column)
    ...generateBowlTeamFormattingRules(sheetId, 3, rowCount, dynastyTeams)
  ]

  // Execute batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing bowl sheet:', error)
    throw new Error(`Failed to initialize bowl sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read Bowl Games data from sheet
export async function readBowlGamesFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    // The caller reshapes its self-describing rows into this parser's column
    // layout (game rows: bowl name in col A; poll rows: blank col A, abbr in
    // col B, rank in col C) — the parse logic below is unchanged.
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const rowCount = BOWL_GAMES_WEEK_1.length
      console.log('[readBowlGamesFromSheet] Reading', rowCount, 'rows from sheet:', spreadsheetId)
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Bowl Games!A2:G${rowCount + 28}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read bowl data: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
      console.log('[readBowlGamesFromSheet] Got', rows.length, 'rows from API')
    }

    // Parse into structured data with tid fields for teambuilder support.
    // Rows with a non-empty Col A (bowl name) are game rows.
    // Rows with an empty Col A but non-empty Col B (team abbr) and Col C
    // (rank 1-25) are post-bowl poll entries pasted below the game block.
    const bowlGames = []
    const pollEntries = []

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      const bowlName = row[0] || ''

      if (!bowlName.trim()) {
        // Poll row — col B = team abbr, col C = rank
        const pollAbbr = (row[1] || '').toUpperCase().trim()
        const pollRankRaw = row[2]
        const pollRank = pollRankRaw !== undefined && pollRankRaw !== '' ? parseInt(pollRankRaw, 10) : null
        if (pollAbbr && pollRank !== null && !isNaN(pollRank) && pollRank >= 1 && pollRank <= 25) {
          const pollTid = getTidFromAbbr(pollAbbr, dynastyTeams)
          pollEntries.push({ abbr: pollAbbr, rank: pollRank, tid: pollTid })
        }
        continue
      }

      const team1Abbr = (row[1] || '').toUpperCase()
      const team1Rank = row[2] ? parseInt(row[2], 10) : null
      const team2Abbr = (row[3] || '').toUpperCase()
      const team2Rank = row[4] ? parseInt(row[4], 10) : null
      // Parse scores - handle empty strings, "0", and NaN correctly
      const score1Raw = row[5]
      const score2Raw = row[6]
      const parsedScore1 = score1Raw !== undefined && score1Raw !== '' ? parseInt(score1Raw, 10) : null
      const parsedScore2 = score2Raw !== undefined && score2Raw !== '' ? parseInt(score2Raw, 10) : null
      // Handle NaN from parseInt
      const team1Score = parsedScore1 !== null && !isNaN(parsedScore1) ? parsedScore1 : null
      const team2Score = parsedScore2 !== null && !isNaN(parsedScore2) ? parsedScore2 : null

      // Debug log for each row with scores
      console.log(`[readBowlGamesFromSheet] Row ${idx}: "${bowlName}" - ${team1Abbr} (raw: "${score1Raw}", parsed: ${team1Score}) vs ${team2Abbr} (raw: "${score2Raw}", parsed: ${team2Score})`)
      const team1Tid = team1Abbr ? getTidFromAbbr(team1Abbr, dynastyTeams) : null
      const team2Tid = team2Abbr ? getTidFromAbbr(team2Abbr, dynastyTeams) : null

      // Determine winner by score
      let winner = null
      let winnerTid = null
      if (team1Score !== null && team2Score !== null) {
        if (team1Score > team2Score) {
          winner = team1Abbr
          winnerTid = team1Tid
        } else {
          winner = team2Abbr
          winnerTid = team2Tid
        }
      }

      bowlGames.push({
        bowlName,
        team1: team1Abbr,
        team1Rank: team1Rank !== null && !isNaN(team1Rank) && team1Rank >= 1 && team1Rank <= 25 ? team1Rank : null,
        team2: team2Abbr,
        team2Rank: team2Rank !== null && !isNaN(team2Rank) && team2Rank >= 1 && team2Rank <= 25 ? team2Rank : null,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        winner,
        winnerTid
      })
    }

    // Build the COMPLETE post-bowl poll by merging two disjoint sources:
    //   1. Played teams' ranks straight off their game rows (Col C / Col E).
    //   2. The non-playing ranked teams pasted in the block below the games.
    // The prompt now puts a played team's rank ONLY on its game row (never in
    // the block), so together they form the full Top 25. Game rows are
    // authoritative: a played team is never a "non-playing" block entry, and a
    // rank already claimed by a played team wins over a colliding block row.
    // This mirrors saveWeeklyScores' played-tid bye guard — and stays correct
    // even if an older prompt still emits a full-25 block (the duplicates for
    // played teams are simply skipped).
    const mergedPoll = []
    const seenPollRanks = new Set()
    const playedPollTids = new Set()
    for (const g of bowlGames) {
      // CFP rows ("CFP First Round …", "… (CFP QF)") show a SEED (1–12) as the
      // number prefix, NOT an AP rank — so we must not harvest it as a poll
      // rank, and we must NOT mark CFP teams as "played" for poll purposes.
      // That keeps them eligible for the non-playing block, which carries
      // their true AP rank (the user's chosen behavior, and the only source
      // for a CFP team's AP rank whether or not its bowl is entered via AI).
      if (g.bowlName && /CFP/i.test(g.bowlName)) continue
      for (const side of [
        { tid: g.team1Tid, rank: g.team1Rank, abbr: g.team1 },
        { tid: g.team2Tid, rank: g.team2Rank, abbr: g.team2 },
      ]) {
        if (side.tid != null) playedPollTids.add(Number(side.tid))
        const r = side.rank
        if (typeof r === 'number' && r >= 1 && r <= 25 && side.tid != null && !seenPollRanks.has(r)) {
          seenPollRanks.add(r)
          mergedPoll.push({ abbr: side.abbr, rank: r, tid: side.tid })
        }
      }
    }
    for (const e of pollEntries) {
      if (e.tid != null && playedPollTids.has(Number(e.tid))) continue
      if (seenPollRanks.has(e.rank)) continue
      seenPollRanks.add(e.rank)
      mergedPoll.push(e)
    }

    // Attach poll entries as a non-enumerable property so callers that
    // iterate bowlGames as a plain array are unaffected, but modals can
    // read bowlGames.pollEntries to save post-bowl rankings.
    Object.defineProperty(bowlGames, 'pollEntries', { value: mergedPoll, enumerable: false })
    return bowlGames
  } catch (error) {
    console.error('Error reading bowl data:', error)
    throw error
  }
}

// Get list of bowl games for reference
export function getBowlGamesList() {
  return [...BOWL_GAMES_WEEK_1]
}

// Get list of Week 1 bowl games (without CFP First Round for selection dropdown)
export function getWeek1BowlGamesList() {
  return BOWL_GAMES_WEEK_1.filter(b => b !== 'CFP First Round')
}

// Get list of Week 2 bowl games
export function getWeek2BowlGamesList() {
  return [...BOWL_GAMES_WEEK_2]
}

// Get all bowl games (for dropdown selection, no CFP games)
export function getAllBowlGamesList() {
  return ALL_BOWL_GAMES.filter(b => !b.includes('CFP'))
}

// Check if a bowl game is in Week 1
export function isBowlInWeek1(bowlName) {
  return BOWL_GAMES_WEEK_1.some(b => b === bowlName)
}

// Check if a bowl game is in Week 2
export function isBowlInWeek2(bowlName) {
  return BOWL_GAMES_WEEK_2.some(b => b === bowlName)
}

// ============================================================================
// WEEKLY SCORES — across-the-country results entry
// 134 FBS teams ÷ 2 = up to 67 games per week. The sheet allows freeform entry
// of up to WEEKLY_SCORES_MAX_ROWS games. Pre-existing user-team games are
// preserved on save (we never overwrite scores the user entered through the
// schedule flow).
// ============================================================================
// 130 rows comfortably covers a full Week 0/Week 1 slate (~90+ FBS
// games when ranked vs unranked + FCS warm-ups all hit the same
// week). Was 75; users hit the cap and Add-Row in Sheets snapped
// back without saving, so we lost rows past 75.
export const WEEKLY_SCORES_MAX_ROWS = 130

// Bye-week ranks block — appended below the 130 game rows. The AI
// reasons about where bye teams should slot in this week's poll
// based on prior-week rankings + the games it just transcribed,
// then emits one row per bye team with the abbr in col A and the
// derived rank in col B. The parser distinguishes bye rows from
// game rows by col D being empty (game rows always have an opponent).
// 25 is enough to cover the entire Top 25 in the unlikely case
// every ranked team had a bye the same week.
export const WEEKLY_SCORES_BYE_ROWS = 25
export const WEEKLY_SCORES_BYE_HEADER_ROW_OFFSET = WEEKLY_SCORES_MAX_ROWS + 1 // 1-indexed: header at row WEEKLY_SCORES_BYE_HEADER_ROW_OFFSET + 1
export const WEEKLY_SCORES_TOTAL_ROWS = WEEKLY_SCORES_MAX_ROWS + 1 /* bye section header */ + WEEKLY_SCORES_BYE_ROWS

export async function createWeeklyScoresSheet(dynastyName, year, week, existingGames = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const sheetTitle = `Week ${week} Scores`

    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Week ${week} Scores ${year}`
        },
        sheets: [
          {
            properties: {
              title: sheetTitle,
              gridProperties: {
                // Header (1) + 130 game rows + 1 bye section header + 25 bye rows
                rowCount: WEEKLY_SCORES_TOTAL_ROWS + 1,
                columnCount: 7,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create weekly scores sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const wsSheetId = sheet.sheets[0].properties.sheetId

    await initializeWeeklyScoresSheet(sheet.spreadsheetId, accessToken, wsSheetId, sheetTitle, existingGames, dynastyTeams)
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl,
      sheetTitle,
    }
  } catch (error) {
    console.error('Error creating weekly scores sheet:', error)
    throw error
  }
}

async function initializeWeeklyScoresSheet(spreadsheetId, accessToken, sheetId, sheetTitle, existingGames = [], dynastyTeams = null) {
  const teamAbbrs = getTeamAbbreviationsListWithCustom(dynastyTeams)
  const rowCount = WEEKLY_SCORES_MAX_ROWS
  // Section-header row sits 1-indexed at row (rowCount + 2) — i.e.
  // 0-indexed row WEEKLY_SCORES_MAX_ROWS + 1 == header(1)+games(130).
  const byeHeaderRowIdx0 = WEEKLY_SCORES_MAX_ROWS + 1
  const byeFirstDataRowIdx0 = byeHeaderRowIdx0 + 1
  const byeLastDataRowIdx0Excl = byeFirstDataRowIdx0 + WEEKLY_SCORES_BYE_ROWS

  // Rank dropdown values: blank or 1..25
  const rankDropdownValues = [{ userEnteredValue: '' }]
  for (let r = 1; r <= 25; r++) rankDropdownValues.push({ userEnteredValue: String(r) })

  // Build pre-fill rows from existingGames so re-opening the sheet shows what
  // the user already has. Trim/fill to rowCount.
  const prefillRows = []
  for (let i = 0; i < rowCount; i++) {
    const g = existingGames[i]
    if (!g) {
      prefillRows.push({ values: [
        { userEnteredValue: { stringValue: '' } },
        { userEnteredValue: { stringValue: '' } },
        { userEnteredValue: { stringValue: '' } },
        { userEnteredValue: { stringValue: '' } },
        { userEnteredValue: { stringValue: '' } },
        { userEnteredValue: { stringValue: '' } },
        { userEnteredValue: { stringValue: '' } },
      ] })
      continue
    }
    const homeAbbr = String(g.homeTeam ?? '')
    const awayAbbr = String(g.awayTeam ?? '')
    const homeScore = g.homeScore
    const awayScore = g.awayScore
    const homeRank = g.homeRank
    const awayRank = g.awayRank
    const neutral = g.neutral ? 'Y' : ''
    prefillRows.push({ values: [
      { userEnteredValue: { stringValue: homeAbbr } },
      typeof homeRank === 'number' && homeRank >= 1 && homeRank <= 25
        ? { userEnteredValue: { numberValue: homeRank } }
        : { userEnteredValue: { stringValue: '' } },
      typeof homeScore === 'number'
        ? { userEnteredValue: { numberValue: homeScore } }
        : { userEnteredValue: { stringValue: '' } },
      { userEnteredValue: { stringValue: awayAbbr } },
      typeof awayRank === 'number' && awayRank >= 1 && awayRank <= 25
        ? { userEnteredValue: { numberValue: awayRank } }
        : { userEnteredValue: { stringValue: '' } },
      typeof awayScore === 'number'
        ? { userEnteredValue: { numberValue: awayScore } }
        : { userEnteredValue: { stringValue: '' } },
      { userEnteredValue: { stringValue: neutral } },
    ] })
  }

  const requests = [
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 7 },
        rows: [{ values: [
          { userEnteredValue: { stringValue: 'Home Team' } },
          { userEnteredValue: { stringValue: 'Home Rank' } },
          { userEnteredValue: { stringValue: 'Home Score' } },
          { userEnteredValue: { stringValue: 'Away Team' } },
          { userEnteredValue: { stringValue: 'Away Rank' } },
          { userEnteredValue: { stringValue: 'Away Score' } },
          { userEnteredValue: { stringValue: 'Neutral?' } },
        ] }],
        fields: 'userEnteredValue'
      }
    },
    {
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 0, endColumnIndex: 7 },
        rows: prefillRows,
        fields: 'userEnteredValue'
      }
    },
    // Bye-section divider row: a single banner cell in col A so the
    // user can see at a glance where the bye-week ranks block starts.
    // Other cols on this row are blank — the parser ignores this row
    // entirely, it's just a visual marker.
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: byeHeaderRowIdx0,
          endRowIndex: byeHeaderRowIdx0 + 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: [{ values: [
          { userEnteredValue: { stringValue: 'BYE WEEK RANKINGS — Team in col A, rank 1-25 in col B (no opponent)' } },
          { userEnteredValue: { stringValue: '' } },
          { userEnteredValue: { stringValue: '' } },
          { userEnteredValue: { stringValue: '' } },
          { userEnteredValue: { stringValue: '' } },
          { userEnteredValue: { stringValue: '' } },
          { userEnteredValue: { stringValue: '' } },
        ] }],
        fields: 'userEnteredValue'
      }
    },
    // Body formatting
    {
      repeatCell: {
        range: { sheetId },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, italic: true, fontFamily: 'Barlow', fontSize: 10 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Strict team dropdown for HOME column (col A, index 0) — covers
    // both the games range AND the bye-week-rank entries below the
    // divider, so the AI can paste team abbrs into the bye block too.
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: byeLastDataRowIdx0Excl, startColumnIndex: 0, endColumnIndex: 1 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr })) },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Home rank dropdown (col B, index 1) — blank or 1..25. Same
    // expansion: bye rows put the team's derived rank here.
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: byeLastDataRowIdx0Excl, startColumnIndex: 1, endColumnIndex: 2 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: rankDropdownValues },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Team dropdown for AWAY column (col D, index 3). Strict: only
    // dropdown values allowed — bad team typos can't sneak through and
    // the user's typing is autocompleted. Empty string IS in the value
    // list so blank cells (bye-rank rows in column A's range) still
    // pass validation without a red warning. (Was previously strict:
    // false to handle the bye-row blanks; including empty in the value
    // list lets us tighten back to strict and still allow blanks.)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: '' }, ...teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))] },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Away rank dropdown (col E, index 4) — blank or 1..25
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 4, endColumnIndex: 5 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: rankDropdownValues },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Y / blank dropdown for neutral (col G, index 6)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 6, endColumnIndex: 7 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Y' }, { userEnteredValue: '' }] },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    },
    // Column widths
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 110 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 110 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    // Team color formatting on HOME (col 0) and AWAY (col 3). Col 0
    // gets the full extended range so bye-rank rows are colored too;
    // col 3 stays at the games-only range.
    ...generateBowlTeamFormattingRules(sheetId, 0, byeLastDataRowIdx0Excl - 1, dynastyTeams),
    ...generateBowlTeamFormattingRules(sheetId, 3, rowCount, dynastyTeams),
  ]

  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing weekly scores sheet:', error)
    throw new Error(`Failed to initialize weekly scores sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Weekly-score paste self-heal lives in its own util so it can be unit-tested
// without pulling in this module's Firebase/context dependencies. Re-exported
// here so existing importers (WeeklyScoresModal) keep their import path.
export { normalizeWeeklyScoreRow, normalizeWeeklyScoreRows }

export async function readWeeklyScoresFromSheet(spreadsheetId, sheetTitle, dynastyTeams = null, opts = {}) {
  try {
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()
      // Read through the full sheet (games region + bye section header
      // + 25 bye rows) in one call — the parser splits them by which
      // row range they came from. Read out to col I (not just G) so that
      // if the AI paste shifted columns (extra blank between each team's
      // Rank and Score → away score lands in col H), the normalizer below
      // can still recover the away score instead of truncating it.
      const range = `${sheetTitle}!A2:I${WEEKLY_SCORES_TOTAL_ROWS + 1}`

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read weekly scores: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    const parseRank = (raw) => {
      if (raw === undefined || raw === '' || raw === null) return null
      // Strip whitespace, commas, common non-rank tokens. The full
      // value must parse cleanly to an integer in 1..25; partials
      // (e.g. "25+") fall through as null. We do NOT silently truncate
      // — the previous behavior accepted "1,234" as 1, which broke
      // ranks across the board.
      const s = String(raw).trim()
      if (!s) return null
      // Reject obvious non-rank text outright so we can flag it.
      if (/^(NR|UNR|—|-|N\/A)$/i.test(s)) return null
      // Strict integer parse — anything other than digits (with
      // optional whitespace) fails.
      if (!/^\d+$/.test(s.replace(/\s+/g, ''))) return null
      const n = parseInt(s.replace(/\s+/g, ''), 10)
      if (isNaN(n) || n < 1 || n > 25) return null
      return n
    }

    // Strict score parse. Strips whitespace + leading sign, rejects
    // commas / decimals / non-numeric text. Returns null on any
    // malformed input — caller decides whether to drop the row.
    const parseScore = (raw) => {
      if (raw === undefined || raw === '' || raw === null) return null
      const s = String(raw).trim()
      if (!s) return null
      // No commas (was the bug — "1,234" parsed as 1). No decimals
      // either (CFB scores are integers).
      if (!/^\d+$/.test(s)) return null
      const n = parseInt(s, 10)
      if (isNaN(n) || n < 0 || n > 200) return null
      return n
    }

    const games = []
    const byeRanks = []
    // Track rows the parser dropped so the caller can surface them
    // in the save-confirmation modal (instead of silent loss).
    const droppedRows = []
    // Recover the extra-blank-column shift (see normalizeWeeklyScoreRow above).
    const normalizeShiftedRow = normalizeWeeklyScoreRow

    // Content-based classification — works regardless of where the
    // AI's paste lands the rows. A row is a game when both team
    // columns (A and D) are non-empty AND the team abbrs differ.
    // A row is a bye-rank entry when col A has a recognized abbr,
    // col D is empty, and col B has a 1-25 rank. Anything else
    // (blank rows, the section banner row) is skipped silently.
    for (const rawRow of rows) {
      if (!rawRow) continue
      const row = normalizeShiftedRow(rawRow)
      const colA = (row[0] || '').toUpperCase().trim()
      const colD = (row[3] || '').toUpperCase().trim()
      if (!colA) continue

      // Bye-rank row: team in col A, rank in col B, no opponent in col D.
      if (!colD) {
        const byeRank = parseRank(row[1])
        if (byeRank == null) continue
        const byeTid = getTidFromTeamText(colA, dynastyTeams)
        if (!byeTid) {
          droppedRows.push({ kind: 'bye', reason: 'unknown-abbr', team: colA, rank: byeRank })
          continue
        }
        byeRanks.push({ team: colA, tid: byeTid, rank: byeRank })
        continue
      }

      // Game row.
      const homeAbbr = colA
      const awayAbbr = colD
      if (homeAbbr === awayAbbr) continue

      const homeRank = parseRank(row[1])
      const awayRank = parseRank(row[4])
      const homeScore = parseScore(row[2])
      const awayScore = parseScore(row[5])
      const neutralFlag = (row[6] || '').toString().trim().toUpperCase()
      const neutral = neutralFlag === 'Y' || neutralFlag === 'YES' || neutralFlag === '1' || neutralFlag === 'TRUE'

      // Columns A/D are team NAMES (per the prompt), but the AI can also emit an
      // abbr. getTidFromTeamText handles abbr → name → tolerant school match
      // (apostrophes, "&", and short forms like "NC State"), where the old
      // getTidFromAbbr dropped "HAWAI'I" / "NC STATE" as unknown.
      const homeTid = getTidFromTeamText(homeAbbr, dynastyTeams)
      const awayTid = getTidFromTeamText(awayAbbr, dynastyTeams)
      if (!homeTid || !awayTid) {
        droppedRows.push({
          kind: 'game',
          reason: 'unknown-abbr',
          home: homeAbbr,
          away: awayAbbr,
          missing: !homeTid && !awayTid ? 'both' : (!homeTid ? 'home' : 'away'),
        })
        continue
      }

      // If a score was provided in raw form but failed strict parsing
      // (e.g., "1,234" or "31.5"), refuse to save the row instead of
      // silently picking a wrong winner. Both sides must parse OR
      // both must be blank (= unscored / scheduled).
      const homeRaw = row[2]
      const awayRaw = row[5]
      const homeProvided = homeRaw !== undefined && String(homeRaw).trim() !== ''
      const awayProvided = awayRaw !== undefined && String(awayRaw).trim() !== ''
      if ((homeProvided && homeScore == null) || (awayProvided && awayScore == null)) {
        droppedRows.push({
          kind: 'game',
          reason: 'malformed-score',
          home: homeAbbr,
          away: awayAbbr,
          rawHome: homeProvided ? String(homeRaw) : null,
          rawAway: awayProvided ? String(awayRaw) : null,
        })
        continue
      }

      games.push({
        homeTeam: homeAbbr,
        awayTeam: awayAbbr,
        homeTid,
        awayTid,
        homeScore,
        awayScore,
        homeRank,
        awayRank,
        neutral,
      })
    }

    // Backward-compat: callers that destructure as an array still
    // get just the games list (Array.isArray on the return). New
    // callers read .byeRanks / .droppedRows off the same returned
    // array (JS arrays are objects).
    games.byeRanks = byeRanks
    games.droppedRows = droppedRows
    return games
  } catch (error) {
    console.error('Error reading weekly scores:', error)
    throw error
  }
}

// Get CFP First Round game name based on seed (for seeds 5-12)
export function getCFPFirstRoundGameName(seed) {
  if (seed < 5 || seed > 12) return null
  const matchup = CFP_FIRST_ROUND_MATCHUPS.find(m => m.seed1 === seed || m.seed2 === seed)
  return matchup?.game || null
}

// Get CFP Quarterfinal bowl name based on seed (for seeds 1-4 or First Round winners)
// cfpBowlConfig: { seed1: 'Sugar Bowl', seed2: 'Cotton Bowl', seed3: 'Rose Bowl', seed4: 'Orange Bowl' }
export function getCFPQuarterfinalGameName(seed, firstRoundResults = [], cfpBowlConfig = null) {
  // Default config if not provided
  const config = cfpBowlConfig || {
    seed1: 'Sugar Bowl',
    seed2: 'Cotton Bowl',
    seed3: 'Rose Bowl',
    seed4: 'Orange Bowl'
  }

  // Seeds 1-4 have byes and play in specific bowls (determined by config)
  if (seed >= 1 && seed <= 4) {
    const bowlBySeed = {
      1: `${config.seed1} (CFP QF)`,
      2: `${config.seed2} (CFP QF)`,
      3: `${config.seed3} (CFP QF)`,
      4: `${config.seed4} (CFP QF)`
    }
    return bowlBySeed[seed]
  }

  // For seeds 5-12, find which QF game they would be in based on first round matchup
  // Seed 5/12 -> plays #4's bowl (seed4)
  // Seed 6/11 -> plays #3's bowl (seed3)
  // Seed 7/10 -> plays #2's bowl (seed2)
  // Seed 8/9 -> plays #1's bowl (seed1)
  if (seed >= 5 && seed <= 12) {
    const seedToByeSeed = {
      5: 4, 12: 4,  // Winner of 5v12 plays #4
      6: 3, 11: 3,  // Winner of 6v11 plays #3
      7: 2, 10: 2,  // Winner of 7v10 plays #2
      8: 1, 9: 1    // Winner of 8v9 plays #1
    }
    const byeSeed = seedToByeSeed[seed]
    const configKey = `seed${byeSeed}`
    return `${config[configKey]} (CFP QF)`
  }

  return null
}

// Create Bowl Week 2 sheet with CFP Quarterfinals teams pre-filled
// excludeGames: array of game names to exclude (user's QF game, user's Week 2 bowl game)
// cfpBowlConfig: { seed1: 'Sugar Bowl', seed2: 'Cotton Bowl', ... } - determines which bowls host CFP QF
export async function createBowlWeek2Sheet(dynastyName, year, cfpSeeds = [], firstRoundResults = [], excludeGames = [], existingBowlWeek2 = [], existingCFPQuarterfinals = [], dynastyTeams = null, cfpBowlConfig = null) {
  try {
    const accessToken = await getAccessToken()

    // Get bowl games list with dynamic CFP QF bowls based on config
    const allBowlGames = getBowlGamesWeek2(cfpBowlConfig)
    // Filter out games that the user is playing in (they enter those separately)
    const bowlGames = allBowlGames.filter(game => !excludeGames.includes(game))
    const rowCount = bowlGames.length

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Bowl Week 2 ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Bowl Games',
              gridProperties: {
                rowCount: rowCount + 28,
                columnCount: 7,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create bowl week 2 sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const bowlSheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data with CFP teams pre-filled and existing data
    await initializeBowlWeek2Sheet(sheet.spreadsheetId, accessToken, bowlSheetId, bowlGames, cfpSeeds, firstRoundResults, existingBowlWeek2, existingCFPQuarterfinals, dynastyTeams, cfpBowlConfig)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating bowl week 2 sheet:', error)
    throw error
  }
}

// Initialize the Bowl Week 2 sheet with headers and bowl game rows
async function initializeBowlWeek2Sheet(spreadsheetId, accessToken, sheetId, bowlGames, cfpSeeds = [], firstRoundResults = [], existingBowlWeek2 = [], existingCFPQuarterfinals = [], dynastyTeams = null, cfpBowlConfig = null) {
  const teamAbbrs = getTeamAbbreviationsListWithCustom(dynastyTeams)
  const rowCount = bowlGames.length

  // Build dynamic CFP QF matchups based on config
  // Maps bowl name (with CFP QF suffix) to seed info
  const config = cfpBowlConfig || {
    seed1: 'Sugar Bowl',
    seed2: 'Cotton Bowl',
    seed3: 'Rose Bowl',
    seed4: 'Orange Bowl'
  }
  const dynamicCFPQFMatchups = {
    [`${config.seed1} (CFP QF)`]: { firstRoundSeeds: [8, 9], topSeed: 1 },
    [`${config.seed2} (CFP QF)`]: { firstRoundSeeds: [7, 10], topSeed: 2 },
    [`${config.seed3} (CFP QF)`]: { firstRoundSeeds: [6, 11], topSeed: 3 },
    [`${config.seed4} (CFP QF)`]: { firstRoundSeeds: [5, 12], topSeed: 4 }
  }

  // Helper to get team by seed (tid-based lookup)
  const getTeamBySeed = (seed) => {
    const seedEntry = cfpSeeds?.find(s => s.seed === seed)
    if (!seedEntry?.tid) return ''
    // Look up in dynastyTeams first, then DEFAULT_TEAMS
    const teamData = dynastyTeams?.[seedEntry.tid] || DEFAULT_TEAMS[seedEntry.tid]
    return teamData?.abbr || ''
  }

  // Helper to get First Round winner
  const getFirstRoundWinner = (seedA, seedB) => {
    if (!firstRoundResults || firstRoundResults.length === 0) return ''
    const game = firstRoundResults.find(g => {
      if (!g) return false
      return (g.seed1 === seedA && g.seed2 === seedB) ||
             (g.seed1 === seedB && g.seed2 === seedA)
    })
    return game?.winner || ''
  }

  // Helper to get existing bowl data by bowl name
  const getExistingBowlData = (bowlName) => {
    // Check in regular bowl games (guard against null entries)
    const bowlData = existingBowlWeek2.find(b => b && b.bowlName === bowlName)
    if (bowlData) return bowlData

    // Check in CFP Quarterfinals results (guard against null entries)
    const cfpMatch = dynamicCFPQFMatchups[bowlName]
    if (cfpMatch) {
      const cfpData = existingCFPQuarterfinals.find(g => g && g.bowl === bowlName)
      if (cfpData) {
        return {
          bowlName,
          team1: cfpData.team1 || '',
          team2: cfpData.team2 || '',
          team1Score: cfpData.score1,
          team2Score: cfpData.score2
        }
      }
    }
    return null
  }

  // Build row data with teams pre-filled for CFP QF games + existing data
  // Team 1 = First Round winner (lower seed), Team 2 = higher seed (1-4 bye team)
  const rowData = bowlGames.map(bowl => {
    const existingData = getExistingBowlData(bowl)
    const matchup = dynamicCFPQFMatchups[bowl]

    // Priority: existing data > CFP computed data > empty
    let team1 = existingData?.team1 || ''
    let team2 = existingData?.team2 || ''
    let team1Score = existingData?.team1Score
    let team2Score = existingData?.team2Score

    // For CFP QF games without existing data, compute from seeds/first round
    if (!existingData && matchup && cfpSeeds.length > 0) {
      const [seed1, seed2] = matchup.firstRoundSeeds
      const firstRoundWinner = getFirstRoundWinner(seed1, seed2)
      const topSeedTeam = getTeamBySeed(matchup.topSeed)
      team1 = firstRoundWinner  // First Round winner (lower seed)
      team2 = topSeedTeam       // Higher seed (1-4 bye team)
    }

    return { bowl, team1, team2, team1Score, team2Score }
  })

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Bowl Game' } },
            { userEnteredValue: { stringValue: 'Team 1' } },
            { userEnteredValue: { stringValue: 'T1 Rank' } },
            { userEnteredValue: { stringValue: 'Team 2' } },
            { userEnteredValue: { stringValue: 'T2 Rank' } },
            { userEnteredValue: { stringValue: 'Team 1 Score' } },
            { userEnteredValue: { stringValue: 'Team 2 Score' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill bowl game names, teams, and scores
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: rowData.map(row => ({
          values: [
            { userEnteredValue: { stringValue: String(row.bowl ?? '') } },
            { userEnteredValue: { stringValue: String(row.team1 ?? '') } },
            { userEnteredValue: { stringValue: '' } },  // Team 1 Rank (blank, user fills from screenshot)
            { userEnteredValue: { stringValue: String(row.team2 ?? '') } },
            { userEnteredValue: { stringValue: '' } },  // Team 2 Rank (blank)
            (row.team1Score !== undefined && row.team1Score !== null && !Number.isNaN(Number(row.team1Score)))
              ? { userEnteredValue: { numberValue: Number(row.team1Score) } }
              : { userEnteredValue: { stringValue: '' } },
            (row.team2Score !== undefined && row.team2Score !== null && !Number.isNaN(Number(row.team2Score)))
              ? { userEnteredValue: { numberValue: Number(row.team2Score) } }
              : { userEnteredValue: { stringValue: '' } }
          ]
        })),
        fields: 'userEnteredValue'
      }
    },
    // Format all cells: Bold, Italic, Center, Barlow font, size 10
    {
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Add STRICT team dropdown validation for Team 1 column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Add STRICT team dropdown validation for Team 2 column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount + 1,
          startColumnIndex: 3,
          endColumnIndex: 4
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    },
    // Protect bowl names column
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          description: 'Bowl names - do not edit',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 2,
          endIndex: 3
        },
        properties: { pixelSize: 55 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3,
          endIndex: 4
        },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 4,
          endIndex: 5
        },
        properties: { pixelSize: 55 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 5,
          endIndex: 7
        },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    // Add conditional formatting for team colors (Team 1 column)
    ...generateBowlTeamFormattingRules(sheetId, 1, rowCount, dynastyTeams),
    // Add conditional formatting for team colors (Team 2 column)
    ...generateBowlTeamFormattingRules(sheetId, 3, rowCount, dynastyTeams)
  ]

  // Execute batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing bowl week 2 sheet:', error)
    throw new Error(`Failed to initialize bowl week 2 sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read Bowl Week 2 Games data from sheet
export async function readBowlWeek2GamesFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    // The caller reshapes its self-describing rows into this parser's column
    // layout (game rows: bowl name in col A; poll rows: blank col A, abbr in
    // col B, rank in col C) — the parse logic below is unchanged.
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const rowCount = BOWL_GAMES_WEEK_2.length
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Bowl Games!A2:G${rowCount + 28}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read bowl week 2 data: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse into structured data with tid fields for teambuilder support.
    // Rows with empty Col A are post-bowl poll entries (abbr in col B, rank in col C).
    const bowlGames = []
    const pollEntries = []

    for (const row of rows) {
      const bowlName = row[0] || ''

      if (!bowlName.trim()) {
        const pollAbbr = (row[1] || '').toUpperCase().trim()
        const pollRankRaw = row[2]
        const pollRank = pollRankRaw !== undefined && pollRankRaw !== '' ? parseInt(pollRankRaw, 10) : null
        if (pollAbbr && pollRank !== null && !isNaN(pollRank) && pollRank >= 1 && pollRank <= 25) {
          const pollTid = getTidFromAbbr(pollAbbr, dynastyTeams)
          pollEntries.push({ abbr: pollAbbr, rank: pollRank, tid: pollTid })
        }
        continue
      }

      const team1Abbr = (row[1] || '').toUpperCase()
      const team1Rank = row[2] ? parseInt(row[2], 10) : null
      const team2Abbr = (row[3] || '').toUpperCase()
      const team2Rank = row[4] ? parseInt(row[4], 10) : null
      const score1Raw = row[5]
      const score2Raw = row[6]
      const parsedScore1 = score1Raw !== undefined && score1Raw !== '' ? parseInt(score1Raw, 10) : null
      const parsedScore2 = score2Raw !== undefined && score2Raw !== '' ? parseInt(score2Raw, 10) : null
      const team1Score = parsedScore1 !== null && !isNaN(parsedScore1) ? parsedScore1 : null
      const team2Score = parsedScore2 !== null && !isNaN(parsedScore2) ? parsedScore2 : null
      const team1Tid = team1Abbr ? getTidFromAbbr(team1Abbr, dynastyTeams) : null
      const team2Tid = team2Abbr ? getTidFromAbbr(team2Abbr, dynastyTeams) : null

      // Determine winner by score
      let winner = null
      let winnerTid = null
      if (team1Score !== null && team2Score !== null) {
        if (team1Score > team2Score) {
          winner = team1Abbr
          winnerTid = team1Tid
        } else {
          winner = team2Abbr
          winnerTid = team2Tid
        }
      }

      bowlGames.push({
        bowlName,
        team1: team1Abbr,
        team1Rank: team1Rank !== null && !isNaN(team1Rank) && team1Rank >= 1 && team1Rank <= 25 ? team1Rank : null,
        team2: team2Abbr,
        team2Rank: team2Rank !== null && !isNaN(team2Rank) && team2Rank >= 1 && team2Rank <= 25 ? team2Rank : null,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        winner,
        winnerTid
      })
    }

    // Merge game-row ranks (played teams) with the non-playing block into the
    // complete Top 25 — see readBowlGamesFromSheet for the full rationale. Game
    // rows are authoritative; played teams are never block entries, and a rank
    // already claimed by a played team wins over a colliding block row.
    const mergedPoll = []
    const seenPollRanks = new Set()
    const playedPollTids = new Set()
    for (const g of bowlGames) {
      // CFP rows ("CFP First Round …", "… (CFP QF)") show a SEED (1–12) as the
      // number prefix, NOT an AP rank — so we must not harvest it as a poll
      // rank, and we must NOT mark CFP teams as "played" for poll purposes.
      // That keeps them eligible for the non-playing block, which carries
      // their true AP rank (the user's chosen behavior, and the only source
      // for a CFP team's AP rank whether or not its bowl is entered via AI).
      if (g.bowlName && /CFP/i.test(g.bowlName)) continue
      for (const side of [
        { tid: g.team1Tid, rank: g.team1Rank, abbr: g.team1 },
        { tid: g.team2Tid, rank: g.team2Rank, abbr: g.team2 },
      ]) {
        if (side.tid != null) playedPollTids.add(Number(side.tid))
        const r = side.rank
        if (typeof r === 'number' && r >= 1 && r <= 25 && side.tid != null && !seenPollRanks.has(r)) {
          seenPollRanks.add(r)
          mergedPoll.push({ abbr: side.abbr, rank: r, tid: side.tid })
        }
      }
    }
    for (const e of pollEntries) {
      if (e.tid != null && playedPollTids.has(Number(e.tid))) continue
      if (seenPollRanks.has(e.rank)) continue
      seenPollRanks.add(e.rank)
      mergedPoll.push(e)
    }

    Object.defineProperty(bowlGames, 'pollEntries', { value: mergedPoll, enumerable: false })
    return bowlGames
  } catch (error) {
    console.error('Error reading bowl week 2 data:', error)
    throw error
  }
}

// ==================== CFP SHEETS ====================

// Create CFP Seeds sheet (for entering seeds 1-12)
export async function createCFPSeedsSheet(dynastyName, year, existingSeeds = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - CFP Seeds ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'CFP Seeds',
              gridProperties: {
                rowCount: 13,
                columnCount: 2,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create CFP seeds sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const cfpSheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data
    await initializeCFPSeedsSheet(sheet.spreadsheetId, accessToken, cfpSheetId, dynastyTeams)

    // Pre-fill with existing seeds data if provided
    if (existingSeeds && existingSeeds.length > 0) {
      await prefillCFPSeedsData(sheet.spreadsheetId, accessToken, existingSeeds)
    }

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating CFP seeds sheet:', error)
    throw error
  }
}

// Pre-fill CFP seeds with existing data
async function prefillCFPSeedsData(spreadsheetId, accessToken, existingSeeds) {
  if (!existingSeeds || existingSeeds.length === 0) return

  // Build values array - 12 rows for seeds 1-12
  const values = new Array(12).fill([''])
  existingSeeds.forEach(seedData => {
    const seedNum = seedData.seed
    if (seedNum >= 1 && seedNum <= 12 && seedData.team) {
      values[seedNum - 1] = [seedData.team]
    }
  })

  // Write values to column B (Team column) starting at row 2
  const range = `'CFP Seeds'!B2:B13`

  const response = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: values
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    console.error('Failed to prefill CFP seeds:', error)
    // Don't throw - sheet is still usable, just without prefilled data
  }
}

// Initialize CFP Seeds sheet
async function initializeCFPSeedsSheet(spreadsheetId, accessToken, sheetId, dynastyTeams = null) {
  const teamList = getTeamAbbreviationsListWithCustom(dynastyTeams)

  // Generate team color formatting rules for the Team column (column B / index 1)
  const teamFormattingRules = generateTeamFormattingRules(sheetId, 1, dynastyTeams)

  const requests = [
    // Headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Seed' } },
            { userEnteredValue: { stringValue: 'Team' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill seed numbers 1-12
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 13,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rows: Array.from({ length: 12 }, (_, i) => ({
          values: [{ userEnteredValue: { numberValue: i + 1 } }]
        })),
        fields: 'userEnteredValue'
      }
    },
    // Team dropdown validation (strict - only accepts values from list)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 13,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamList.map(team => ({ userEnteredValue: team }))
          },
          strict: true,
          showCustomUi: true
        }
      }
    },
    // Format all cells
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 14,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              fontFamily: 'Barlow',
              fontSize: 10,
              bold: true
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Freeze header row
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          description: 'Header row',
          warningOnly: true
        }
      }
    },
    // Protect seed column
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: 13,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          description: 'Seed numbers',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 60 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 150 },
        fields: 'pixelSize'
      }
    },
    // Add team color conditional formatting
    ...teamFormattingRules
  ]

  await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

// Read CFP Seeds from sheet
export async function readCFPSeedsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/CFP Seeds!A2:B13`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read CFP seeds: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse into structured data - ALWAYS include tid for teambuilder support
    const seeds = rows.map(row => {
      const seedNum = row[0] ? parseInt(row[0]) : null
      const teamAbbr = (row[1] || '').toUpperCase()
      const tid = teamAbbr ? getTidFromAbbr(teamAbbr, dynastyTeams) : null
      return {
        seed: seedNum,
        tid              // PRIMARY identifier for teambuilder support
      }
    }).filter(s => s.seed && s.tid)  // Require tid

    return seeds
  } catch (error) {
    console.error('Error reading CFP seeds:', error)
    throw error
  }
}

// Create CFP First Round sheet (4 games - seeds 5-12 play)
export async function createCFPFirstRoundSheet(dynastyName, year, existingData = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - CFP First Round ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'CFP First Round',
              gridProperties: {
                rowCount: 5,
                columnCount: 5,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create CFP First Round sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const cfpSheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data
    await initializeCFPFirstRoundSheet(sheet.spreadsheetId, accessToken, cfpSheetId, existingData, dynastyTeams)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating CFP First Round sheet:', error)
    throw error
  }
}

// Initialize CFP First Round sheet
async function initializeCFPFirstRoundSheet(spreadsheetId, accessToken, sheetId, existingData = [], dynastyTeams = null) {
  const teamList = getTeamAbbreviationsListWithCustom(dynastyTeams)

  // CFP First Round matchups (seeds play each other: 5v12, 6v11, 7v10, 8v9)
  const games = [
    'Game 1 (5 vs 12)',
    'Game 2 (6 vs 11)',
    'Game 3 (7 vs 10)',
    'Game 4 (8 vs 9)'
  ]

  // Get existing data for pre-filling (match by game name, guard against null entries)
  const getExistingGame = (gameName) => {
    return existingData.find(g => g && g.game === gameName) || {}
  }

  const requests = [
    // Headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 5
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Game' } },
            { userEnteredValue: { stringValue: 'Higher Seed' } },
            { userEnteredValue: { stringValue: 'Lower Seed' } },
            { userEnteredValue: { stringValue: 'Higher Score' } },
            { userEnteredValue: { stringValue: 'Lower Score' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill game names and existing data
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 5,
          startColumnIndex: 0,
          endColumnIndex: 5
        },
        rows: games.map(gameName => {
          const existing = getExistingGame(gameName)
          return {
            values: [
              { userEnteredValue: { stringValue: String(gameName ?? '') } },
              { userEnteredValue: { stringValue: String(existing.higherSeed ?? '') } },
              { userEnteredValue: { stringValue: String(existing.lowerSeed ?? '') } },
              { userEnteredValue: (existing.higherSeedScore != null && !Number.isNaN(Number(existing.higherSeedScore))) ? { numberValue: Number(existing.higherSeedScore) } : { stringValue: '' } },
              { userEnteredValue: (existing.lowerSeedScore != null && !Number.isNaN(Number(existing.lowerSeedScore))) ? { numberValue: Number(existing.lowerSeedScore) } : { stringValue: '' } }
            ]
          }
        }),
        fields: 'userEnteredValue'
      }
    },
    // Team dropdown validation for columns B and C
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 5,
          startColumnIndex: 1,
          endColumnIndex: 3
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamList.map(team => ({ userEnteredValue: team }))
          },
          strict: true,
          showCustomUi: true
        }
      }
    },
    // Format all cells
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 5,
          startColumnIndex: 0,
          endColumnIndex: 5
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              fontFamily: 'Barlow',
              fontSize: 10,
              bold: true,
              italic: true
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 5
          },
          description: 'Header row',
          warningOnly: true
        }
      }
    },
    // Protect game column
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: 5,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          description: 'Game names',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 3
        },
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3,
          endIndex: 5
        },
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    // Add conditional formatting for team colors (Higher Seed column - column B)
    ...generateBowlTeamFormattingRules(sheetId, 1, 4, dynastyTeams),
    // Add conditional formatting for team colors (Lower Seed column - column C)
    ...generateBowlTeamFormattingRules(sheetId, 2, 4, dynastyTeams)
  ]

  await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

// Read CFP First Round results from sheet
export async function readCFPFirstRoundFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/CFP First Round!A2:E5`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read CFP First Round: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse into structured data - ALWAYS include tid for teambuilder support
    const games = rows.map(row => {
      const gameName = row[0] || ''
      const higherSeedAbbr = (row[1] || '').toUpperCase()
      const lowerSeedAbbr = (row[2] || '').toUpperCase()
      const higherSeedTid = higherSeedAbbr ? getTidFromAbbr(higherSeedAbbr, dynastyTeams) : null
      const lowerSeedTid = lowerSeedAbbr ? getTidFromAbbr(lowerSeedAbbr, dynastyTeams) : null
      const higherSeedScore = row[3] ? parseInt(row[3]) : null
      const lowerSeedScore = row[4] ? parseInt(row[4]) : null

      // Determine winner tid from scores
      let winnerTid = null
      if (higherSeedScore !== null && lowerSeedScore !== null) {
        winnerTid = higherSeedScore > lowerSeedScore ? higherSeedTid : lowerSeedTid
      }

      return {
        game: gameName,
        higherSeed: higherSeedAbbr,     // Keep for backward compat
        lowerSeed: lowerSeedAbbr,       // Keep for backward compat
        higherSeedTid,                  // PRIMARY identifier
        lowerSeedTid,                   // PRIMARY identifier
        higherSeedScore,
        lowerSeedScore,
        winnerTid                       // PRIMARY identifier
      }
    })

    return games
  } catch (error) {
    console.error('Error reading CFP First Round:', error)
    throw error
  }
}

// Create CFP Quarterfinals sheet with auto-filled teams
export async function createCFPQuarterfinalsSheet(dynastyName, year, cfpSeeds, firstRoundResults, existingQuarterfinals = [], bowlConfig = null, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - CFP Quarterfinals ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'CFP Quarterfinals',
              gridProperties: {
                rowCount: 6,
                columnCount: 6
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to create CFP Quarterfinals sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const cfpSheetId = sheet.sheets[0].properties.sheetId

    // Initialize sheet with headers and auto-filled teams (pass bowl config for correct bowl names)
    await initializeCFPQuarterfinalsSheet(sheet.spreadsheetId, accessToken, cfpSheetId, cfpSeeds, firstRoundResults, existingQuarterfinals, bowlConfig, dynastyTeams)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating CFP Quarterfinals sheet:', error)
    throw error
  }
}

// Initialize CFP Quarterfinals sheet with teams
async function initializeCFPQuarterfinalsSheet(spreadsheetId, accessToken, sheetId, cfpSeeds, firstRoundResults, existingQuarterfinals = [], bowlConfig = null, dynastyTeams = null) {
  // Get seed teams (tid-based lookup)
  const getTeamBySeed = (seed) => {
    const seedEntry = cfpSeeds?.find(s => s.seed === seed)
    if (!seedEntry?.tid) return ''
    // Look up in dynastyTeams first, then DEFAULT_TEAMS
    const teamData = dynastyTeams?.[seedEntry.tid] || DEFAULT_TEAMS[seedEntry.tid]
    return teamData?.abbr || ''
  }

  // Get First Round winner by seed numbers
  const getFirstRoundWinner = (seedA, seedB) => {
    if (!firstRoundResults || firstRoundResults.length === 0) return ''
    const game = firstRoundResults.find(g => {
      if (!g) return false
      return (g.seed1 === seedA && g.seed2 === seedB) ||
             (g.seed1 === seedB && g.seed2 === seedA)
    })
    return game?.winner || ''
  }

  // Get existing quarterfinal data by bowl name (guard against null entries)
  const getExistingQF = (bowlName) => {
    return existingQuarterfinals.find(g => g && g.bowlName === bowlName) || {}
  }

  // Default bowl config if not provided
  const defaultBowlConfig = {
    seed1: 'Sugar Bowl',
    seed2: 'Cotton Bowl',
    seed3: 'Rose Bowl',
    seed4: 'Orange Bowl'
  }
  const effectiveBowlConfig = bowlConfig || defaultBowlConfig

  // Get bowl name for a seed from config
  const getBowlForSeed = (seed) => effectiveBowlConfig[`seed${seed}`] || defaultBowlConfig[`seed${seed}`]

  // Quarterfinal matchups with bowl games - USE CONFIG for bowl names!
  // Team 1 = bye seed (1-4), Team 2 = First Round winner
  // Order in sheet: seed 4, seed 1, seed 3, seed 2 (matches bracket display order)
  const quarterfinals = [
    {
      bowl: getBowlForSeed(4),
      team1: getTeamBySeed(4),
      team2: getFirstRoundWinner(5, 12)
    },
    {
      bowl: getBowlForSeed(1),
      team1: getTeamBySeed(1),
      team2: getFirstRoundWinner(8, 9)
    },
    {
      bowl: getBowlForSeed(3),
      team1: getTeamBySeed(3),
      team2: getFirstRoundWinner(6, 11)
    },
    {
      bowl: getBowlForSeed(2),
      team1: getTeamBySeed(2),
      team2: getFirstRoundWinner(7, 10)
    }
  ]

  // Build the data rows with existing scores pre-filled
  const headers = ['Bowl Game', 'Team 1', 'Team 2', 'Team 1 Score', 'Team 2 Score', 'Winner']
  const dataRows = quarterfinals.map(qf => {
    const existing = getExistingQF(qf.bowl)
    return [
      qf.bowl,
      existing.team1 || qf.team1,
      existing.team2 || qf.team2,
      existing.team1Score != null ? existing.team1Score : '',
      existing.team2Score != null ? existing.team2Score : '',
      existing.winner || ''
    ]
  })

  // Update values
  const updateResponse = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/CFP Quarterfinals!A1:F5?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [headers, ...dataRows]
      })
    }
  )

  if (!updateResponse.ok) {
    console.error('Failed to set CFP Quarterfinals data')
  }

  // Format the sheet
  await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Freeze header row
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                gridProperties: { frozenRowCount: 1 }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          },
          // Bold header row
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)'
            }
          },
          // White text for header
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          // Center all cells
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 5 },
              cell: {
                userEnteredFormat: { horizontalAlignment: 'CENTER' }
              },
              fields: 'userEnteredFormat.horizontalAlignment'
            }
          },
          // Auto-resize columns
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 6
              }
            }
          }
        ]
      })
    }
  )
}

// Read CFP Quarterfinals results from sheet
export async function readCFPQuarterfinalsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-placed TSV rows in place (no Google fetch).
    // The caller (handleLocalImport) is responsible for placing each game's
    // row at the index this parser's rowToByeSeed expects, AND for filling
    // col A with the configured bowl name — the parse logic below is unchanged.
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/CFP Quarterfinals!A2:F5`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read CFP Quarterfinals: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // BULLETPROOF: Sheet rows are in fixed order by bye seed: 4, 1, 3, 2
    // This maps row index to bye seed for slot determination
    const rowToByeSeed = [4, 1, 3, 2]
    const byeSeedToSlot = { 1: 'cfpqf1', 2: 'cfpqf4', 3: 'cfpqf3', 4: 'cfpqf2' }

    // Parse rows into games - ALWAYS include tid and seed for bulletproof slot determination
    const games = rows.map((row, index) => {
      const team1Score = row[3] ? parseInt(row[3]) : null
      const team2Score = row[4] ? parseInt(row[4]) : null
      const team1Abbr = row[1]?.toUpperCase() || ''
      const team2Abbr = row[2]?.toUpperCase() || ''
      const team1Tid = team1Abbr ? getTidFromAbbr(team1Abbr, dynastyTeams) : null
      const team2Tid = team2Abbr ? getTidFromAbbr(team2Abbr, dynastyTeams) : null

      // Auto-determine winner from scores
      let winnerTid = null
      if (team1Score !== null && team2Score !== null) {
        winnerTid = team1Score > team2Score ? team1Tid : team2Tid
      }

      // CRITICAL: Include bye seed info for bulletproof slot determination
      // Team1 is always the bye seed (1-4), Team2 is the first round winner
      const byeSeed = rowToByeSeed[index]
      const cfpSlot = byeSeedToSlot[byeSeed]

      return {
        bowlName: row[0] || '',  // Use bowlName for consistency
        team1: team1Abbr,        // Keep for backward compat
        team2: team2Abbr,        // Keep for backward compat
        team1Tid,                // PRIMARY identifier
        team2Tid,                // PRIMARY identifier
        team1Score,
        team2Score,
        winnerTid,               // PRIMARY identifier
        // BULLETPROOF slot determination
        seed1: byeSeed,          // Bye seed (1-4) - always in team1 position
        cfpSlot                  // Slot ID (cfpqf1, cfpqf2, cfpqf3, cfpqf4)
      }
    }).filter(game => game.team1Tid && game.team2Tid)  // Require tids

    return games
  } catch (error) {
    console.error('Error reading CFP Quarterfinals:', error)
    throw error
  }
}

// ==================== CUSTOM CONFERENCES SHEET ====================

// Default EA CFB 26 conference alignment
// Use the canonical FBS-conference layout from data/conferenceTeams.js
// as the seed for newly-created Conferences sheets and the fallback
// for users who haven't saved a custom layout yet. Re-pointed (was a
// duplicate copy that drifted — missed Delaware, Missouri State,
// Temple, New Mexico, and Southern Miss after CFB 26's realignment,
// causing read-back validation to fail with "Missing 5 teams").
const DEFAULT_CONFERENCES = CANONICAL_CONFERENCES

// Get default conferences
export function getDefaultConferences() {
  return DEFAULT_CONFERENCES
}

// Create Custom Conferences sheet with multiple year tabs
export async function createConferencesSheet(dynastyName, currentYear, conferencesByYear = null, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Determine which years to create tabs for
    // If conferencesByYear provided, use those years; otherwise just use currentYear
    const years = conferencesByYear
      ? Object.keys(conferencesByYear).map(Number).sort((a, b) => b - a) // Descending order (newest first)
      : [currentYear]

    // Ensure current year is included
    if (!years.includes(currentYear)) {
      years.unshift(currentYear)
      years.sort((a, b) => b - a)
    }

    // Fixed 20 slots per conference (21 rows total with header)
    const maxTeams = 20
    const rowCount = maxTeams + 1 // +1 for header

    // Calculate column count from actual data (use max of all years' conference counts)
    let maxConferences = Object.keys(DEFAULT_CONFERENCES).length
    if (conferencesByYear) {
      Object.values(conferencesByYear).forEach(yearData => {
        if (yearData && typeof yearData === 'object') {
          maxConferences = Math.max(maxConferences, Object.keys(yearData).length)
        }
      })
    }
    const columnCount = maxConferences

    // Create sheet definitions for each year
    const sheetDefinitions = years.map((year, index) => ({
      properties: {
        title: String(year),
        index: index,
        gridProperties: {
          rowCount: rowCount,
          columnCount: columnCount,
          frozenRowCount: 1
        }
      }
    }))

    // Create the spreadsheet with multiple year tabs
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Conference Alignment`
        },
        sheets: sheetDefinitions
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create conferences sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await response.json()

    // Initialize each year's tab with its conference data
    // Find the most recent year with saved data to use as fallback
    const savedYears = conferencesByYear ? Object.keys(conferencesByYear).map(Number).sort((a, b) => b - a) : []

    for (let i = 0; i < years.length; i++) {
      const year = years[i]
      const sheetId = spreadsheet.sheets[i].properties.sheetId

      // Use this year's data, or fall back to most recent previous year, or DEFAULT_CONFERENCES
      let conferencesData = conferencesByYear?.[year]
      if (!conferencesData) {
        // Find the most recent year before this one that has data
        const fallbackYear = savedYears.find(y => y < year) || savedYears[0]
        conferencesData = (fallbackYear && conferencesByYear?.[fallbackYear]) || DEFAULT_CONFERENCES
      }

      // Translate any stale abbreviations to the user's current ones so a
      // teambuilder rename (e.g. BAMA → ALA) doesn't make the user
      // hand-edit every cell — and so the read-back validator (which now
      // checks against the dynasty's actual team registry) matches.
      conferencesData = translateConferencesToCurrentAbbrs(conferencesData, dynastyTeams)

      const sortedConferences = Object.keys(conferencesData).sort()

      await initializeConferencesSheet(spreadsheet.spreadsheetId, accessToken, sheetId, sortedConferences, maxTeams, conferencesData, dynastyTeams)
    }

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(spreadsheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating conferences sheet:', error)
    throw error
  }
}

// Generate conditional formatting rules for team colors in conferences sheet
function generateConferencesTeamFormattingRules(sheetId, columnIndex, rowCount, dynastyTeams = null) {
  const rules = []
  const teams = getTeamsWithCustom(dynastyTeams)

  for (const [abbr, teamData] of Object.entries(teams)) {
    // Add rule for uppercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })

    // Add rule for lowercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr.toLowerCase() }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })
  }

  return rules
}

// Initialize the Conferences sheet with headers and team data
async function initializeConferencesSheet(spreadsheetId, accessToken, sheetId, sortedConferences, maxTeams, conferencesData, dynastyTeams = null) {
  const teamAbbrs = getTeamAbbreviationsListWithCustom(dynastyTeams)

  const requests = [
    // Set conference headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: sortedConferences.length
        },
        rows: [{
          values: sortedConferences.map(conf => ({
            userEnteredValue: { stringValue: conf }
          }))
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill teams for each conference
    ...sortedConferences.map((conf, colIndex) => {
      const teams = conferencesData[conf] || []
      return {
        updateCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: teams.length + 1,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          rows: teams.map(team => ({
            values: [{ userEnteredValue: { stringValue: team } }]
          })),
          fields: 'userEnteredValue'
        }
      }
    }),
    // Format all cells: Bold, Italic, Center, Barlow font, size 10
    {
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Bold headers with different background
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: hexToRgb('#333333'),
            textFormat: {
              foregroundColor: hexToRgb('#FFFFFF'),
              bold: true,
              fontFamily: 'Barlow',
              fontSize: 11
            }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    },
    // Add STRICT team dropdown validation for all columns
    ...sortedConferences.map((conf, colIndex) => ({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: maxTeams + 1,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    })),
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Conference headers - do not edit',
          warningOnly: false
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: sortedConferences.length
        },
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    // Add conditional formatting for team colors for each column
    ...sortedConferences.flatMap((conf, colIndex) =>
      generateConferencesTeamFormattingRules(sheetId, colIndex, maxTeams, dynastyTeams)
    )
  ]

  // Execute batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing conferences sheet:', error)
    throw new Error(`Failed to initialize conferences sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read conferences data from sheet
// Get all expected FBS teams from default conferences
function getAllExpectedTeams() {
  const allTeams = new Set()
  Object.values(DEFAULT_CONFERENCES).forEach(teams => {
    teams.forEach(team => allTeams.add(team))
  })
  return allTeams
}

// Translate a conferences object whose team abbrs may be stale (e.g.
// the static DEFAULT_CONFERENCES list, or saved data from before a
// teambuilder rename) into one that uses the user's CURRENT
// abbreviations. Looks each abbr up by tid via the static team
// registry, then prefers the abbr in the user's dynasty registry.
//
// No-op for non-teambuilder dynasties (current abbr == default abbr)
// and when dynastyTeams is missing — safe to apply unconditionally.
function translateConferencesToCurrentAbbrs(conferences, dynastyTeams) {
  if (!conferences || !dynastyTeams || typeof dynastyTeams !== 'object') return conferences
  const defaultAbbrToTid = {}
  Object.entries(DEFAULT_TEAMS).forEach(([tid, team]) => {
    if (team?.abbr) defaultAbbrToTid[team.abbr.toUpperCase()] = Number(tid)
  })
  const out = {}
  Object.entries(conferences).forEach(([conf, teams]) => {
    out[conf] = (teams || []).map(abbr => {
      const upper = String(abbr || '').toUpperCase()
      const tid = defaultAbbrToTid[upper]
      const currentAbbr = tid != null ? dynastyTeams[tid]?.abbr : null
      return currentAbbr ? currentAbbr.toUpperCase() : upper
    })
  })
  return out
}

// Helper to parse a single sheet tab's conference data
function parseConferenceSheetData(rows) {
  if (!rows || rows.length === 0) return {}

  // First row is headers (conference names)
  const headers = rows[0]
  const conferences = {}

  // Build conference object
  headers.forEach((confName, colIndex) => {
    if (!confName) return

    const teams = []
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const team = rows[rowIndex]?.[colIndex]
      if (team && team.trim()) {
        teams.push(team.toUpperCase())
      }
    }
    conferences[confName] = teams
  })

  return conferences
}

// Validate conference data for a single year.
//
// `dynastyTeams` (when provided) is the user's tid-keyed team registry
// from currentDynasty.teams. We use it to derive the expected FBS team
// set from the user's CURRENT abbreviations — that way a teambuilder
// rename (e.g. BAMA → ALA) doesn't get reported as a missing team. We
// also gracefully accept extra teams that aren't in the static default
// list (FCS additions like Delaware joining C-USA).
function validateConferenceData(conferences, yearLabel = '', dynastyTeams = null) {
  const allTeamsInSheet = []
  const teamToConference = {}

  Object.entries(conferences).forEach(([confName, teams]) => {
    teams.forEach(team => {
      allTeamsInSheet.push(team)
      if (teamToConference[team]) {
        teamToConference[team].push(confName)
      } else {
        teamToConference[team] = [confName]
      }
    })
  })

  // Check for duplicates — still a hard error since it corrupts the
  // team→conference relationship downstream.
  const duplicates = Object.entries(teamToConference)
    .filter(([team, confs]) => confs.length > 1)
    .map(([team, confs]) => `${team} (in ${confs.join(', ')})`)

  if (duplicates.length > 0) {
    throw new Error(`${yearLabel ? `[${yearLabel}] ` : ''}Duplicate teams found: ${duplicates.join('; ')}. Each team can only be in one conference.`)
  }

  // Build the expected set. Prefer the dynasty's actual team registry
  // when available (covers teambuilder renames); fall back to the
  // static default list for older callers that don't pass it in.
  let expectedTeams
  if (dynastyTeams && typeof dynastyTeams === 'object') {
    expectedTeams = new Set()
    Object.values(dynastyTeams).forEach(team => {
      // Only require FBS teams (not FCS-only additions). isFCS is the
      // canonical flag in the team registry.
      if (team && !team.isFCS && team.abbr) {
        expectedTeams.add(team.abbr.toUpperCase())
      }
    })
    // Defensive fallback: if registry produced nothing usable (corrupt
    // or empty), drop back to the static list rather than skip the
    // missing check entirely.
    if (expectedTeams.size === 0) {
      expectedTeams = getAllExpectedTeams()
    }
  } else {
    expectedTeams = getAllExpectedTeams()
  }

  const teamsInSheet = new Set(allTeamsInSheet)
  const missingTeams = [...expectedTeams].filter(team => !teamsInSheet.has(team))

  if (missingTeams.length > 0) {
    const preview = missingTeams.slice(0, 8).join(', ')
    const more = missingTeams.length > 8 ? ` (+${missingTeams.length - 8} more)` : ''
    throw new Error(`${yearLabel ? `[${yearLabel}] ` : ''}Missing ${missingTeams.length} team${missingTeams.length === 1 ? '' : 's'} from your sheet: ${preview}${more}. Add them to a conference column and save again. (Renamed teams use your custom abbreviation.)`)
  }
}

export async function readConferencesFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    // opts.rows is the SAME rows[][] the Sheets API returns — row 0 is the
    // conference-name header, rows 1..N are the per-column team slots. We run
    // it through the IDENTICAL parse + validate path used for the legacy
    // single "Conferences" tab, so an incomplete or duplicate paste throws in
    // validateConferenceData BEFORE anything is returned to the destructive
    // save. Returns the flat { conf: [teams] } shape, which onSave applies to
    // the current year (matching the legacy single-tab contract).
    if (opts.rows) {
      const conferences = parseConferenceSheetData(opts.rows)
      validateConferenceData(conferences, '', dynastyTeams)
      return conferences
    }

    const accessToken = await getAccessToken()

    // First, get spreadsheet metadata to find all sheet tabs
    const metaResponse = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    )

    if (!metaResponse.ok) {
      const error = await metaResponse.json()
      throw new Error(`Failed to read spreadsheet metadata: ${error.error?.message || 'Unknown error'}`)
    }

    const metaData = await metaResponse.json()
    const sheetTitles = metaData.sheets?.map(s => s.properties.title) || []

    // Filter to only year tabs (numeric titles like "2025", "2026")
    const yearTabs = sheetTitles.filter(title => /^\d{4}$/.test(title))

    // If no year tabs found, try legacy "Conferences" tab
    if (yearTabs.length === 0) {
      if (sheetTitles.includes('Conferences')) {
        // Legacy single-tab format - read it and return without year key
        const response = await fetchWithTimeout(
          `${SHEETS_API_BASE}/${spreadsheetId}/values/Conferences!A1:Z21`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            }
          }
        )

        if (!response.ok) {
          const error = await response.json()
          throw new Error(`Failed to read conferences: ${error.error?.message || 'Unknown error'}`)
        }

        const data = await response.json()
        const conferences = parseConferenceSheetData(data.values)
        validateConferenceData(conferences, '', dynastyTeams)
        return conferences
      }
      return {}
    }

    // Read all year tabs and return data keyed by year
    const conferencesByYear = {}

    for (const yearTab of yearTabs) {
      // Read up to 26 columns (A-Z) to handle any number of conferences
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${yearTab}'!A1:Z21`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read ${yearTab} conferences: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      const conferences = parseConferenceSheetData(data.values)
      validateConferenceData(conferences, yearTab, dynastyTeams)
      conferencesByYear[yearTab] = conferences
    }

    return conferencesByYear
  } catch (error) {
    console.error('Error reading conferences:', error)
    throw error
  }
}

// ============================================
// STATS ENTRY SHEET
// ============================================

/**
 * Create a Stats Entry sheet for end of season player statistics
 * Columns: Player, Position, Class, Dev Trait, Overall Rating (before game one), Games Played, Snaps Played
 * Pre-fills player info from roster data
 */
export async function createStatsEntrySheet(dynastyName, year, players = []) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    // Create the spreadsheet with Stats tab
    // 3 columns: Player (dropdown), Games Played, Snaps Played
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} Dynasty - ${year} GP/Snaps`
        },
        sheets: [
          {
            properties: {
              title: 'GP/Snaps',
              gridProperties: {
                rowCount: Math.max(players.length + 10, 100), // Extra rows for flexibility
                columnCount: 3, // Player + GP + Snaps
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const statsSheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and set up dropdown validation for player names
    await initializeStatsEntrySheet(sheet.spreadsheetId, accessToken, statsSheetId, players)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating stats entry sheet:', error)
    throw error
  }
}

// Initialize the Stats Entry sheet with headers and player dropdown validation
async function initializeStatsEntrySheet(spreadsheetId, accessToken, sheetId, players) {
  // Sort players alphabetically by name for the dropdown
  const sortedPlayerNames = [...players]
    .map(p => p.name)
    .filter(name => name && name.trim())
    .sort((a, b) => a.localeCompare(b))

  // Number of data rows (one per player, plus a few extra)
  const numDataRows = Math.max(sortedPlayerNames.length + 5, 90)

  const requests = [
    // Set headers - only 3 columns now
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 3
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' } },
            { userEnteredValue: { stringValue: 'Games Played' } },
            { userEnteredValue: { stringValue: 'Snaps Played' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Bold and center headers
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(textFormat.bold,horizontalAlignment,verticalAlignment,wrapStrategy)'
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 200 }, // Player name (dropdown)
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 3
        },
        properties: { pixelSize: 120 }, // GP, Snaps
        fields: 'pixelSize'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Protected header row',
          warningOnly: false
        }
      }
    },
    // Center all data cells
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: numDataRows + 1,
          startColumnIndex: 0,
          endColumnIndex: 3
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat.horizontalAlignment'
      }
    }
  ]

  // Add dropdown validation for Player column (column A) with all roster player names
  // This prevents free text entry - users must select from the dropdown
  if (sortedPlayerNames.length > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: numDataRows + 1,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: sortedPlayerNames.map(name => ({ userEnteredValue: name }))
          },
          showCustomUi: true,
          strict: true // Reject input not in the list
        }
      }
    })
  }

  // Execute all requests
  const batchResponse = await fetchWithTimeout(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    }
  )

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Error initializing stats sheet:', error)
    throw new Error(`Failed to initialize sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

/**
 * Read stats data from the stats entry sheet
 * New format: Column A = Player Name, Column B = Games Played, Column C = Snaps Played
 */
export async function readStatsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Read all data from the GP/Snaps sheet (A-C: Player, GP, Snaps)
    const range = encodeURIComponent("'GP/Snaps'!A2:C200")
    const response = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read stats: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const rows = data.values || []

    // BLANK cell semantics: a cell the user left empty means "I don't
    // know — don't touch what's already saved." A cell with "0" in it
    // means "this player legitimately had zero." parseInt('') is NaN,
    // parseInt('0') is 0, so the legacy `parseInt(x) || 0` collapsed
    // both to 0 and silently wiped pre-existing GP/Snaps for any row
    // the user didn't touch. Returning null for blanks lets the
    // caller preserve existing values.
    const parseIntOrNull = (raw) => {
      if (raw === undefined || raw === null) return null
      const s = String(raw).trim()
      if (s === '') return null
      const n = parseInt(s, 10)
      return Number.isFinite(n) ? n : null
    }

    return rows.map(row => ({
      name: row[0] || '',
      gamesPlayed: parseIntOrNull(row[1]),
      snapsPlayed: parseIntOrNull(row[2]),
    })).filter(player => player.name && player.name.trim()) // Filter by player name (must have selected from dropdown)
  } catch (error) {
    console.error('Error reading stats from sheet:', error)
    throw error
  }
}

// Local (no-Google) counterpart of readStatsFromSheet. Takes splitTsv rows
// (the "=== GP/SNAPS ===" label and code fences are already stripped) and
// returns the SAME [{ name, gamesPlayed, snapsPlayed }] shape the Google
// reader produces, so the existing onSave applies unchanged. Blank cell = null
// ("don't touch the saved value"), never 0 — same semantics as the reader.
export function parseGpSnapsLocal(rows) {
  const parseIntOrNull = (raw) => {
    if (raw === undefined || raw === null) return null
    const s = String(raw).trim()
    if (s === '') return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }
  return (rows || [])
    .map((row) => ({
      name: String(row[0] || '').trim(),
      gamesPlayed: parseIntOrNull(row[1]),
      snapsPlayed: parseIntOrNull(row[2]),
    }))
    // Drop a stray header row and require a real player name (the strict
    // dropdown the Google flow enforced is replaced here by this filter).
    .filter((p) => p.name && p.name.toLowerCase() !== 'player')
}

// ============================================
// DETAILED STATS SHEET (9 TABS)
// ============================================

// Define columns for each stat category
const DETAILED_STATS_TABS = {
  'Passing': [
    'Completions', 'Attempts', 'Yards', 'Touchdowns', 'Interceptions',
    'Net Yards/Attempt', 'Adjusted Net Yards/Attempt', 'Passing Long', 'Sacks Taken'
  ],
  'Rushing': [
    'Carries', 'Yards', 'Touchdowns', '20+ Yard Runs', 'Broken Tackles',
    'Yards After Contact', 'Rushing Long', 'Fumbles'
  ],
  'Receiving': [
    'Receptions', 'Yards', 'Touchdowns', 'Receiving Long', 'Yards After Catch', 'Drops'
  ],
  'Blocking': [
    'Pancakes', 'Sacks Allowed'
  ],
  'Defensive': [
    'Solo Tackles', 'Assisted Tackles', 'Tackles for Loss', 'Sacks', 'Interceptions',
    'INT Return Yards', 'INT Long', 'Defensive TDs', 'Deflections', 'Catches Allowed',
    'Forced Fumbles', 'Fumble Recoveries', 'Fumble Return Yards', 'Blocks', 'Safeties'
  ],
  'Kicking': [
    'FG Made', 'FG Attempted', 'FG Long', 'XP Made', 'XP Attempted',
    'FG Made (0-29)', 'FG Att (0-29)', 'FG Made (30-39)', 'FG Att (30-39)',
    'FG Made (40-49)', 'FG Att (40-49)', 'FG Made (50+)', 'FG Att (50+)',
    'Kickoffs', 'Touchbacks', 'FG Blocked', 'XP Blocked'
  ],
  'Punting': [
    'Punts', 'Punting Yards', 'Net Punting Yards', 'Punts Inside 20',
    'Touchbacks', 'Punt Long', 'Punts Blocked'
  ],
  'Kick Return': [
    'Kickoff Returns', 'KR Yardage', 'KR Touchdowns', 'KR Long'
  ],
  'Punt Return': [
    'Punt Returns', 'PR Yardage', 'PR Long', 'PR Touchdowns'
  ]
}

/**
 * Create a Detailed Stats sheet with 9 tabs for all football statistics
 * Each tab has: Name, Snaps Played (pre-filled), then stat-specific columns
 */
export async function createDetailedStatsSheet(dynastyName, year, playerStats = [], aggregatedStats = {}) {
  // aggregatedStats is an object keyed by player name, containing their aggregated box score stats
  // Format: { 'Player Name': { passing: {...}, rushing: {...}, ... }, ... }
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    const tabNames = Object.keys(DETAILED_STATS_TABS)
    const rowCount = Math.max(playerStats.length + 1, 86)

    // Create the spreadsheet with all 9 tabs
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} Dynasty - ${year} Detailed Stats`
        },
        sheets: tabNames.map((tabName, index) => ({
          properties: {
            title: tabName,
            index: index,
            gridProperties: {
              rowCount: rowCount,
              columnCount: DETAILED_STATS_TABS[tabName].length + 2, // +2 for Name and Snaps columns
              frozenRowCount: 1
            }
          }
        }))
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()

    // Initialize each tab with headers and player data IN PARALLEL — and
    // share the sheet at the same time. Each tab init is a separate
    // batchUpdate call (~400–600ms of network latency); serially we paid
    // ~5s before the user could see the sheet. With Promise.all the wall-
    // clock collapses to roughly the slowest single request. Tab inits
    // touch independent sheetIds so they don't conflict with each other
    // or with shareSheetPublicly.
    await Promise.all([
      ...tabNames.map((tabName, i) => initializeDetailedStatsTab(
        sheet.spreadsheetId,
        accessToken,
        sheet.sheets[i].properties.sheetId,
        tabName,
        playerStats,
        aggregatedStats
      )),
      shareSheetPublicly(sheet.spreadsheetId, accessToken),
    ])

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating detailed stats sheet:', error)
    throw error
  }
}

// Position filters for each detailed stats tab
const TAB_POSITION_FILTERS = {
  'Passing': ['QB'],
  'Rushing': ['QB', 'HB', 'FB', 'WR', 'TE'],
  'Receiving': ['HB', 'FB', 'WR', 'TE'],
  'Blocking': ['LT', 'LG', 'C', 'RG', 'RT'],
  'Defensive': ['LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS'],
  'Kicking': ['K', 'P'],
  'Punting': ['K', 'P'],
  'Kick Return': ['HB', 'FB', 'WR', 'CB', 'FS', 'SS'],
  'Punt Return': ['HB', 'FB', 'WR', 'CB', 'FS', 'SS']
}

// Mapping from detailed stats tab names to box score stat category keys
const TAB_TO_BOXSCORE_CATEGORY = {
  'Passing': 'passing',
  'Rushing': 'rushing',
  'Receiving': 'receiving',
  'Blocking': 'blocking',
  'Defensive': 'defense',
  'Kicking': 'kicking',
  'Punting': 'punting',
  'Kick Return': 'kickReturn',
  'Punt Return': 'puntReturn'
}

// Mapping from detailed stats column names to box score field names —
// keyed by box-score CATEGORY so identical column labels can resolve to
// different fields per tab. Concrete reason: "Touchbacks" means
// `touchbacks` in Kicking but `tB` in Punting; "Yards" varies similarly.
// A flat name->field map silently mis-routed punting data into kicking
// fields and vice versa.
const COLUMN_TO_BOXSCORE_FIELD = {
  passing: {
    'Completions': 'comp',
    'Attempts': 'attempts',
    'Yards': 'yards',
    'Touchdowns': 'tD',
    'Interceptions': 'iNT',
    'Passing Long': 'long',
    'Sacks Taken': 'sacks',
    'Net Yards/Attempt': 'netYardsPerAttempt',
    'Adjusted Net Yards/Attempt': 'adjNetYardsPerAttempt'
  },
  rushing: {
    'Carries': 'carries',
    'Yards': 'yards',
    'Touchdowns': 'tD',
    'Rushing Long': 'long',
    'Fumbles': 'fumbles',
    '20+ Yard Runs': '20+',
    'Broken Tackles': 'brokenTackles',
    'Yards After Contact': 'yAC'
  },
  receiving: {
    'Receptions': 'receptions',
    'Yards': 'yards',
    'Touchdowns': 'tD',
    'Receiving Long': 'long',
    'Yards After Catch': 'rAC',
    'Run After Catch': 'rAC', // Legacy alias
    'Drops': 'drops'
  },
  blocking: {
    'Sacks Allowed': 'sacksAllowed',
    'Pancakes': 'pancakes'
  },
  defense: {
    'Solo Tackles': 'solo',
    'Assisted Tackles': 'assists',
    'Tackles for Loss': 'tFL',
    'Sacks': 'sack',
    'Interceptions': 'iNT',
    'INT Return Yards': 'iNTYards',
    'INT Long': 'iNTLong',
    'Defensive TDs': 'tD',
    'Deflections': 'deflections',
    'Catches Allowed': 'catchesAllowed',
    'Forced Fumbles': 'fF',
    'Fumble Recoveries': 'fR',
    'Fumble Return Yards': 'fumbleYards',
    'Blocks': 'blocks',
    'Safeties': 'safeties'
  },
  kicking: {
    'FG Made': 'fGM',
    'FG Attempted': 'fGA',
    'FG Long': 'fGLong',
    'XP Made': 'xPM',
    'XP Attempted': 'xPA',
    'Kickoffs': 'kickoffs',
    'Touchbacks': 'touchbacks',
    'FG Blocked': 'fGBlock',
    'XP Blocked': 'xPB',
    'FG Made (0-29)': 'fGM29',
    'FG Att (0-29)': 'fGA29',
    'FG Made (30-39)': 'fGM39',
    'FG Att (30-39)': 'fGA39',
    'FG Made (40-49)': 'fGM49',
    'FG Att (40-49)': 'fGA49',
    'FG Made (50+)': 'fGM50+',
    'FG Att (50+)': 'fGA50+'
  },
  punting: {
    'Punts': 'punts',
    'Punting Yards': 'yards',
    'Net Punting Yards': 'netYards',
    'Punts Inside 20': 'in20',
    'Touchbacks': 'tB', // ← was silently routed to kicking's 'touchbacks'
    'Punt Long': 'long',
    'Punts Blocked': 'block'
  },
  kickReturn: {
    'Kickoff Returns': 'kR',
    'KR Yardage': 'yards',
    'KR Touchdowns': 'tD',
    'KR Long': 'long'
  },
  puntReturn: {
    'Punt Returns': 'pR',
    'PR Yardage': 'yards',
    'PR Touchdowns': 'tD',
    'PR Long': 'long'
  }
}

// Initialize a single tab of the detailed stats sheet
async function initializeDetailedStatsTab(spreadsheetId, accessToken, sheetId, tabName, playerStats, aggregatedStats = {}) {
  const statColumns = DETAILED_STATS_TABS[tabName]
  const totalColumns = statColumns.length + 2 // Name + Snaps + stat columns
  const boxScoreCategory = TAB_TO_BOXSCORE_CATEGORY[tabName]

  // Filter players by positions relevant to this tab
  const allowedPositions = TAB_POSITION_FILTERS[tabName] || []
  const filteredPlayers = playerStats.filter(p => allowedPositions.includes(p.position))

  // Sort by snaps played (highest to lowest)
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    return (b.snapsPlayed || 0) - (a.snapsPlayed || 0)
  })

  // Get all player names for dropdown (filtered by position for this tab)
  const playerNames = filteredPlayers.map(p => p.name).sort()

  // Calculate row count for validation (use 85 rows for data entry)
  const dataRowCount = 85

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: totalColumns
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Name' } },
            { userEnteredValue: { stringValue: 'Snaps' } },
            ...statColumns.map(col => ({ userEnteredValue: { stringValue: col } }))
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Bold and center headers
    {
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(textFormat.bold,horizontalAlignment,verticalAlignment,wrapStrategy)'
      }
    },
    // Set Name column width
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    },
    // Set Snaps column width
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 60 },
        fields: 'pixelSize'
      }
    },
    // Set stat columns width
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 2,
          endIndex: totalColumns
        },
        properties: { pixelSize: 85 },
        fields: 'pixelSize'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Protected header row',
          warningOnly: false
        }
      }
    }
  ]

  // Add dropdown validation for Name column (strict - must be from roster)
  if (playerNames.length > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: dataRowCount + 1,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: playerNames.map(name => ({ userEnteredValue: name }))
          },
          showCustomUi: true,
          strict: true // Reject input that doesn't match dropdown
        }
      }
    })
  }

  // Pre-fill player data if available (including aggregated box score stats)
  if (sortedPlayers.length > 0) {
    // Helper to get stat value for a player from aggregated stats
    const getPlayerStatValue = (playerName, columnName) => {
      const playerAggStats = aggregatedStats[playerName]
      if (!playerAggStats || !boxScoreCategory) return null

      const categoryStats = playerAggStats[boxScoreCategory]
      if (!categoryStats) return null

      const fieldName = COLUMN_TO_BOXSCORE_FIELD[boxScoreCategory]?.[columnName]
      if (!fieldName) return null

      const value = categoryStats[fieldName]
      return value !== undefined && value !== null ? value : null
    }

    requests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: sortedPlayers.length + 1,
          startColumnIndex: 0,
          endColumnIndex: totalColumns
        },
        rows: sortedPlayers.map(player => {
          // Name and Snaps columns
          const baseValues = [
            { userEnteredValue: { stringValue: String(player.name ?? '') } },
            { userEnteredValue: { numberValue: Number(player.snapsPlayed) || 0 } }
          ]

          // Stat columns - pre-fill from aggregated box scores if available
          const statValues = statColumns.map(colName => {
            const statValue = getPlayerStatValue(player.name, colName)
            if (statValue !== null) {
              // Use number for numeric stats
              if (typeof statValue === 'number') {
                return { userEnteredValue: { numberValue: statValue } }
              }
              return { userEnteredValue: { stringValue: String(statValue) } }
            }
            // Leave empty if no aggregated stat available
            return { userEnteredValue: { stringValue: '' } }
          })

          return { values: [...baseValues, ...statValues] }
        }),
        fields: 'userEnteredValue'
      }
    })

    // Center Snaps and stat columns (not Name column)
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: sortedPlayers.length + 1,
          startColumnIndex: 1, // Start at Snaps column
          endColumnIndex: totalColumns
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat.horizontalAlignment'
      }
    })

    // Add auto-filter to header row with default sort by Snaps (descending)
    requests.push({
      setBasicFilter: {
        filter: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: sortedPlayers.length + 1,
            startColumnIndex: 0,
            endColumnIndex: totalColumns
          },
          sortSpecs: [{
            dimensionIndex: 1, // Snaps column (column B)
            sortOrder: 'DESCENDING'
          }]
        }
      }
    })
  }

  // Execute all requests
  const batchResponse = await fetchWithTimeout(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    }
  )

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error(`Error initializing ${tabName} tab:`, error)
    throw new Error(`Failed to initialize ${tabName} tab: ${error.error?.message || 'Unknown error'}`)
  }
}

/**
 * Read detailed stats data from all tabs
 * Columns: Name (A), Snaps (B), then stat columns (C+)
 */
export async function readDetailedStatsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const tabNames = Object.keys(DETAILED_STATS_TABS)

    // Fire all 9 tab reads in parallel instead of awaiting them in sequence.
    // Each fetch was ~250–500ms of network latency; serially that stacks to
    // 2–4 seconds before the user sees any sync progress. Promise.all lets
    // them run concurrently and reduces the wall-clock to roughly the
    // slowest single request (~500ms).
    const responses = await Promise.all(
      tabNames.map(tabName => {
        const statColumns = DETAILED_STATS_TABS[tabName]
        const lastColumn = String.fromCharCode(65 + statColumns.length + 1) // A=65, +1 for Name, +1 for Snaps
        const range = encodeURIComponent(`'${tabName}'!A2:${lastColumn}200`)
        return fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        )
      })
    )

    const result = {}
    await Promise.all(responses.map(async (response, idx) => {
      const tabName = tabNames[idx]
      const statColumns = DETAILED_STATS_TABS[tabName]
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        console.error(`Failed to read ${tabName}:`, error)
        return
      }
      const data = await response.json()
      const rows = data.values || []
      result[tabName] = rows.map(row => {
        const player = {
          name: row[0]?.trim() || ''
          // Snaps column (row[1]) is read-only for display/sorting, not returned
        }
        // Map stat columns (starting at column index 2, after Name and Snaps)
        statColumns.forEach((col, i) => {
          const value = row[i + 2]
          // Try to parse as number, otherwise keep as string
          player[col] = value !== undefined && value !== '' ? (isNaN(parseFloat(value)) ? value : parseFloat(value)) : null
        })
        return player
      }).filter(player => player.name) // Filter out empty rows (check for valid name)
    }))

    return result
  } catch (error) {
    console.error('Error reading detailed stats from sheet:', error)
    throw error
  }
}

// LOCAL-PASTE parse for Detailed Stats. The Google reader above reads NINE tabs
// (one fetch per stat category) and reads each player row POSITIONALLY: col A =
// Name, col B = Snaps (read-only), then the stat columns in the fixed order of
// DETAILED_STATS_TABS[tabName]. splitTsv can't carry nine separate tabs (blank
// lines + "=== … ===" labels are stripped), so the local paste is
// SELF-DESCRIBING per row:
//
//   TabName<TAB>PlayerName<TAB><stat col 1><TAB><stat col 2>…
//
// TabName (col 0) picks the category and thus the column ORDER; PlayerName is
// col 1; the remaining cells map positionally into DETAILED_STATS_TABS[TabName]
// — the SAME positional read the Google reader does, minus the Snaps column
// (which the reader discards anyway). Returns the SAME
// { tabName: [ { name, <col>: value } ] } shape, so the existing onSave (which
// keys by category + player NAME + column-name string, never by row index)
// applies unchanged. Unknown players/stats are simply omitted.
export function parseDetailedStatsLocal(rows) {
  // Case-insensitive tab-name resolver so "kick return"/"KICK RETURN" match the
  // canonical "Kick Return" key.
  const tabByLower = {}
  for (const tab of Object.keys(DETAILED_STATS_TABS)) tabByLower[tab.toLowerCase()] = tab
  // Common natural-language variants the AI/user writes for a category so a
  // near-miss header doesn't silently drop that whole category's rows.
  const CATEGORY_ALIASES = {
    'defense': 'Defensive', 'defensive stats': 'Defensive', 'defense stats': 'Defensive',
    'kickoff return': 'Kick Return', 'kickoff returns': 'Kick Return', 'kick returns': 'Kick Return',
    'punt returns': 'Punt Return', 'receiving stats': 'Receiving', 'rushing stats': 'Rushing',
    'passing stats': 'Passing', 'kicking stats': 'Kicking', 'punting stats': 'Punting',
    'blocking stats': 'Blocking',
  }
  const resolveTab = (key) => {
    const k = String(key || '').trim().toLowerCase()
    if (!k) return undefined
    if (tabByLower[k]) return tabByLower[k]
    const alias = CATEGORY_ALIASES[k]
    return alias && DETAILED_STATS_TABS[alias] ? alias : undefined
  }

  const result = {}
  for (const row of (rows || [])) {
    const tabName = resolveTab(row[0])
    const name = String(row[1] || '').trim()
    // A row needs a recognized category and a player name; otherwise skip.
    if (!tabName || !name) continue

    const statColumns = DETAILED_STATS_TABS[tabName]
    const player = { name }
    statColumns.forEach((col, i) => {
      // Stat cells start at row index 2 (after TabName + PlayerName), mirroring
      // the Google reader's `row[i + 2]` (Name + Snaps offset).
      const value = row[i + 2]
      player[col] = value !== undefined && value !== '' ? (isNaN(parseFloat(value)) ? value : parseFloat(value)) : null
    })

    if (!result[tabName]) result[tabName] = []
    result[tabName].push(player)
  }

  return result
}

// Conference order for standings sheet
const CONFERENCE_ORDER = [
  'ACC', 'American', 'Big 12', 'Big Ten', 'C-USA', 'Independent', 'MAC', 'MWC', 'Pac-12', 'SEC', 'Sun Belt'
]

const TEAMS_PER_CONFERENCE = 20

/**
 * Create a Google Sheet for conference standings entry
 * All conferences stacked with 20 team slots each
 */
export async function createConferenceStandingsSheet(year, existingStandings = {}, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Calculate total rows: header row + (20 teams * 10 conferences) + 9 spacer rows between conferences
    const totalTeamRows = CONFERENCE_ORDER.length * TEAMS_PER_CONFERENCE
    const spacerRows = CONFERENCE_ORDER.length - 1
    const totalRows = 1 + totalTeamRows + spacerRows // 1 header + 200 team rows + 9 spacers = 210

    // Create spreadsheet
    const createResponse = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${year} Conference Standings`
        },
        sheets: [{
          properties: {
            title: 'Standings',
            gridProperties: {
              rowCount: totalRows + 10, // Extra padding
              columnCount: 7,
              frozenRowCount: 1
            }
          }
        }]
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Share publicly for embedding
    await shareSheetPublicly(spreadsheetId, accessToken)

    // Build requests for formatting and data
    const requests = []

    // Column headers
    const headers = ['Conference', 'Conf. Rank', 'Team', 'Wins', 'Losses', 'Points For', 'Points Against']

    // Set header row
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        rows: [{
          values: headers.map(h => ({
            userEnteredValue: { stringValue: h },
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          }))
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 7
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    })

    // Pre-fill conference names and rank numbers for each conference section
    let currentRow = 1 // Start after header
    const cellUpdates = []

    CONFERENCE_ORDER.forEach((conference, confIndex) => {
      // Pre-fill 20 rows for this conference
      for (let teamRank = 1; teamRank <= TEAMS_PER_CONFERENCE; teamRank++) {
        cellUpdates.push({
          range: {
            sheetId,
            startRowIndex: currentRow,
            endRowIndex: currentRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          rows: [{
            values: [
              {
                userEnteredValue: { stringValue: conference },
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                  textFormat: { bold: true, fontSize: 10 },
                  horizontalAlignment: 'CENTER'
                }
              },
              {
                userEnteredValue: { numberValue: teamRank },
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                  textFormat: { fontSize: 10 },
                  horizontalAlignment: 'CENTER'
                }
              }
            ]
          }],
          fields: 'userEnteredValue,userEnteredFormat'
        })
        currentRow++
      }

      // Add a spacer row between conferences (except after the last one)
      if (confIndex < CONFERENCE_ORDER.length - 1) {
        cellUpdates.push({
          range: {
            sheetId,
            startRowIndex: currentRow,
            endRowIndex: currentRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 7
          },
          rows: [{
            values: Array(7).fill({
              userEnteredFormat: {
                backgroundColor: { red: 0.3, green: 0.3, blue: 0.3 }
              }
            })
          }],
          fields: 'userEnteredFormat'
        })
        currentRow++
      }
    })

    // Add cell updates in batches to avoid hitting API limits
    const batchSize = 50
    for (let i = 0; i < cellUpdates.length; i += batchSize) {
      const batch = cellUpdates.slice(i, i + batchSize)
      requests.push(...batch.map(update => ({ updateCells: update })))
    }

    // Set column widths
    const columnWidths = [100, 80, 200, 60, 60, 90, 110]
    columnWidths.forEach((width, index) => {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: index,
            endIndex: index + 1
          },
          properties: { pixelSize: width },
          fields: 'pixelSize'
        }
      })
    })

    // Center align all data cells
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: totalRows,
          startColumnIndex: 2,
          endColumnIndex: 7
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment'
      }
    })

    // Add team dropdown validation for Team column (column C, index 2)
    requests.push(generateTeamValidation(sheetId, 2, 1, totalRows, dynastyTeams))

    // Add conditional formatting for team colors in Team column
    requests.push(...generateTeamFormattingRulesForRange(sheetId, 2, 1, totalRows, dynastyTeams))

    // Execute all requests
    const batchResponse = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests })
      }
    )

    if (!batchResponse.ok) {
      const error = await batchResponse.json()
      console.error('Error setting up conference standings sheet:', error)
      throw new Error(`Failed to setup sheet: ${error.error?.message || 'Unknown error'}`)
    }

    // Pre-fill existing data if provided
    if (existingStandings && Object.keys(existingStandings).length > 0) {
      await prefillConferenceStandingsData(spreadsheetId, accessToken, existingStandings)
    }

    return {
      sheetId: spreadsheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating conference standings sheet:', error)
    throw error
  }
}

/**
 * Pre-fill existing conference standings data into sheet
 */
async function prefillConferenceStandingsData(spreadsheetId, accessToken, existingStandings) {
  // Build values array - need to calculate row positions for each conference
  // Row 1 = header, then 20 rows per conference with spacer rows between
  const values = []

  let currentRow = 0 // 0-indexed, row 0 is header so data starts at row 1

  CONFERENCE_ORDER.forEach((conference, confIndex) => {
    const confData = existingStandings[conference] || []

    // Fill 20 rows for this conference
    for (let teamRank = 1; teamRank <= TEAMS_PER_CONFERENCE; teamRank++) {
      // Find team with this rank in existing data
      const teamData = confData.find(t => t.rank === teamRank)

      if (teamData) {
        // Row format: [Conference, Rank, Team, Wins, Losses, Points For, Points Against]
        // We only need to fill Team (C), Wins (D), Losses (E), Points For (F), Points Against (G)
        values.push({
          row: currentRow + 2, // +2 because row 1 is header and sheets are 1-indexed
          team: teamData.team || '',
          wins: teamData.wins || 0,
          losses: teamData.losses || 0,
          pointsFor: teamData.pointsFor || 0,
          pointsAgainst: teamData.pointsAgainst || 0
        })
      }
      currentRow++
    }

    // Account for spacer row (except after last conference)
    if (confIndex < CONFERENCE_ORDER.length - 1) {
      currentRow++
    }
  })

  if (values.length === 0) return

  // Build batch update for existing data - update columns C-G for each team
  const requests = values.map(v => ({
    updateCells: {
      range: {
        sheetId: 0,
        startRowIndex: v.row - 1, // Convert to 0-indexed
        endRowIndex: v.row,
        startColumnIndex: 2, // Column C
        endColumnIndex: 7    // Column G
      },
      rows: [{
        values: [
          { userEnteredValue: { stringValue: String(v.team ?? '') } },
          { userEnteredValue: { numberValue: Number(v.wins) || 0 } },
          { userEnteredValue: { numberValue: Number(v.losses) || 0 } },
          { userEnteredValue: { numberValue: Number(v.pointsFor) || 0 } },
          { userEnteredValue: { numberValue: Number(v.pointsAgainst) || 0 } }
        ]
      }],
      fields: 'userEnteredValue'
    }
  }))

  // Execute batch update
  const response = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    }
  )

  if (!response.ok) {
    console.error('Failed to pre-fill conference standings:', await response.json())
  }
}

/**
 * Read conference standings from Google Sheet
 */
export async function readConferenceStandingsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: rows are already section-tagged. The Google sheet
    // pre-fills cols A (conference) and B (rank) and reads them back here, so
    // each row already carries its conference in row[0]. The local prompt asks
    // the AI to emit those same 7 columns per line —
    // Conference⇥Rank⇥Team⇥Wins⇥Losses⇥PointsFor⇥PointsAgainst — so the pasted
    // rows flow through the EXACT same per-row grouping below (group by row[0]
    // conference). No separate parser needed.
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      // Read all data from the Standings tab
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Standings!A2:G250`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read standings: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse rows into standings by conference
    const standings = {}

    rows.forEach(row => {
      const conference = row[0]?.trim()
      const rank = parseInt(row[1]) || 0
      const teamAbbr = row[2]?.trim().toUpperCase() // Normalize to uppercase abbreviation
      const wins = parseInt(row[3]) || 0
      const losses = parseInt(row[4]) || 0
      const pointsFor = parseInt(row[5]) || 0
      const pointsAgainst = parseInt(row[6]) || 0
      const tid = teamAbbr ? getTidFromAbbr(teamAbbr, dynastyTeams) : null

      // Skip empty rows, spacer rows, or rows without a team
      if (!conference || !teamAbbr || teamAbbr === '') return

      if (!standings[conference]) {
        standings[conference] = []
      }

      standings[conference].push({
        rank,
        team: teamAbbr,  // Keep for backward compat
        tid,             // PRIMARY identifier for teambuilder support
        wins,
        losses,
        pointsFor,
        pointsAgainst
      })
    })

    // Sort each conference by rank
    Object.keys(standings).forEach(conf => {
      standings[conf].sort((a, b) => a.rank - b.rank)
    })

    // Debug log the parsed standings
    console.log('[ConferenceStandings] Parsed standings from sheet:', {
      conferences: Object.keys(standings),
      totalTeams: Object.values(standings).flat().length,
      sampleData: Object.entries(standings).slice(0, 2).map(([conf, teams]) => ({
        conference: conf,
        teams: teams.slice(0, 3).map(t => `${t.team}: ${t.wins}-${t.losses}`)
      }))
    })

    return standings
  } catch (error) {
    console.error('Error reading conference standings:', error)
    throw error
  }
}

/**
 * Create a Google Sheet for the final Top 25 entry. Two columns:
 * # | Top 25 with 25 rows. The Coaches column was removed when the
 * site dropped the coaches poll — only the media-style top-25 lives
 * here now.
 */
export async function createFinalPollsSheet(year, existingPolls = {}, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create spreadsheet with 26 rows (1 header + 25 teams)
    const createResponse = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${year} Final Top 25`
        },
        sheets: [{
          properties: {
            title: 'Polls',
            gridProperties: {
              rowCount: 26,
              columnCount: 2,
              frozenRowCount: 1
            }
          }
        }]
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Share publicly for embedding
    await shareSheetPublicly(spreadsheetId, accessToken)

    // Build requests for formatting and data
    const requests = []

    // Column headers
    const headers = ['#', 'Top 25']

    // Set header row
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: [{
          values: headers.map(h => ({
            userEnteredValue: { stringValue: h },
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 11
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          }))
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    })

    // Pre-fill rank numbers 1-25
    const rankRows = []
    for (let rank = 1; rank <= 25; rank++) {
      rankRows.push({
        values: [{
          userEnteredValue: { numberValue: rank },
          userEnteredFormat: {
            backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
            textFormat: { bold: true, fontSize: 11 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        }]
      })
    }

    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 26,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rows: rankRows,
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Set column widths
    const columnWidths = [50, 150]
    columnWidths.forEach((width, index) => {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: index,
            endIndex: index + 1
          },
          properties: { pixelSize: width },
          fields: 'pixelSize'
        }
      })
    })

    // Set row height for all rows
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 26
        },
        properties: { pixelSize: 30 },
        fields: 'pixelSize'
      }
    })

    // Center align team columns
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 26,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { fontSize: 11 }
          }
        },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontSize'
      }
    })

    // Add team dropdown validation for the Top 25 column (column B, index 1)
    requests.push(generateTeamValidation(sheetId, 1, 1, 26, dynastyTeams))

    // Conditional formatting (team colors) for the Top 25 column
    requests.push(...generateTeamFormattingRulesForRange(sheetId, 1, 1, 26, dynastyTeams))

    // Execute all requests
    const batchResponse = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests })
      }
    )

    if (!batchResponse.ok) {
      const error = await batchResponse.json()
      console.error('Error setting up final polls sheet:', error)
      throw new Error(`Failed to setup sheet: ${error.error?.message || 'Unknown error'}`)
    }

    // Pre-fill existing polls if provided
    if (existingPolls && existingPolls.media?.length > 0) {
      await prefillFinalPollsData(spreadsheetId, accessToken, sheetId, existingPolls)
    }

    return {
      sheetId: spreadsheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating final polls sheet:', error)
    throw error
  }
}

/**
 * Pre-fill the existing top-25 (media-only) into the sheet
 */
async function prefillFinalPollsData(spreadsheetId, accessToken, sheetId, existingPolls) {
  const { media = [] } = existingPolls

  // Build values array for each rank 1-25
  const values = []
  for (let rank = 1; rank <= 25; rank++) {
    const mediaTeam = media.find(t => t.rank === rank)?.team || ''
    if (mediaTeam) {
      values.push({
        row: rank + 1, // +1 because row 1 is header (1-indexed)
        media: mediaTeam,
      })
    }
  }

  if (values.length === 0) return

  // Build batch update for existing data — only column B (Top 25)
  const requests = values.map(v => ({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: v.row - 1, // Convert to 0-indexed
        endRowIndex: v.row,
        startColumnIndex: 1, // Column B
        endColumnIndex: 2    // Column B only
      },
      rows: [{
        values: [
          { userEnteredValue: { stringValue: String(v.media ?? '') } },
        ]
      }],
      fields: 'userEnteredValue'
    }
  }))

  // Execute batch update
  const response = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    }
  )

  if (!response.ok) {
    console.error('Failed to pre-fill final polls:', await response.json())
  }
}

/**
 * Read the final Top 25 from the Google Sheet. Returns a `{ media }`
 * shape — `coaches` is left as an empty array purely so legacy
 * persistence code that destructures it doesn't choke.
 */
export async function readFinalPollsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      // Read all data from the Polls tab (rank + Top 25 abbr)
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Polls!A2:B26`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read polls: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse rows into the single Top 25 list. Storing tid alongside
    // abbr keeps downstream lookups stable across teambuilder renames.
    const media = []
    rows.forEach(row => {
      const rank = parseInt(row[0]) || 0
      const teamAbbr = row[1]?.trim().toUpperCase() || ''
      if (rank >= 1 && rank <= 25 && teamAbbr) {
        const tid = getTidFromAbbr(teamAbbr, dynastyTeams)
        media.push({ rank, team: teamAbbr, tid: tid != null ? Number(tid) : null })
      }
    })

    media.sort((a, b) => a.rank - b.rank)

    return { media, coaches: [] }
  } catch (error) {
    console.error('Error reading final polls:', error)
    throw error
  }
}

// Team stats - Offense tab columns (in order)
const TEAM_STATS_OFFENSE = [
  'Points',
  'Offense Yards',
  'Yards Per Play',
  'Passing Yards',
  'Passing Touchdowns',
  'Rushing Yards',
  'Rushing Touchdowns',
  'First Downs'
]

// Team stats - Defense tab columns (in order)
const TEAM_STATS_DEFENSE = [
  'Points Allowed',
  'Total Yards Allowed',
  'Passing Yards Allowed',
  'Rushing Yards Allowed',
  'Sacks',
  'Forced Fumbles',
  'Interceptions'
]

// Mapping from display names to aggregated stat keys
const TEAM_STATS_OFFENSE_KEY_MAP = {
  'Points': 'pointsFor',
  'Offense Yards': 'totalOffense',
  'Yards Per Play': 'yardsPerPlay', // calculated
  'Passing Yards': 'passYards',
  'Passing Touchdowns': 'passTds',
  'Rushing Yards': 'rushYards',
  'Rushing Touchdowns': 'rushTds',
  'First Downs': 'firstDowns'
}

const TEAM_STATS_DEFENSE_KEY_MAP = {
  'Points Allowed': 'pointsAgainst',
  'Total Yards Allowed': 'defTotalYards',
  'Passing Yards Allowed': 'defPassYards',
  'Rushing Yards Allowed': 'defRushYards',
  'Sacks': 'defSacks',
  'Forced Fumbles': 'forcedFumbles',
  'Interceptions': 'defInterceptions'
}

/**
 * Create a Google Sheet for team stats entry with Offense and Defense tabs
 * Vertical two-column layout: Column A = stat names, Column B = values
 * @param {number} year - The season year
 * @param {string} teamName - The team name
 * @param {Object} aggregatedStats - Optional pre-aggregated stats from box scores to pre-fill
 */
export async function createTeamStatsSheet(year, teamName, aggregatedStats = {}) {
  try {
    const accessToken = await getAccessToken()

    const numOffenseStats = TEAM_STATS_OFFENSE.length
    const numDefenseStats = TEAM_STATS_DEFENSE.length

    // Create spreadsheet with two tabs: Offense and Defense
    const createResponse = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${year} ${teamName} Team Stats`
        },
        sheets: [
          {
            properties: {
              title: 'Offense',
              gridProperties: {
                rowCount: numOffenseStats,
                columnCount: 2,
                frozenColumnCount: 1
              }
            }
          },
          {
            properties: {
              title: 'Defense',
              gridProperties: {
                rowCount: numDefenseStats,
                columnCount: 2,
                frozenColumnCount: 1
              }
            }
          }
        ]
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const offenseSheetId = spreadsheet.sheets[0].properties.sheetId
    const defenseSheetId = spreadsheet.sheets[1].properties.sheetId

    // Share publicly for embedding
    await shareSheetPublicly(spreadsheetId, accessToken)

    // Build requests for formatting and data
    const requests = []

    // Helper to format a value for display (round decimals to 1 place)
    const formatValue = (value) => {
      if (value === undefined || value === null || value === 0) return null
      if (Number.isInteger(value)) return value
      return Math.round(value * 10) / 10
    }

    // === OFFENSE TAB ===
    requests.push({
      updateCells: {
        range: {
          sheetId: offenseSheetId,
          startRowIndex: 0,
          endRowIndex: numOffenseStats,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: TEAM_STATS_OFFENSE.map(stat => {
          const key = TEAM_STATS_OFFENSE_KEY_MAP[stat]
          const rawValue = key && aggregatedStats[key]
          const value = formatValue(rawValue)
          const hasValue = value !== null

          return {
            values: [
              {
                userEnteredValue: { stringValue: stat },
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE',
                  padding: { left: 8 }
                }
              },
              {
                userEnteredValue: hasValue ? { numberValue: value } : { stringValue: '' },
                userEnteredFormat: {
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                  textFormat: { fontSize: 12, bold: true },
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }
                }
              }
            ]
          }
        }),
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Protect Column A for Offense
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: offenseSheetId, startRowIndex: 0, endRowIndex: numOffenseStats, startColumnIndex: 0, endColumnIndex: 1 },
          description: 'Stat names - do not edit',
          warningOnly: true
        }
      }
    })

    // Column widths and row heights for Offense
    requests.push(
      { updateDimensionProperties: { range: { sheetId: offenseSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId: offenseSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId: offenseSheetId, dimension: 'ROWS', startIndex: 0, endIndex: numOffenseStats }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }
    )

    // === DEFENSE TAB ===
    requests.push({
      updateCells: {
        range: {
          sheetId: defenseSheetId,
          startRowIndex: 0,
          endRowIndex: numDefenseStats,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: TEAM_STATS_DEFENSE.map(stat => {
          const key = TEAM_STATS_DEFENSE_KEY_MAP[stat]
          const rawValue = key && aggregatedStats[key]
          const value = formatValue(rawValue)
          const hasValue = value !== null

          return {
            values: [
              {
                userEnteredValue: { stringValue: stat },
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE',
                  padding: { left: 8 }
                }
              },
              {
                userEnteredValue: hasValue ? { numberValue: value } : { stringValue: '' },
                userEnteredFormat: {
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                  textFormat: { fontSize: 12, bold: true },
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }
                }
              }
            ]
          }
        }),
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Protect Column A for Defense
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: defenseSheetId, startRowIndex: 0, endRowIndex: numDefenseStats, startColumnIndex: 0, endColumnIndex: 1 },
          description: 'Stat names - do not edit',
          warningOnly: true
        }
      }
    })

    // Column widths and row heights for Defense
    requests.push(
      { updateDimensionProperties: { range: { sheetId: defenseSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId: defenseSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId: defenseSheetId, dimension: 'ROWS', startIndex: 0, endIndex: numDefenseStats }, properties: { pixelSize: 32 }, fields: 'pixelSize' } }
    )

    // Execute all requests
    const batchResponse = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests })
      }
    )

    if (!batchResponse.ok) {
      const error = await batchResponse.json()
      console.error('Error setting up team stats sheet:', error)
      throw new Error(`Failed to setup sheet: ${error.error?.message || 'Unknown error'}`)
    }

    return {
      sheetId: spreadsheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating team stats sheet:', error)
    throw error
  }
}

/**
 * Read team stats from Google Sheet
 * Reads values from both Offense and Defense tabs
 */
export async function readTeamStatsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numOffenseStats = TEAM_STATS_OFFENSE.length
    const numDefenseStats = TEAM_STATS_DEFENSE.length

    // Read from both tabs in parallel
    const [offenseResponse, defenseResponse] = await Promise.all([
      fetch(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'Offense'!B1:B${numOffenseStats}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      ),
      fetch(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'Defense'!B1:B${numDefenseStats}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
    ])

    if (!offenseResponse.ok) {
      const error = await offenseResponse.json()
      throw new Error(`Failed to read offense stats: ${error.error?.message || 'Unknown error'}`)
    }

    if (!defenseResponse.ok) {
      const error = await defenseResponse.json()
      throw new Error(`Failed to read defense stats: ${error.error?.message || 'Unknown error'}`)
    }

    const offenseData = await offenseResponse.json()
    const defenseData = await defenseResponse.json()

    const offenseRows = offenseData.values || []
    const defenseRows = defenseData.values || []

    // Map rows to stat object
    const stats = {}

    // Parse offense stats
    TEAM_STATS_OFFENSE.forEach((col, index) => {
      const value = offenseRows[index]?.[0]
      const key = TEAM_STATS_OFFENSE_KEY_MAP[col]
      if (key) {
        stats[key] = value !== undefined && value !== '' ? (parseFloat(value) || 0) : null
      }
    })

    // Parse defense stats
    TEAM_STATS_DEFENSE.forEach((col, index) => {
      const value = defenseRows[index]?.[0]
      const key = TEAM_STATS_DEFENSE_KEY_MAP[col]
      if (key) {
        stats[key] = value !== undefined && value !== '' ? (parseFloat(value) || 0) : null
      }
    })

    return stats
  } catch (error) {
    console.error('Error reading team stats:', error)
    throw error
  }
}

// LOCAL-PASTE parse for Team Stats. The Google reader above reads two tabs
// (Offense col B, Defense col B) POSITIONALLY, indexing each value into the
// fixed TEAM_STATS_OFFENSE / TEAM_STATS_DEFENSE label arrays. splitTsv can't
// preserve that two-tab layout (blank-line + "=== … ===" stripping), so the
// local paste is SELF-DESCRIBING per row instead:
//
//   Section<TAB>StatLabel<TAB>Value
//
// Section ∈ {OFFENSE, DEFENSE} picks which key map to use; StatLabel is looked
// up in that map (NOT by position), so line order is irrelevant and unknown
// stats can simply be omitted. Returns the SAME flat { key: number|null }
// object shape the Google reader returns (all 15 keys present, absent stats =
// null), so the existing onSave (which replaces teamStatsByYear[year]) applies
// unchanged.
export function parseTeamStatsLocal(rows) {
  // Case-insensitive label → key lookup, per section. yardsPerPlay is derived
  // downstream but the sheet has a row for it, so we keep it here for parity.
  const offenseByLabel = {}
  for (const label of TEAM_STATS_OFFENSE) offenseByLabel[label.toLowerCase()] = TEAM_STATS_OFFENSE_KEY_MAP[label]
  const defenseByLabel = {}
  for (const label of TEAM_STATS_DEFENSE) defenseByLabel[label.toLowerCase()] = TEAM_STATS_DEFENSE_KEY_MAP[label]

  // Seed every key to null so the returned object matches the Google reader's
  // shape (which always emits all keys, null for blanks).
  const stats = {}
  for (const label of TEAM_STATS_OFFENSE) {
    const key = TEAM_STATS_OFFENSE_KEY_MAP[label]
    if (key) stats[key] = null
  }
  for (const label of TEAM_STATS_DEFENSE) {
    const key = TEAM_STATS_DEFENSE_KEY_MAP[label]
    if (key) stats[key] = null
  }

  for (const row of (rows || [])) {
    const section = String(row[0] || '').trim().toUpperCase()
    const label = String(row[1] || '').trim().toLowerCase()
    const rawValue = row[2]
    if (!label) continue

    // Resolve the key from the section's map; fall back to the other section's
    // map only if the label is unique there (defends against a mis-tagged
    // section without cross-contaminating an offense/defense pair — the two
    // label sets don't overlap, so this is safe).
    let key = null
    if (section === 'OFFENSE') key = offenseByLabel[label]
    else if (section === 'DEFENSE') key = defenseByLabel[label]
    if (!key) key = offenseByLabel[label] || defenseByLabel[label]
    if (!key) continue

    if (rawValue === undefined || rawValue === '' || rawValue === null) {
      stats[key] = null
    } else {
      const n = parseFloat(rawValue)
      stats[key] = Number.isFinite(n) ? n : null
    }
  }

  return stats
}

// Awards columns and list
const AWARDS_COLUMNS = ['Award', 'Player', 'Position', 'Team', 'Class']

export const AWARDS_LIST = [
  'Heisman',
  'Maxwell',
  'Walter Camp',
  'Bear Bryant Coach of the Year',
  'Davey O\'Brien',
  'Chuck Bednarik',
  'Bronco Nagurski',
  'Jim Thorpe',
  'Doak Walker',
  'Fred Biletnikoff',
  'Lombardi',
  'Unitas Golden Arm',
  'Edge Rusher of the Year',
  'Outland',
  'John Mackey',
  'Broyles',
  'Dick Butkus',
  'Rimington',
  'Lou Groza',
  'Ray Guy',
  'Returner of the Year',
  // Most outstanding freshman. Reported missing by ALABAMA PRINCE 2026-05-12.
  'Shaun Alexander'
]

/**
 * Create Awards Google Sheet for End of Season Recap
 * Creates multiple tabs: current year (blank) + past years (pre-filled)
 * @param {number} currentYear - The current season year
 * @param {object} awardsByYear - Object mapping year to awards data for pre-fill
 * @param {object} dynastyTeams - Custom teambuilder teams
 */
export async function createAwardsSheet(currentYear, awardsByYear = {}, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Get all years to create tabs for (current year first, then past years descending)
    const pastYears = Object.keys(awardsByYear)
      .map(y => parseInt(y))
      .filter(y => y < currentYear)
      .sort((a, b) => b - a) // Most recent first
    const allYears = [currentYear, ...pastYears]

    // Create sheet definitions for each year
    const sheets = allYears.map((year, index) => ({
      properties: {
        title: `${year}`,
        index: index,
        gridProperties: {
          rowCount: AWARDS_LIST.length + 1,
          columnCount: AWARDS_COLUMNS.length,
          frozenRowCount: 1
        }
      }
    }))

    // Create the spreadsheet
    const createResponse = await fetchWithTimeout(`${SHEETS_API_BASE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: `Dynasty Awards`
        },
        sheets
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create spreadsheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId

    // Map year to sheetId
    const sheetIdMap = {}
    spreadsheet.sheets.forEach((sheet, index) => {
      sheetIdMap[allYears[index]] = sheet.properties.sheetId
    })

    // Helper to convert award key back to display name for lookup
    const awardKeyToName = (key) => {
      // Reverse the camelCase conversion
      return AWARDS_LIST.find(name => {
        const converted = name
          .toLowerCase()
          .replace(/['']/g, '')
          .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
          .replace(/^./, str => str.toLowerCase())
        return converted === key
      }) || key
    }

    // Prepare batch update requests for ALL sheets
    const requests = []

    // Apply formatting to each sheet
    for (const year of allYears) {
      const sheetId = sheetIdMap[year]

      // Set column widths
      const columnWidths = [200, 200, 80, 80, 80] // Award, Player, Position, Team, Class
      columnWidths.forEach((width, index) => {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: { pixelSize: width },
            fields: 'pixelSize'
          }
        })
      })

      // Set row height
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: AWARDS_LIST.length + 1
          },
          properties: { pixelSize: 28 },
          fields: 'pixelSize'
        }
      })

      // Header row formatting
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: AWARDS_COLUMNS.length
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })

      // Data rows formatting
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: AWARDS_LIST.length + 1,
            startColumnIndex: 0,
            endColumnIndex: AWARDS_COLUMNS.length
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      })

      // Award name column left-aligned
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: AWARDS_LIST.length + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                italic: true,
                fontFamily: 'Barlow',
                fontSize: 10
              },
              horizontalAlignment: 'LEFT',
              verticalAlignment: 'MIDDLE',
              backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }
            }
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,backgroundColor)'
        }
      })

      // Protect header row
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: AWARDS_COLUMNS.length
            },
            description: 'Header row - do not edit',
            warningOnly: false
          }
        }
      })

      // Protect award names column
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: {
              sheetId: sheetId,
              startRowIndex: 1,
              endRowIndex: AWARDS_LIST.length + 1,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            description: 'Award names - do not edit',
            warningOnly: false
          }
        }
      })

      // Coach awards indices (these get merged Position/Team/Class into just Team)
      const coachAwardIndices = [
        AWARDS_LIST.indexOf('Bear Bryant Coach of the Year'),
        AWARDS_LIST.indexOf('Broyles')
      ].filter(i => i !== -1)

      // Merge Position, Team, Class columns (C, D, E = indices 2, 3, 4) for coach awards
      coachAwardIndices.forEach(awardIndex => {
        const rowIndex = awardIndex + 1 // +1 for header row
        requests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 2,
              endColumnIndex: 5
            },
            mergeType: 'MERGE_ALL'
          }
        })
      })

      // Add position dropdown validation for Position column - skip coach award rows
      // Rows before first coach award
      if (coachAwardIndices[0] > 0) {
        requests.push(generatePositionValidation(sheetId, 2, 1, coachAwardIndices[0] + 1))
      }
      // Rows between coach awards
      if (coachAwardIndices.length > 1 && coachAwardIndices[1] > coachAwardIndices[0] + 1) {
        requests.push(generatePositionValidation(sheetId, 2, coachAwardIndices[0] + 2, coachAwardIndices[1] + 1))
      }
      // Rows after last coach award
      const lastCoachIdx = coachAwardIndices[coachAwardIndices.length - 1]
      if (lastCoachIdx < AWARDS_LIST.length - 1) {
        requests.push(generatePositionValidation(sheetId, 2, lastCoachIdx + 2, AWARDS_LIST.length + 1))
      }

      // Add class dropdown validation for Class column - skip coach award rows
      // Rows before first coach award
      if (coachAwardIndices[0] > 0) {
        requests.push(generateClassValidation(sheetId, 4, 1, coachAwardIndices[0] + 1))
      }
      // Rows between coach awards
      if (coachAwardIndices.length > 1 && coachAwardIndices[1] > coachAwardIndices[0] + 1) {
        requests.push(generateClassValidation(sheetId, 4, coachAwardIndices[0] + 2, coachAwardIndices[1] + 1))
      }
      // Rows after last coach award
      if (lastCoachIdx < AWARDS_LIST.length - 1) {
        requests.push(generateClassValidation(sheetId, 4, lastCoachIdx + 2, AWARDS_LIST.length + 1))
      }

      // Add team dropdown validation for Team column (column D, index 3) - all rows
      requests.push(generateTeamValidation(sheetId, 3, 1, AWARDS_LIST.length + 1, dynastyTeams))

      // Add conditional formatting for team colors in Team column
      requests.push(...generateTeamFormattingRulesForRange(sheetId, 3, 1, AWARDS_LIST.length + 1, dynastyTeams))

      // Also add team validation and formatting to merged coach award cells (column C which is now part of merged)
      coachAwardIndices.forEach(awardIndex => {
        const rowIndex = awardIndex + 1
        requests.push(generateTeamValidation(sheetId, 2, rowIndex, rowIndex + 1, dynastyTeams))
        requests.push(...generateTeamFormattingRulesForRange(sheetId, 2, rowIndex, rowIndex + 1, dynastyTeams))
      })
    } // End of for loop over years

    // Execute batch update for formatting
    const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    })

    if (!batchResponse.ok) {
      const error = await batchResponse.json()
      console.error('Error setting up awards sheet:', error)
      throw new Error(`Failed to setup sheet: ${error.error?.message || 'Unknown error'}`)
    }

    // Write data to each tab
    const lastCol = String.fromCharCode(65 + AWARDS_COLUMNS.length - 1)

    for (const year of allYears) {
      const yearAwards = awardsByYear[year] || {}
      const isPastYear = year < currentYear

      // Build values for this year's tab
      const values = [
        AWARDS_COLUMNS, // Header row
        ...AWARDS_LIST.map(awardName => {
          // Convert award name to camelCase key for lookup
          const awardKey = awardName
            .toLowerCase()
            .replace(/['']/g, '')
            .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
            .replace(/^./, str => str.toLowerCase())

          const awardData = yearAwards[awardKey]

          if (isPastYear && awardData) {
            // Pre-fill with existing data for past years
            // Coach awards (Bear Bryant, Broyles) only have player and team (in merged Position cell)
            const isCoachAward = awardName === 'Bear Bryant Coach of the Year' || awardName === 'Broyles'
            if (isCoachAward) {
              return [awardName, awardData.player || '', awardData.team || '', '', '']
            }
            return [
              awardName,
              awardData.player || '',
              awardData.position || '',
              awardData.team || '',
              awardData.class || ''
            ]
          } else {
            // Blank for current year or if no data
            return [awardName, '', '', '', '']
          }
        })
      ]

      // Write to the year's tab
      const valuesResponse = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${year}'!A1:${lastCol}${AWARDS_LIST.length + 1}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values })
        }
      )

      if (!valuesResponse.ok) {
        const error = await valuesResponse.json()
        throw new Error(`Failed to write values for ${year}: ${error.error?.message || 'Unknown error'}`)
      }
    }

    return {
      sheetId: spreadsheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      currentYear // Return current year so caller knows which tab to read from
    }
  } catch (error) {
    console.error('Error creating awards sheet:', error)
    throw error
  }
}

/**
 * Read awards from Google Sheet
 * @param {string} spreadsheetId - The Google Sheet ID
 * @param {number} year - The year tab to read from
 */
export async function readAwardsFromSheet(spreadsheetId, year, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const lastCol = String.fromCharCode(65 + AWARDS_COLUMNS.length - 1)

      // Read all data rows from the specified year tab
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${year}'!A2:${lastCol}${AWARDS_LIST.length + 1}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read awards: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Coach awards have merged cells - team is in column C (row[2]) instead of D (row[3])
    const COACH_AWARDS = ['Bear Bryant Coach of the Year', 'Broyles']

    // Map to awards object
    const awards = {}
    rows.forEach((row) => {
      const award = row[0]
      const player = row[1] || ''
      const isCoachAward = COACH_AWARDS.includes(award)
      // For coach awards, team is in the merged cell (column C), not column D
      const position = isCoachAward ? '' : (row[2] || '')
      const team = isCoachAward ? (row[2] || '').toUpperCase() : (row[3] || '').toUpperCase()
      const playerClass = isCoachAward ? '' : (row[4] || '')

      if (award && player) {
        // Convert award name to camelCase key
        const key = award
          .toLowerCase()
          .replace(/['']/g, '')
          .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
          .replace(/^./, str => str.toLowerCase())

        // Resolve the team text → tid so downstream consumers (Awards card
        // display, CoachCareer stint attribution, player lookup) survive
        // teambuilder/edition renames. Use getTidFromTeamText (abbr OR name OR
        // alias OR tolerant name scan) — the same robust resolver the
        // All-American/All-Conference readers use — so a team entered by name
        // or a non-registry abbr still lands on the right tid (getTidFromAbbr
        // alone missed these, which is why some award cards showed no
        // logo/wrong school).
        const tid = team ? getTidFromTeamText(team, dynastyTeams) : null
        awards[key] = {
          player,
          position,
          team,
          tid: tid != null ? Number(tid) : null,
          class: playerClass
        }
      }
    })

    return awards
  } catch (error) {
    console.error('Error reading awards:', error)
    throw error
  }
}

// All-Americans/All-Conference positions list
const ALL_AMERICAN_POSITIONS = [
  'QB', 'HB', 'HB', 'WR', 'WR', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'CB', 'FS', 'SS',
  'K', 'P'
]

/**
 * Create All-Americans & All-Conference Google Sheet with multi-year tabs
 * Structure: 12 columns (3 teams × 4 cols each: Position, Player, Team, Class)
 * Two tables: All-Americans on top, All-Conference below
 * Each year gets its own tab; past years are pre-filled with existing data
 */
export async function createAllAmericansSheet(currentYear, allAmericansByYear = {}, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numPositions = ALL_AMERICAN_POSITIONS.length // 25
    // Row layout:
    // Row 1: "All-Americans" header (merged)
    // Row 2: "First-Team" | "Second-Team" | "Freshman Team" (each merged over 4 cols)
    // Row 3: Position | Player | Team | Class (repeated 3x)
    // Rows 4-28: Position data rows (25 positions)
    // Row 29: Empty separator
    // Row 30: "All-Conference" header (merged)
    // Row 31: "First-Team" | "Second-Team" | "Freshman Team"
    // Row 32: Position | Player | Team | Class (repeated 3x)
    // Rows 33-57: Position data rows (25 positions)
    const totalRows = 3 + numPositions + 1 + 3 + numPositions // 57 rows

    // Get all years to create tabs for (current year first, then past years descending)
    const pastYears = Object.keys(allAmericansByYear)
      .map(y => parseInt(y))
      .filter(y => y < currentYear)
      .sort((a, b) => b - a)
    const allYears = [currentYear, ...pastYears]

    // Create sheet definitions for each year
    const sheets = allYears.map((year, index) => ({
      properties: {
        title: `${year}`,
        index: index,
        gridProperties: {
          rowCount: totalRows,
          columnCount: 12,
          frozenRowCount: 3
        }
      }
    }))

    // Create the spreadsheet with all year tabs
    const createResponse = await fetchWithTimeout(`${SHEETS_API_BASE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: `All-Americans & All-Conference`
        },
        sheets
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create spreadsheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId

    // Build a map of year -> sheetId for each tab
    const sheetIdsByYear = {}
    spreadsheet.sheets.forEach(sheet => {
      const yearTitle = sheet.properties.title
      sheetIdsByYear[yearTitle] = sheet.properties.sheetId
    })

    // Prepare batch update requests for ALL tabs
    const requests = []

    // Apply formatting to each year tab
    for (const year of allYears) {
      const sheetId = sheetIdsByYear[`${year}`]
      if (!sheetId && sheetId !== 0) continue

      // Set column widths: Position(60), Player(150), Team(60), Class(60) × 3
      const colWidths = [60, 150, 60, 60, 60, 150, 60, 60, 60, 150, 60, 60]
      colWidths.forEach((width, index) => {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: { pixelSize: width },
            fields: 'pixelSize'
          }
        })
      })

      // Set row heights
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: totalRows
          },
          properties: { pixelSize: 24 },
          fields: 'pixelSize'
        }
      })

      // Main header rows (All-Americans row 1, All-Conference row 30) - taller
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 32 },
          fields: 'pixelSize'
        }
      })
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 29, endIndex: 30 },
          properties: { pixelSize: 32 },
          fields: 'pixelSize'
        }
      })

      // === MERGE CELLS ===

      // Row 1: "All-Americans" merged across all 12 columns
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // Row 2: Team headers merged (First-Team: 0-3, Second-Team: 4-7, Freshman Team: 8-11)
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 4, endColumnIndex: 8 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // Row 30: "All-Conference" merged across all 12 columns (index 29)
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 0, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // Row 31: Team headers for All-Conference (index 30)
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 4, endColumnIndex: 8 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 8, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // === FORMATTING ===

      // Main headers (All-Americans & All-Conference) - dark background, white text
      const mainHeaderFormat = {
        backgroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
        textFormat: {
          foregroundColor: { red: 1, green: 1, blue: 1 },
          bold: true,
          fontSize: 14,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: mainHeaderFormat },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 29, endRowIndex: 30, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: mainHeaderFormat },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })

      // Team headers (First-Team, Second-Team, Freshman Team) - medium gray
      const teamHeaderFormat = {
        backgroundColor: { red: 0.3, green: 0.3, blue: 0.3 },
        textFormat: {
          foregroundColor: { red: 1, green: 1, blue: 1 },
          bold: true,
          fontSize: 11,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      // All-Americans team headers (row 2)
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: teamHeaderFormat },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })
      // All-Conference team headers (row 31)
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: teamHeaderFormat },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })

      // Column headers (Position, Player, Team, Class) - light gray
      const colHeaderFormat = {
        backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
        textFormat: {
          foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
          bold: true,
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      // All-Americans column headers (row 3)
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: colHeaderFormat },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })
      // All-Conference column headers (row 32)
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 31, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: colHeaderFormat },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      })

      // Data rows formatting
      const dataFormat = {
        textFormat: {
          bold: true,
          italic: true,
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      // All-Americans data rows (rows 4-28, indices 3-27)
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 3, endRowIndex: 3 + numPositions, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: dataFormat },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      })
      // All-Conference data rows (rows 33-57, indices 32-56)
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 32, endRowIndex: 32 + numPositions, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: dataFormat },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
        }
      })

      // Position columns background (light gray for visual distinction)
      const positionColFormat = {
        backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
        textFormat: {
          bold: true,
          italic: true,
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      // All-Americans position columns (cols 0, 4, 8)
      ;[0, 4, 8].forEach(col => {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 3, endRowIndex: 3 + numPositions, startColumnIndex: col, endColumnIndex: col + 1 },
            cell: { userEnteredFormat: positionColFormat },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        })
      })
      // All-Conference position columns
      ;[0, 4, 8].forEach(col => {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 32, endRowIndex: 32 + numPositions, startColumnIndex: col, endColumnIndex: col + 1 },
            cell: { userEnteredFormat: positionColFormat },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        })
      })

      // Separator row (row 29, index 28) - empty with light background
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 28, endRowIndex: 29, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: { backgroundColor: { red: 0.97, green: 0.97, blue: 0.97 } } },
          fields: 'userEnteredFormat(backgroundColor)'
        }
      })

      // === PROTECT HEADERS AND POSITION COLUMNS ===

      // Protect All-Americans headers (rows 1-3)
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
            description: 'All-Americans headers - do not edit',
            warningOnly: false
          }
        }
      })

      // Protect All-Conference headers (rows 30-32)
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId, startRowIndex: 29, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 12 },
            description: 'All-Conference headers - do not edit',
            warningOnly: false
          }
        }
      })

      // Protect position columns (cols 0, 4, 8) for All-Americans
      ;[0, 4, 8].forEach(col => {
        requests.push({
          addProtectedRange: {
            protectedRange: {
              range: { sheetId, startRowIndex: 3, endRowIndex: 3 + numPositions, startColumnIndex: col, endColumnIndex: col + 1 },
              description: 'Position column - do not edit',
              warningOnly: false
            }
          }
        })
      })

      // Protect position columns for All-Conference
      ;[0, 4, 8].forEach(col => {
        requests.push({
          addProtectedRange: {
            protectedRange: {
              range: { sheetId, startRowIndex: 32, endRowIndex: 32 + numPositions, startColumnIndex: col, endColumnIndex: col + 1 },
              description: 'Position column - do not edit',
              warningOnly: false
            }
          }
        })
      })

      // Protect separator row
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId, startRowIndex: 28, endRowIndex: 29, startColumnIndex: 0, endColumnIndex: 12 },
            description: 'Separator row - do not edit',
            warningOnly: false
          }
        }
      })

      // Add team dropdown validation and conditional formatting for Team columns (indices 2, 6, 10)
      // All-Americans section: rows 3-28 (indices 3 to 3 + numPositions)
      // All-Conference section: rows 32-57 (indices 32 to 32 + numPositions)
      const teamColumnIndices = [2, 6, 10]

      teamColumnIndices.forEach(colIndex => {
        // All-Americans section
        requests.push(generateTeamValidation(sheetId, colIndex, 3, 3 + numPositions, dynastyTeams))
        requests.push(...generateTeamFormattingRulesForRange(sheetId, colIndex, 3, 3 + numPositions, dynastyTeams))

        // All-Conference section
        requests.push(generateTeamValidation(sheetId, colIndex, 32, 32 + numPositions, dynastyTeams))
        requests.push(...generateTeamFormattingRulesForRange(sheetId, colIndex, 32, 32 + numPositions, dynastyTeams))
      })

      // Add class dropdown validation for Class columns (indices 3, 7, 11)
      const classColumnIndices = [3, 7, 11]

      classColumnIndices.forEach(colIndex => {
        // All-Americans section
        requests.push(generateClassValidation(sheetId, colIndex, 3, 3 + numPositions))

        // All-Conference section
        requests.push(generateClassValidation(sheetId, colIndex, 32, 32 + numPositions))
      })
    } // End of for loop over years

    // Execute batch update for formatting (all tabs at once)
    const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    })

    if (!batchResponse.ok) {
      const error = await batchResponse.json()
      console.error('Error setting up all-americans sheet:', error)
      throw new Error(`Failed to setup sheet: ${error.error?.message || 'Unknown error'}`)
    }

    // Helper to build position-indexed data maps for pre-filling
    const buildPositionMap = (entries, designation) => {
      const map = {}
      if (!entries) return map
      entries.filter(e => e.designation === designation).forEach(e => {
        if (!map[e.position]) map[e.position] = e
      })
      return map
    }

    // Prepare values to write
    const colHeaders = ['Position', 'Player', 'Team', 'Class']

    // Write values for each year tab
    for (const year of allYears) {
      const yearData = allAmericansByYear[year] || {}
      const allAmericans = yearData.allAmericans || []
      const allConference = yearData.allConference || []
      const isPastYear = year < currentYear

      // Build position maps for All-Americans
      const aaFirst = buildPositionMap(allAmericans, 'first')
      const aaSecond = buildPositionMap(allAmericans, 'second')
      const aaFreshman = buildPositionMap(allAmericans, 'freshman')

      // Build position maps for All-Conference
      const acFirst = buildPositionMap(allConference, 'first')
      const acSecond = buildPositionMap(allConference, 'second')
      const acFreshman = buildPositionMap(allConference, 'freshman')

      // Build the values array
      const values = []

      // Row 1: All-Americans header
      values.push(['All-Americans', '', '', '', '', '', '', '', '', '', '', ''])

      // Row 2: Team headers (merged cells will show first value)
      values.push(['First-Team', '', '', '', 'Second-Team', '', '', '', 'Freshman Team', '', '', ''])

      // Row 3: Column headers
      values.push([...colHeaders, ...colHeaders, ...colHeaders])

      // Rows 4-28: Position data for All-Americans
      ALL_AMERICAN_POSITIONS.forEach(pos => {
        const first = isPastYear && aaFirst[pos] ? aaFirst[pos] : null
        const second = isPastYear && aaSecond[pos] ? aaSecond[pos] : null
        const freshman = isPastYear && aaFreshman[pos] ? aaFreshman[pos] : null
        values.push([
          pos, first?.player || '', first?.school || '', first?.class || '',
          pos, second?.player || '', second?.school || '', second?.class || '',
          pos, freshman?.player || '', freshman?.school || '', freshman?.class || ''
        ])
      })

      // Row 29: Empty separator
      values.push(['', '', '', '', '', '', '', '', '', '', '', ''])

      // Row 30: All-Conference header
      values.push(['All-Conference', '', '', '', '', '', '', '', '', '', '', ''])

      // Row 31: Team headers
      values.push(['First-Team', '', '', '', 'Second-Team', '', '', '', 'Freshman Team', '', '', ''])

      // Row 32: Column headers
      values.push([...colHeaders, ...colHeaders, ...colHeaders])

      // Rows 33-57: Position data for All-Conference
      ALL_AMERICAN_POSITIONS.forEach(pos => {
        const first = isPastYear && acFirst[pos] ? acFirst[pos] : null
        const second = isPastYear && acSecond[pos] ? acSecond[pos] : null
        const freshman = isPastYear && acFreshman[pos] ? acFreshman[pos] : null
        values.push([
          pos, first?.player || '', first?.school || '', first?.class || '',
          pos, second?.player || '', second?.school || '', second?.class || '',
          pos, freshman?.player || '', freshman?.school || '', freshman?.class || ''
        ])
      })

      // Write values to this year's tab
      const valuesResponse = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${year}'!A1:L${totalRows}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values })
        }
      )

      if (!valuesResponse.ok) {
        const error = await valuesResponse.json()
        throw new Error(`Failed to write values for ${year}: ${error.error?.message || 'Unknown error'}`)
      }
    }

    return {
      sheetId: spreadsheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating all-americans sheet:', error)
    throw error
  }
}

/**
 * Read All-Americans & All-Conference data from Google Sheet
 * @param spreadsheetId - The Google Sheets ID
 * @param year - The year tab to read from
 */
export async function readAllAmericansFromSheet(spreadsheetId, year, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numPositions = ALL_AMERICAN_POSITIONS.length

    // Read all data from the specified year tab
    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${year}'!A1:L57`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read data: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const rows = data.values || []

    // Helper to extract team data from rows. Resolve the school text → tid at
    // read time so post-rename teambuilder teams keep their honor links. Use
    // getTidFromTeamText (abbr OR name OR alias OR tolerant name scan) so a
    // school entered by name or a non-registry abbr still resolves.
    const tidFor = (abbr) => {
      const t = abbr ? getTidFromTeamText(abbr, dynastyTeams) : null
      return t != null ? Number(t) : null
    }
    const extractTeamData = (startRow, teamLabel) => {
      const result = []
      for (let i = 0; i < numPositions; i++) {
        const row = rows[startRow + i] || []

        // First-Team (cols 0-3)
        if (row[1]) { // Player name exists
          const school = (row[2] || '').toUpperCase()
          result.push({
            team: teamLabel,
            designation: 'first',
            position: row[0] || ALL_AMERICAN_POSITIONS[i],
            player: row[1],
            school,
            schoolTid: tidFor(school),
            class: row[3] || ''
          })
        }

        // Second-Team (cols 4-7)
        if (row[5]) {
          const school = (row[6] || '').toUpperCase()
          result.push({
            team: teamLabel,
            designation: 'second',
            position: row[4] || ALL_AMERICAN_POSITIONS[i],
            player: row[5],
            school,
            schoolTid: tidFor(school),
            class: row[7] || ''
          })
        }

        // Freshman Team (cols 8-11)
        if (row[9]) {
          const school = (row[10] || '').toUpperCase()
          result.push({
            team: teamLabel,
            designation: 'freshman',
            position: row[8] || ALL_AMERICAN_POSITIONS[i],
            player: row[9],
            school,
            schoolTid: tidFor(school),
            class: row[11] || ''
          })
        }
      }
      return result
    }

    // All-Americans data starts at row 4 (index 3)
    const allAmericans = extractTeamData(3, 'all-american')

    // All-Conference data starts at row 33 (index 32)
    const allConference = extractTeamData(32, 'all-conference')

    return {
      allAmericans,
      allConference
    }
  } catch (error) {
    console.error('Error reading all-americans data:', error)
    throw error
  }
}

// List of FBS conferences for All-Conference sheets
const ALL_CONFERENCES = [
  'Big Ten', 'SEC', 'Big 12', 'ACC', 'Pac-12',
  'Mountain West', 'American', 'Sun Belt', 'Conference USA', 'MAC'
]

/**
 * Create All-Americans Only sheet (no All-Conference section)
 * Structure: One tab per year (most recent first), each with First/Second/Freshman teams
 * 12 columns (3 teams × 4 cols each: Position, Player, Team, Class)
 * 28 rows total: 1 header + 2 team headers + 25 position rows
 */
export async function createAllAmericansOnlySheet(currentYear, allAmericansByYear = {}, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numPositions = ALL_AMERICAN_POSITIONS.length // 25
    // Row layout:
    // Row 1: "All-Americans" header (merged)
    // Row 2: "First-Team" | "Second-Team" | "Freshman Team" (each merged over 4 cols)
    // Row 3: Position | Player | Team | Class (repeated 3x)
    // Rows 4-28: Position data rows (25 positions)
    const totalRows = 3 + numPositions // 28 rows

    // Get all years to create tabs for (current year first, then past years descending)
    const pastYears = Object.keys(allAmericansByYear)
      .map(y => parseInt(y))
      .filter(y => y < currentYear)
      .sort((a, b) => b - a)
    const allYears = [currentYear, ...pastYears]

    // Create sheet definitions for each year
    const sheets = allYears.map((year, index) => ({
      properties: {
        title: `${year}`,
        index: index,
        gridProperties: {
          rowCount: totalRows,
          columnCount: 12,
          frozenRowCount: 3
        }
      }
    }))

    // Create the spreadsheet with all year tabs
    const createResponse = await fetchWithTimeout(`${SHEETS_API_BASE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: `All-Americans`
        },
        sheets
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create spreadsheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId

    // Build a map of year -> sheetId for each tab
    const sheetIdsByYear = {}
    spreadsheet.sheets.forEach(sheet => {
      const yearTitle = sheet.properties.title
      sheetIdsByYear[yearTitle] = sheet.properties.sheetId
    })

    // Prepare batch update requests for ALL tabs
    const requests = []

    // Apply formatting to each year tab
    for (const year of allYears) {
      const sheetId = sheetIdsByYear[`${year}`]
      if (!sheetId && sheetId !== 0) continue

      // Set column widths: Position(60), Player(150), Team(60), Class(60) × 3
      const colWidths = [60, 150, 60, 60, 60, 150, 60, 60, 60, 150, 60, 60]
      colWidths.forEach((width, index) => {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: { pixelSize: width },
            fields: 'pixelSize'
          }
        })
      })

      // Set row heights
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: totalRows
          },
          properties: { pixelSize: 24 },
          fields: 'pixelSize'
        }
      })

      // Main header row - taller
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 32 },
          fields: 'pixelSize'
        }
      })

      // === MERGE CELLS ===

      // Row 1: "All-Americans" merged across all 12 columns
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // Row 2: Team headers merged (First-Team: 0-3, Second-Team: 4-7, Freshman Team: 8-11)
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 4, endColumnIndex: 8 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // === FORMATTING ===

      // Main header - dark background, white text
      const mainHeaderFormat = {
        backgroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
        textFormat: {
          foregroundColor: { red: 1, green: 1, blue: 1 },
          bold: true,
          fontSize: 14,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: mainHeaderFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Team headers (Row 2) - lighter background
      const teamHeaderFormat = {
        backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
        textFormat: {
          foregroundColor: { red: 1, green: 1, blue: 1 },
          bold: true,
          fontSize: 11,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: teamHeaderFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Column headers (Row 3) - gray background
      const colHeaderFormat = {
        backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
        textFormat: {
          foregroundColor: { red: 0, green: 0, blue: 0 },
          bold: true,
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: colHeaderFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Data rows - light background, centered
      const dataFormat = {
        backgroundColor: { red: 1, green: 1, blue: 1 },
        textFormat: {
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 3, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: dataFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Alternate row colors for data rows
      for (let i = 3; i < totalRows; i++) {
        if (i % 2 === 1) {
          requests.push({
            repeatCell: {
              range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 12 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }
                }
              },
              fields: 'userEnteredFormat.backgroundColor'
            }
          })
        }
      }

      // Add data validation for Team columns (2, 6, 10) and Class columns (3, 7, 11)
      // Data rows start at row 4 (index 3) and end at row 28 (index totalRows-1)
      const teamColumns = [2, 6, 10]
      const classColumns = [3, 7, 11]

      teamColumns.forEach(colIndex => {
        requests.push(generateTeamValidation(sheetId, colIndex, 3, totalRows, dynastyTeams))
        // Add conditional formatting for team colors
        requests.push(...generateTeamFormattingRulesForRange(sheetId, colIndex, 3, totalRows, dynastyTeams))
      })

      classColumns.forEach(colIndex => {
        requests.push(generateClassValidation(sheetId, colIndex, 3, totalRows))
      })
    }

    // Apply formatting
    if (requests.length > 0) {
      await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      })
    }

    // Now write the data to each tab
    const valueRanges = []

    for (const year of allYears) {
      const isPastYear = year !== currentYear
      const yearData = allAmericansByYear[year] || {}

      // Index existing data by position for each designation (arrays to handle multiple per position)
      const aaFirst = {}
      const aaSecond = {}
      const aaFreshman = {}

      if (yearData.allAmericans) {
        yearData.allAmericans.forEach(entry => {
          const pos = entry.position
          if (entry.designation === 'first') {
            if (!aaFirst[pos]) aaFirst[pos] = []
            aaFirst[pos].push(entry)
          } else if (entry.designation === 'second') {
            if (!aaSecond[pos]) aaSecond[pos] = []
            aaSecond[pos].push(entry)
          } else if (entry.designation === 'freshman') {
            if (!aaFreshman[pos]) aaFreshman[pos] = []
            aaFreshman[pos].push(entry)
          }
        })
      }

      // Track which entries have been used (to handle multiple slots per position)
      const usedFirst = {}
      const usedSecond = {}
      const usedFreshman = {}

      // Build values array for this year tab
      const values = []

      // Row 1: Main header
      values.push(['All-Americans', '', '', '', '', '', '', '', '', '', '', ''])

      // Row 2: Team headers
      values.push(['First-Team', '', '', '', 'Second-Team', '', '', '', 'Freshman Team', '', '', ''])

      // Row 3: Column headers
      values.push([
        'Position', 'Player', 'Team', 'Class',
        'Position', 'Player', 'Team', 'Class',
        'Position', 'Player', 'Team', 'Class'
      ])

      // Rows 4-28: Position data
      ALL_AMERICAN_POSITIONS.forEach(pos => {
        // Get next unused entry for each designation (for positions with multiple slots like WR, HB)
        const firstEntries = aaFirst[pos] || []
        const secondEntries = aaSecond[pos] || []
        const freshmanEntries = aaFreshman[pos] || []

        if (!usedFirst[pos]) usedFirst[pos] = 0
        if (!usedSecond[pos]) usedSecond[pos] = 0
        if (!usedFreshman[pos]) usedFreshman[pos] = 0

        const first = isPastYear && firstEntries[usedFirst[pos]] ? firstEntries[usedFirst[pos]++] : null
        const second = isPastYear && secondEntries[usedSecond[pos]] ? secondEntries[usedSecond[pos]++] : null
        const freshman = isPastYear && freshmanEntries[usedFreshman[pos]] ? freshmanEntries[usedFreshman[pos]++] : null

        values.push([
          pos, first?.player || '', first?.school || '', first?.class || '',
          pos, second?.player || '', second?.school || '', second?.class || '',
          pos, freshman?.player || '', freshman?.school || '', freshman?.class || ''
        ])
      })

      valueRanges.push({
        range: `'${year}'!A1:L${totalRows}`,
        values
      })
    }

    // Write all values
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: valueRanges
      })
    })

    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating all-americans only sheet:', error)
    throw error
  }
}

/**
 * Read All-Americans data from All-Americans Only sheet
 * @param spreadsheetId - The Google Sheets ID
 * @param year - The year tab to read from
 */
export async function readAllAmericansOnlyFromSheet(spreadsheetId, year, dynastyTeams = null, opts = {}) {
  try {
    const numPositions = ALL_AMERICAN_POSITIONS.length

    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      // Read all data from the specified year tab (28 rows)
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${year}'!A1:L28`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read data: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Extract All-Americans data starting at row 4 (index 3)
    const allAmericans = []
    for (let i = 0; i < numPositions; i++) {
      const row = rows[3 + i] || []

      // First-Team (cols 0-3)
      if (row[1]) {
        allAmericans.push({
          team: 'all-american',
          designation: 'first',
          position: row[0] || ALL_AMERICAN_POSITIONS[i],
          player: row[1],
          school: (row[2] || '').toUpperCase(),
          schoolTid: getTidFromTeamText((row[2] || ''), dynastyTeams),
          class: row[3] || ''
        })
      }

      // Second-Team (cols 4-7)
      if (row[5]) {
        allAmericans.push({
          team: 'all-american',
          designation: 'second',
          position: row[4] || ALL_AMERICAN_POSITIONS[i],
          player: row[5],
          school: (row[6] || '').toUpperCase(),
          schoolTid: getTidFromTeamText((row[6] || ''), dynastyTeams),
          class: row[7] || ''
        })
      }

      // Freshman Team (cols 8-11)
      if (row[9]) {
        allAmericans.push({
          team: 'all-american',
          designation: 'freshman',
          position: row[8] || ALL_AMERICAN_POSITIONS[i],
          player: row[9],
          school: (row[10] || '').toUpperCase(),
          schoolTid: getTidFromTeamText((row[10] || ''), dynastyTeams),
          class: row[11] || ''
        })
      }
    }

    return { allAmericans }
  } catch (error) {
    console.error('Error reading all-americans only data:', error)
    throw error
  }
}

/**
 * Create All-Conference sheet for a specific year
 * Structure: One tab per conference (10 tabs), each with First/Second/Freshman teams
 * 12 columns (3 teams × 4 cols each: Position, Player, Team, Class)
 * 28 rows total: 1 header + 2 team headers + 25 position rows
 */
export async function createAllConferenceSheet(year, allConferenceByConference = {}, customConferences = null, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numPositions = ALL_AMERICAN_POSITIONS.length // 25
    const totalRows = 3 + numPositions // 28 rows

    // Use custom conferences if available, otherwise default
    const conferences = customConferences && Object.keys(customConferences).length > 0
      ? Object.keys(customConferences).sort()
      : ALL_CONFERENCES

    // Create sheet definitions for each conference
    const sheets = conferences.map((conf, index) => ({
      properties: {
        title: conf,
        index: index,
        gridProperties: {
          rowCount: totalRows,
          columnCount: 12,
          frozenRowCount: 3
        }
      }
    }))

    // Create the spreadsheet with all conference tabs
    const createResponse = await fetchWithTimeout(`${SHEETS_API_BASE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: `${year} All-Conference`
        },
        sheets
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create spreadsheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId

    // Build a map of conference -> sheetId for each tab
    const sheetIdsByConf = {}
    spreadsheet.sheets.forEach(sheet => {
      const confTitle = sheet.properties.title
      sheetIdsByConf[confTitle] = sheet.properties.sheetId
    })

    // Prepare batch update requests for ALL tabs
    const requests = []

    // Apply formatting to each conference tab
    for (const conf of conferences) {
      const sheetId = sheetIdsByConf[conf]
      if (!sheetId && sheetId !== 0) continue

      // Set column widths: Position(60), Player(150), Team(60), Class(60) × 3
      const colWidths = [60, 150, 60, 60, 60, 150, 60, 60, 60, 150, 60, 60]
      colWidths.forEach((width, index) => {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: { pixelSize: width },
            fields: 'pixelSize'
          }
        })
      })

      // Set row heights
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: totalRows
          },
          properties: { pixelSize: 24 },
          fields: 'pixelSize'
        }
      })

      // Main header row - taller
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 32 },
          fields: 'pixelSize'
        }
      })

      // === MERGE CELLS ===

      // Row 1: Conference name merged across all 12 columns
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // Row 2: Team headers merged (First-Team: 0-3, Second-Team: 4-7, Freshman Team: 8-11)
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 4, endColumnIndex: 8 },
          mergeType: 'MERGE_ALL'
        }
      })
      requests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 8, endColumnIndex: 12 },
          mergeType: 'MERGE_ALL'
        }
      })

      // === FORMATTING ===

      // Main header - dark background, white text
      const mainHeaderFormat = {
        backgroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
        textFormat: {
          foregroundColor: { red: 1, green: 1, blue: 1 },
          bold: true,
          fontSize: 14,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: mainHeaderFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Team headers (Row 2) - lighter background
      const teamHeaderFormat = {
        backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
        textFormat: {
          foregroundColor: { red: 1, green: 1, blue: 1 },
          bold: true,
          fontSize: 11,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: teamHeaderFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Column headers (Row 3) - gray background
      const colHeaderFormat = {
        backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
        textFormat: {
          foregroundColor: { red: 0, green: 0, blue: 0 },
          bold: true,
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: colHeaderFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Data rows - light background, centered
      const dataFormat = {
        backgroundColor: { red: 1, green: 1, blue: 1 },
        textFormat: {
          fontSize: 10,
          fontFamily: 'Barlow'
        },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'MIDDLE'
      }

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 3, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: 12 },
          cell: { userEnteredFormat: dataFormat },
          fields: 'userEnteredFormat'
        }
      })

      // Alternate row colors for data rows
      for (let i = 3; i < totalRows; i++) {
        if (i % 2 === 1) {
          requests.push({
            repeatCell: {
              range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 12 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }
                }
              },
              fields: 'userEnteredFormat.backgroundColor'
            }
          })
        }
      }

      // Add data validation for Team columns (2, 6, 10) and Class columns (3, 7, 11)
      // Data rows start at row 4 (index 3) and end at row 28 (index totalRows-1)
      const teamColumns = [2, 6, 10]
      const classColumns = [3, 7, 11]

      teamColumns.forEach(colIndex => {
        requests.push(generateTeamValidation(sheetId, colIndex, 3, totalRows, dynastyTeams))
        // Add conditional formatting for team colors
        requests.push(...generateTeamFormattingRulesForRange(sheetId, colIndex, 3, totalRows, dynastyTeams))
      })

      classColumns.forEach(colIndex => {
        requests.push(generateClassValidation(sheetId, colIndex, 3, totalRows))
      })
    }

    // Apply formatting
    if (requests.length > 0) {
      await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      })
    }

    // Now write the data to each conference tab
    const valueRanges = []

    for (const conf of conferences) {
      const confData = allConferenceByConference[conf] || []

      // Index existing data by position for each designation (arrays to handle multiple per position)
      const acFirst = {}
      const acSecond = {}
      const acFreshman = {}

      confData.forEach(entry => {
        const pos = entry.position
        if (entry.designation === 'first') {
          if (!acFirst[pos]) acFirst[pos] = []
          acFirst[pos].push(entry)
        } else if (entry.designation === 'second') {
          if (!acSecond[pos]) acSecond[pos] = []
          acSecond[pos].push(entry)
        } else if (entry.designation === 'freshman') {
          if (!acFreshman[pos]) acFreshman[pos] = []
          acFreshman[pos].push(entry)
        }
      })

      // Track which entries have been used (to handle multiple slots per position)
      const usedFirst = {}
      const usedSecond = {}
      const usedFreshman = {}

      // Build values array for this conference tab
      const values = []

      // Row 1: Conference header
      values.push([`All-${conf}`, '', '', '', '', '', '', '', '', '', '', ''])

      // Row 2: Team headers
      values.push(['First-Team', '', '', '', 'Second-Team', '', '', '', 'Freshman Team', '', '', ''])

      // Row 3: Column headers
      values.push([
        'Position', 'Player', 'Team', 'Class',
        'Position', 'Player', 'Team', 'Class',
        'Position', 'Player', 'Team', 'Class'
      ])

      // Rows 4-28: Position data
      ALL_AMERICAN_POSITIONS.forEach(pos => {
        // Get next unused entry for each designation (for positions with multiple slots like WR, HB)
        const firstEntries = acFirst[pos] || []
        const secondEntries = acSecond[pos] || []
        const freshmanEntries = acFreshman[pos] || []

        if (!usedFirst[pos]) usedFirst[pos] = 0
        if (!usedSecond[pos]) usedSecond[pos] = 0
        if (!usedFreshman[pos]) usedFreshman[pos] = 0

        const first = firstEntries[usedFirst[pos]] ? firstEntries[usedFirst[pos]++] : null
        const second = secondEntries[usedSecond[pos]] ? secondEntries[usedSecond[pos]++] : null
        const freshman = freshmanEntries[usedFreshman[pos]] ? freshmanEntries[usedFreshman[pos]++] : null

        values.push([
          pos, first?.player || '', first?.school || '', first?.class || '',
          pos, second?.player || '', second?.school || '', second?.class || '',
          pos, freshman?.player || '', freshman?.school || '', freshman?.class || ''
        ])
      })

      valueRanges.push({
        range: `'${conf}'!A1:L${totalRows}`,
        values
      })
    }

    // Write all values
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: valueRanges
      })
    })

    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating all-conference sheet:', error)
    throw error
  }
}

/**
 * Read All-Conference data from All-Conference sheet
 * @param spreadsheetId - The Google Sheets ID
 * @param conferences - Array of conference names (tabs) to read from
 */
export async function readAllConferenceFromSheet(spreadsheetId, conferences = ALL_CONFERENCES, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numPositions = ALL_AMERICAN_POSITIONS.length
    const allConferenceByConference = {}

    // Read data from each conference tab
    for (const conf of conferences) {
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(conf)}'!A1:L28`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        // Tab might not exist, skip it
        console.warn(`Could not read tab '${conf}', skipping`)
        continue
      }

      const data = await response.json()
      const rows = data.values || []

      // Extract All-Conference data starting at row 4 (index 3). Resolve
      // school text → tid at read time so post-rename teambuilder teams keep
      // their honor links. Use getTidFromTeamText (the tolerant, mascot-strip
      // resolver the All-Americans reader uses) so full names AND custom teams
      // resolve — getTidFromAbbr alone missed both, leaving schoolTid null.
      const tidFor = (text) => {
        const t = text ? getTidFromTeamText(text, dynastyTeams) : null
        return t != null ? Number(t) : null
      }
      const confEntries = []
      for (let i = 0; i < numPositions; i++) {
        const row = rows[3 + i] || []

        // First-Team (cols 0-3)
        if (row[1]) {
          const school = (row[2] || '').trim().toUpperCase()
          confEntries.push({
            team: 'all-conference',
            designation: 'first',
            position: row[0] || ALL_AMERICAN_POSITIONS[i],
            player: row[1],
            school,
            schoolTid: tidFor(school),
            class: row[3] || ''
          })
        }

        // Second-Team (cols 4-7)
        if (row[5]) {
          const school = (row[6] || '').trim().toUpperCase()
          confEntries.push({
            team: 'all-conference',
            designation: 'second',
            position: row[4] || ALL_AMERICAN_POSITIONS[i],
            player: row[5],
            school,
            schoolTid: tidFor(school),
            class: row[7] || ''
          })
        }

        // Freshman Team (cols 8-11)
        if (row[9]) {
          const school = (row[10] || '').trim().toUpperCase()
          confEntries.push({
            team: 'all-conference',
            designation: 'freshman',
            position: row[8] || ALL_AMERICAN_POSITIONS[i],
            player: row[9],
            school,
            schoolTid: tidFor(school),
            class: row[11] || ''
          })
        }
      }

      if (confEntries.length > 0) {
        allConferenceByConference[conf] = confEntries
      }
    }

    // Also return flattened array for backwards compatibility
    const allConference = []
    for (const conf of Object.keys(allConferenceByConference)) {
      allConference.push(...allConferenceByConference[conf])
    }

    return {
      allConference,
      allConferenceByConference
    }
  } catch (error) {
    console.error('Error reading all-conference data:', error)
    throw error
  }
}

// LOCAL-PASTE parse for All-Conference. The Google reader above groups by TAB
// (one fetch per conference tab) and reads a fixed 12-column-per-row grid. The
// local paste cannot carry that grid (splitTsv drops blank lines + the
// "=== … ===" tab labels), so each pasted line is SELF-DESCRIBING instead:
//
//   Conference<TAB>Designation<TAB>Position<TAB>Player<TAB>School<TAB>Class
//
// Designation ∈ {first, second, freshman}. We group by the per-row conference
// (col 0) and emit the SAME { allConference, allConferenceByConference } shape
// the Google reader returns — entries carry their own designation/position/
// school, so downstream save (handleAllConferenceSave) keys by conference and
// honor identity, never by array index or row order.
export function parseAllConferenceLocal(rows, dynastyTeams = null) {
  // Tolerant resolver (mascot-strip, full names, custom teams) — matches the
  // All-Americans reader so AC entries aren't left with a null schoolTid.
  const tidFor = (text) => {
    const t = text ? getTidFromTeamText(text, dynastyTeams) : null
    return t != null ? Number(t) : null
  }
  const normDesignation = (raw) => {
    const s = String(raw || '').trim().toLowerCase()
    if (s.startsWith('first') || s === '1' || s === '1st') return 'first'
    if (s.startsWith('second') || s === '2' || s === '2nd') return 'second'
    if (s.startsWith('fresh') || s === 'fr') return 'freshman'
    return null
  }

  const allConferenceByConference = {}
  for (const row of (rows || [])) {
    const conference = (row[0] || '').trim()
    const designation = normDesignation(row[1])
    const position = (row[2] || '').trim()
    const player = (row[3] || '').trim()
    // A row needs at minimum a conference, a recognized designation, and a
    // player name — otherwise it is noise (header echo, stray line) and is
    // skipped rather than written as a corrupt honor.
    if (!conference || !designation || !player) continue
    const school = (row[4] || '').toUpperCase().trim()
    const playerClass = (row[5] || '').trim()

    const entry = {
      team: 'all-conference',
      designation,
      position,
      player,
      school,
      schoolTid: tidFor(school),
      class: playerClass
    }
    if (!allConferenceByConference[conference]) allConferenceByConference[conference] = []
    allConferenceByConference[conference].push(entry)
  }

  const allConference = []
  for (const conf of Object.keys(allConferenceByConference)) {
    allConference.push(...allConferenceByConference[conf])
  }
  return { allConference, allConferenceByConference }
}

// Transfer/Leaving reasons for Players Leaving sheet
const LEAVING_REASONS = [
  'Graduating',
  'Pro Draft',
  'Playing Style',
  'Proximity to Home',
  'Championship Contender',
  'Program Tradition',
  'Campus Lifestyle',
  'Stadium Atmosphere',
  'Pro Potential',
  'Brand Exposure',
  'Academic Prestige',
  'Conference Prestige',
  'Coach Stability',
  'Coach Prestige',
  'Athletic Facilities',
  'Playing Time'
]

// Create Players Leaving sheet for offseason
// Auto-fills RS Sr (exhausted eligibility) and Sr with 5+ games as "Graduating"
// teamAbbr is optional but recommended for proper team-centric filtering
export async function createPlayersLeavingSheet(dynastyName, year, players, teamAbbr, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Filter to only current roster players using isPlayerOnRoster (handles both stint-based and legacy)
    const teamTid = getTidFromAbbr(teamAbbr, dynastyTeams)
    const currentRosterPlayers = players.filter(p => {
      if (p.isHonorOnly) return false
      if (p.isRecruit) return false

      // Use centralized isPlayerOnRoster - handles both stint-based and legacy systems.
      // Pass dynasty so teambuilder-renamed slots resolve when teamAbbr is the
      // legacy abbr branch (without it, TB takeovers would mis-filter rosters).
      return isPlayerOnRoster(p, teamTid || teamAbbr, year, { teams: dynastyTeams })
    })

    // Get player names for dropdown (only current roster)
    const playerNames = currentRosterPlayers.map(p => p.name).sort()

    // Find seniors who are graduating:
    // - RS Sr: Always graduating (exhausted eligibility, no games requirement)
    // - Sr: Only if 5+ games played (the 5+ games rule applies)
    // Use getPlayerClassForYear for stint-based, classByYear for legacy
    const seniorsGraduating = currentRosterPlayers.filter(player => {
      // Get player's class for this year - handles both stint-based and legacy systems
      const playerClass = getPlayerClassForYear(player, year) || player.classByYear?.[year] || player.classByYear?.[String(year)] || player.year

      // RS Sr always graduates - they've exhausted eligibility
      if (playerClass === 'RS Sr') return true

      // Sr needs 5+ games to auto-graduate
      if (playerClass === 'Sr') {
        // Read from player's own statsByYear (check both number and string keys)
        const yearStats = player.statsByYear?.[year] || player.statsByYear?.[String(year)]
        const gamesPlayed = yearStats?.gamesPlayed || 0
        return gamesPlayed >= 5
      }

      return false
    }).sort((a, b) => a.name.localeCompare(b.name))

    // We'll pre-fill graduating seniors, then leave room for more entries
    const prefilledRows = seniorsGraduating.length
    const totalRows = Math.max(prefilledRows + 20, 60) // At least 60 rows for additional entries

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Players Leaving ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Players Leaving',
              gridProperties: {
                rowCount: totalRows + 1,
                columnCount: 2,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create players leaving sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize the sheet with headers and pre-filled data
    await initializePlayersLeavingSheet(
      sheet.spreadsheetId,
      accessToken,
      sheetId,
      playerNames,
      seniorsGraduating,
      totalRows
    )

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating players leaving sheet:', error)
    throw error
  }
}

// Initialize the Players Leaving sheet with headers, validation, and pre-filled data
async function initializePlayersLeavingSheet(spreadsheetId, accessToken, sheetId, playerNames, seniorsGraduating, totalRows) {
  // Build pre-filled rows for graduating seniors
  const prefilledRows = seniorsGraduating.map(player => ({
    values: [
      { userEnteredValue: { stringValue: String(player.name ?? '') } },
      { userEnteredValue: { stringValue: 'Graduating' } }
    ]
  }))

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' } },
            { userEnteredValue: { stringValue: 'Transfer Reason' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Format all cells: Bold, Italic, Center, Barlow font, size 10
    {
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Add player name dropdown validation for Player column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: totalRows + 1,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: playerNames.map(name => ({ userEnteredValue: name }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Add leaving reason dropdown validation for Transfer Reason column
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: totalRows + 1,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: LEAVING_REASONS.map(reason => ({ userEnteredValue: reason }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 150 },
        fields: 'pixelSize'
      }
    }
  ]

  // Add pre-filled graduating seniors if any
  if (prefilledRows.length > 0) {
    requests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: 1 + prefilledRows.length,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: prefilledRows,
        fields: 'userEnteredValue'
      }
    })
  }

  // Note: Player name dropdown validation already added above with strict: true
  // No duplicate validation needed - dropdowns enforce selection from list only

  // Execute all requests
  await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

// Read players leaving data from Google Sheet
export async function readPlayersLeavingFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Players Leaving!A2:B100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read players leaving data: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse rows into player leaving objects
    const playersLeaving = rows
      .filter(row => row[0] && row[0].trim()) // Must have player name
      .map(row => ({
        playerName: row[0]?.trim() || '',
        reason: row[1]?.trim() || ''
      }))
      .filter(entry => entry.playerName && entry.reason) // Must have both values

    return playersLeaving
  } catch (error) {
    console.error('Error reading players leaving data:', error)
    throw error
  }
}

// Draft round options
const DRAFT_ROUNDS = [
  '1st Round',
  '2nd Round',
  '3rd Round',
  '4th Round',
  '5th Round',
  '6th Round',
  '7th Round',
  'Undrafted'
]

// Create Draft Results sheet for recruiting week 1
// Pre-fills players who declared for the draft (reason = 'Pro Draft')
export async function createDraftResultsSheet(dynastyName, year, playersLeavingThisYear, allPlayers, rosterPlayers = null) {
  try {
    const accessToken = await getAccessToken()

    // Players flagged as Pro Draft in PlayersLeaving — pre-filled at the top.
    const proDraftDeclarees = playersLeavingThisYear
      .filter(p => p.reason === 'Pro Draft')
      .map(leaving => {
        const player = (rosterPlayers || []).find(p => p.name === leaving.playerName || p.pid === leaving.pid)
          || allPlayers.find(p => p.name === leaving.playerName || p.pid === leaving.pid)
        return {
          name: leaving.playerName || player?.name || '',
          pid: leaving.pid || player?.pid,
        }
      })
      .filter(p => p.name)

    // Full roster name list for the column A dropdown — users can still type
    // names that aren't in the list (strict: false).
    const rosterNames = (rosterPlayers || [])
      .map(p => p.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))

    const totalRows = Math.max(proDraftDeclarees.length + 10, 100)

    // Create the spreadsheet — 2 columns: Player | Draft Round.
    // The AI reads names + rounds from screenshots and pastes both at A2,
    // so we don't need Position or Overall columns in the sheet.
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - ${year} Draft Results`
        },
        sheets: [
          {
            properties: {
              title: 'Draft Results',
              gridProperties: {
                rowCount: totalRows + 1,
                columnCount: 2,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to create draft results sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await response.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Build batch update requests
    const requests = []

    // Set header row with white text on dark background
    const headerFormat = {
      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
      horizontalAlignment: 'CENTER'
    }
    requests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' }, userEnteredFormat: headerFormat },
            { userEnteredValue: { stringValue: 'Draft Round' }, userEnteredFormat: headerFormat }
          ]
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Set column widths
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 220 },
        fields: 'pixelSize'
      }
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 140 },
        fields: 'pixelSize'
      }
    })

    // Column A dropdown — full roster names, not strict so users can type
    // players who aren't in the roster list (e.g. walk-ons, missed imports).
    if (rosterNames.length > 0) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: totalRows + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: rosterNames.map(name => ({ userEnteredValue: name }))
            },
            showCustomUi: true,
            strict: false
          }
        }
      })
    }

    // Column B — Draft Round strict dropdown
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: totalRows + 1,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: DRAFT_ROUNDS.map(round => ({ userEnteredValue: round }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    })

    // Pre-fill rows for players already flagged as Pro Draft in PlayersLeaving.
    // AI/user fills in their rounds; blank rows below are available for anyone else.
    if (proDraftDeclarees.length > 0) {
      requests.push({
        updateCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: 1 + proDraftDeclarees.length,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          rows: proDraftDeclarees.map(p => ({
            values: [
              { userEnteredValue: { stringValue: p.name } },
              { userEnteredValue: { stringValue: '' } }
            ]
          })),
          fields: 'userEnteredValue'
        }
      })
    }

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    })

    // Execute all requests
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    })

    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating draft results sheet:', error)
    throw error
  }
}

// Read draft results from Google Sheet
export async function readDraftResultsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Draft Results!A2:B100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read draft results: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Parse rows — column A = player name, column B = draft round.
    // Both columns are now AI/user-supplied; position and overall are looked
    // up from player records in the save handler so we don't need them here.
    const draftResults = rows
      .filter(row => row[0] && row[0].trim() && row[1] && row[1].trim())
      .map(row => ({
        playerName: row[0]?.trim() || '',
        position: '',
        overall: 0,
        draftRound: row[1]?.trim() || ''
      }))

    return draftResults
  } catch (error) {
    console.error('Error reading draft results:', error)
    throw error
  }
}

// Recruiting class options
const RECRUIT_CLASSES = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr', 'Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr']

// Raw in-game position labels — used by BOTH the Targets/Commitments sheet
// and the Recruiting Database sheet's Position dropdown. The Database stores
// this same raw granular value (not the grading engine's bucketed scheme —
// see utils/recruitAttributes.js's positionBucket) so a scout can tell a left
// tackle from a right tackle prospect apart; grading buckets LT/RT under OT
// (etc.) at read time instead, via positionBucket in recruitingDatabaseSheetFormat.js.
export const RECRUIT_POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P', 'ATH'
]

const RECRUIT_ARCHETYPES = [
  'Backfield Creator', 'Dual Threat', 'Pocket Passer', 'Pure Runner',
  'Backfield Threat', 'Contact Seeker', 'East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'North/South Blocker',
  'Blocking', 'Utility',
  'Contested Specialist', 'Elusive Route Runner', 'Gadget', 'Gritty Possession', 'Physical Route Runner', 'Route Artist', 'Speedster',
  'Possession', 'Pure Blocker', 'Pure Possession', 'Vertical Threat',
  'Agile', 'Pass Protector', 'Raw Strength', 'Ground and Pound', 'Well Rounded',
  'Edge Setter', 'Gap Specialist', 'Power Rusher', 'Pure Power', 'Speed Rusher',
  'Lurker', 'Signal Caller', 'Thumper',
  'Boundary', 'Bump and Run', 'Field', 'Zone',
  'Box Specialist', 'Coverage Specialist', 'Hybrid',
  'Accurate', 'Power'
]

const STAR_RATINGS = ['☆', '☆☆', '☆☆☆', '☆☆☆☆', '☆☆☆☆☆']

const HEIGHTS = [
  '5\'5"', '5\'6"', '5\'7"', '5\'8"', '5\'9"', '5\'10"', '5\'11"',
  '6\'0"', '6\'1"', '6\'2"', '6\'3"', '6\'4"', '6\'5"', '6\'6"', '6\'7"', '6\'8"', '6\'9"', '6\'10"', '6\'11"',
  '7\'0"'
]

const US_STATES = [
  'AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL',
  'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA',
  'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE',
  'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY', 'Non-US'
]

const GEM_BUST_OPTIONS = ['Gem', 'Bust']
const DEV_TRAITS = ['Elite', 'Star', 'Impact', 'Normal']
const RECRUITING_DATABASE_DEV_TRAITS = ['Hidden', 'Normal', 'Impact', 'Star', 'Elite']

// Convert stars number to symbols
function starsNumberToSymbol(num) {
  if (!num || num <= 0) return ''
  return '☆'.repeat(Math.min(num, 5))
}

// Create Recruiting Commitments sheet
// Max scholarships per class is 35, so we use 35 rows
export async function createRecruitingSheet(dynastyName, year, dynastyTeams = null, existingCommitments = [], titleOverride = null) {
  try {
    const accessToken = await getAccessToken()

    // Get teams from dynasty.teams (tid-based) - source of truth
    const teams = getTeamsWithCustom(dynastyTeams)
    const teamAbbrs = Object.keys(teams).sort()

    // Roomy enough for a full season of TARGETS (far more than the 35-scholarship
    // commit cap), since one sheet does both commitments and target tracking.
    const totalRows = Math.max(120, existingCommitments.length + 25)

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: titleOverride || `${dynastyName} - ${year} Recruiting Class`
        },
        sheets: [
          {
            properties: {
              title: 'Commitments',
              gridProperties: {
                // A–O (15 commit fields) + Commitment + one column per named
                // attribute + hidden pid = TOTAL_COLS.
                rowCount: totalRows + 1,
                columnCount: TOTAL_COLS,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to create recruiting sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await response.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Build batch update requests
    const requests = []

    // Set header row with dark background
    const headerStyle = { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 }, horizontalAlignment: 'CENTER' }
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Class' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Position' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Archetype' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Stars' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Nat. Rank' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'State Rank' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Pos. Rank' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Height' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Weight' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Hometown' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'State' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Gem/Bust' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Dev Trait' }, userEnteredFormat: headerStyle },
            { userEnteredValue: { stringValue: 'Prev Team' }, userEnteredFormat: headerStyle },
            // ── Targets extension: Commitment + a single "Attributes" cell
            // (the AI fills it with "<code> <rating>" pairs) + hidden pid ──
            ...[
              { label: 'Commitment' },
              { label: 'Attributes', note: "Scouted attributes — list each as '<code> <rating>', e.g. AWR 76, SPD 67, TAK 80. The app reads them by code/name." },
              ...ATTRIBUTE_COLUMNS.slice(1).map(() => ({ label: '' })),
              { label: 'pid' },
              { label: 'NIL', note: 'Recruiting NIL offer (CFB 27)' },
              { label: 'Updated', note: 'Last-edited timestamp — used for most-recent-wins sync with the app. Leave this alone; the app manages it.' },
            ].map(h => ({
              userEnteredValue: { stringValue: h.label },
              userEnteredFormat: headerStyle,
              ...(h.note ? { note: h.note } : {}),
            }))
          ]
        }],
        fields: 'userEnteredValue,userEnteredFormat,note'
      }
    })

    // Set column widths (A–O commit fields, then Commitment, the named attrs, pid, NIL)
    const columnWidths = [150, 70, 70, 140, 80, 70, 70, 70, 60, 60, 120, 50, 70, 70, 80,
      100, 340, ...ATTRIBUTE_COLUMNS.slice(1).map(() => 8), 50, 70]
    columnWidths.forEach((width, idx) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
          properties: { pixelSize: width },
          fields: 'pixelSize'
        }
      })
    })

    // Column B: Class dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 1, endColumnIndex: 2 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: RECRUIT_CLASSES.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column C: Position dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 2, endColumnIndex: 3 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: RECRUIT_POSITIONS.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column D: Archetype dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: RECRUIT_ARCHETYPES.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column E: Stars dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 4, endColumnIndex: 5 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: STAR_RATINGS.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column I: Height dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 8, endColumnIndex: 9 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: HEIGHTS.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column L: State dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 11, endColumnIndex: 12 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: US_STATES.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column M: Gem/Bust dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 12, endColumnIndex: 13 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: GEM_BUST_OPTIONS.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column N: Dev Trait dropdown
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 13, endColumnIndex: 14 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: DEV_TRAITS.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true
        }
      }
    })

    // Column O: Previous Team dropdown with team abbreviations (strict validation)
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 14, endColumnIndex: 15 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: ['', ...teamAbbrs].map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: true // Only allow dropdown values (empty for non-transfers)
        }
      }
    })

    // Column O: Base formatting - centered, bold, italic
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 14, endColumnIndex: 15 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, italic: true }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    })

    // Column P: Commitment dropdown (Targets). Blank = committed to your team
    // (today's behavior), 'Uncommitted' = open target, a team abbr = committed
    // there. Not strict, so the AI/user can still type a team if needed.
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 15, endColumnIndex: 16 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: ['', 'Uncommitted', ...teamAbbrs].map(v => ({ userEnteredValue: v })) },
          showCustomUi: true, strict: false
        }
      }
    })

    // Column P: team-color conditional formatting. Each Commitment cell is tinted
    // with the committed team's colors — sourced from the dynasty's tid-keyed
    // teams (getTeamsWithCustom), so the coloring is tid-based, matching by the
    // team's abbr the cell displays. Open targets ('Uncommitted') get a neutral
    // slate so they read as "still being recruited".
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 15, endColumnIndex: 16 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'Uncommitted' }] },
            format: { backgroundColor: { red: 0.42, green: 0.45, blue: 0.5 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true } },
          },
        },
        index: 0,
      },
    })
    requests.push(...generateTeamFormattingRulesForRange(sheetId, 15, 1, totalRows + 1, dynastyTeams))

    // Hidden pid column (round-trip stability for the reconciler — users never touch it).
    // Hide ONLY pid (endIndex = NIL_COL) so the trailing NIL column stays visible.
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: PID_COL, endIndex: NIL_COL },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser'
      }
    })

    // Build conditional format rules separately — they're applied in a second
    // batchUpdate after the essential requests so a slow/failed color pass
    // never blocks sheet creation.
    const colorRequests = []
    for (const abbr of teamAbbrs) {
      const teamData = teams[abbr]
      if (!teamData?.backgroundColor || !teamData?.textColor) continue

      const bgColor = hexToRgb(teamData.backgroundColor)
      const textColor = hexToRgb(teamData.textColor)

      colorRequests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 14, endColumnIndex: 15 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: abbr }] },
              format: {
                backgroundColor: bgColor,
                textFormat: { foregroundColor: textColor, bold: true, italic: true }
              }
            }
          },
          index: 0
        }
      })
    }

    // Pre-fill existing commitments if any
    if (existingCommitments && existingCommitments.length > 0) {
      // Coerce every stringValue to an actual string. Some legacy
      // commitments stored previousTeam (and occasionally other fields)
      // as a numeric tid; Sheets' batchUpdate rejects non-strings on
      // string_value with "Invalid value… (TYPE_STRING), 53".
      const str = (v) => (v === null || v === undefined) ? '' : String(v)
      // For previousTeam specifically: if it's numeric, try to map the
      // tid back to its abbr (the column is a strict dropdown of abbrs).
      const previousTeamAsAbbr = (v) => {
        if (v === null || v === undefined || v === '') return ''
        const s = String(v)
        // Already an abbr (non-numeric string)
        if (Number.isNaN(Number(s))) return s
        const tid = Number(s)
        // Reverse-lookup in the teams object built earlier in this fn
        for (const [abbr, t] of Object.entries(teams)) {
          if (Number(t?.tid) === tid) return abbr
        }
        return '' // unknown tid → blank (column is strict)
      }
      // Targets columns prefill: commitment string, the 10 attributes (in the
      // canonical order for the row's position/archetype), and the hidden pid.
      // These are blank for plain commitments (the fields are simply absent).
      const numOrBlank = (v) => (v === null || v === undefined || v === '')
        ? { userEnteredValue: { stringValue: '' } }
        : { userEnteredValue: { numberValue: Number(v) } }
      // Existing recruit's attributes → one labeled cell ("AWR 76, SPD 67, …")
      // in the order the game lists them (matches what the AI would type).
      const attrsToLabeledCell = (recruit) => {
        const attrs = recruit.attributes
        if (!attrs || typeof attrs !== 'object') return ''
        const order = attributeNamesFor(recruit.position, recruit.archetype) || Object.keys(attrs)
        return order
          .filter(n => attrs[n] != null && attrs[n] !== '')
          .map(n => `${ATTRIBUTE_ABBR[n] || n} ${attrs[n]}`)
          .join(', ')
      }
      const dataRows = existingCommitments.map(recruit => ({
        values: [
          { userEnteredValue: { stringValue: str(recruit.name) } },
          { userEnteredValue: { stringValue: str(recruit.class || 'HS') } },
          { userEnteredValue: { stringValue: str(recruit.position) } },
          { userEnteredValue: { stringValue: str(recruit.archetype) } },
          { userEnteredValue: { stringValue: str(starsNumberToSymbol(recruit.stars)) } },
          { userEnteredValue: recruit.nationalRank ? { numberValue: Number(recruit.nationalRank) } : { stringValue: '' } },
          { userEnteredValue: recruit.stateRank ? { numberValue: Number(recruit.stateRank) } : { stringValue: '' } },
          { userEnteredValue: recruit.positionRank ? { numberValue: Number(recruit.positionRank) } : { stringValue: '' } },
          { userEnteredValue: { stringValue: str(recruit.height) } },
          { userEnteredValue: recruit.weight ? { numberValue: Number(recruit.weight) } : { stringValue: '' } },
          { userEnteredValue: { stringValue: str(recruit.hometown) } },
          { userEnteredValue: { stringValue: str(recruit.state) } },
          { userEnteredValue: { stringValue: str(recruit.gemBust) } },
          { userEnteredValue: { stringValue: str(recruit.devTrait || '') } },
          { userEnteredValue: { stringValue: previousTeamAsAbbr(recruit.previousTeam) } },
          { userEnteredValue: { stringValue: str(recruit.commitment) } },
          // Single "Attributes" cell — labeled "<code> <rating>" pairs in the
          // recruit's on-screen order, then blanks for the legacy column slots.
          { userEnteredValue: { stringValue: attrsToLabeledCell(recruit) } },
          ...ATTRIBUTE_COLUMNS.slice(1).map(() => ({ userEnteredValue: { stringValue: '' } })),
          numOrBlank(recruit.pid),
          numOrBlank(recruit.nilByYear?.[year] ?? recruit.nilByYear?.[String(year)]),
          numOrBlank(recruit.updatedAt)
        ]
      }))

      requests.push({
        updateCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1 + existingCommitments.length, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
          rows: dataRows,
          fields: 'userEnteredValue'
        }
      })
    }

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    })

    // Execute essential requests (headers, widths, dropdowns, data)
    const batchRes = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    })
    if (!batchRes.ok) {
      const errBody = await batchRes.json().catch(() => ({}))
      throw new Error(`Failed to format recruiting sheet: ${errBody.error?.message || batchRes.status}`)
    }

    // Apply team color rules in a separate non-blocking call. If this fails
    // (slow API, quota) the sheet is still fully functional — colors are cosmetic.
    if (colorRequests.length > 0) {
      fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: colorRequests })
      }, { timeoutMs: 45000, label: 'team color rules' }).catch(err => {
        console.warn('Team color rules failed (non-blocking):', err.message)
      })
    }

    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    }
  } catch (error) {
    console.error('Error creating recruiting sheet:', error)
    throw error
  }
}

// Re-push the current app recruits into an existing recruiting sheet's
// Commitments body (rows 2..N+1), using the SAME column layout createRecruitingSheet
// prefills with. A recruiting sheet is created once and cached per phase/week
// (dynasty.recruitingSheet_<year>_<key>); recruits added afterward through the
// local/in-app entry paths never touch that sheet, so on reopen it would show a
// stale subset (e.g. app has 3 targets, the cached sheet still shows the 1 that
// existed when it was first created). Calling this on reuse keeps the sheet in
// sync with the app.
//
// Intentionally does NOT clear rows beyond the current set, so recruits a user
// typed straight into the sheet (below the prefill) are preserved. Best-effort:
// a failure is logged and swallowed so the user still gets their sheet.
export async function refreshRecruitingSheetPrefill(spreadsheetId, recruits, dynastyTeams = null, year = null) {
  if (!spreadsheetId || !Array.isArray(recruits) || recruits.length === 0) return
  try {
    const accessToken = await getAccessToken()
    const teams = getTeamsWithCustom(dynastyTeams)
    const previousTeamAsAbbr = (v) => {
      if (v === null || v === undefined || v === '') return ''
      const s = String(v)
      if (Number.isNaN(Number(s))) return s
      const tid = Number(s)
      for (const [abbr, t] of Object.entries(teams)) {
        if (Number(t?.tid) === tid) return abbr
      }
      return ''
    }
    const attrsToLabeledCell = (recruit) => {
      const attrs = recruit.attributes
      if (!attrs || typeof attrs !== 'object') return ''
      const order = attributeNamesFor(recruit.position, recruit.archetype) || Object.keys(attrs)
      return order
        .filter(n => attrs[n] != null && attrs[n] !== '')
        .map(n => `${ATTRIBUTE_ABBR[n] || n} ${attrs[n]}`)
        .join(', ')
    }
    const values = recruits.map(r => ([
      r.name ?? '',
      r.class || 'HS',
      r.position ?? '',
      r.archetype ?? '',
      starsNumberToSymbol(r.stars),
      r.nationalRank || '',
      r.stateRank || '',
      r.positionRank || '',
      r.height ?? '',
      r.weight || '',
      r.hometown ?? '',
      r.state ?? '',
      r.gemBust ?? '',
      r.devTrait || '',
      previousTeamAsAbbr(r.previousTeam),
      r.commitment ?? '',
      attrsToLabeledCell(r),
      ...ATTRIBUTE_COLUMNS.slice(1).map(() => ''),
      r.pid ?? '',
      r.nilByYear?.[year] ?? r.nilByYear?.[String(year)] ?? '',
      r.updatedAt ?? '',
    ]))
    const range = `Commitments!A2:${colLetter(UPDATED_AT_COL)}${values.length + 1}`
    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || `HTTP ${response.status}`)
    }
  } catch (error) {
    if (error?.isAuthError) throw error
    console.warn('refreshRecruitingSheetPrefill failed (non-blocking):', error?.message || error)
  }
}

// Convert star symbols to number. Filled stars (★) win when present — in the
// mixed ratings format "★★★★☆" the ☆ is the EMPTY remainder, and counting ☆
// (the old behavior) turned a pasted 4-star into 1 and an all-filled entry
// into 0 ("all recruits show 1 star or no stars"). Outline-only strings
// (what our own sheets write) and plain numbers still parse.
function starsSymbolToNumber(starsStr) {
  if (!starsStr) return 0
  const str = String(starsStr)
  const filled = (str.match(/★/g) || []).length
  if (filled > 0) return Math.min(filled, 5)
  const outline = (str.match(/☆/g) || []).length
  if (outline > 0) return Math.min(outline, 5)
  const n = parseInt(str, 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 5)) : 0
}

// Read recruiting commitments from Google Sheet
export async function readRecruitingFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      // Range is wide (A–AA) so the optional Targets columns (P = Commitment,
      // Q–Z = attributes, AA = hidden pid) round-trip, and tall enough for a full
      // season of targets — far more than the legacy ~99-row commitments cap. A
      // legacy commitments sheet (only A–O filled) parses identically; the extra
      // columns simply come back blank. See utils/recruitSheetParse.js.
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${RECRUITING_READ_RANGE}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read recruiting data: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    return parseRecruitingRows(rows)
  } catch (error) {
    console.error('Error reading recruiting data:', error)
    throw error
  }
}

// Push the app's own recruiting records into an EXISTING recruiting sheet's
// Commitments body — a full-range overwrite (not a partial batchUpdate) so
// recruits added/removed between syncs are handled for free, same pattern as
// prefillRosterSheet. This is the write half of the Recruiting Database's
// two-way Google Sheets sync (readRecruitingFromSheet is the read half);
// the caller (syncRecruitingDatabase in recruitingTargets.js) is what merges
// local + sheet state by most-recent updatedAt before calling this.
export async function writeRecruitingRows(spreadsheetId, recruits, userTid, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const teams = getTeamsWithCustom(dynastyTeams)

    const str = (v) => (v === null || v === undefined) ? '' : String(v)
    const tidToAbbr = (tid) => {
      for (const [abbr, t] of Object.entries(teams)) {
        if (Number(t?.tid) === Number(tid)) return abbr
      }
      return ''
    }
    // Reverse of classifyCommitment() in recruitingTargets.js: '' = committed
    // to you, 'Uncommitted' = open/unresolved target, else the destination
    // team's abbr.
    const commitmentCell = (recruit) => {
      if (recruit.commitmentTid == null) return 'Uncommitted'
      if (Number(recruit.commitmentTid) === Number(userTid)) return ''
      return tidToAbbr(recruit.commitmentTid) || 'Uncommitted'
    }
    const attrsToLabeledCell = (recruit) => {
      const attrs = recruit.attributes
      if (!attrs || typeof attrs !== 'object') return ''
      const order = attributeNamesFor(recruit.position, recruit.archetype) || Object.keys(attrs)
      return order
        .filter(n => attrs[n] != null && attrs[n] !== '')
        .map(n => `${ATTRIBUTE_ABBR[n] || n} ${attrs[n]}`)
        .join(', ')
    }

    const values = recruits.map(recruit => ([
      str(recruit.name),
      str(recruit.class || 'HS'),
      str(recruit.position),
      str(recruit.archetype),
      starsNumberToSymbol(recruit.stars),
      recruit.nationalRank || '',
      recruit.stateRank || '',
      recruit.positionRank || '',
      str(recruit.height),
      recruit.weight || '',
      str(recruit.hometown),
      str(recruit.state),
      str(recruit.gemBust),
      str(recruit.devTrait || ''),
      tidToAbbr(recruit.previousTeam) || str(recruit.previousTeam),
      commitmentCell(recruit),
      attrsToLabeledCell(recruit),
      ...ATTRIBUTE_COLUMNS.slice(1).map(() => ''),
      recruit.pid ?? '',
      recruit.nilByYear?.[recruit.targetYear] ?? '',
      recruit.updatedAt ?? '',
    ]))

    if (values.length === 0) return

    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Commitments!A2:${colLetter(UPDATED_AT_COL)}${values.length + 1}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to write recruiting data: ${error.error?.message || 'Unknown error'}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error writing recruiting data:', error)
    throw error
  }
}

// ==================== TRAINING RESULTS SHEET ====================

/**
 * Create a Training Results sheet for entering new player overalls
 * @param {string} dynastyName - Name of the dynasty
 * @param {number} year - Current year
 * @param {Array} players - Players to include (returning players + portal transfers)
 * @returns {Object} { spreadsheetId, spreadsheetUrl }
 */
export async function createTrainingResultsSheet(dynastyName, year, players) {
  try {
    const accessToken = await getAccessToken()

    // Sort players by last name
    const sortedPlayers = [...players].sort((a, b) => {
      const getLastName = (name) => {
        if (!name) return ''
        const parts = name.trim().split(' ')
        return parts[parts.length - 1].toLowerCase()
      }
      return getLastName(a.name).localeCompare(getLastName(b.name))
    })

    const totalRows = Math.max(sortedPlayers.length, 20)

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Training Results ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Training Results',
              gridProperties: {
                rowCount: totalRows + 1,
                columnCount: 4,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create training results sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize the sheet with headers and data
    await initializeTrainingResultsSheet(
      sheet.spreadsheetId,
      accessToken,
      sheetId,
      sortedPlayers,
      totalRows
    )

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating training results sheet:', error)
    throw error
  }
}

// Initialize the Training Results sheet with headers, validation, and pre-filled data
async function initializeTrainingResultsSheet(spreadsheetId, accessToken, sheetId, players, totalRows) {
  // Build pre-filled rows for players
  const dataRows = players.map(player => ({
    values: [
      { userEnteredValue: { stringValue: String(player.name ?? '') } },
      { userEnteredValue: { stringValue: String(player.position ?? '') } },
      // Show blank if overall is 0/undefined/non-numeric, otherwise show the number
      (player.overall != null && player.overall !== '' && !Number.isNaN(Number(player.overall)) && Number(player.overall) !== 0)
        ? { userEnteredValue: { numberValue: Number(player.overall) } }
        : { userEnteredValue: { stringValue: '' } },
      { userEnteredValue: { stringValue: '' } } // New Overall - user enters this
    ]
  }))

  const requests = [
    // Set headers
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' } },
            { userEnteredValue: { stringValue: 'Position' } },
            { userEnteredValue: { stringValue: 'Past OVR' } },
            { userEnteredValue: { stringValue: 'New OVR' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill player data
    {
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: players.length + 1, startColumnIndex: 0, endColumnIndex: 4 },
        rows: dataRows,
        fields: 'userEnteredValue'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row',
          warningOnly: false
        }
      }
    },
    // Columns A–C (Player / Position / Past OVR) are NOT protected. The
    // paste workflow is: AI outputs all 4 columns, user pastes over A2,
    // reader keys by name so row order is irrelevant. Unprotecting these
    // columns lets the paste land without Google Sheets blocking it.
    // Format header row - bold, background color
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Format all data cells - center aligned
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    // Add data validation for New OVR column (40-99)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: {
            type: 'NUMBER_BETWEEN',
            values: [
              { userEnteredValue: '40' },
              { userEnteredValue: '99' }
            ]
          },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Highlight New OVR column with light background
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 3, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 0.8 },
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
      }
    },
    // Add auto-filter to header row so user can sort/filter
    {
      setBasicFilter: {
        filter: {
          range: { sheetId, startRowIndex: 0, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 4 }
        }
      }
    }
  ]

  await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

/**
 * Read training results from sheet
 * @param {string} spreadsheetId - The Google Sheet ID
 * @returns {Array} Array of { playerName, position, pastOverall, newOverall }
 */
export async function readTrainingResultsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const range = encodeURIComponent("'Training Results'!A2:D200")
    const response = await fetchWithTimeout(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read training results: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const rows = data.values || []

    const results = rows
      .filter(row => row[0] && row[3]) // Must have player name and new overall
      .map(row => ({
        playerName: row[0]?.trim() || '',
        position: row[1]?.trim() || '',
        pastOverall: row[2]?.trim() ? parseInt(row[2], 10) : null, // null if blank
        newOverall: parseInt(row[3], 10) || 0
      }))
      .filter(r => r.newOverall >= 40 && r.newOverall <= 99) // Valid overall range

    return results
  } catch (error) {
    console.error('Error reading training results:', error)
    throw error
  }
}

// Local (no-Google) counterpart of readTrainingResultsFromSheet. The Training
// Results AI prompt already emits the full self-describing 4-column row
// (Player<TAB>Position<TAB>Past OVR<TAB>New OVR) and matches by name, so the
// same prompt drives the local paste. Returns the SAME shape the reader does.
export function parseTrainingResultsLocal(rows) {
  const intOrNull = (raw) => {
    if (raw === undefined || raw === null) return null
    const s = String(raw).trim()
    if (s === '') return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }
  return (rows || [])
    .map((row) => ({
      playerName: String(row[0] || '').trim(),
      position: String(row[1] || '').trim(),
      pastOverall: intOrNull(row[2]),
      newOverall: intOrNull(row[3]) ?? 0,
    }))
    // Drop a stray header row; require a real name and a valid new overall
    // (mirrors the reader, which needs row[0] && row[3] in 40–99).
    .filter((r) => r.playerName && r.playerName.toLowerCase() !== 'player')
    .filter((r) => r.newOverall >= 40 && r.newOverall <= 99)
}

// ============================================
// Encourage Transfers Sheet Functions
// ============================================

// Create Encourage Transfers sheet for offseason week 7
export async function createEncourageTransfersSheet(dynastyName, year, players) {
  try {
    const accessToken = await getAccessToken()

    const rowCount = players.length + 1 // +1 for header
    const columnCount = 4 // Name, Position, Overall, Encourage Transfer

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Encourage Transfers ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Encourage Transfers',
              gridProperties: {
                rowCount: rowCount,
                columnCount: columnCount,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create encourage transfers sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data
    await initializeEncourageTransfersSheet(sheet.spreadsheetId, accessToken, sheetId, players)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating encourage transfers sheet:', error)
    throw error
  }
}

// Initialize the Encourage Transfers sheet with headers and player data
async function initializeEncourageTransfersSheet(spreadsheetId, accessToken, sheetId, players) {
  // Sort players by position order (QB -> P), then by overall within each position
  const positionOrder = [
    'QB', 'HB', 'FB', 'WR', 'TE',
    'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG',
    'LE', 'RE', 'LEDG', 'REDG', 'EDGE', 'DT',
    'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL', 'OLB', 'LB',
    'CB', 'FS', 'SS', 'S', 'K', 'P'
  ]
  const sortedPlayers = [...players].sort((a, b) => {
    const posA = positionOrder.indexOf(a.position) !== -1 ? positionOrder.indexOf(a.position) : 999
    const posB = positionOrder.indexOf(b.position) !== -1 ? positionOrder.indexOf(b.position) : 999
    if (posA !== posB) return posA - posB
    return (b.overall || 0) - (a.overall || 0)
  })
  const rowCount = sortedPlayers.length + 1

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 4
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Name' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Position' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Overall' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Encourage Transfer' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }
          ]
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    },
    // Set player data rows
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount,
          startColumnIndex: 0,
          endColumnIndex: 4
        },
        rows: sortedPlayers.map(player => ({
          values: [
            { userEnteredValue: { stringValue: String(player.name ?? '') }, userEnteredFormat: { horizontalAlignment: 'LEFT' } },
            { userEnteredValue: { stringValue: String(player.position ?? '') }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { numberValue: Number(player.overall) || 0 }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { boolValue: false }, dataValidation: { condition: { type: 'BOOLEAN' }, strict: true } }
          ]
        })),
        fields: 'userEnteredValue,userEnteredFormat,dataValidation'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    },
    // Protect Name, Position, Overall columns (only checkbox column is editable)
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 3
          },
          description: 'Player info - do not edit. Only use the Encourage Transfer checkbox.',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 2,
          endIndex: 3
        },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3,
          endIndex: 4
        },
        properties: { pixelSize: 140 },
        fields: 'pixelSize'
      }
    },
    // Add filter to header row
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 4
          }
        }
      }
    }
  ]

  const batchUpdateResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchUpdateResponse.ok) {
    const error = await batchUpdateResponse.json()
    console.error('Batch update error:', error)
    throw new Error(`Failed to initialize encourage transfers sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read encourage transfers data from sheet
export async function readEncourageTransfersFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const range = 'Encourage Transfers!A2:D'
      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read encourage transfers: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    // Return only players marked for transfer (checkbox is TRUE)
    const transferPlayers = rows
      .filter(row => row[0] && (row[3] === 'TRUE' || row[3] === true))
      .map(row => ({
        name: row[0]?.trim() || '',
        position: row[1]?.trim() || '',
        overall: parseInt(row[2], 10) || 0
      }))

    return transferPlayers
  } catch (error) {
    console.error('Error reading encourage transfers:', error)
    throw error
  }
}

// ============================================
// Recruit Overalls Sheet Functions
// ============================================

// Create Recruit Overalls sheet for Training Camp (Week 6)
// Shows all recruits (HS and transfers) for user to enter their overalls
export async function createRecruitOverallsSheet(dynastyName, year, recruits) {
  try {
    const accessToken = await getAccessToken()

    const rowCount = Math.max(recruits.length + 1, 30) // At least 30 rows
    const columnCount = 6 // Name, Position, Class, Stars, Overall, Jersey #

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Incoming Freshmen Overalls ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Recruit Overalls',
              gridProperties: {
                rowCount: rowCount,
                columnCount: columnCount,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create recruit overalls sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize headers and data
    await initializeRecruitOverallsSheet(sheet.spreadsheetId, accessToken, sheetId, recruits)

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating recruit overalls sheet:', error)
    throw error
  }
}

// Initialize the Recruit Overalls sheet with headers and recruit data
async function initializeRecruitOverallsSheet(spreadsheetId, accessToken, sheetId, recruits) {
  // Sort recruits by last name
  const sortedRecruits = [...recruits].sort((a, b) => {
    const getLastName = (name) => {
      if (!name) return ''
      const parts = name.trim().split(' ')
      return parts[parts.length - 1].toLowerCase()
    }
    return getLastName(a.name).localeCompare(getLastName(b.name))
  })

  const rowCount = Math.max(sortedRecruits.length + 1, 30)

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 6
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Name' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Position' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Class' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Stars' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Overall' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
            { userEnteredValue: { stringValue: 'Jersey #' }, userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } }
          ]
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    },
    // Set recruit data rows
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: sortedRecruits.length + 1,
          startColumnIndex: 0,
          endColumnIndex: 6
        },
        rows: sortedRecruits.map(recruit => ({
          values: [
            { userEnteredValue: { stringValue: String(recruit.name ?? '') }, userEnteredFormat: { horizontalAlignment: 'LEFT' } },
            { userEnteredValue: { stringValue: String(recruit.position ?? '') }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { stringValue: String(recruit.year ?? recruit.class ?? '') }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { numberValue: Number(recruit.stars) || 0 }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: (recruit.overall != null && recruit.overall !== '' && !Number.isNaN(Number(recruit.overall))) ? { numberValue: Number(recruit.overall) } : { stringValue: '' }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: recruit.jerseyNumber != null && recruit.jerseyNumber !== '' ? { stringValue: String(recruit.jerseyNumber) } : { stringValue: '' }, userEnteredFormat: { horizontalAlignment: 'CENTER' } }
          ]
        })),
        fields: 'userEnteredValue,userEnteredFormat'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 6
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    },
    // Protect Name, Position, Class, Stars columns (Overall and Jersey # are editable)
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          description: 'Recruit info - do not edit. Only enter Overall and Jersey #.',
          warningOnly: true
        }
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1
        },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 2
        },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 2,
          endIndex: 3
        },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 3,
          endIndex: 4
        },
        properties: { pixelSize: 50 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 4,
          endIndex: 5
        },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: 'COLUMNS',
          startIndex: 5,
          endIndex: 6
        },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    // Add auto-filter to header row so user can sort/filter
    {
      setBasicFilter: {
        filter: {
          range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 6 }
        }
      }
    }
  ]

  const batchUpdateResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchUpdateResponse.ok) {
    const error = await batchUpdateResponse.json()
    console.error('Batch update error:', error)
    throw new Error(`Failed to initialize recruit overalls sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read recruit overalls from sheet
export async function readRecruitOverallsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const range = 'Recruit Overalls!A2:F'
    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read recruit overalls: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const rows = data.values || []

    // Return all recruits with their overalls and jersey numbers
    const recruitOveralls = rows
      .filter(row => row[0] && row[4]) // Must have name and overall
      .map(row => ({
        name: row[0]?.trim() || '',
        position: row[1]?.trim() || '',
        class: row[2]?.trim() || '',
        stars: parseInt(row[3], 10) || 0,
        overall: parseInt(row[4], 10) || 0,
        jerseyNumber: row[5]?.trim() || ''
      }))
      .filter(r => r.overall >= 40 && r.overall <= 99) // Valid overall range

    return recruitOveralls
  } catch (error) {
    console.error('Error reading recruit overalls:', error)
    throw error
  }
}

// Local (no-Google) counterpart of readRecruitOverallsFromSheet. The Google
// prompt emits only cols E/F in fixed row order (relies on the sheet's
// pre-filled Name column); the LOCAL prompt instead leads each row with the
// recruit's name so paste order doesn't matter. Rows are
// Name<TAB>Overall<TAB>Jersey#. Returns { name, overall, jerseyNumber } — the
// fields handleRecruitOverallsSave matches on.
export function parseRecruitOverallsLocal(rows) {
  const intOrNull = (raw) => {
    if (raw === undefined || raw === null) return null
    const s = String(raw).trim()
    if (s === '') return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }
  return (rows || [])
    .map((row) => ({
      name: String(row[0] || '').trim(),
      overall: intOrNull(row[1]) ?? 0,
      jerseyNumber: String(row[2] ?? '').trim(),
    }))
    .filter((r) => r.name && r.name.toLowerCase() !== 'name')
    .filter((r) => r.overall >= 40 && r.overall <= 99)
}

// ============================================
// GAME BOX SCORE SHEET FUNCTIONS
// ============================================

// Generate conditional formatting rules for team colors in scoring summary
function generateScoringTeamFormattingRules(sheetId, teamAbbr1, teamAbbr2, rowCount, dynastyTeams = null) {
  const rules = []
  const teamsData = getTeamsWithCustom(dynastyTeams)
  const teamAbbrs = [teamAbbr1, teamAbbr2]

  for (const abbr of teamAbbrs) {
    const teamData = teamsData[abbr] || teamsData[abbr?.toUpperCase()]
    if (!teamData) continue

    // Add rule for uppercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr.toUpperCase() }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })

    // Add rule for lowercase version
    rules.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: abbr.toLowerCase() }]
            },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: {
                foregroundColor: hexToRgb(teamData.textColor),
                bold: true,
                italic: true
              }
            }
          }
        },
        index: 0
      }
    })
  }

  return rules
}

// Create a game box score sheet with 9 tabs for a single team's stats
// existingData: optional object with stat arrays keyed by tab name (passing, rushing, etc.) to pre-fill
export async function createGameBoxScoreSheet(teamName, teamAbbr, opponentAbbr, year, week, isUserTeam, rosterPlayers = [], existingData = null) {
  try {
    const accessToken = await getAccessToken()

    // Create the spreadsheet with 9 tabs
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${teamAbbr} Stats - Week ${week} vs ${opponentAbbr} (${year})`
        },
        sheets: [
          // 1st tab: AI All-In-One — the one-paste tab the user asked
          // to see first when the spreadsheet opens. Sits ahead of the
          // 9 individual stat tabs so the default Sheets view lands on
          // it instead of "Passing".
          (() => {
            const layout = computeUnifiedTabLayout()
            return {
              properties: {
                title: AI_UNIFIED_TAB.title,
                gridProperties: {
                  rowCount: layout.totalRows,
                  columnCount: layout.maxCols,
                }
              }
            }
          })(),
          ...STAT_TAB_ORDER.map(key => {
            const tab = STAT_TABS[key]
            return {
              properties: {
                title: tab.title,
                gridProperties: {
                  rowCount: tab.rowCount + 1, // +1 for header
                  columnCount: tab.headers.length,
                  frozenRowCount: 1
                }
              }
            }
          }),
        ]
      })
    }, { label: 'createSpreadsheet' })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create box score sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()

    // Extract sheet IDs for each tab. Unified tab is now at index 0;
    // the 9 individual stat tabs follow at indices 1..N.
    const unifiedSheetId = sheet.sheets[0].properties.sheetId
    const sheetIds = {}
    STAT_TAB_ORDER.forEach((key, idx) => {
      sheetIds[key] = sheet.sheets[idx + 1].properties.sheetId
    })

    // Initialize all tabs with headers and formatting, in parallel with the
    // public-share permission grant. Init writes to the 9 stat tabs and the
    // unified AI tab — disjoint sheet IDs, so they don't conflict; share is
    // a Drive permissions call against a different API surface entirely.
    // Previously these ran sequentially: init9tabs → initUnified → share,
    // costing one round-trip per step. Parallel cuts ~2 round-trips of
    // latency off the create flow.
    await Promise.all([
      initializeBoxScoreSheet(sheet.spreadsheetId, accessToken, sheetIds, isUserTeam, rosterPlayers),
      initializeUnifiedAITab(sheet.spreadsheetId, accessToken, unifiedSheetId, isUserTeam, rosterPlayers),
      shareSheetPublicly(sheet.spreadsheetId, accessToken),
    ])

    // Pre-fill with existing player stats data if provided. Must run AFTER
    // init — init installs dropdowns/data-validation on the same cells the
    // prefill writes to, and a value that lands before its validator
    // exists can be silently rejected by the strict-dropdown rule. Once
    // init is done both prefills can race against each other (different
    // tabs, different ranges).
    if (existingData) {
      await Promise.all([
        prefillPlayerStatsData(sheet.spreadsheetId, accessToken, existingData),
        prefillUnifiedAITab(sheet.spreadsheetId, accessToken, unifiedSheetId, existingData),
      ])
    }

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating box score sheet:', error)
    throw error
  }
}

// Initialize box score sheet tabs with headers, formatting, and validation
async function initializeBoxScoreSheet(spreadsheetId, accessToken, sheetIds, isUserTeam, rosterPlayers) {
  const requests = []

  // For each tab, add headers and formatting
  STAT_TAB_ORDER.forEach(key => {
    const tab = STAT_TABS[key]
    const sheetId = sheetIds[key]

    // Set headers
    requests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: tab.headers.length
        },
        rows: [{
          values: tab.headers.map(header => ({
            userEnteredValue: { stringValue: header }
          }))
        }],
        fields: 'userEnteredValue'
      }
    })

    // Format all cells
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    })

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Protected header row',
          warningOnly: false
        }
      }
    })

    // Add player name dropdown for user's team (column A)
    // If roster is provided, make it strict (no free text) to ensure data consistency
    if (isUserTeam && rosterPlayers.length > 0) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: tab.rowCount + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: rosterPlayers.map(name => ({ userEnteredValue: name }))
            },
            showCustomUi: true,
            strict: true // Roster provided - must select from dropdown
          }
        }
      })
    }
  })

  // Send batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Batch update error:', error)
    throw new Error(`Failed to initialize box score sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Pre-fill player stats sheet with existing data
// existingData: object with arrays keyed by tab name (passing, rushing, etc.)
async function prefillPlayerStatsData(spreadsheetId, accessToken, existingData) {
  if (!existingData) return

  // For each stat tab, write the data
  for (const key of STAT_TAB_ORDER) {
    const tabData = existingData[key]
    if (!tabData || !Array.isArray(tabData) || tabData.length === 0) continue

    const tab = STAT_TABS[key]

    // Use the SAME helper the readers use — alias-aware so canonical keys
    // like qBRating / attempts / brokenTackles round-trip correctly.
    const headerToKey = buildHeaderKeyMap(key, tab.headers)

    // Convert player stat objects to row arrays
    const rows = tabData.map(playerStats => {
      const row = []
      tab.headers.forEach((header, idx) => {
        const key = headerToKey[idx]
        const value = playerStats[key]
        row.push(value !== null && value !== undefined ? String(value) : '')
      })
      return row
    })

    // Get column letter for last column
    const lastColLetter = String.fromCharCode(65 + tab.headers.length - 1)

    // Write data to sheet starting at row 2 (after headers)
    const range = `'${tab.title}'!A2:${lastColLetter}${rows.length + 1}`

    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: range,
          majorDimension: 'ROWS',
          values: rows
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error(`Failed to prefill player stats for ${tab.title}:`, error)
      // Don't throw - sheet is still usable, just without prefilled data
    }
  }
}

// ============================================
// AI ALL-IN-ONE TAB
// Single-tab layout: every player-stat category stacked vertically with
// section banners + column headers + per-section data rows. Lets users (or
// an AI) paste the entire team's stats in one go at cell A1.
// ============================================

// Build the COMPACT unified-tab matrix. Sections are laid out contiguously
// as: banner row, header row, then ONLY the data rows present in existingData
// (none for a blank template). No blank padding between or within sections.
//
// This is what makes the AI paste reliable: every AI paste contains all 9
// banner+header pairs PLUS its data, so it is always taller than this compact
// template and overwrites it completely — leaving no stale banners behind.
// The reader then finds each section by its banner text, so exact row numbers
// never matter. Returns the matrix plus 0-indexed banner/header positions so
// formatting can target them.
function buildCompactUnifiedMatrix(existingData) {
  const layout = computeUnifiedTabLayout()
  const rows = []
  const placements = []
  for (const section of layout.sections) {
    const bannerIdx = rows.length
    const banner = Array(layout.maxCols).fill('')
    banner[0] = `═══ ${section.title.toUpperCase()} ═══`
    rows.push(banner)

    const headerIdx = rows.length
    const header = Array(layout.maxCols).fill('')
    section.headers.forEach((h, i) => { header[i] = h })
    rows.push(header)

    placements.push({ bannerIdx, headerIdx, headerLen: section.headers.length })

    const tabData = existingData?.[section.key]
    if (Array.isArray(tabData) && tabData.length) {
      // Same alias-aware mapping the readers use, so RTG/Att/BT etc. survive.
      const headerToKey = buildHeaderKeyMap(section.key, section.headers)
      for (const playerStats of tabData) {
        const r = Array(layout.maxCols).fill('')
        section.headers.forEach((_, idx) => {
          const v = playerStats[headerToKey[idx]]
          r[idx] = (v !== null && v !== undefined) ? String(v) : ''
        })
        rows.push(r)
      }
    }
  }
  return { matrix: rows, placements, layout }
}

// Formatting for the unified tab: ONE plain default across the whole sheet.
// We intentionally do NOT bold or shade banner/header rows. Section positions
// vary with a variable-length paste, so any fixed-position styling lands on
// the wrong rows and bleeds bold/shading into the data the user pastes over
// it. A plain tab also means a values paste inherits clean cells. The ═══
// banners read fine as plain text.
function unifiedFormatRequests(sheetId) {
  return [{
    repeatCell: {
      range: { sheetId },
      cell: {
        userEnteredFormat: {
          textFormat: { fontFamily: 'Barlow', fontSize: 10, bold: false, italic: false },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
          backgroundColor: { red: 1, green: 1, blue: 1 },
        },
      },
      fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,backgroundColor)',
    },
  }]
}

// Write the compact unified tab: values (banners + headers + optional data),
// then banner/header formatting. Used by both init (template, no data) and
// prefill (with existing data).
async function writeUnifiedTab(spreadsheetId, accessToken, sheetId, existingData) {
  const { matrix, layout } = buildCompactUnifiedMatrix(existingData)
  const lastColLetter = String.fromCharCode(65 + layout.maxCols - 1)
  const range = `'${AI_UNIFIED_TAB.title}'!A1:${lastColLetter}${matrix.length}`

  const valuesResp = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: matrix }),
    }
  )
  if (!valuesResp.ok) {
    console.error('Failed to write AI All-In-One values:', await valuesResp.json().catch(() => ({})))
    return // Non-fatal: the 9 individual tabs are still usable.
  }

  const fmtResp = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: unifiedFormatRequests(sheetId) }),
  })
  if (!fmtResp.ok) {
    console.error('Failed to format AI All-In-One tab:', await fmtResp.json().catch(() => ({})))
  }
}

// Strict roster-name dropdown on column A of the (dynamic) unified tab.
// The tab's rows shift with a variable-length paste, so the dropdown can't be
// pinned to per-section data ranges — it covers the whole name column. The
// banner ("═══ … ═══") and header ("Player Name") rows also live in column A,
// so those exact strings are added to the allow-list to keep the strict rule
// from flagging the structural rows (and from rejecting them on prefill).
async function applyUnifiedRosterValidation(spreadsheetId, accessToken, sheetId, rosterPlayers) {
  const layout = computeUnifiedTabLayout()
  const structural = []
  for (const section of layout.sections) {
    structural.push(`═══ ${section.title.toUpperCase()} ═══`)
    if (section.headers[0]) structural.push(section.headers[0])
  }
  const values = [...new Set([...rosterPlayers, ...structural])].map(v => ({ userEnteredValue: v }))
  const request = {
    setDataValidation: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values },
        showCustomUi: true,
        strict: true,
      },
    },
  }
  const resp = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [request] }),
  })
  if (!resp.ok) {
    console.error('Failed to apply unified roster validation:', await resp.json().catch(() => ({})))
  }
}

// Initialize the unified AI tab with the compact banner+header template, then
// (for teams with a real tracked roster) install the strict roster-name
// dropdown on column A.
async function initializeUnifiedAITab(spreadsheetId, accessToken, sheetId, isUserTeam = false, rosterPlayers = []) {
  await writeUnifiedTab(spreadsheetId, accessToken, sheetId, null)
  if (isUserTeam && rosterPlayers.length > 0) {
    await applyUnifiedRosterValidation(spreadsheetId, accessToken, sheetId, rosterPlayers)
  }
}

// Pre-fill the unified tab with existing data (existingData[key] is an array
// of player stat objects), laid out compactly under each banner.
async function prefillUnifiedAITab(spreadsheetId, accessToken, sheetId, existingData) {
  if (!existingData) return
  await writeUnifiedTab(spreadsheetId, accessToken, sheetId, existingData)
}

// Pure parse of unified-tab rows -> { passing: [...], rushing: [...], ... } —
// the same shape the 9-tab reader produces, sections with no rows return [].
// Exported so the local TSV paste path produces identical data with no fetch:
// pass it splitTsv(pastedText). Banner-anchored: locate each section by its
// "═══ TITLE ═══" banner in column A and read the data rows that follow until
// the next banner, rather than trusting fixed row numbers. This tolerates a
// paste with the wrong line count or no blank padding (the #1 failure mode).
export function parseUnifiedBoxScoreRows(rows) {
  const layout = computeUnifiedTabLayout()
  // Strip banner decoration before matching so a banner survives however the AI
  // dressed it up: box-drawing rules ("═══"/"───"/"━━━"), markdown bold/heading
  // ("**PASSING**", "## Passing"), pipe-table borders, en/em dashes — all
  // normalize to the bare title. Without this, a decorated-but-not-"═══" banner
  // was unrecognized and the whole category silently dropped.
  const norm = (s) => String(s || '')
    .replace(/[═─━—–\-*#~`|]+/g, ' ')
    .replace(/\s+/g, ' ').trim().toUpperCase()
  const titleToSection = {}
  for (const section of layout.sections) titleToSection[norm(section.title)] = section
  // Fuzzy banner resolver: exact normalized title, else a section whose every
  // title word appears in the banner — so "RECEIVING STATS" or a decorated
  // "═══ RECEIVING ═══" still maps to the Receiving section instead of silently
  // dropping that whole category. Only applied to single-cell banner lines
  // (restEmpty below), so a data row can never be mistaken for a banner.
  const resolveSectionTitle = (a) => {
    const key = norm(a)
    if (titleToSection[key]) return titleToSection[key]
    const words = new Set(key.split(' ').filter(Boolean))
    for (const section of layout.sections) {
      const tWords = norm(section.title).split(' ').filter(Boolean)
      if (tWords.length && tWords.every((w) => words.has(w))) return section
    }
    return null
  }

  // A full header row ALSO identifies its section — each section's header list
  // is distinctive ("Player Name, Carries, Yards, TD, Fumbles, …" is uniquely
  // Rushing). This makes the banners OPTIONAL: a paste whose banners the AI
  // dropped, merged, or mangled still attributes correctly as long as the
  // header rows survive. Matches only when the row's leading cells equal a
  // section's headers exactly (first cell "Player Name" required), so a real
  // data row (first cell = a player's name) can never be mistaken for a header.
  const normCell = (s) => String(s || '').trim().toLowerCase()
  const resolveSectionHeader = (cells) => {
    if (!cells || cells.length < 2) return null
    const rowKeys = cells.map(normCell)
    for (const section of layout.sections) {
      const secKeys = section.headers.map(normCell)
      if (secKeys.length <= rowKeys.length && secKeys.every((h, i) => h === rowKeys[i])) return section
    }
    return null
  }

  const boxScore = {}
  for (const section of layout.sections) boxScore[section.key] = []

  let current = null
  const seen = new Set() // sections already read — ignore any later duplicate banner
  for (let r = 0; r < (rows || []).length; r++) {
    const row = rows[r] || []
    const a = (row[0] || '').trim()
    if (!a) continue

    // Banner line: decorated with ═, or a bare section title on its own row.
    const decorated = a.includes('═')
    const asTitle = resolveSectionTitle(a)
    const restEmpty = row.slice(1).every(c => !String(c || '').trim())
    if (decorated || (asTitle && restEmpty)) {
      // First occurrence of a known section wins; a duplicate banner (stale
      // leftover from a re-paste) or an unrecognized decorated line stops
      // attribution so its rows can't be misread into a section.
      if (asTitle && !seen.has(asTitle.key)) { seen.add(asTitle.key); current = asTitle }
      else current = null
      continue
    }
    // A recognizable header row opens its section when no banner did (banners
    // optional); if a banner just opened the same section, this simply skips
    // the header line. A header for an already-seen section is ignored.
    const asHeader = resolveSectionHeader(row)
    if (asHeader) {
      if (current?.key !== asHeader.key && !seen.has(asHeader.key)) {
        seen.add(asHeader.key)
        current = asHeader
      }
      continue
    }
    if (!current) continue
    // Skip the section's column-header row (column A === "Player Name").
    if (a.toLowerCase() === String(current.headers[0]).toLowerCase()) continue

    const headerToKey = buildHeaderKeyMap(current.key, current.headers)
    const entry = { playerName: a }
    current.headers.forEach((header, idx) => {
      if (idx === 0) return
      const value = row[idx] || ''
      entry[headerToKey[idx]] = value === '' ? null : (isNaN(Number(value)) ? value : Number(value))
    })
    boxScore[current.key].push(entry)
  }
  return boxScore
}

// Inverse of parseUnifiedBoxScoreRows: a boxScore -> unified TSV (a "═══ TITLE
// ═══" banner, the header row, then one line per entry) for each section that
// has rows. Seeds / round-trips the raw textarea in the local paste grid.
export function serializeUnifiedBoxScoreToTsv(boxScore) {
  const layout = computeUnifiedTabLayout()
  const lines = []
  for (const section of layout.sections) {
    const entries = (boxScore && boxScore[section.key]) || []
    if (entries.length === 0) continue
    const keyMap = buildHeaderKeyMap(section.key, section.headers)
    lines.push(`═══ ${section.title.toUpperCase()} ═══`)
    lines.push(section.headers.join('\t'))
    for (const entry of entries) {
      const cells = section.headers.map((header, idx) => {
        const v = idx === 0 ? (entry.playerName ?? '') : (entry[keyMap[idx]] ?? '')
        return v == null ? '' : String(v)
      })
      lines.push(cells.join('\t'))
    }
  }
  return lines.join('\n')
}

// Section metadata for the editable paste grid: display headers plus the entry
// key each column binds to (fieldKeys[0] === 'playerName'). Lets the UI render
// and edit the boxScore without re-deriving the header->key mapping.
export function getUnifiedBoxScoreSections() {
  const layout = computeUnifiedTabLayout()
  return layout.sections.map((s) => {
    const keyMap = buildHeaderKeyMap(s.key, s.headers)
    return {
      key: s.key,
      title: s.title,
      headers: s.headers,
      fieldKeys: s.headers.map((_, idx) => keyMap[idx]),
    }
  })
}

// Read the unified tab back into the same { passing: [...], rushing: [...], ... }
// shape the 9-tab reader produces. Sections with no rows return [].
export async function readGameBoxScoreFromUnifiedTab(spreadsheetId) {
  try {
    const accessToken = await getAccessToken()
    const layout = computeUnifiedTabLayout()
    const lastColLetter = String.fromCharCode(65 + layout.maxCols - 1)
    const range = `'${AI_UNIFIED_TAB.title}'!A1:${lastColLetter}${layout.totalRows}`

    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (!response.ok) {
      // Tab missing or unreadable — caller should fall back to 9-tab read.
      return null
    }
    const data = await response.json()
    return parseUnifiedBoxScoreRows(data.values || [])
  } catch (error) {
    console.error('Error reading unified AI tab:', error)
    return null
  }
}

// Create a scoring summary sheet
// existingData: optional array of scoring plays to pre-fill (from game.boxScore.scoringSummary)
export async function createScoringSummarySheet(homeTeamAbbr, awayTeamAbbr, year, week, homeRoster = [], awayRoster = [], existingData = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create the spreadsheet with single tab
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `Scoring Summary - ${awayTeamAbbr} @ ${homeTeamAbbr} Week ${week} (${year})`
        },
        sheets: [{
          properties: {
            title: SCORING_SUMMARY.title,
            gridProperties: {
              rowCount: SCORING_SUMMARY.rowCount + 1,
              columnCount: SCORING_SUMMARY.headers.length,
              frozenRowCount: 1
            }
          }
        }]
      })
    }, { label: 'createScoringSummarySpreadsheet' })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create scoring summary sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Init (headers / formatting / dropdowns) and the public-share grant
    // hit different API surfaces and don't conflict — run them in parallel.
    await Promise.all([
      initializeScoringSummarySheet(sheet.spreadsheetId, accessToken, sheetId, homeTeamAbbr, awayTeamAbbr, homeRoster, awayRoster, dynastyTeams),
      shareSheetPublicly(sheet.spreadsheetId, accessToken),
    ])

    // Prefill must run AFTER init so the strict dropdowns are in place
    // before any data lands in those cells.
    if (existingData && existingData.length > 0) {
      await prefillScoringSummaryData(sheet.spreadsheetId, accessToken, existingData)
    }

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating scoring summary sheet:', error)
    throw error
  }
}

// Pre-fill scoring summary sheet with existing data.
//
// The sheet has 13 cols (A-M): legacy 9-col scoring schema (A-I)
// plus play-by-play extension (J-M). Existing dynasty data only
// populates A-I; that's expected and the J-M cells stay empty for
// those rows. New all-plays data populates all 13.
async function prefillScoringSummaryData(spreadsheetId, accessToken, scoringData) {
  if (!scoringData || scoringData.length === 0) return

  const rows = scoringData.map(play => [
    // A-I — legacy fields (scoring summary; untouched)
    play.team || '',
    play.scorer || '',
    play.passer || '',
    play.yards || '',
    play.scoreType || '',
    play.patResult || '',
    play.quarter || '',
    play.timeLeft || '',
    play.videoLink || '',
    // J-M — play-by-play extension. Pure atoms; the frontend
    // reconstructs the highlight string from these + A-I.
    play.down || '',
    play.distance || '',
    play.fieldPos || '',
    play.playType || '',
  ])

  // Write data to sheet starting at row 2 (after headers). Range
  // covers all 13 cols A-M; legacy rows just send empty strings for
  // the new cols.
  const range = `'${SCORING_SUMMARY.title}'!A2:M${rows.length + 1}`
  const response = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: rows
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    console.error('Failed to prefill scoring data:', error)
    // Don't throw - sheet is still usable, just without prefilled data
  }
}

// Initialize scoring summary sheet with headers, formatting, and dropdowns
async function initializeScoringSummarySheet(spreadsheetId, accessToken, sheetId, homeTeamAbbr, awayTeamAbbr, homeRoster = [], awayRoster = [], dynastyTeams = null) {
  // Combine both rosters for player dropdown
  const allPlayers = [...homeRoster, ...awayRoster].sort()

  const requests = [
    // Set headers
    {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: SCORING_SUMMARY.headers.length
        },
        rows: [{
          values: SCORING_SUMMARY.headers.map(header => ({
            userEnteredValue: { stringValue: header }
          }))
        }],
        fields: 'userEnteredValue'
      }
    },
    // Format all cells
    {
      repeatCell: {
        range: {
          sheetId: sheetId
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              italic: true,
              fontFamily: 'Barlow',
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1
          },
          description: 'Protected header row',
          warningOnly: false
        }
      }
    },
    // Team dropdown (column A - index 0)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: SCORING_SUMMARY.rowCount + 1,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: homeTeamAbbr.toUpperCase() },
              { userEnteredValue: awayTeamAbbr.toUpperCase() }
            ]
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Score Type dropdown (column E - index 4)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: SCORING_SUMMARY.rowCount + 1,
          startColumnIndex: 4,
          endColumnIndex: 5
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: SCORE_TYPES.map(type => ({ userEnteredValue: type }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // PAT Result dropdown (column F - index 5)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: SCORING_SUMMARY.rowCount + 1,
          startColumnIndex: 5,
          endColumnIndex: 6
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: PAT_RESULTS.map(result => ({ userEnteredValue: result }))
          },
          showCustomUi: true,
          strict: true // No free text - use empty option for non-TD plays
        }
      }
    },
    // Quarter dropdown (column G - index 6)
    {
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: SCORING_SUMMARY.rowCount + 1,
          startColumnIndex: 6,
          endColumnIndex: 7
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: QUARTERS.map(q => ({ userEnteredValue: q }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    }
  ]

  // Add player dropdown for Scorer column (column B - index 1) if we have players
  if (allPlayers.length > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: SCORING_SUMMARY.rowCount + 1,
          startColumnIndex: 1,
          endColumnIndex: 2
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: allPlayers.map(name => ({ userEnteredValue: name }))
          },
          showCustomUi: true,
          strict: false // Allow free text entry as well
        }
      }
    })

    // Add player dropdown for Passer column (column C - index 2)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: SCORING_SUMMARY.rowCount + 1,
          startColumnIndex: 2,
          endColumnIndex: 3
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: allPlayers.map(name => ({ userEnteredValue: name }))
          },
          showCustomUi: true,
          strict: false // Allow free text entry or empty (for non-passing TDs)
        }
      }
    })

  }

  // Down dropdown (column J - index 9) — play-by-play extension.
  // Empty default + strict: false so scoring-only rows can leave it
  // blank without the sheet rejecting the cell.
  requests.push({
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: SCORING_SUMMARY.rowCount + 1,
        startColumnIndex: 9,
        endColumnIndex: 10
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: DOWNS.map(d => ({ userEnteredValue: d }))
        },
        showCustomUi: true,
        strict: false,
      }
    }
  })

  // Play Type dropdown (column M - index 12) — play-by-play extension.
  requests.push({
    setDataValidation: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: SCORING_SUMMARY.rowCount + 1,
        startColumnIndex: 12,
        endColumnIndex: 13
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: PLAY_TYPES.map(t => ({ userEnteredValue: t }))
        },
        showCustomUi: true,
        strict: false,
      }
    }
  })

  // Add conditional formatting for team colors
  const teamFormattingRules = generateScoringTeamFormattingRules(sheetId, homeTeamAbbr, awayTeamAbbr, SCORING_SUMMARY.rowCount, dynastyTeams)
  requests.push(...teamFormattingRules)

  // Send batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Batch update error:', error)
    throw new Error(`Failed to initialize scoring summary sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Per-tab header key aliases — the default naive camelCase parser produces
// keys like "bT" or "att" that don't match the canonical box-score format used
// by generateRandomBoxScore, boxScoreAggregator, and DetailedStatsEntryModal.
// This map aligns sheet-read output with that canonical convention so stats
// flow cleanly into statsByYear and player game logs.
const BOX_SCORE_HEADER_ALIASES = {
  passing: { 'Rtg': 'qBRating', 'Att': 'attempts' },
  rushing: { 'BT': 'brokenTackles' }
}

// Single source of truth for header → JS key mapping. MUST be used by both
// readers and writers — drift between them causes silent data wipe on
// round-trip (real bug from 2026-04: RTG/Att/BT vanished after re-open
// because the writers used naive camelize while only the readers consulted
// the alias table). The first column is always the player name.
function buildHeaderKeyMap(sectionKey, headers) {
  const aliases = BOX_SCORE_HEADER_ALIASES[sectionKey] || {}
  const map = {}
  headers.forEach((header, idx) => {
    if (idx === 0) {
      map[idx] = 'playerName'
    } else {
      map[idx] = aliases[header]
        || header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
    }
  })
  return map
}

// Read all stats from a game box score sheet (9 tabs)
export async function readGameBoxScoreFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const boxScore = {}

    // Fire all 9 stat-tab reads AND the unified-tab read in parallel.
    // Previously this was a sequential for-loop (9 stacked round-trips),
    // followed by the unified read — totalling ~10 serial round-trips
    // every time the user clicked Sync. Parallel collapses that to one
    // round-trip's worth of latency.
    const tabReadPromises = STAT_TAB_ORDER.map(async (key) => {
      const tab = STAT_TABS[key]
      const range = `'${tab.title}'!A2:${String.fromCharCode(65 + tab.headers.length - 1)}${tab.rowCount + 1}`

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        console.error(`Failed to read ${tab.title}:`, error)
        return { key, rows: [] }
      }

      const data = await response.json()
      const rawRows = data.values || []

      const headerToKey = buildHeaderKeyMap(key, tab.headers)

      const rows = rawRows
        .filter(row => row[0]) // Must have player name
        .map(row => {
          const entry = {}
          tab.headers.forEach((header, idx) => {
            const value = row[idx] || ''
            const k = headerToKey[idx]
            if (idx === 0) {
              entry.playerName = value.trim()
            } else {
              entry[k] = value === '' ? null : (isNaN(Number(value)) ? value : Number(value))
            }
          })
          return entry
        })

      return { key, rows }
    })

    // readGameBoxScoreFromUnifiedTab already swallows its own errors and
    // returns null on failure (the catch inside its function), so it's
    // safe to await alongside the tab reads via Promise.all.
    const [tabResults, unified] = await Promise.all([
      Promise.all(tabReadPromises),
      readGameBoxScoreFromUnifiedTab(spreadsheetId),
    ])

    for (const { key, rows } of tabResults) {
      boxScore[key] = rows
    }

    // Merge in data from the AI All-In-One unified tab. If a section has
    // data in the unified tab, prefer it (the user pasted there); otherwise
    // keep what came from the dedicated tab.
    if (unified) {
      for (const key of STAT_TAB_ORDER) {
        const unifiedRows = unified[key]
        if (Array.isArray(unifiedRows) && unifiedRows.length > 0) {
          boxScore[key] = unifiedRows
        }
      }
    }

    return boxScore
  } catch (error) {
    console.error('Error reading box score:', error)
    throw error
  }
}

// Read scoring summary / plays from sheet.
//
// The sheet has 14 cols (A-N) × up to 300 rows. Cols A-I are the
// legacy scoring summary shape; cols J-N are the play-by-play
// extension. A given row may be:
//   • a scoring play (cols A-I filled, J-N optional)
//   • a non-scoring play (cols A + J-N filled, B-F blank)
//   • both (a scoring play with full PBP detail, all 14 cols filled)
//
// We return every row the user filled. The frontend filters by which
// fields are populated to decide what to render (Scores Only checkbox).
//
// Back-compat: old 9-col sheets only have data through col I; cols
// J-M come back empty for those rows. Old 30-row sheets only have
// data through row 31; rows 32-301 come back empty. The Google Sheets
// API gracefully truncates a read range that exceeds the grid bounds,
// so reading A2:M301 against an old 9-col/30-row sheet returns the
// rows that exist with the cols that exist — no error.
//
// Older 14-col sheets (with a Description column at N) and 15-col
// sheets (with separate Outcome + Notes cols at N/O) read fine too:
// we now stop at col M, so any col-N+ data on legacy sheets is
// silently dropped on the next sync. The frontend reconstructs the
// highlight string from the structured atoms in A-M instead.
export async function readScoringSummaryFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  // Filter + map shared by the live-sheet read AND the local-paste path. Keep a
  // row when the team column is set AND at least one other meaningful field is
  // set. Scoring-play detection is via col E (Score Type) / col F (2PT in PAT
  // Result), NEVER col M — that keeps scoring-only users on the same strict
  // filter; PBP-only rows survive via the down / playType / scorer signals.
  const buildFromRows = (rows) => rows
    .filter(row => {
      const hasTeam = row[0] && row[0].trim()
      if (!hasTeam) return false
      const hasScoreType = row[4] && row[4].trim()
      const patResult = (row[5] || '').trim()
      const is2PTAttempt = patResult.includes('2PT')
      if (hasScoreType || is2PTAttempt) return true
      const hasDown = row[9] && row[9].trim()
      const hasPlayType = row[12] && row[12].trim()
      const hasScorer = row[1] && row[1].trim()
      return hasDown || hasPlayType || hasScorer
    })
    .map(row => ({
      // Legacy 9-col fields (A-I).
      team: (row[0] || '').trim().toUpperCase(),
      scorer: (row[1] || '').trim(),
      passer: (row[2] || '').trim(),
      yards: (row[3] || '').trim(),
      scoreType: (row[4] || '').trim(),
      patResult: (row[5] || '').trim(),
      quarter: (row[6] || '').trim(),
      timeLeft: (row[7] || '').trim(),
      videoLink: (row[8] || '').trim(),
      // Play-by-play extension (J-M). Empty on legacy / scoring-only rows.
      down: (row[9] || '').trim(),
      distance: (row[10] || '').trim(),
      fieldPos: (row[11] || '').trim(),
      playType: (row[12] || '').trim(),
    }))

  // Local paste path: the caller passes pre-split rows (splitTsv output), so we
  // skip the Google Sheets network fetch entirely and run the same filter/map.
  if (Array.isArray(opts.rows)) {
    return buildFromRows(opts.rows)
  }

  try {
    const accessToken = await getAccessToken()

    // Read all 13 cols × 300 data rows.
    const range = `'${SCORING_SUMMARY.title}'!A2:M${SCORING_SUMMARY.rowCount + 1}`
    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read scoring summary: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    return buildFromRows(data.values || [])
  } catch (error) {
    console.error('Error reading scoring summary:', error)
    throw error
  }
}

// Team stats row labels for game team stats sheet (entry order)
export const TEAM_STATS_ROWS = [
  'First Downs',
  'Total Offense',
  'Total Plays',
  'Rush Attempts',
  'Rush Yards',
  'Rush TDs',
  'Completions',
  'Pass Attempts',
  'Pass TDs',
  'Passing Yards',
  '3rd Down Conv',
  '3rd Down Att',
  '4th Down Conv',
  '4th Down Att',
  '2PT Conv',
  '2PT Att',
  'Red Zone TD',
  'Red Zone FG',
  'Red Zone Pct',
  'Turnovers',
  'Fumbles Lost',
  'Interceptions',
  'Punt Ret Yards',
  'Kick Ret Yards',
  'Total Yards',
  'Punt Avg',
  'Penalties',
  'Penalty Yards',
  'Poss Minutes',
  'Poss Seconds'
]

// Create a game team stats sheet with a single tab (columns for away and home teams)
// existingData: optional tid-keyed map { [tid]: {...stats} } to pre-fill.
// We map tid→column internally via homeTeamAbbr / awayTeamAbbr so callers
// never need to think about the sheet's home/away column layout.
export async function createGameTeamStatsSheet(homeTeamAbbr, awayTeamAbbr, year, week, existingData = null, dynastyTeams = null) {
  try {
    // Defensive coerce: stringValue writes (and the sheet title) below
    // assume these are strings. If a caller ever passes a tid, the
    // Sheets API rejects with TYPE_STRING — keep that from happening.
    homeTeamAbbr = String(homeTeamAbbr ?? '')
    awayTeamAbbr = String(awayTeamAbbr ?? '')
    const accessToken = await getAccessToken()

    // Create the spreadsheet with 1 tab (3 columns: Stat, Away, Home)
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `Team Stats - ${awayTeamAbbr} @ ${homeTeamAbbr} Week ${week} (${year})`
        },
        sheets: [
          {
            properties: {
              title: 'Team Stats',
              gridProperties: {
                rowCount: TEAM_STATS_ROWS.length + 1, // +1 for header
                columnCount: 3,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    }, { label: 'createTeamStatsSpreadsheet' })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create team stats sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()

    // Get the sheet ID for the single tab
    const sheetId = sheet.sheets[0].properties.sheetId

    // Init and the public-share grant hit different APIs; run in parallel.
    await Promise.all([
      initializeTeamStatsSheet(sheet.spreadsheetId, accessToken, sheetId, homeTeamAbbr, awayTeamAbbr, dynastyTeams),
      shareSheetPublicly(sheet.spreadsheetId, accessToken),
    ])

    // Prefill runs after init for the same dropdown-ordering reason as the
    // other game sheets. existingData arrives tid-keyed; project it onto
    // the sheet's home/away columns using the abbrs we just wrote into
    // the header row.
    if (existingData && Object.keys(existingData).length > 0) {
      const homeTid = homeTeamAbbr ? getTidFromAbbr(homeTeamAbbr, dynastyTeams) : null
      const awayTid = awayTeamAbbr ? getTidFromAbbr(awayTeamAbbr, dynastyTeams) : null
      const slotData = {
        home: homeTid != null ? (existingData[Number(homeTid)] || existingData[String(homeTid)]) : null,
        away: awayTid != null ? (existingData[Number(awayTid)] || existingData[String(awayTid)]) : null,
      }
      if (slotData.home || slotData.away) {
        await prefillTeamStatsData(sheet.spreadsheetId, accessToken, slotData)
      }
    }

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl,
      homeTeamAbbr,
      awayTeamAbbr
    }
  } catch (error) {
    console.error('Error creating team stats sheet:', error)
    throw error
  }
}

// Initialize team stats sheet with single tab, 3 columns (Stat, Away, Home)
async function initializeTeamStatsSheet(spreadsheetId, accessToken, sheetId, homeTeamAbbr, awayTeamAbbr, dynastyTeams = null) {
  const requests = []

  // Get team colors from dynasty.teams (source of truth)
  const teams = getTeamsWithCustom(dynastyTeams)
  const awayTeamData = teams[awayTeamAbbr]
  const homeTeamData = teams[homeTeamAbbr]
  const awayBgColor = awayTeamData ? hexToRgb(awayTeamData.backgroundColor) : { red: 0.2, green: 0.2, blue: 0.2 }
  const awayTextColor = awayTeamData ? hexToRgb(awayTeamData.textColor) : { red: 1, green: 1, blue: 1 }
  const homeBgColor = homeTeamData ? hexToRgb(homeTeamData.backgroundColor) : { red: 0.2, green: 0.2, blue: 0.2 }
  const homeTextColor = homeTeamData ? hexToRgb(homeTeamData.textColor) : { red: 1, green: 1, blue: 1 }

  // Set header row with all three columns (Stat, AwayAbbr, HomeAbbr)
  requests.push({
    updateCells: {
      range: {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: 3
      },
      rows: [{
        values: [
          {
            userEnteredValue: { stringValue: 'Stat' },
            userEnteredFormat: {
              textFormat: { bold: true, fontFamily: 'Barlow', fontSize: 11 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontFamily: 'Barlow', fontSize: 11 }
            }
          },
          {
            userEnteredValue: { stringValue: awayTeamAbbr },
            userEnteredFormat: {
              textFormat: { bold: true, fontFamily: 'Barlow', fontSize: 11, foregroundColor: awayTextColor },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              backgroundColor: awayBgColor
            }
          },
          {
            userEnteredValue: { stringValue: homeTeamAbbr },
            userEnteredFormat: {
              textFormat: { bold: true, fontFamily: 'Barlow', fontSize: 11, foregroundColor: homeTextColor },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              backgroundColor: homeBgColor
            }
          }
        ]
      }],
      fields: 'userEnteredValue,userEnteredFormat'
    }
  })

  // Set stat row labels (column A)
  requests.push({
    updateCells: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: TEAM_STATS_ROWS.length + 1,
        startColumnIndex: 0,
        endColumnIndex: 1
      },
      rows: TEAM_STATS_ROWS.map(label => ({
        values: [{ userEnteredValue: { stringValue: label } }]
      })),
      fields: 'userEnteredValue'
    }
  })

  // Format data cells (rows 2+)
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: TEAM_STATS_ROWS.length + 1
      },
      cell: {
        userEnteredFormat: {
          textFormat: {
            fontFamily: 'Barlow',
            fontSize: 10
          },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
    }
  })

  // Format stat label column (bold, left-aligned)
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetId,
        startRowIndex: 1,
        endRowIndex: TEAM_STATS_ROWS.length + 1,
        startColumnIndex: 0,
        endColumnIndex: 1
      },
      cell: {
        userEnteredFormat: {
          textFormat: {
            bold: true
          },
          horizontalAlignment: 'LEFT'
        }
      },
      fields: 'userEnteredFormat(textFormat.bold,horizontalAlignment)'
    }
  })

  // Protect header row
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        description: 'Protected header row',
        warningOnly: false
      }
    }
  })

  // Protect stat labels column (column A, data rows only)
  requests.push({
    addProtectedRange: {
      protectedRange: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: TEAM_STATS_ROWS.length + 1,
          startColumnIndex: 0,
          endColumnIndex: 1
        },
        description: 'Protected stat labels',
        warningOnly: false
      }
    }
  })

  // Set column widths: Stat (140px), Away (80px), Home (80px)
  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: 0,
        endIndex: 1
      },
      properties: { pixelSize: 140 },
      fields: 'pixelSize'
    }
  })

  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: sheetId,
        dimension: 'COLUMNS',
        startIndex: 1,
        endIndex: 3
      },
      properties: { pixelSize: 80 },
      fields: 'pixelSize'
    }
  })

  // Send batch update
  const batchResponse = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Batch update error:', error)
    throw new Error(`Failed to initialize team stats sheet: ${error.error?.message || 'Unknown error'}`)
  }
}

// Read team stats from sheet (single tab with columns: Stat, Away, Home)
export async function readGameTeamStatsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Read header row to get team abbreviations and data rows
    const range = `'Team Stats'!A1:C${TEAM_STATS_ROWS.length + 1}`

    const response = await fetchWithTimeout(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to read team stats:', error)
      throw new Error('Failed to read team stats from sheet')
    }

    const data = await response.json()
    const rows = data.values || []

    if (rows.length < 1) {
      throw new Error('Team stats sheet is empty')
    }

    // Header row contains: Stat, AwayAbbr, HomeAbbr. The sheet itself still
    // uses home/away columns (that's a UI affordance for the user filling
    // it out), but we return data keyed by tid via the abbr→tid lookup
    // so storage stays in the canonical byTid shape. Callers that need to
    // know which side was which still get teamAbbr inside each entry.
    const headerRow = rows[0]
    const awayTeamAbbr = headerRow[1] || ''
    const homeTeamAbbr = headerRow[2] || ''

    const awayEntry = { teamAbbr: awayTeamAbbr }
    const homeEntry = { teamAbbr: homeTeamAbbr }

    // Parse data rows (starting from row 2)
    for (let i = 1; i < rows.length && i <= TEAM_STATS_ROWS.length; i++) {
      const row = rows[i]
      const statLabel = TEAM_STATS_ROWS[i - 1]
      const awayValue = row[1] || ''
      const homeValue = row[2] || ''

      // Convert stat label to camelCase key
      const camelKey = statLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^./, c => c.toLowerCase())

      awayEntry[camelKey] = awayValue === '' ? null : (isNaN(Number(awayValue)) ? awayValue : Number(awayValue))
      homeEntry[camelKey] = homeValue === '' ? null : (isNaN(Number(homeValue)) ? homeValue : Number(homeValue))
    }

    const teamStatsByTid = {}
    const awayTid = awayTeamAbbr ? getTidFromAbbr(awayTeamAbbr, dynastyTeams) : null
    const homeTid = homeTeamAbbr ? getTidFromAbbr(homeTeamAbbr, dynastyTeams) : null
    if (awayTid != null) teamStatsByTid[Number(awayTid)] = awayEntry
    if (homeTid != null) teamStatsByTid[Number(homeTid)] = homeEntry

    return teamStatsByTid
  } catch (error) {
    console.error('Error reading team stats:', error)
    throw error
  }
}

// Parse PASTED Team Stats TSV into the same teamStatsByTid map that
// readGameTeamStatsFromSheet returns — the no-Google ingest path.
//
// The AI prompt for team stats emits exactly 30 lines of "<away>\t<home>"
// (column A's stat label is pre-filled/protected, so it is never output, and
// there is no header row). `rows` is that TSV after splitTsv(): an array of
// [awayValue, homeValue] cells. Stat labels therefore come from the fixed
// TEAM_STATS_ROWS order (by index), and the team abbreviations come from the
// GAME (the paste carries neither). Value coercion mirrors the sheet reader
// 1:1 so paste and Google round-trips produce identical stored data.
export function parseGameTeamStatsTsv(rows, { awayAbbr, homeAbbr, dynastyTeams = null } = {}) {
  const toCamelKey = (label) => label
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase())

  const awayEntry = { teamAbbr: awayAbbr || '' }
  const homeEntry = { teamAbbr: homeAbbr || '' }

  for (let i = 0; i < TEAM_STATS_ROWS.length; i++) {
    const row = rows[i] || []
    const camelKey = toCamelKey(TEAM_STATS_ROWS[i])
    const awayValue = (row[0] ?? '').toString().trim()
    const homeValue = (row[1] ?? '').toString().trim()
    awayEntry[camelKey] = awayValue === '' ? null : (isNaN(Number(awayValue)) ? awayValue : Number(awayValue))
    homeEntry[camelKey] = homeValue === '' ? null : (isNaN(Number(homeValue)) ? homeValue : Number(homeValue))
  }

  const teamStatsByTid = {}
  const awayTid = awayAbbr ? getTidFromAbbr(awayAbbr, dynastyTeams) : null
  const homeTid = homeAbbr ? getTidFromAbbr(homeAbbr, dynastyTeams) : null
  if (awayTid != null) teamStatsByTid[Number(awayTid)] = awayEntry
  if (homeTid != null) teamStatsByTid[Number(homeTid)] = homeEntry
  return teamStatsByTid
}

// Pre-fill team stats sheet with existing data (single tab with columns B=away, C=home)
async function prefillTeamStatsData(spreadsheetId, accessToken, teamStatsData) {
  if (!teamStatsData) return

  // Map of camelCase keys to TEAM_STATS_ROWS indices
  const keyToRowIndex = {}
  TEAM_STATS_ROWS.forEach((label, idx) => {
    const camelKey = label
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^./, c => c.toLowerCase())
    keyToRowIndex[camelKey] = idx
  })

  // Build values array for both columns (B=away, C=home)
  const values = new Array(TEAM_STATS_ROWS.length).fill(null).map(() => ['', ''])

  // Legacy key migration: old data stored punt count under `punts`; new field is `puntAvg`.
  const migrateKey = (key) => (key === 'punts' ? 'puntAvg' : key)

  // Fill away team values (column B)
  if (teamStatsData.away) {
    Object.entries(teamStatsData.away).forEach(([key, value]) => {
      if (key === 'teamAbbr') return // Skip metadata
      const rowIdx = keyToRowIndex[migrateKey(key)]
      if (rowIdx !== undefined && value !== null && value !== undefined) {
        values[rowIdx][0] = String(value)
      }
    })
  }

  // Fill home team values (column C)
  if (teamStatsData.home) {
    Object.entries(teamStatsData.home).forEach(([key, value]) => {
      if (key === 'teamAbbr') return // Skip metadata
      const rowIdx = keyToRowIndex[migrateKey(key)]
      if (rowIdx !== undefined && value !== null && value !== undefined) {
        values[rowIdx][1] = String(value)
      }
    })
  }

  // Write values to columns B and C starting at row 2 (after header)
  const range = `'Team Stats'!B2:C${TEAM_STATS_ROWS.length + 1}`

  const response = await fetchWithTimeout(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: values
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    console.error('Failed to prefill team stats:', error)
    // Don't throw - sheet is still usable, just without prefilled data
  }
}

// ==================== TRANSFER DESTINATIONS SHEET ====================

/**
 * Create a Transfer Destinations sheet for tracking where outgoing transfers committed
 * @param {string} dynastyName - Name of the dynasty
 * @param {number} year - Current year
 * @param {Array} transferringPlayers - Players who are transferring out
 * @returns {Object} { spreadsheetId, spreadsheetUrl }
 */
export async function createTransferDestinationsSheet(dynastyName, year, transferringPlayers, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Sort players by last name
    const sortedPlayers = [...transferringPlayers].sort((a, b) => {
      const getLastName = (name) => {
        if (!name) return ''
        const parts = name.trim().split(' ')
        return parts[parts.length - 1].toLowerCase()
      }
      return getLastName(a.name).localeCompare(getLastName(b.name))
    })

    const totalRows = Math.max(sortedPlayers.length + 5, 20)

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - ${year} Transfer Destinations`
        },
        sheets: [
          {
            properties: {
              title: 'Transfer Destinations',
              gridProperties: {
                rowCount: totalRows + 1,
                columnCount: 2,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to create transfer destinations sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await response.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Get all team abbreviations for dropdown (uses dynastyTeams if provided)
    const teams = getTeamsWithCustom(dynastyTeams)
    const teamAbbrs = Object.keys(teams).sort()

    // Build batch update requests
    const requests = []

    // Set header row
    const headerFormat = {
      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
      horizontalAlignment: 'CENTER'
    }
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player Name' }, userEnteredFormat: headerFormat },
            { userEnteredValue: { stringValue: 'New Team' }, userEnteredFormat: headerFormat }
          ]
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Pre-fill player names
    if (sortedPlayers.length > 0) {
      requests.push({
        updateCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: sortedPlayers.length + 1, startColumnIndex: 0, endColumnIndex: 1 },
          rows: sortedPlayers.map(p => ({
            values: [{ userEnteredValue: { stringValue: String(p.name ?? '') } }]
          })),
          fields: 'userEnteredValue'
        }
      })
    }

    // Set column widths
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    })

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row',
          warningOnly: false
        }
      }
    })

    // Protect player name column
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 1 },
          description: 'Player names - do not edit',
          warningOnly: false
        }
      }
    })

    // Add team dropdown validation (STRICT - only dropdown values allowed)
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 1, endColumnIndex: 2 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: teamAbbrs.map(v => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: true // MANDATORY dropdown - no free text
        }
      }
    })

    // Add conditional formatting for team colors
    for (const abbr of teamAbbrs) {
      const teamInfo = teams[abbr]
      if (!teamInfo?.backgroundColor && !teamInfo?.textColor) continue

      const bgColor = teamInfo.backgroundColor || '#FFFFFF'
      const textColor = teamInfo.textColor || '#000000'

      // Parse hex colors
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result ? {
          red: parseInt(result[1], 16) / 255,
          green: parseInt(result[2], 16) / 255,
          blue: parseInt(result[3], 16) / 255
        } : { red: 1, green: 1, blue: 1 }
      }

      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 1, endColumnIndex: 2 }],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: abbr }]
              },
              format: {
                backgroundColor: hexToRgb(bgColor),
                textFormat: { foregroundColor: hexToRgb(textColor), bold: true }
              }
            }
          },
          index: 0
        }
      })
    }

    // Format all cells center aligned and bold
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    })

    // Add auto-filter
    requests.push({
      setBasicFilter: {
        filter: {
          range: { sheetId, startRowIndex: 0, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 2 }
        }
      }
    })

    // Execute batch update
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests })
    })

    // Share sheet publicly
    await shareSheetPublicly(spreadsheetId, accessToken)

    return {
      spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating transfer destinations sheet:', error)
    throw error
  }
}

/**
 * Read transfer destinations from sheet
 * @param {string} spreadsheetId - The Google Sheet ID
 * @returns {Array} Array of { playerName, newTeam }
 */
export async function readTransferDestinationsFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const response = await fetchWithTimeout(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/Transfer Destinations!A2:B`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read transfer destinations: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    const destinations = rows
      .filter(row => row[0] && row[1]) // Must have both player name and new team
      .map(row => {
        const newTeamAbbr = row[1]?.trim().toUpperCase() || ''
        return {
          playerName: row[0]?.trim() || '',
          newTeam: newTeamAbbr,  // Keep for backward compat
          newTeamTid: newTeamAbbr ? getTidFromAbbr(newTeamAbbr, dynastyTeams) : null  // PRIMARY identifier
        }
      })

    return destinations
  } catch (error) {
    console.error('Error reading transfer destinations:', error)
    throw error
  }
}

/**
 * Create a Roster History sheet for bulk-updating teamsByYear
 * Columns: Player Name | PID | 2025 Team | 2026 Team
 */
export async function createRosterHistorySheet(dynastyName, years = [2025, 2026], dynastyTeams = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()
    const teams = getTeamsWithCustom(dynastyTeams)
    const allTeamAbbrs = Object.keys(teams).sort()

    // Create spreadsheet
    const createResponse = await fetchWithTimeout(`${SHEETS_API_BASE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Roster History`
        },
        sheets: [{
          properties: {
            title: 'Roster History',
            gridProperties: { rowCount: 500, columnCount: 2 + years.length, frozenRowCount: 1 }
          }
        }]
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(`Failed to create sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Build header row: Player Name, PID, then year columns
    const headers = ['Player Name', 'PID', ...years.map(y => `${y} Team`)]

    // Build requests for formatting
    const requests = []

    // Header formatting
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    })

    // Column widths
    requests.push(
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } }
    )
    years.forEach((_, i) => {
      requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2 + i, endIndex: 3 + i }, properties: { pixelSize: 100 }, fields: 'pixelSize' } })
    })

    // Set default white background with black text for data cells (year columns)
    years.forEach((_, i) => {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 2 + i, endColumnIndex: 3 + i },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1 },
              textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } },
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
        }
      })
    })

    // Add dropdowns for each year column (rows 2-500). Strict: only
    // dropdown values allowed — empty string is in the value list so
    // blank cells (year-not-on-team) still pass validation. The strict
    // flag prevents typos sneaking through as free text.
    years.forEach((_, i) => {
      requests.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 2 + i, endColumnIndex: 3 + i },
          rule: {
            condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: '' }, ...allTeamAbbrs.map(abbr => ({ userEnteredValue: abbr }))] },
            showCustomUi: true,
            strict: true
          }
        }
      })
    })

    // Add conditional formatting for each team's colors (for each year column)
    years.forEach((_, yearIndex) => {
      allTeamAbbrs.forEach(abbr => {
        const teamInfo = teams[abbr]
        if (teamInfo?.backgroundColor) {
          const bgColor = hexToRgb(teamInfo.backgroundColor)
          const textColor = hexToRgb(teamInfo.textColor || '#FFFFFF')
          requests.push({
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 2 + yearIndex, endColumnIndex: 3 + yearIndex }],
                booleanRule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: abbr }] },
                  format: {
                    backgroundColor: { red: bgColor.r / 255, green: bgColor.g / 255, blue: bgColor.b / 255 },
                    textFormat: { foregroundColor: { red: textColor.r / 255, green: textColor.g / 255, blue: textColor.b / 255 }, bold: true }
                  }
                }
              },
              index: 0
            }
          })
        }
      })
    })

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row',
          warningOnly: true
        }
      }
    })

    // Apply formatting
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    })

    // Write headers
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster History!A1:${String.fromCharCode(65 + headers.length - 1)}1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [headers] })
    })

    // Share publicly for embedding
    await shareSheetPublicly(spreadsheetId, accessToken)

    return { spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` }
  } catch (error) {
    console.error('Error creating roster history sheet:', error)
    throw error
  }
}

/**
 * Prefill roster history sheet with player data
 */
export async function prefillRosterHistorySheet(spreadsheetId, players, years = [2025, 2026]) {
  try {
    const accessToken = await getAccessToken()

    // Build data rows: Player Name, PID, team for each year
    const getTeamForYear = (player, year) => {
      return player.teamsByYear?.[year] || player.team || ''
    }

    const rows = players
      .filter(p => !p.isHonorOnly) // Exclude honor-only players
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(p => {
        const row = [p.name || '', p.pid || '']
        years.forEach(year => {
          row.push(getTeamForYear(p, year))
        })
        return row
      })

    if (rows.length === 0) return

    const endCol = String.fromCharCode(65 + 1 + years.length) // A=65, so 2+years.length columns
    await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster History!A2:${endCol}${rows.length + 1}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: rows })
    })
  } catch (error) {
    console.error('Error prefilling roster history sheet:', error)
    throw error
  }
}

/**
 * Read roster history from sheet
 * Returns array of { playerName, pid, teamsByYear: { year: team } }
 */
export async function readRosterHistoryFromSheet(spreadsheetId, years = [2025, 2026], dynastyTeams = null, opts = {}) {
  try {
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()
      const endCol = String.fromCharCode(65 + 1 + years.length)

      const response = await fetchWithTimeout(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster History!A2:${endCol}500`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read roster history: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    return rows
      .filter(row => row[0]) // Must have a name. PID (col B) may be blank — the
      // user can't know internal PIDs; the modal falls back to name matching.
      .map(row => {
        const teamsByYear = {}
        const teamsByYearTid = {}  // New tid-based version
        years.forEach((year, i) => {
          const team = row[2 + i]?.trim().toUpperCase()
          if (team) {
            teamsByYear[year] = team  // Keep abbr for backward compat
            const tid = getTidFromAbbr(team, dynastyTeams)
            if (tid) teamsByYearTid[year] = tid  // PRIMARY identifier
          }
        })
        return {
          playerName: row[0]?.trim() || '',
          pid: parseInt(row[1]) || null,
          teamsByYear,      // Keep for backward compat
          teamsByYearTid    // PRIMARY identifier for teambuilder support
        }
      })
  } catch (error) {
    console.error('Error reading roster history:', error)
    throw error
  }
}

/**
 * Create Portal Transfer Class Assignment sheet
 * For assigning classes to incoming portal transfers on Signing Day
 * @param {string} dynastyName - Dynasty name
 * @param {number} year - The offseason year (e.g., 2026 for the 2026 recruiting cycle)
 * @param {Array} portalTransfers - Array of { name, position, pid, year (current class) }
 */
export async function createPortalTransferClassSheet(dynastyName, year, portalTransfers) {
  try {
    const accessToken = await getAccessToken()

    // Sort transfers by position order (QB -> P)
    const positionOrder = [
      'QB', 'HB', 'FB', 'WR', 'TE',
      'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG',
      'LE', 'RE', 'LEDG', 'REDG', 'EDGE', 'DT',
      'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL', 'OLB', 'LB',
      'CB', 'FS', 'SS', 'S', 'K', 'P'
    ]
    const sortedTransfers = [...portalTransfers].sort((a, b) => {
      const posA = positionOrder.indexOf(a.position) !== -1 ? positionOrder.indexOf(a.position) : 999
      const posB = positionOrder.indexOf(b.position) !== -1 ? positionOrder.indexOf(b.position) : 999
      if (posA !== posB) return posA - posB
      // Secondary sort by name
      return (a.name || '').localeCompare(b.name || '')
    })

    const totalRows = Math.max(sortedTransfers.length, 10)

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Portal Transfer Class Assignment ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Portal Transfers',
              gridProperties: {
                rowCount: totalRows + 1,
                columnCount: 5, // A-E: Name, Position, Current Class, New Class, Jersey #
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create portal transfer class sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize the sheet with headers and data
    await initializePortalTransferClassSheet(
      sheet.spreadsheetId,
      accessToken,
      sheetId,
      sortedTransfers,
      totalRows,
      year
    )

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating portal transfer class sheet:', error)
    throw error
  }
}

// Get class progression options for a given incoming class
function getPortalTransferClassOptions(incomingClass) {
  // Portal transfers can come in as Fr, So, or Jr
  // Each has options: stay same (with RS prefix), progress, or progress with RS
  const baseClass = incomingClass?.replace('RS ', '') || 'Fr'

  switch (baseClass) {
    case 'Fr':
      return ['RS Fr', 'So', 'RS So']
    case 'So':
      return ['RS So', 'Jr', 'RS Jr']
    case 'Jr':
      return ['RS Jr', 'Sr', 'RS Sr']
    default:
      return ['RS Fr', 'So', 'RS So'] // Default to Fr options
  }
}

// Initialize the Portal Transfer Class sheet with headers, validation, and pre-filled data
async function initializePortalTransferClassSheet(spreadsheetId, accessToken, sheetId, transfers, totalRows, year) {
  // Build pre-filled rows for transfers.
  // Support both 'year' and 'incomingClass' field names for flexibility.
  // Col E "Jersey #" — pre-fill with whatever jersey the player already
  // has on the roster (typically blank for new transfers); user can
  // overwrite if needed.
  const dataRows = transfers.map(transfer => {
    const j = transfer.jerseyNumber
    const jerseyCell = (j != null && j !== '' && !Number.isNaN(Number(j)))
      ? { userEnteredValue: { numberValue: Number(j) } }
      : { userEnteredValue: { stringValue: '' } }
    return {
      values: [
        { userEnteredValue: { stringValue: String(transfer.name ?? '') } },
        { userEnteredValue: { stringValue: String(transfer.position ?? '') } },
        { userEnteredValue: { stringValue: String(transfer.incomingClass ?? transfer.year ?? 'Fr') } }, // Current class they came in as
        { userEnteredValue: { stringValue: '' } }, // New Class - user selects from dropdown
        jerseyCell // Jersey # - user fills in
      ]
    }
  })

  const requests = [
    // Set headers
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' } },
            { userEnteredValue: { stringValue: 'Position' } },
            { userEnteredValue: { stringValue: `${year} Recruitment Class` } },
            { userEnteredValue: { stringValue: `Updated ${year + 1} Class` } },
            { userEnteredValue: { stringValue: 'Jersey #' } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill transfer data
    {
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: transfers.length + 1, startColumnIndex: 0, endColumnIndex: 5 },
        rows: dataRows,
        fields: 'userEnteredValue'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row',
          warningOnly: false
        }
      }
    },
    // Protect Player column (column A)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 1 },
          description: 'Player names',
          warningOnly: false
        }
      }
    },
    // Protect Position column (column B)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 1, endColumnIndex: 2 },
          description: 'Positions',
          warningOnly: false
        }
      }
    },
    // Protect Current Class column (column C)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 2, endColumnIndex: 3 },
          description: 'Current Class',
          warningOnly: false
        }
      }
    },
    // Format header row - bold, background color
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Format all data cells - center aligned
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 160 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 90 },
        fields: 'pixelSize'
      }
    },
    // Highlight Updated Class column with light background
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 3, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 0.8 },
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
      }
    },
    // Highlight Jersey # column with the same light background — both
    // are user-editable columns and should share the visual cue.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 4, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 0.8 },
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
      }
    },
    // Jersey # validation — integer 0..99, strict but allow blank
    // (the empty-string sentinel value sneaks through strict-mode).
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 4, endColumnIndex: 5 },
        rule: {
          condition: {
            type: 'NUMBER_BETWEEN',
            values: [
              { userEnteredValue: '0' },
              { userEnteredValue: '99' }
            ]
          },
          showCustomUi: true,
          strict: false // allow blank cells for unknown jerseys
        }
      }
    },
    // Add auto-filter to header row for sorting/filtering
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: totalRows + 1,
            startColumnIndex: 0,
            endColumnIndex: 5
          }
        }
      }
    }
  ]

  // Add per-row data validation based on each transfer's current class
  transfers.forEach((transfer, index) => {
    const rowIndex = index + 1 // 1-based (skip header)
    const transferClass = transfer.incomingClass || transfer.year || 'Fr'
    const options = getPortalTransferClassOptions(transferClass)

    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: options.map(opt => ({ userEnteredValue: opt }))
          },
          showCustomUi: true,
          strict: true
        }
      }
    })
  })

  await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

/**
 * Read portal transfer class selections from sheet
 * @param {string} spreadsheetId - The Google Sheet ID
 * @returns {Array} Array of { playerName, position, currentClass, newClass, pid }
 */
export async function readPortalTransferClassFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      // Read columns A through E (col E = Jersey #). Older sheets that
      // were created before the Jersey # column was added are 4 cols wide;
      // the extra range just returns shorter rows and row[4] is undefined.
      const range = encodeURIComponent("'Portal Transfers'!A2:E100")
      const response = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read portal transfer class: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    const results = rows
      .filter(row => row[0] && row[3]) // Must have player name and new class
      .map(row => {
        // Jersey is optional — parse to a number if present, else null.
        const jerseyRaw = (row[4] ?? '').toString().trim()
        const jerseyParsed = jerseyRaw === '' ? null : Number(jerseyRaw)
        const jerseyNumber = (Number.isFinite(jerseyParsed) && jerseyParsed >= 0 && jerseyParsed <= 99)
          ? jerseyParsed
          : null
        return {
          playerName: row[0]?.trim() || '',
          position: row[1]?.trim() || '',
          currentClass: row[2]?.trim() || '',
          selectedClass: row[3]?.trim() || '', // Use selectedClass to match handler expectations
          jerseyNumber
        }
      })
      .filter(r => r.selectedClass) // Must have a class selected

    return results
  } catch (error) {
    console.error('Error reading portal transfer class:', error)
    throw error
  }
}

/**
 * Create Fringe Case Class Assignment sheet
 * For players who played 5-9 games and might have redshirted if they played fewer
 * @param {string} dynastyName - Dynasty name
 * @param {number} year - The offseason year
 * @param {Array} fringeCasePlayers - Array of { name, position, pid, year (current class), gamesPlayed }
 */
export async function createFringeCaseClassSheet(dynastyName, year, fringeCasePlayers) {
  try {
    const accessToken = await getAccessToken()

    // Sort players by last name
    const sortedPlayers = [...fringeCasePlayers].sort((a, b) => {
      const getLastName = (name) => {
        if (!name) return ''
        const parts = name.trim().split(' ')
        return parts[parts.length - 1].toLowerCase()
      }
      return getLastName(a.name).localeCompare(getLastName(b.name))
    })

    const totalRows = Math.max(sortedPlayers.length, 10)

    // Create the spreadsheet
    const response = await fetchWithTimeout(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Fringe Case Class Assignment ${year}`
        },
        sheets: [
          {
            properties: {
              title: 'Fringe Cases',
              gridProperties: {
                rowCount: totalRows + 1,
                columnCount: 5,
                frozenRowCount: 1
              }
            }
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create fringe case class sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize the sheet with headers and data
    await initializeFringeCaseClassSheet(
      sheet.spreadsheetId,
      accessToken,
      sheetId,
      sortedPlayers,
      totalRows,
      year
    )

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating fringe case class sheet:', error)
    throw error
  }
}

// Get class options for fringe case players (progressed class vs redshirt version)
function getFringeCaseClassOptions(currentClass) {
  const isRS = currentClass?.startsWith('RS ') || false
  const baseClass = currentClass?.replace('RS ', '') || 'Fr'

  // Map current class to progressed options
  const progressionMap = {
    'Fr': ['So', 'RS Fr'], // Progressed to So, or redshirt to RS Fr
    'So': ['Jr', 'RS So'],
    'Jr': ['Sr', 'RS Jr'],
    'Sr': ['RS Sr'], // Can only redshirt
    'RS Fr': ['RS So'], // Already RS, just progresses
    'RS So': ['RS Jr'],
    'RS Jr': ['RS Sr'],
    'RS Sr': [] // No progression possible
  }

  return progressionMap[currentClass] || [baseClass]
}

// Initialize the Fringe Case Class sheet with headers, validation, and pre-filled data
async function initializeFringeCaseClassSheet(spreadsheetId, accessToken, sheetId, players, totalRows, year) {
  // Build pre-filled rows for players
  // Support both 'year'/'currentClass' and 'gamesPlayed'/'gameCount' field names for flexibility
  const dataRows = players.map(player => {
    // Default to progressed class (first option)
    const playerClass = player.currentClass || player.year || 'Fr'
    const games = player.gameCount || player.gamesPlayed || 0
    const options = getFringeCaseClassOptions(playerClass)
    const defaultClass = options[0] || playerClass

    return {
      values: [
        { userEnteredValue: { stringValue: String(player.name ?? '') } },
        { userEnteredValue: { stringValue: String(player.position ?? '') } },
        { userEnteredValue: { stringValue: String(playerClass ?? '') } }, // Current class
        { userEnteredValue: { numberValue: Number(games) || 0 } }, // Games played
        { userEnteredValue: { stringValue: String(defaultClass ?? '') } } // New Class - pre-filled with progressed class
      ]
    }
  })

  const requests = [
    // Set headers
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' } },
            { userEnteredValue: { stringValue: 'Position' } },
            { userEnteredValue: { stringValue: `${year} Recruitment Class` } },
            { userEnteredValue: { stringValue: 'Games' } },
            { userEnteredValue: { stringValue: `Updated ${year + 1} Class` } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill player data
    {
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: players.length + 1, startColumnIndex: 0, endColumnIndex: 5 },
        rows: dataRows,
        fields: 'userEnteredValue'
      }
    },
    // Protect header row
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row',
          warningOnly: false
        }
      }
    },
    // Protect Player column (column A)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 1 },
          description: 'Player names',
          warningOnly: false
        }
      }
    },
    // Protect Position column (column B)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 1, endColumnIndex: 2 },
          description: 'Positions',
          warningOnly: false
        }
      }
    },
    // Protect Current Class column (column C)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 2, endColumnIndex: 3 },
          description: 'Current Class',
          warningOnly: false
        }
      }
    },
    // Protect Games column (column D)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 3, endColumnIndex: 4 },
          description: 'Games Played',
          warningOnly: false
        }
      }
    },
    // Format header row - bold, background color
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    },
    // Format all data cells - center aligned
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 0, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    },
    // Set column widths
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 70 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 160 },
        fields: 'pixelSize'
      }
    },
    // Highlight Updated Class column with light background
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: totalRows + 1, startColumnIndex: 4, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 0.8 },
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
      }
    }
  ]

  // Add per-row data validation based on each player's current class
  players.forEach((player, index) => {
    const rowIndex = index + 1 // 1-based (skip header)
    const playerClass = player.currentClass || player.year || 'Fr'
    const options = getFringeCaseClassOptions(playerClass)

    if (options.length > 0) {
      requests.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 4, endColumnIndex: 5 },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: options.map(opt => ({ userEnteredValue: opt }))
            },
            showCustomUi: true,
            strict: true
          }
        }
      })
    }
  })

  await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

/**
 * Read fringe case class selections from sheet
 * @param {string} spreadsheetId - The Google Sheet ID
 * @returns {Array} Array of { playerName, position, currentClass, gamesPlayed, newClass }
 */
export async function readFringeCaseClassFromSheet(spreadsheetId, dynastyTeams = null, opts = {}) {
  try {
    // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
    let rows
    if (opts.rows) {
      rows = opts.rows
    } else {
      const accessToken = await getAccessToken()

      const range = encodeURIComponent("'Fringe Cases'!A2:E100")
      const response = await fetchWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Failed to read fringe case class: ${error.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      rows = data.values || []
    }

    const results = rows
      .filter(row => row[0] && row[4]) // Must have player name and new class
      .map(row => ({
        playerName: row[0]?.trim() || '',
        position: row[1]?.trim() || '',
        currentClass: row[2]?.trim() || '',
        gamesPlayed: parseInt(row[3]) || 0,
        selectedClass: row[4]?.trim() || ''  // Use selectedClass to match handler expectations
      }))
      .filter(r => r.selectedClass) // Must have a class selected

    return results
  } catch (error) {
    console.error('Error reading fringe case class:', error)
    throw error
  }
}

// ──────────────────────────────────────────────────────────────────────
// TOP 25 RANKINGS SHEET
//
// One spreadsheet per dynasty. One tab per year present in the dynasty
// (current year first, then descending). Each tab is a 26-row × 22-col
// grid: row 1 = column headers ("Rank", "Preseason", "Week 1" … "Week
// 15", "CC", "CFP-1", "CFP-Q", "CFP-S", "Natty"); rows 2-26 = ranks
// 1-25; the rank label sits in column A, every other cell holds a team
// abbreviation (or blank for unranked slots).
//
// Cells use a strict ONE_OF_LIST data validation built from every team
// in dynasty.teams — typos / unknown abbrs are rejected at the cell
// level, so a careless edit can't silently corrupt the rank slot.
// Conditional formatting paints each cell with the team's primary /
// secondary colors as soon as a valid abbr lands.
//
// Pre-fill comes from dynasty.teams[tid].byYear[year].rankByWeek — the
// same store every other read site uses. Sync-back inverts the layout:
// for each non-empty cell, look up the team's tid by abbr and write
// rankByWeek[year][weekKey] = rank.
// ──────────────────────────────────────────────────────────────────────

// Week-key columns. Order matches the headers on the sheet.
// Slot 15 is the canonical Conference Championship Week rank slot —
// post-Week-14, pre-CCG-game poll. WeeklyScoresModal writes there when
// the dynasty is in CCG phase, and getTeamRanking anchors there for
// CCG-phase reads. The phantom slot 100 ('CC' label) was a leftover
// from when the schema had two adjacent CCG-week slots; nothing ever
// wrote to 100, but its presence as a column on the Top 25 sheet led
// users to enter CCG rankings into a dead column. Dropped here so the
// sheet exposes ONE clearly-labeled CCG column at slot 15, and any
// stray slot-100 data is migrated to slot 15 in the dynasty loader.
const TOP25_WEEK_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 101, 102, 103, 104, 105]
const TOP25_WEEK_LABELS = {
  0: 'Preseason',
  16: 'CCG',
  101: 'CFP-1',
  102: 'CFP-Q',
  103: 'CFP-S',
  104: 'Natty',
  105: 'Final',
}
const TOP25_NUM_RANKS = 25

function top25WeekHeader(weekKey) {
  if (TOP25_WEEK_LABELS[weekKey]) return TOP25_WEEK_LABELS[weekKey]
  return `Week ${weekKey}`
}

// columnIndex 0 = Rank label column, 1..21 = each TOP25_WEEK_KEYS slot.
function top25WeekColumnIndex(weekKey) {
  const i = TOP25_WEEK_KEYS.indexOf(weekKey)
  return i >= 0 ? i + 1 : -1
}

// Build the 26-row × 22-col data block for one year's tab. Rows are
// arrays so the shape matches the Sheets API expectations directly.
function buildTop25TabRows(dynasty, year) {
  const yearKey = String(year)
  const yearKeyNum = Number(year)
  // Header row.
  const header = ['Rank']
  for (const wk of TOP25_WEEK_KEYS) header.push(top25WeekHeader(wk))

  // Initialize 25 empty data rows.
  const dataRows = []
  for (let r = 1; r <= TOP25_NUM_RANKS; r++) {
    const row = [`#${r}`]
    for (let c = 0; c < TOP25_WEEK_KEYS.length; c++) row.push('')
    dataRows.push(row)
  }

  // Walk every team in dynasty.teams and place its rankByWeek entries
  // into the right (rank, week) slots. First team to claim a (rank,
  // week) cell wins on conflict — same defensive policy as the
  // Rankings page.
  const teams = dynasty?.teams || {}
  for (const team of Object.values(teams)) {
    if (!team?.abbr) continue
    const rbw = team?.byYear?.[yearKeyNum]?.rankByWeek
      ?? team?.byYear?.[yearKey]?.rankByWeek
    if (!rbw) continue
    for (const [k, v] of Object.entries(rbw)) {
      const wk = Number(k)
      if (!Number.isFinite(wk)) continue
      const colIdx = top25WeekColumnIndex(wk)
      if (colIdx < 0) continue
      const rank = Number(v)
      if (!Number.isFinite(rank) || rank < 1 || rank > TOP25_NUM_RANKS) continue
      const rowIdx = rank - 1
      // Only fill if empty (defensive against accidental dupes).
      if (!dataRows[rowIdx][colIdx]) dataRows[rowIdx][colIdx] = team.abbr
    }
  }

  return [header, ...dataRows]
}

/**
 * Create the Top 25 rankings spreadsheet — one tab per year that has
 * at least some data in the dynasty (games, rankByWeek, or final
 * poll). Pre-filled from rankByWeek.
 */
export async function createTop25Sheet(dynastyName, dynasty) {
  if (!dynasty) throw new Error('createTop25Sheet: dynasty is required')

  // Determine which years to include. Union of:
  //   - every year with at least one stored game
  //   - every year present in finalPollsByYear
  //   - every year present in any team's byYear with a rankByWeek
  //   - the current year (so the freshly-current season always shows)
  const years = new Set()
  for (const g of (dynasty.games || [])) {
    const y = Number(g?.year)
    if (Number.isFinite(y)) years.add(y)
  }
  for (const k of Object.keys(dynasty.finalPollsByYear || {})) {
    const y = Number(k)
    if (Number.isFinite(y)) years.add(y)
  }
  for (const team of Object.values(dynasty.teams || {})) {
    for (const k of Object.keys(team?.byYear || {})) {
      const y = Number(k)
      if (Number.isFinite(y) && team.byYear[k]?.rankByWeek) years.add(y)
    }
  }
  if (dynasty.currentYear) years.add(Number(dynasty.currentYear))
  const orderedYears = [...years].filter(y => Number.isFinite(y)).sort((a, b) => b - a)

  if (orderedYears.length === 0) {
    throw new Error('createTop25Sheet: no years to render — dynasty has no game data, no rankByWeek entries, and no final polls.')
  }

  const accessToken = await getAccessToken()

  // Step 1 — create the spreadsheet with one sheet (tab) per year.
  const NUM_COLS = 1 + TOP25_WEEK_KEYS.length // rank label + 21 week cols
  const NUM_ROWS = 1 + TOP25_NUM_RANKS        // header + 25 ranks
  const createBody = {
    properties: { title: `${dynastyName} — Top 25 Rankings` },
    sheets: orderedYears.map(year => ({
      properties: {
        title: `${year} Top 25`,
        gridProperties: {
          rowCount: NUM_ROWS,
          columnCount: NUM_COLS,
          frozenRowCount: 1,
          frozenColumnCount: 1,
        },
      },
    })),
  }
  const createRes = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    throw new Error(`createTop25Sheet: Sheets API create failed — ${err.error?.message || createRes.status}`)
  }
  const sheet = await createRes.json()
  const sheetIdByYear = new Map()
  for (let i = 0; i < orderedYears.length; i++) {
    sheetIdByYear.set(orderedYears[i], sheet.sheets[i].properties.sheetId)
  }

  // Step 2 — pre-fill data for each tab via values batchUpdate.
  const valueRanges = []
  for (const year of orderedYears) {
    const rows = buildTop25TabRows(dynasty, year)
    valueRanges.push({
      range: `'${year} Top 25'!A1:${String.fromCharCode(64 + NUM_COLS)}${NUM_ROWS}`,
      majorDimension: 'ROWS',
      values: rows,
    })
  }
  const valuesRes = await fetch(
    `${SHEETS_API_BASE}/${sheet.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: valueRanges }),
    },
  )
  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}))
    throw new Error(`createTop25Sheet: values batchUpdate failed — ${err.error?.message || valuesRes.status}`)
  }

  // Step 3 — formatting + validation pass via sheets batchUpdate.
  // Split into two batches:
  //   3a (awaited)    — header / rank-label / alignment / validation
  //                      / column widths. Small (~6 reqs per year).
  //   3b (background) — per-team conditional formatting. Big (one
  //                      rule per team per year — ~140 teams ×
  //                      orderedYears.length, often 700+ requests).
  //                      Sending this synchronously made the
  //                      "Creating Top 25 Sheet…" loader hang for
  //                      tens of seconds on multi-year dynasties,
  //                      so it now runs after we return.
  const baseRequests = []
  const colorRequests = []
  const teamsMap = getTeamsWithCustom(dynasty.teams)
  const validationValues = Object.keys(teamsMap).sort().map(abbr => ({ userEnteredValue: abbr }))

  for (const year of orderedYears) {
    const sId = sheetIdByYear.get(year)

    // Header row formatting.
    baseRequests.push({
      repeatCell: {
        range: { sheetId: sId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.13, green: 0.14, blue: 0.18 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    })

    // Rank-label column (column A, rows 2-26).
    baseRequests.push({
      repeatCell: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.18, green: 0.19, blue: 0.23 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    })

    // Center-align all team-cell content.
    baseRequests.push({
      repeatCell: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 1, endColumnIndex: NUM_COLS },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true } } },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)',
      },
    })

    // Strict-dropdown validation on every team cell.
    baseRequests.push({
      setDataValidation: {
        range: { sheetId: sId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 1, endColumnIndex: NUM_COLS },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: validationValues },
          showCustomUi: true,
          strict: true,
        },
      },
    })

    // Per-team conditional formatting — paint cells in the team's
    // primary/secondary colors as soon as a valid abbr lands.
    // Deferred to the background batch (see comment above).
    for (const [abbr, teamData] of Object.entries(teamsMap)) {
      colorRequests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: sId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 1, endColumnIndex: NUM_COLS }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: abbr }] },
              format: {
                backgroundColor: hexToRgb(teamData.backgroundColor),
                textFormat: { foregroundColor: hexToRgb(teamData.textColor), bold: true, italic: true },
              },
            },
          },
          index: 0,
        },
      })
    }

    // Sensible column widths — narrow week columns + slightly wider rank label.
    baseRequests.push({
      updateDimensionProperties: {
        range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 64 },
        fields: 'pixelSize',
      },
    })
    baseRequests.push({
      updateDimensionProperties: {
        range: { sheetId: sId, dimension: 'COLUMNS', startIndex: 1, endIndex: NUM_COLS },
        properties: { pixelSize: 86 },
        fields: 'pixelSize',
      },
    })
  }

  const batchRes = await fetch(
    `${SHEETS_API_BASE}/${sheet.spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: baseRequests }),
    },
  )
  if (!batchRes.ok) {
    const err = await batchRes.json().catch(() => ({}))
    throw new Error(`createTop25Sheet: batchUpdate failed — ${err.error?.message || batchRes.status}`)
  }

  await shareSheetPublicly(sheet.spreadsheetId, accessToken)

  // Background: apply per-team conditional formatting. Fire-and-
  // forget — failures here are non-fatal (the sheet is fully
  // functional without team-color rules; only the visual coloring
  // is missing). Logged at warn level for diagnostics.
  if (colorRequests.length > 0) {
    fetch(
      `${SHEETS_API_BASE}/${sheet.spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: colorRequests }),
      },
    ).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('[createTop25Sheet] background color formatting failed:', err?.error?.message || res.status)
      }
    }).catch((err) => {
      console.warn('[createTop25Sheet] background color formatting threw:', err)
    })
  }

  return {
    spreadsheetId: sheet.spreadsheetId,
    spreadsheetUrl: sheet.spreadsheetUrl,
    years: orderedYears,
  }
}

/**
 * Read a Top 25 spreadsheet back into a per-year, per-team
 * rankByWeek diff. Returns:
 *
 *   {
 *     yearTotals: { 2034: { newCount, oldCount }, 2033: {...} },
 *     teamUpdates: {
 *       [tid]: {
 *         [year]: { [weekKey]: rank | null }   // null = clear that slot
 *       }
 *     },
 *     unknownAbbrs: [{ year, weekKey, rank, raw }],  // typos / unknown teams
 *   }
 *
 * The caller is responsible for showing a confirmation diff and
 * applying the updates with the appropriate guardrails.
 */
/**
 * Refresh the Top 25 sheet's data cells to match the dynasty's current
 * rankByWeek state. Called when re-opening an existing sheet so the
 * pre-fill stays in sync with weekly-scores saves that landed since
 * the sheet was created.
 *
 * Without this, a user who creates the sheet on Wk 3, saves Wks 4-12
 * via the weekly-scores flow, then opens the Top 25 sheet to fix one
 * cell, sees a "diff: 42 removed" because the sheet still reflects
 * the Wk 3 state — every rankByWeek entry that landed via weekly
 * saves looks like a deletion.
 *
 * Walks every "[year] Top 25" tab on the spreadsheet and rewrites the
 * data range with freshly-built rows from buildTop25TabRows. Header
 * stays identical, so we ignore that row and only stomp the 25 data
 * rows. Years that exist on the sheet but not in the dynasty get
 * cleared (data rows blanked); years that exist in the dynasty but
 * not on the sheet are NOT auto-added — that's a structural change
 * worth a fresh sheet, not a silent edit.
 */
export async function refreshTop25SheetData(spreadsheetId, dynasty) {
  if (!dynasty) throw new Error('refreshTop25SheetData: dynasty is required')
  const accessToken = await getAccessToken()

  const metaRes = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties(title)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}))
    throw new Error(`refreshTop25SheetData: meta fetch failed — ${err.error?.message || metaRes.status}`)
  }
  const meta = await metaRes.json()
  const tabs = (meta.sheets || []).map(s => s.properties).filter(Boolean)

  const NUM_COLS = 1 + TOP25_WEEK_KEYS.length
  const NUM_ROWS = 1 + TOP25_NUM_RANKS

  // Only refresh the dynasty's current year tab. Past-year tabs are
  // already protected from accidental deletions in readTop25FromSheet
  // (blank cells on past years are treated as "keep" not "remove"),
  // and refreshing them here would stomp any in-flight user edits to
  // past-year data. Future-year tabs are also left alone — the user
  // may be staging next season's preseason picture.
  const dynastyYear = Number(dynasty.currentYear)
  const valueRanges = []
  for (const t of tabs) {
    const m = t?.title?.match(/^(\d{4})\s+Top\s+25$/i)
    if (!m) continue
    const year = Number(m[1])
    if (!Number.isFinite(year)) continue
    if (Number.isFinite(dynastyYear) && year !== dynastyYear) continue
    const rows = buildTop25TabRows(dynasty, year)
    valueRanges.push({
      range: `'${t.title}'!A1:${String.fromCharCode(64 + NUM_COLS)}${NUM_ROWS}`,
      majorDimension: 'ROWS',
      values: rows,
    })
  }

  if (valueRanges.length === 0) return { refreshedTabs: 0 }

  const valuesRes = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: valueRanges }),
    },
  )
  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}))
    throw new Error(`refreshTop25SheetData: values batchUpdate failed — ${err.error?.message || valuesRes.status}`)
  }
  return { refreshedTabs: valueRanges.length }
}

export async function readTop25FromSheet(spreadsheetId, dynasty) {
  if (!dynasty) throw new Error('readTop25FromSheet: dynasty is required')

  const accessToken = await getAccessToken()
  // Resolve all tabs first so we know which years exist.
  const metaRes = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties(title,sheetId,gridProperties)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}))
    throw new Error(`readTop25FromSheet: meta fetch failed — ${err.error?.message || metaRes.status}`)
  }
  const meta = await metaRes.json()
  const tabs = (meta.sheets || []).map(s => s.properties)

  const NUM_COLS = 1 + TOP25_WEEK_KEYS.length
  const NUM_ROWS = 1 + TOP25_NUM_RANKS

  // Walk every "[year] Top 25" tab and read its data.
  const ranges = []
  const yearByRange = new Map()
  for (const t of tabs) {
    const m = t?.title?.match(/^(\d{4})\s+Top\s+25$/i)
    if (!m) continue
    const year = Number(m[1])
    const rng = `'${t.title}'!A1:${String.fromCharCode(64 + NUM_COLS)}${NUM_ROWS}`
    ranges.push(rng)
    yearByRange.set(rng, year)
  }
  if (ranges.length === 0) {
    return { yearTotals: {}, teamUpdates: {}, unknownAbbrs: [] }
  }
  const valuesRes = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}))
    throw new Error(`readTop25FromSheet: values batchGet failed — ${err.error?.message || valuesRes.status}`)
  }
  const valuesData = await valuesRes.json()

  // Build per-year, per-team map of new rank entries: { year: { tid: { weekKey: rank } } }.
  // Also count old vs new entries per year for the bulk-delete guardrail.
  // Track which (year → Set<weekKey>) had ANY entry in the sheet so the
  // removal-detection pass below knows which weeks the user actually touched.
  // Weeks with zero sheet entries are treated as "untouched" — existing
  // rankings for those weeks are preserved, not deleted.
  const yearTotals = {}
  const newEntriesByYear = {}
  const unknownAbbrs = []
  // year (number) → Set of weekKeys that had ≥1 entry in the sheet
  const weeksWithDataByYear = new Map()

  for (const r of (valuesData.valueRanges || [])) {
    const year = yearByRange.get(r.range) ?? yearByRange.get(decodeURIComponent(r.range))
    if (!year) continue
    const rows = r.values || []
    // Count old entries for this year (from current dynasty.teams).
    let oldCount = 0
    for (const team of Object.values(dynasty.teams || {})) {
      const rbw = team?.byYear?.[year]?.rankByWeek ?? team?.byYear?.[String(year)]?.rankByWeek
      if (!rbw) continue
      for (const v of Object.values(rbw)) {
        if (typeof v === 'number' && v >= 1 && v <= 25) oldCount += 1
      }
    }

    const yearMap = newEntriesByYear[year] || (newEntriesByYear[year] = {})
    if (!weeksWithDataByYear.has(year)) weeksWithDataByYear.set(year, new Set())
    const touchedWeeks = weeksWithDataByYear.get(year)
    let newCount = 0
    // Skip header row 0; data rows 1..25 = ranks 1..25.
    for (let rIdx = 1; rIdx <= TOP25_NUM_RANKS; rIdx++) {
      const row = rows[rIdx] || []
      const rank = rIdx
      // Column 0 is the rank label; week columns start at 1.
      for (let cIdx = 1; cIdx < NUM_COLS; cIdx++) {
        const raw = (row[cIdx] || '').trim()
        if (!raw) continue
        const weekKey = TOP25_WEEK_KEYS[cIdx - 1]
        // Resolve tolerantly (team name / abbr / mascot-stripped school name).
        const tid = getTidFromTeamText(raw, dynasty.teams)
        if (tid == null) {
          unknownAbbrs.push({ year, weekKey, rank, raw })
          continue
        }
        const tidKey = String(tid)
        const teamMap = yearMap[tidKey] || (yearMap[tidKey] = {})
        teamMap[weekKey] = rank
        touchedWeeks.add(weekKey)   // mark this week as having been used
        newCount += 1
      }
    }
    yearTotals[year] = { oldCount, newCount }
  }

  // Convert to teamUpdates shape: { [tid]: { [year]: { [weekKey]: rank | null } } }.
  // For weeks that WERE touched in the sheet, include explicit `null` entries
  // for every old slot not carried forward — tells the caller to clear those.
  // Weeks that had NO entries in the sheet are left completely alone; a blank
  // column means "user didn't touch this week," not "user wants it deleted."
  //
  // Example: user adds Bama Wk 4 #13. Only Week 4 is touched. UNC Wk 3 #18
  // and WASH Wk 3 #9 are untouched (Week 3 had no sheet entries) → preserved.
  const teamUpdates = {}
  // Seed teamUpdates with new entries.
  for (const [year, byTid] of Object.entries(newEntriesByYear)) {
    for (const [tidKey, weekMap] of Object.entries(byTid)) {
      const tEntry = teamUpdates[tidKey] || (teamUpdates[tidKey] = {})
      tEntry[year] = { ...weekMap }
    }
  }
  // For each year present in the read, walk all teams that had an old
  // rankByWeek entry and add nulls for any weekKey that:
  //   (a) was touched in the sheet (had ≥1 entry for that week), AND
  //   (b) no longer has an entry for this specific team.
  //
  // PAST-YEAR PROTECTION: for years strictly before the dynasty's
  // current year, skip removal-entry generation entirely.
  const dynastyCurrentYear = Number(dynasty.currentYear)
  for (const yearStr of Object.keys(yearTotals)) {
    const yearNum = Number(yearStr)
    if (Number.isFinite(dynastyCurrentYear) && yearNum < dynastyCurrentYear) {
      // Past year — skip removal-entry generation entirely.
      continue
    }
    // Weeks that had ≥1 entry in the sheet for this year.
    const touchedWeeks = weeksWithDataByYear.get(yearNum) || new Set()
    if (touchedWeeks.size === 0) continue  // sheet was completely empty for this year

    for (const [tidKey, team] of Object.entries(dynasty.teams || {})) {
      const oldRbw = team?.byYear?.[yearNum]?.rankByWeek
        ?? team?.byYear?.[yearStr]?.rankByWeek
      if (!oldRbw) continue
      const newWeekMap = teamUpdates[tidKey]?.[yearStr] || {}
      for (const k of Object.keys(oldRbw)) {
        const wk = Number(k)
        if (!Number.isFinite(wk)) continue
        // ONLY generate a removal if this week was touched in the sheet.
        // An entirely-blank week column means the user didn't engage with
        // that week at all — don't treat it as "user cleared all rankings."
        if (!touchedWeeks.has(wk)) continue
        if (oldRbw[k] != null && !(wk in newWeekMap) && !(String(wk) in newWeekMap)) {
          if (!teamUpdates[tidKey]) teamUpdates[tidKey] = {}
          if (!teamUpdates[tidKey][yearStr]) teamUpdates[tidKey][yearStr] = {}
          teamUpdates[tidKey][yearStr][wk] = null
        }
      }
    }
  }

  return { yearTotals, teamUpdates, unknownAbbrs }
}

// Week options for the local Top 25 paste picker (one entry per rankByWeek key).
export function getTop25WeekOptions() {
  const label = (w) => {
    if (w === 0) return 'Preseason'
    if (w === 16) return 'Conf Championships'
    if (w === 101) return 'CFP First Round'
    if (w === 102) return 'CFP Quarterfinals'
    if (w === 103) return 'CFP Semifinals'
    if (w === 104) return 'National Championship'
    if (w === 105) return 'Final'
    return `Week ${w}`
  }
  return TOP25_WEEK_KEYS.map((w) => ({ key: w, label: label(w) }))
}

// Local (no-Google) counterpart of readTop25FromSheet, scoped to ONE (year,
// week). The user pastes a single week's poll (Rank<TAB>Abbr, or a bare Abbr
// per line with rank = line order) and this returns the SAME { yearTotals,
// teamUpdates, unknownAbbrs } shape the grid reader does — so buildTop25Diff /
// applyTop25SheetDiff and the whole confirm-and-apply pipeline are reused
// unchanged. Only the selected week is "touched", so every other week's
// existing rankings are preserved exactly as the sheet reader would.
export function parseTop25WeekLocal(rows, dynasty, year, weekKey) {
  if (!dynasty) throw new Error('parseTop25WeekLocal: dynasty is required')
  const yearNum = Number(year)
  const yearStr = String(yearNum)
  const wk = Number(weekKey)

  const newEntries = {} // tidKey -> rank
  const unknownAbbrs = []
  let seq = 0
  for (const row of (rows || [])) {
    // Accept "<rank>\t<abbr>" OR a bare "<abbr>" (rank = running line order).
    // A rank-only row ("15" with no team) is an intentionally-empty rank slot —
    // detect it by a leading numeric cell even when the team cell is blank (a
    // "15\t" line splits to just ["15"]), so it's skipped as blank below rather
    // than misread as a team literally named "15".
    let rank
    let rawAbbr
    if (/^\d{1,2}$/.test(String(row[0] ?? '').trim())) {
      rank = parseInt(row[0], 10)
      rawAbbr = String(row[1] || '').trim()
    } else {
      rawAbbr = String(row[0] || '').trim()
      rank = seq + 1
    }
    if (!rawAbbr) continue
    if (!(rank >= 1 && rank <= TOP25_NUM_RANKS)) continue
    seq = Math.max(seq, rank)
    // Resolve tolerantly: the poll grid + AI prompt emit team NAMES, not abbrs.
    const tid = getTidFromTeamText(rawAbbr, dynasty.teams)
    if (tid == null) {
      unknownAbbrs.push({ year: yearNum, weekKey: wk, rank, raw: rawAbbr })
      continue
    }
    newEntries[String(tid)] = rank
  }

  const newCount = Object.keys(newEntries).length
  // oldCount across ALL weeks of the year — same guardrail input the reader uses.
  let oldCount = 0
  for (const team of Object.values(dynasty.teams || {})) {
    const rbw = team?.byYear?.[yearNum]?.rankByWeek ?? team?.byYear?.[yearStr]?.rankByWeek
    if (!rbw) continue
    for (const v of Object.values(rbw)) {
      if (typeof v === 'number' && v >= 1 && v <= 25) oldCount += 1
    }
  }
  const yearTotals = { [yearNum]: { oldCount, newCount } }

  // Seed new entries for the selected week.
  const teamUpdates = {}
  for (const [tidKey, rank] of Object.entries(newEntries)) {
    teamUpdates[tidKey] = { [yearStr]: { [wk]: rank } }
  }

  // Removal nulls: the selected week IS touched, so any team that had an old
  // rank THIS week but isn't in the paste gets cleared. Past years are
  // protected (never generate removals), matching the reader.
  const dynastyCurrentYear = Number(dynasty.currentYear)
  if (!(Number.isFinite(dynastyCurrentYear) && yearNum < dynastyCurrentYear)) {
    for (const [tidKey, team] of Object.entries(dynasty.teams || {})) {
      const oldRbw = team?.byYear?.[yearNum]?.rankByWeek ?? team?.byYear?.[yearStr]?.rankByWeek
      if (!oldRbw) continue
      const hasOldThisWeek = oldRbw[wk] != null || oldRbw[String(wk)] != null
      if (!hasOldThisWeek) continue
      const carried = teamUpdates[tidKey]?.[yearStr] || {}
      if (!(wk in carried) && !(String(wk) in carried)) {
        if (!teamUpdates[tidKey]) teamUpdates[tidKey] = {}
        if (!teamUpdates[tidKey][yearStr]) teamUpdates[tidKey][yearStr] = {}
        teamUpdates[tidKey][yearStr][wk] = null
      }
    }
  }

  return { yearTotals, teamUpdates, unknownAbbrs }
}

// ──────────────────────────────────────────────────────────────────────
// PRESEASON TOP 25 SHEET
//
// Single-tab spreadsheet dedicated to one year's preseason poll. Two
// columns × 26 rows: Rank label in column A (frozen, pre-filled #1
// through #25), team abbr in column B (strict ONE_OF_LIST dropdown
// against every team in dynasty.teams). Per-team conditional
// formatting paints the cell as soon as a valid abbr lands — same
// pattern as the schedule and full Top 25 sheets.
//
// Pre-fill comes from dynasty.preseasonRankingsByYear[year] when
// present; otherwise from each team's rankByWeek[0] (= the team's
// preseason rank if it was previously seeded). First valid match
// for each rank slot wins.
// ──────────────────────────────────────────────────────────────────────

const PRESEASON_NUM_RANKS = 25

/**
 * Create a one-tab preseason Top 25 spreadsheet for the given year.
 * Pre-filled from existing preseason data when available.
 */
export async function createPreseasonRankingsSheet(dynastyName, year, dynasty) {
  if (!dynasty) throw new Error('createPreseasonRankingsSheet: dynasty is required')
  if (!year) throw new Error('createPreseasonRankingsSheet: year is required')

  const accessToken = await getAccessToken()
  const NUM_COLS = 2
  const NUM_ROWS = 1 + PRESEASON_NUM_RANKS

  // Step 1 — create the spreadsheet.
  const createRes = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: `${dynastyName} — ${year} Preseason Top 25` },
      sheets: [{
        properties: {
          title: `${year} Preseason Top 25`,
          gridProperties: {
            rowCount: NUM_ROWS,
            columnCount: NUM_COLS,
            frozenRowCount: 1,
            frozenColumnCount: 1,
          },
        },
      }],
    }),
  })
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    throw new Error(`createPreseasonRankingsSheet: create failed — ${err.error?.message || createRes.status}`)
  }
  const sheet = await createRes.json()
  const sheetId = sheet.sheets[0].properties.sheetId

  // Step 2 — pre-fill rows.
  // Look up existing rank → abbr pairs from the dynasty.
  const yearKeyNum = Number(year)
  const yearKeyStr = String(year)
  const presByYear = dynasty.preseasonRankingsByYear || {}
  const seedFromPoll = presByYear[yearKeyNum] || presByYear[yearKeyStr] || []
  const byRank = new Map()
  for (const e of (Array.isArray(seedFromPoll) ? seedFromPoll : [])) {
    if (!e || typeof e.rank !== 'number' || e.rank < 1 || e.rank > PRESEASON_NUM_RANKS) continue
    const abbr = e.tid != null
      ? (dynasty.teams?.[e.tid]?.abbr || dynasty.teams?.[String(e.tid)]?.abbr)
      : e.team
    if (abbr) byRank.set(e.rank, abbr)
  }
  // Fall back to rankByWeek[0] for any rank slot still empty.
  for (const team of Object.values(dynasty.teams || {})) {
    if (!team?.abbr) continue
    const rbw = team?.byYear?.[yearKeyNum]?.rankByWeek
      ?? team?.byYear?.[yearKeyStr]?.rankByWeek
    if (!rbw) continue
    const v = rbw[0] ?? rbw['0']
    if (typeof v !== 'number' || v < 1 || v > PRESEASON_NUM_RANKS) continue
    if (!byRank.has(v)) byRank.set(v, team.abbr)
  }

  const rows = [['Rank', 'Team']]
  for (let r = 1; r <= PRESEASON_NUM_RANKS; r++) {
    rows.push([`#${r}`, byRank.get(r) || ''])
  }
  const valuesRes = await fetch(
    `${SHEETS_API_BASE}/${sheet.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [{
          range: `'${year} Preseason Top 25'!A1:B${NUM_ROWS}`,
          majorDimension: 'ROWS',
          values: rows,
        }],
      }),
    },
  )
  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}))
    throw new Error(`createPreseasonRankingsSheet: values batchUpdate failed — ${err.error?.message || valuesRes.status}`)
  }

  // Step 3 — formatting + validation.
  const teamsMap = getTeamsWithCustom(dynasty.teams)
  const validationValues = Object.keys(teamsMap).sort().map(abbr => ({ userEnteredValue: abbr }))
  const requests = [
    // Header row formatting.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.13, green: 0.14, blue: 0.18 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // Rank label column.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.18, green: 0.19, blue: 0.23 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // Team column — center + bold.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true } } },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)',
      },
    },
    // Strict-dropdown validation on team column.
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 1, endColumnIndex: 2 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: validationValues },
          showCustomUi: true,
          strict: true,
        },
      },
    },
    // Column widths.
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize',
      },
    },
  ]

  // Per-team conditional formatting on the team column.
  for (const [abbr, teamData] of Object.entries(teamsMap)) {
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: NUM_ROWS, startColumnIndex: 1, endColumnIndex: 2 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: abbr }] },
            format: {
              backgroundColor: hexToRgb(teamData.backgroundColor),
              textFormat: { foregroundColor: hexToRgb(teamData.textColor), bold: true, italic: true },
            },
          },
        },
        index: 0,
      },
    })
  }

  const batchRes = await fetch(
    `${SHEETS_API_BASE}/${sheet.spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    },
  )
  if (!batchRes.ok) {
    const err = await batchRes.json().catch(() => ({}))
    throw new Error(`createPreseasonRankingsSheet: batchUpdate failed — ${err.error?.message || batchRes.status}`)
  }

  await shareSheetPublicly(sheet.spreadsheetId, accessToken)

  return {
    spreadsheetId: sheet.spreadsheetId,
    spreadsheetUrl: sheet.spreadsheetUrl,
    year: yearKeyNum,
  }
}

/**
 * Read a preseason rankings sheet back. Returns:
 *
 *   {
 *     entries: [{ rank, abbr, tid }],   // valid (rank, team) pairs
 *     unknownAbbrs: [{ rank, raw }],    // abbrs not in dynasty.teams
 *   }
 */
export async function readPreseasonRankingsFromSheet(spreadsheetId, dynasty, year, opts = {}) {
  if (!dynasty) throw new Error('readPreseasonRankingsFromSheet: dynasty is required')

  // Local-paste path: parse pre-split TSV rows in place (no Google fetch).
  let rows
  if (opts.rows) {
    rows = opts.rows
  } else {
    const accessToken = await getAccessToken()
    const NUM_ROWS = 1 + PRESEASON_NUM_RANKS
    const range = `'${year} Preseason Top 25'!A1:B${NUM_ROWS}`

    const res = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`readPreseasonRankingsFromSheet: values get failed — ${err.error?.message || res.status}`)
    }
    const data = await res.json()
    rows = data.values || []
  }

  const entries = []
  const unknownAbbrs = []
  for (let r = 1; r <= PRESEASON_NUM_RANKS; r++) {
    const row = rows[r] || []
    const raw = (row[1] || '').trim()
    if (!raw) continue
    // Resolve tolerantly: the poll grid + AI prompt emit team NAMES, not abbrs.
    const tid = getTidFromTeamText(raw, dynasty.teams)
    if (tid == null) {
      unknownAbbrs.push({ rank: r, raw })
      continue
    }
    const abbr = dynasty.teams?.[tid]?.abbr || dynasty.teams?.[String(tid)]?.abbr || raw
    entries.push({ rank: r, abbr, tid: Number(tid) })
  }

  return { entries, unknownAbbrs }
}
