// Note: Firebase auth import removed - we use OAuth tokens from localStorage directly
// This allows Google Sheets to work with free tier (IndexedDB) users who have signed in with Google
import { teamAbbreviations, getTeamAbbreviationsList, getSelectableTeamsList, getSchedulableTeamsList } from '../data/teamAbbreviations'
import { getAbbrFromTeamName, getTidFromAbbr, TEAMS as DEFAULT_TEAMS } from '../data/teamRegistry'
import { conferenceTeams as CANONICAL_CONFERENCES } from '../data/conferenceTeams'
import { STAT_TABS, STAT_TAB_ORDER, SCORING_SUMMARY, SCORE_TYPES, PAT_RESULTS, QUARTERS, AI_UNIFIED_TAB, computeUnifiedTabLayout } from '../data/boxScoreConstants'
import { isPlayerOnRoster, getPlayerClassForYear } from '../context/DynastyContext'

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files'

// Get the current user's OAuth access token
async function getAccessToken() {
  // Try to get from localStorage first
  const storedToken = localStorage.getItem('google_access_token')
  const tokenExpiry = localStorage.getItem('google_token_expiry')

  if (storedToken && tokenExpiry) {
    const expiryTime = parseInt(tokenExpiry)
    if (Date.now() < expiryTime) {
      return storedToken
    }
  }

  // Token not found or expired
  throw new Error('OAuth access token not found or expired. Try refreshing your session or sign out and sign back in.')
}

// Share a Google Sheet with "anyone with the link can edit"
// This is required for embedding sheets in iframes since iframes can't share auth cookies
async function shareSheetPublicly(spreadsheetId, accessToken) {
  try {
    const response = await fetch(`${DRIVE_API_BASE}/${spreadsheetId}/permissions`, {
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
      const error = await response.json()
      console.error('Failed to share sheet:', error)
      // Don't throw - sheet still works, just won't embed properly
    }
  } catch (error) {
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
    const response = await fetch(SHEETS_API_BASE, {
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
                columnCount: 13,
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
      backgroundColor: team.primaryColor || '#333333',
      textColor: team.secondaryColor || '#FFFFFF',
    }
  }
  return teams
}

// Get list of team abbreviations with dynastyTeams support
function getTeamAbbreviationsListWithCustom(dynastyTeams = null) {
  const teams = getTeamsWithCustom(dynastyTeams)
  return Object.keys(teams).sort()
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
      // Roster headers (13 columns)
      {
        updateCells: {
          range: {
            sheetId: rosterSheetId, // Roster sheet
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 13
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
              { userEnteredValue: { stringValue: 'Image URL' } }
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
              values: getSelectableTeamsList(dynastyTeams).map(abbr => ({ userEnteredValue: abbr }))
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
              values: getSchedulableTeamsList(dynastyTeams).map(abbr => ({ userEnteredValue: abbr }))
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
                { userEnteredValue: 'WI' }, { userEnteredValue: 'WY' }, { userEnteredValue: 'DC' }
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
            endColumnIndex: 13
          }
        }
      }
    })

    const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
    const response = await fetch(SHEETS_API_BASE, {
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
    const response = await fetch(SHEETS_API_BASE, {
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
                columnCount: 13,
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

    // Build schedule data rows - either from existing schedule or empty
    // Week 0-15 = 16 weeks of regular season
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
              { userEnteredValue: { numberValue: row.week } },
              { userEnteredValue: { stringValue: row.userTeam } },
              { userEnteredValue: { stringValue: row.opponent } },
              { userEnteredValue: { stringValue: row.site } }
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
              values: getSelectableTeamsList(dynastyTeams).map(abbr => ({ userEnteredValue: abbr }))
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
              values: ['BYE', ...getSchedulableTeamsList(dynastyTeams)].map(abbr => ({ userEnteredValue: abbr }))
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

    const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
      // Roster headers (13 columns)
      {
        updateCells: {
          range: {
            sheetId: rosterSheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 13
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
              { userEnteredValue: { stringValue: 'Image URL' } }
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
                { userEnteredValue: 'WI' }, { userEnteredValue: 'WY' }, { userEnteredValue: 'DC' }
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
              endColumnIndex: 13
            }
          }
        }
      }
    ]

    const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readScheduleFromScheduleSheet(spreadsheetId, dynastyTeams = null) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    const response = await fetch(
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
        let location = (row[3] || 'Home').toLowerCase()
        if (location === 'road') {
          location = 'away'
        }

        const userTeamAbbr = (row[1] || '').toUpperCase()
        const opponentAbbr = row[2].toUpperCase()

        // parseInt("0") is 0 (falsy), so a plain `|| index + 1` fallback
        // would silently re-assign Week 0 entries to the row index + 1 and
        // shift the entire schedule down. Only fall back when the parse
        // genuinely failed.
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

// Read roster data from a Roster-only sheet
export async function readRosterFromRosterSheet(spreadsheetId) {
  try {
    // Get OAuth access token (works for both free and paid tiers)
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:M100`,
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
      .filter(row => row[0] && row[7]) // Has first name (col A) and overall rating (col H)
      .map(row => ({
        name: `${row[0] || ''} ${row[1] || ''}`.trim(),  // Combine first + last name
        firstName: row[0] || '',                          // A: First Name
        lastName: row[1] || '',                           // B: Last Name
        position: row[2] || 'QB',                         // C: Position
        year: row[3] || 'Fr',                             // D: Class
        devTrait: row[4] || 'Normal',                     // E: Dev Trait
        jerseyNumber: row[5] || '',                       // F: Jersey #
        archetype: row[6] || '',                          // G: Archetype
        overall: parseInt(row[7]) || 0,                   // H: Overall
        height: normalizeHeight(row[8]),                  // I: Height
        weight: row[9] ? parseInt(row[9]) : null,         // J: Weight
        hometown: row[10] || '',                          // K: Hometown
        state: row[11] || '',                             // L: State
        pictureUrl: row[12] || ''                          // M: Image URL
      }))
  } catch (error) {
    console.error('Error reading roster:', error)
    throw error
  }
}

// Pre-fill roster data into a Roster-only sheet
export async function prefillRosterSheet(spreadsheetId, players) {
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
    // Columns: First Name | Last Name | Position | Class | Dev Trait | Jersey # | Archetype | Overall | Height | Weight | Hometown | State | Image URL
    const rosterValues = players.map(p => {
      const { firstName, lastName } = p.firstName ? { firstName: p.firstName, lastName: p.lastName || '' } : splitName(p.name)
      return [
        firstName,
        lastName,
        p.position || '',
        p.year || '',
        p.devTrait || 'Normal',
        p.jerseyNumber || '',
        p.archetype || '',
        p.overall || '',
        p.height || '',
        p.weight || '',
        p.hometown || '',
        p.state || '',
        p.pictureUrl || ''
      ]
    })

    // Add 5 extra empty rows for adding new players
    const EXTRA_ROWS = 5
    for (let i = 0; i < EXTRA_ROWS; i++) {
      rosterValues.push(['', '', '', '', '', '', '', '', '', '', '', '', ''])
    }

    if (rosterValues.length === 0) return

    // Write roster data starting at row 2 (after header)
    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:M${rosterValues.length + 1}?valueInputOption=RAW`,
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

    const response = await fetch(
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

    const response = await fetch(url, {
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
    const response = await fetch(
      `${DRIVE_API_BASE}/${spreadsheetId}?fields=id,trashed`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (response.status === 404 || response.status === 403) return false
    if (!response.ok) return true
    const data = await response.json()
    return !data.trashed
  } catch (error) {
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

    const response = await fetch(url, {
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

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:M100`,
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
      .filter(row => row[0] && row[7]) // Has first name (col A) and overall rating (col H)
      .map(row => ({
        name: `${row[0] || ''} ${row[1] || ''}`.trim(),  // Combine first + last name
        firstName: row[0] || '',                          // A: First Name
        lastName: row[1] || '',                           // B: Last Name
        position: row[2] || 'QB',                         // C: Position
        year: row[3] || 'Fr',                             // D: Class
        devTrait: row[4] || 'Normal',                     // E: Dev Trait
        jerseyNumber: row[5] || '',                       // F: Jersey #
        archetype: row[6] || '',                          // G: Archetype
        overall: parseInt(row[7]) || 0,                   // H: Overall
        height: normalizeHeight(row[8]),                  // I: Height (auto-formats to 6'1")
        weight: row[9] ? parseInt(row[9]) : null,         // J: Weight
        hometown: row[10] || '',                          // K: Hometown
        state: row[11] || '',                             // L: State
        pictureUrl: row[12] || ''                          // M: Image URL
      }))
  } catch (error) {
    console.error('Error reading roster:', error)
    throw error
  }
}

// Write existing schedule and roster data to a sheet
export async function writeExistingDataToSheet(spreadsheetId, schedule, players, userTeamAbbr) {
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

    // Prepare roster data (rows 2-86, columns A-M, 13 columns)
    const rosterValues = players?.map(player => {
      const { firstName, lastName } = player.firstName ? { firstName: player.firstName, lastName: player.lastName || '' } : splitName(player.name)
      return [
        firstName,                            // A: First Name
        lastName,                             // B: Last Name
        player.position || '',                // C: Position
        player.year || '',                    // D: Class
        player.devTrait || 'Normal',          // E: Dev Trait
        player.jerseyNumber || '',            // F: Jersey #
        player.archetype || '',               // G: Archetype
        player.overall || '',                 // H: Overall
        normalizeHeight(player.height),       // I: Height (normalized to 6'1" format)
        player.weight || '',                  // J: Weight
        player.hometown || '',                // K: Hometown
        player.state || '',                   // L: State
        player.pictureUrl || ''               // M: Image URL
      ]
    }) || []

    // Add 5 extra empty rows for adding new players
    const EXTRA_ROWS = 5
    for (let i = 0; i < EXTRA_ROWS; i++) {
      rosterValues.push(['', '', '', '', '', '', '', '', '', '', '', '', ''])
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

    // Write roster data (13 columns)
    if (rosterValues.length > 0) {
      requests.push(
        fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster!A2:M${rosterValues.length + 1}?valueInputOption=RAW`, {
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
    const response = await fetch(SHEETS_API_BASE, {
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
          endColumnIndex: 5
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Conference' } },
            { userEnteredValue: { stringValue: 'Team 1' } },
            { userEnteredValue: { stringValue: 'Team 2' } },
            { userEnteredValue: { stringValue: 'Team 1 Score' } },
            { userEnteredValue: { stringValue: 'Team 2 Score' } }
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
          endColumnIndex: 5
        },
        rows: conferences.map(conf => {
          const existing = getExistingCC(conf)
          return {
            values: [
              { userEnteredValue: { stringValue: conf } },
              { userEnteredValue: { stringValue: existing.team1 || '' } },
              { userEnteredValue: { stringValue: existing.team2 || '' } },
              { userEnteredValue: existing.team1Score != null ? { numberValue: existing.team1Score } : { stringValue: '' } },
              { userEnteredValue: existing.team2Score != null ? { numberValue: existing.team2Score } : { stringValue: '' } }
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
            endColumnIndex: 5
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
        properties: { pixelSize: 100 },
        fields: 'pixelSize'
      }
    },
    // Add conditional formatting for team colors (Team 1 column)
    ...generateCCTeamFormattingRules(sheetId, 1, rowCount, dynastyTeams),
    // Add conditional formatting for team colors (Team 2 column)
    ...generateCCTeamFormattingRules(sheetId, 2, rowCount, dynastyTeams)
  ]

  // Execute batch update
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readConferenceChampionshipsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    console.log('[readCCSheet] Reading from spreadsheet:', spreadsheetId)
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Conference Championships!A2:E11`,
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
    const rows = data.values || []
    console.log('[readCCSheet] Rows:', rows)

    // Parse into structured data with tid fields for teambuilder support
    const championships = rows.map(row => {
      const team1Abbr = (row[1] || '').toUpperCase()
      const team2Abbr = (row[2] || '').toUpperCase()
      const team1Score = row[3] ? parseInt(row[3]) : null
      const team2Score = row[4] ? parseInt(row[4]) : null
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

      return {
        conference: row[0] || '',
        team1: team1Abbr,
        team2: team2Abbr,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
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

// Bowl games list for Bowl Week 1 (26 regular bowls + 4 CFP First Round = 30 games)
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
  'Music City Bowl',
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

// Regular bowl games for Bowl Week 2 (8 games - excludes CFP Quarterfinals)
const BOWL_GAMES_WEEK_2_REGULAR = [
  'Bahamas Bowl',
  'Citrus Bowl',
  "Duke's Mayo Bowl",
  'First Responder Bowl',
  'Gator Bowl',
  'Reliaquest Bowl',
  'Sun Bowl',
  'Texas Bowl'
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
const getBowlGamesWeek2 = (cfpBowlConfig = null) => {
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
export async function createBowlWeek1Sheet(dynastyName, year, cfpSeeds = [], excludeGames = [], existingBowlWeek1 = [], existingCFPFirstRound = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Filter out games that the user is playing in (they enter those separately)
    const bowlGames = BOWL_GAMES_WEEK_1.filter(game => !excludeGames.includes(game))
    const rowCount = bowlGames.length

    // Create the spreadsheet
    const response = await fetch(SHEETS_API_BASE, {
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
                rowCount: rowCount + 1,
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

// Generate conditional formatting rules for team colors in bowl sheet
function generateBowlTeamFormattingRules(sheetId, columnIndex, rowCount, dynastyTeams = null) {
  const rules = []
  const teams = getTeamsWithCustom(dynastyTeams)

  for (const [abbr, teamData] of Object.entries(teams)) {
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
      { userEnteredValue: { stringValue: bowl } },
      { userEnteredValue: { stringValue: team1 } },
      { userEnteredValue: { stringValue: team2 } }
    ]

    // Add scores if we have them
    if (team1Score !== undefined && team1Score !== null) {
      values.push({ userEnteredValue: { numberValue: team1Score } })
    } else {
      values.push({ userEnteredValue: { stringValue: '' } })
    }
    if (team2Score !== undefined && team2Score !== null) {
      values.push({ userEnteredValue: { numberValue: team2Score } })
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
          endColumnIndex: 5
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Bowl Game' } },
            { userEnteredValue: { stringValue: 'Team 1' } },
            { userEnteredValue: { stringValue: 'Team 2' } },
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
          endColumnIndex: 5
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
    // Add conditional formatting for team colors (Team 1 column)
    ...generateBowlTeamFormattingRules(sheetId, 1, rowCount, dynastyTeams),
    // Add conditional formatting for team colors (Team 2 column)
    ...generateBowlTeamFormattingRules(sheetId, 2, rowCount, dynastyTeams)
  ]

  // Execute batch update
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readBowlGamesFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const rowCount = BOWL_GAMES_WEEK_1.length
    console.log('[readBowlGamesFromSheet] Reading', rowCount, 'rows from sheet:', spreadsheetId)
    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Bowl Games!A2:E${rowCount + 1}`,
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
    const rows = data.values || []
    console.log('[readBowlGamesFromSheet] Got', rows.length, 'rows from API')

    // Parse into structured data with tid fields for teambuilder support
    const bowlGames = rows.map((row, idx) => {
      const bowlName = row[0] || ''
      const team1Abbr = (row[1] || '').toUpperCase()
      const team2Abbr = (row[2] || '').toUpperCase()
      // Parse scores - handle empty strings, "0", and NaN correctly
      const score1Raw = row[3]
      const score2Raw = row[4]
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

      return {
        bowlName: row[0] || '',
        team1: team1Abbr,
        team2: team2Abbr,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        winner,
        winnerTid
      }
    })

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
export const WEEKLY_SCORES_MAX_ROWS = 75

export async function createWeeklyScoresSheet(dynastyName, year, week, existingGames = [], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const sheetTitle = `Week ${week} Scores`

    const response = await fetch(SHEETS_API_BASE, {
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
                rowCount: WEEKLY_SCORES_MAX_ROWS + 1,
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
    const homeAbbr = g.homeTeam || ''
    const awayAbbr = g.awayTeam || ''
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
    // Strict team dropdown for HOME column (col A, index 0)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 0, endColumnIndex: 1 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr })) },
          showCustomUi: true,
          strict: true
        }
      }
    },
    // Home rank dropdown (col B, index 1) — blank or 1..25
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 1, endColumnIndex: 2 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: rankDropdownValues },
          showCustomUi: true,
          strict: false
        }
      }
    },
    // Strict team dropdown for AWAY column (col D, index 3)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: teamAbbrs.map(abbr => ({ userEnteredValue: abbr })) },
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
    // Team color formatting on HOME (col 0) and AWAY (col 3)
    ...generateBowlTeamFormattingRules(sheetId, 0, rowCount, dynastyTeams),
    ...generateBowlTeamFormattingRules(sheetId, 3, rowCount, dynastyTeams),
  ]

  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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

export async function readWeeklyScoresFromSheet(spreadsheetId, sheetTitle, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const range = `${sheetTitle}!A2:G${WEEKLY_SCORES_MAX_ROWS + 1}`

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read weekly scores: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const rows = data.values || []

    const parseRank = (raw) => {
      if (raw === undefined || raw === '' || raw === null) return null
      const n = parseInt(raw, 10)
      if (isNaN(n) || n < 1 || n > 25) return null
      return n
    }

    const games = []
    for (const row of rows) {
      const homeAbbr = (row[0] || '').toUpperCase().trim()
      const awayAbbr = (row[3] || '').toUpperCase().trim()
      if (!homeAbbr || !awayAbbr) continue
      if (homeAbbr === awayAbbr) continue

      const homeRank = parseRank(row[1])
      const homeScoreRaw = row[2]
      const awayRank = parseRank(row[4])
      const awayScoreRaw = row[5]
      const parsedHome = (homeScoreRaw === undefined || homeScoreRaw === '') ? null : parseInt(homeScoreRaw, 10)
      const parsedAway = (awayScoreRaw === undefined || awayScoreRaw === '') ? null : parseInt(awayScoreRaw, 10)
      const homeScore = parsedHome !== null && !isNaN(parsedHome) ? parsedHome : null
      const awayScore = parsedAway !== null && !isNaN(parsedAway) ? parsedAway : null
      const neutralFlag = (row[6] || '').toString().trim().toUpperCase()
      const neutral = neutralFlag === 'Y' || neutralFlag === 'YES' || neutralFlag === '1' || neutralFlag === 'TRUE'

      const homeTid = getTidFromAbbr(homeAbbr, dynastyTeams)
      const awayTid = getTidFromAbbr(awayAbbr, dynastyTeams)
      if (!homeTid || !awayTid) continue

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
    const response = await fetch(SHEETS_API_BASE, {
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
                rowCount: rowCount + 1,
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
          endColumnIndex: 5
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Bowl Game' } },
            { userEnteredValue: { stringValue: 'Team 1' } },
            { userEnteredValue: { stringValue: 'Team 2' } },
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
          endColumnIndex: 5
        },
        rows: rowData.map(row => ({
          values: [
            { userEnteredValue: { stringValue: row.bowl } },
            { userEnteredValue: { stringValue: row.team1 } },
            { userEnteredValue: { stringValue: row.team2 } },
            row.team1Score !== undefined && row.team1Score !== null
              ? { userEnteredValue: { numberValue: row.team1Score } }
              : { userEnteredValue: { stringValue: '' } },
            row.team2Score !== undefined && row.team2Score !== null
              ? { userEnteredValue: { numberValue: row.team2Score } }
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
    // Add conditional formatting for team colors (Team 1 column)
    ...generateBowlTeamFormattingRules(sheetId, 1, rowCount, dynastyTeams),
    // Add conditional formatting for team colors (Team 2 column)
    ...generateBowlTeamFormattingRules(sheetId, 2, rowCount, dynastyTeams)
  ]

  // Execute batch update
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readBowlWeek2GamesFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const rowCount = BOWL_GAMES_WEEK_2.length
    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Bowl Games!A2:E${rowCount + 1}`,
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
    const rows = data.values || []

    // Parse into structured data with tid fields for teambuilder support
    const bowlGames = rows.map(row => {
      const team1Abbr = (row[1] || '').toUpperCase()
      const team2Abbr = (row[2] || '').toUpperCase()
      const team1Score = row[3] ? parseInt(row[3]) : null
      const team2Score = row[4] ? parseInt(row[4]) : null
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

      return {
        bowlName: row[0] || '',
        team1: team1Abbr,
        team2: team2Abbr,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        winner,
        winnerTid
      }
    })

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
    const response = await fetch(SHEETS_API_BASE, {
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

  const response = await fetch(
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

  await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

// Read CFP Seeds from sheet
export async function readCFPSeedsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
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
    const rows = data.values || []

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
    const response = await fetch(SHEETS_API_BASE, {
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
              { userEnteredValue: { stringValue: gameName } },
              { userEnteredValue: { stringValue: existing.higherSeed || '' } },
              { userEnteredValue: { stringValue: existing.lowerSeed || '' } },
              { userEnteredValue: existing.higherSeedScore != null ? { numberValue: existing.higherSeedScore } : { stringValue: '' } },
              { userEnteredValue: existing.lowerSeedScore != null ? { numberValue: existing.lowerSeedScore } : { stringValue: '' } }
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

  await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

// Read CFP First Round results from sheet
export async function readCFPFirstRoundFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
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
    const rows = data.values || []

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
    const response = await fetch(SHEETS_API_BASE, {
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
  const updateResponse = await fetch(
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
  await fetch(
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
export async function readCFPQuarterfinalsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
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
    const rows = data.values || []

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
    const response = await fetch(SHEETS_API_BASE, {
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
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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

export async function readConferencesFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // First, get spreadsheet metadata to find all sheet tabs
    const metaResponse = await fetch(
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
        const response = await fetch(
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
      const response = await fetch(
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
    const response = await fetch(SHEETS_API_BASE, {
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
  const batchResponse = await fetch(
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
    const response = await fetch(
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

    return rows.map(row => ({
      name: row[0] || '',
      gamesPlayed: parseInt(row[1]) || 0,
      snapsPlayed: parseInt(row[2]) || 0
    })).filter(player => player.name && player.name.trim()) // Filter by player name (must have selected from dropdown)
  } catch (error) {
    console.error('Error reading stats from sheet:', error)
    throw error
  }
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
    const response = await fetch(SHEETS_API_BASE, {
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

    // Initialize each tab with headers and player data
    for (let i = 0; i < tabNames.length; i++) {
      const tabName = tabNames[i]
      const sheetId = sheet.sheets[i].properties.sheetId
      await initializeDetailedStatsTab(sheet.spreadsheetId, accessToken, sheetId, tabName, playerStats, aggregatedStats)
    }

    // Share sheet publicly so it can be embedded in iframe
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

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
            { userEnteredValue: { stringValue: player.name || '' } },
            { userEnteredValue: { numberValue: player.snapsPlayed || 0 } }
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
  const batchResponse = await fetch(
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
    const result = {}

    for (const tabName of Object.keys(DETAILED_STATS_TABS)) {
      const statColumns = DETAILED_STATS_TABS[tabName]
      const lastColumn = String.fromCharCode(65 + statColumns.length + 1) // A=65, +1 for Name, +1 for Snaps

      const range = encodeURIComponent(`'${tabName}'!A2:${lastColumn}200`)
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        console.error(`Failed to read ${tabName}:`, error)
        continue
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
    }

    return result
  } catch (error) {
    console.error('Error reading detailed stats from sheet:', error)
    throw error
  }
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
    const createResponse = await fetch(SHEETS_API_BASE, {
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
    const batchResponse = await fetch(
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
          { userEnteredValue: { stringValue: v.team } },
          { userEnteredValue: { numberValue: v.wins } },
          { userEnteredValue: { numberValue: v.losses } },
          { userEnteredValue: { numberValue: v.pointsFor } },
          { userEnteredValue: { numberValue: v.pointsAgainst } }
        ]
      }],
      fields: 'userEnteredValue'
    }
  }))

  // Execute batch update
  const response = await fetch(
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
export async function readConferenceStandingsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Read all data from the Standings tab
    const response = await fetch(
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
    const rows = data.values || []

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
 * Create a Google Sheet for final Top 25 polls entry
 * Three columns: # | Media | Coaches with 25 rows
 */
export async function createFinalPollsSheet(year, existingPolls = {}, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create spreadsheet with 26 rows (1 header + 25 teams)
    const createResponse = await fetch(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${year} Final Top 25 Polls`
        },
        sheets: [{
          properties: {
            title: 'Polls',
            gridProperties: {
              rowCount: 26,
              columnCount: 3,
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
    const headers = ['#', 'Media', 'Coaches']

    // Set header row
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 3
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
            endColumnIndex: 3
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
    const columnWidths = [50, 150, 150]
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
          endColumnIndex: 3
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

    // Add team dropdown validation for Media column (column B, index 1)
    requests.push(generateTeamValidation(sheetId, 1, 1, 26, dynastyTeams))

    // Add team dropdown validation for Coaches column (column C, index 2)
    requests.push(generateTeamValidation(sheetId, 2, 1, 26, dynastyTeams))

    // Add conditional formatting for team colors in Media column
    requests.push(...generateTeamFormattingRulesForRange(sheetId, 1, 1, 26, dynastyTeams))

    // Add conditional formatting for team colors in Coaches column
    requests.push(...generateTeamFormattingRulesForRange(sheetId, 2, 1, 26, dynastyTeams))

    // Execute all requests
    const batchResponse = await fetch(
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
    if (existingPolls && (existingPolls.media?.length > 0 || existingPolls.coaches?.length > 0)) {
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
 * Pre-fill existing final polls data into sheet
 */
async function prefillFinalPollsData(spreadsheetId, accessToken, sheetId, existingPolls) {
  const { media = [], coaches = [] } = existingPolls

  // Build values array for each rank 1-25
  const values = []
  for (let rank = 1; rank <= 25; rank++) {
    const mediaTeam = media.find(t => t.rank === rank)?.team || ''
    const coachesTeam = coaches.find(t => t.rank === rank)?.team || ''

    // Only add if there's data
    if (mediaTeam || coachesTeam) {
      values.push({
        row: rank + 1, // +1 because row 1 is header (1-indexed)
        media: mediaTeam,
        coaches: coachesTeam
      })
    }
  }

  if (values.length === 0) return

  // Build batch update for existing data - update columns B-C for each rank
  const requests = values.map(v => ({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: v.row - 1, // Convert to 0-indexed
        endRowIndex: v.row,
        startColumnIndex: 1, // Column B
        endColumnIndex: 3    // Column C
      },
      rows: [{
        values: [
          { userEnteredValue: { stringValue: v.media } },
          { userEnteredValue: { stringValue: v.coaches } }
        ]
      }],
      fields: 'userEnteredValue'
    }
  }))

  // Execute batch update
  const response = await fetch(
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
 * Read final polls from Google Sheet
 */
export async function readFinalPollsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Read all data from the Polls tab
    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Polls!A2:C26`,
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
    const rows = data.values || []

    // Parse rows into media and coaches polls
    const media = []
    const coaches = []

    // Resolve abbr → tid at read time. Storing the tid alongside the abbr
    // means downstream poll lookups (Rankings page, TeamYear, CoachCareer
    // year-by-year) work even after a teambuilder team is renamed.
    rows.forEach(row => {
      const rank = parseInt(row[0]) || 0
      const mediaTeam = row[1]?.trim().toUpperCase() || ''
      const coachesTeam = row[2]?.trim().toUpperCase() || ''

      if (rank >= 1 && rank <= 25) {
        if (mediaTeam) {
          const tid = getTidFromAbbr(mediaTeam, dynastyTeams)
          media.push({ rank, team: mediaTeam, tid: tid != null ? Number(tid) : null })
        }
        if (coachesTeam) {
          const tid = getTidFromAbbr(coachesTeam, dynastyTeams)
          coaches.push({ rank, team: coachesTeam, tid: tid != null ? Number(tid) : null })
        }
      }
    })

    // Sort by rank
    media.sort((a, b) => a.rank - b.rank)
    coaches.sort((a, b) => a.rank - b.rank)

    return { media, coaches }
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
    const createResponse = await fetch(SHEETS_API_BASE, {
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
    const batchResponse = await fetch(
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

// Awards columns and list
const AWARDS_COLUMNS = ['Award', 'Player', 'Position', 'Team', 'Class']

const AWARDS_LIST = [
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
  'Returner of the Year'
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
    const createResponse = await fetch(`${SHEETS_API_BASE}`, {
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
    const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
      const valuesResponse = await fetch(
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
export async function readAwardsFromSheet(spreadsheetId, year, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const lastCol = String.fromCharCode(65 + AWARDS_COLUMNS.length - 1)

    // Read all data rows from the specified year tab
    const response = await fetch(
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
    const rows = data.values || []

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

        // Resolve abbr → tid so downstream consumers (CoachCareer stint
        // attribution, Awards player lookup) survive teambuilder renames.
        const tid = team ? getTidFromAbbr(team, dynastyTeams) : null
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
    const createResponse = await fetch(`${SHEETS_API_BASE}`, {
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
    const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
      const valuesResponse = await fetch(
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
    const response = await fetch(
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

    // Helper to extract team data from rows. Resolve school abbr → tid at
    // read time so post-rename teambuilder teams keep their honor links.
    const tidFor = (abbr) => {
      const t = abbr ? getTidFromAbbr(abbr, dynastyTeams) : null
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
    const createResponse = await fetch(`${SHEETS_API_BASE}`, {
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
      await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
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
export async function readAllAmericansOnlyFromSheet(spreadsheetId, year, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const numPositions = ALL_AMERICAN_POSITIONS.length

    // Read all data from the specified year tab (28 rows)
    const response = await fetch(
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
    const rows = data.values || []

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
    const createResponse = await fetch(`${SHEETS_API_BASE}`, {
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
      await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
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
      const response = await fetch(
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
      // school abbr → tid at read time so post-rename teambuilder teams
      // keep their honor links.
      const tidFor = (abbr) => {
        const t = abbr ? getTidFromAbbr(abbr, dynastyTeams) : null
        return t != null ? Number(t) : null
      }
      const confEntries = []
      for (let i = 0; i < numPositions; i++) {
        const row = rows[3 + i] || []

        // First-Team (cols 0-3)
        if (row[1]) {
          const school = (row[2] || '').toUpperCase()
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
          const school = (row[6] || '').toUpperCase()
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
          const school = (row[10] || '').toUpperCase()
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

      // Use centralized isPlayerOnRoster - handles both stint-based and legacy systems
      return isPlayerOnRoster(p, teamTid || teamAbbr, year)
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
    const response = await fetch(SHEETS_API_BASE, {
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
      { userEnteredValue: { stringValue: player.name } },
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
  await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  })
}

// Read players leaving data from Google Sheet
export async function readPlayersLeavingFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
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
    const rows = data.values || []

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
export async function createDraftResultsSheet(dynastyName, year, playersLeavingThisYear, allPlayers) {
  try {
    const accessToken = await getAccessToken()

    // Filter players who declared for the draft
    const draftDeclarees = playersLeavingThisYear
      .filter(p => p.reason === 'Pro Draft')
      .map(leaving => {
        // Find the full player info
        const player = allPlayers.find(p => p.name === leaving.playerName || p.pid === leaving.pid)
        return {
          name: leaving.playerName,
          pid: leaving.pid || player?.pid,
          position: player?.position || '',
          overall: player?.overall || ''
        }
      })
      .sort((a, b) => (b.overall || 0) - (a.overall || 0)) // Sort by overall desc

    const totalRows = Math.max(draftDeclarees.length + 5, 20)

    // Create the spreadsheet
    const response = await fetch(SHEETS_API_BASE, {
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
      throw new Error(`Failed to create draft results sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const spreadsheet = await response.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Get player names for validation (only draft declarees)
    const playerNames = draftDeclarees.map(p => p.name)

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
          endColumnIndex: 4
        },
        rows: [{
          values: [
            { userEnteredValue: { stringValue: 'Player' }, userEnteredFormat: headerFormat },
            { userEnteredValue: { stringValue: 'Position' }, userEnteredFormat: headerFormat },
            { userEnteredValue: { stringValue: 'Overall' }, userEnteredFormat: headerFormat },
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
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 80 },
        fields: 'pixelSize'
      }
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    })

    // Add data validation for Draft Round column (dropdown)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1,
          endRowIndex: totalRows + 1,
          startColumnIndex: 3,
          endColumnIndex: 4
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

    // Pre-fill draft declarees
    if (draftDeclarees.length > 0) {
      const prefilledRows = draftDeclarees.map(player => ({
        values: [
          { userEnteredValue: { stringValue: player.name } },
          { userEnteredValue: { stringValue: player.position } },
          { userEnteredValue: { numberValue: player.overall || 0 } },
          { userEnteredValue: { stringValue: '' } } // Draft round to be filled in
        ]
      }))

      requests.push({
        updateCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 1,
            endRowIndex: 1 + draftDeclarees.length,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          rows: prefilledRows,
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
            endColumnIndex: 4
          },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    })

    // Execute all requests
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readDraftResultsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Draft Results!A2:D100`,
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
    const rows = data.values || []

    // Parse rows into draft result objects
    const draftResults = rows
      .filter(row => row[0] && row[0].trim() && row[3] && row[3].trim()) // Must have player name and draft round
      .map(row => ({
        playerName: row[0]?.trim() || '',
        position: row[1]?.trim() || '',
        overall: parseInt(row[2]) || 0,
        draftRound: row[3]?.trim() || ''
      }))

    return draftResults
  } catch (error) {
    console.error('Error reading draft results:', error)
    throw error
  }
}

// Recruiting class options
const RECRUIT_CLASSES = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr', 'Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr']

const RECRUIT_POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P', 'ATH'
]

const RECRUIT_ARCHETYPES = [
  'Backfield Creator', 'Dual Threat', 'Pocket Passer', 'Pure Runner',
  'Backfield Threat', 'East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'North/South Blocker',
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
  'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'
]

const GEM_BUST_OPTIONS = ['Gem', 'Bust']
const DEV_TRAITS = ['Elite', 'Star', 'Impact', 'Normal']

// Convert stars number to symbols
function starsNumberToSymbol(num) {
  if (!num || num <= 0) return ''
  return '☆'.repeat(Math.min(num, 5))
}

// Create Recruiting Commitments sheet
// Max scholarships per class is 35, so we use 35 rows
export async function createRecruitingSheet(dynastyName, year, dynastyTeams = null, existingCommitments = []) {
  try {
    const accessToken = await getAccessToken()

    // Get teams from dynasty.teams (tid-based) - source of truth
    const teams = getTeamsWithCustom(dynastyTeams)
    const teamAbbrs = Object.keys(teams).sort()

    const totalRows = Math.max(35, existingCommitments.length + 10) // Max 35 scholarships per class

    // Create the spreadsheet
    const response = await fetch(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - ${year} Recruiting Class`
        },
        sheets: [
          {
            properties: {
              title: 'Commitments',
              gridProperties: {
                rowCount: totalRows + 1,
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
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 15 },
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
            { userEnteredValue: { stringValue: 'Prev Team' }, userEnteredFormat: headerStyle }
          ]
        }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })

    // Set column widths
    const columnWidths = [150, 70, 70, 140, 80, 70, 70, 70, 60, 60, 120, 50, 70, 70, 80]
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

    // Add conditional formatting for Previous Team column (team colors)
    for (const abbr of teamAbbrs) {
      const teamData = teams[abbr]
      if (!teamData?.backgroundColor || !teamData?.textColor) continue

      const bgColor = hexToRgb(teamData.backgroundColor)
      const textColor = hexToRgb(teamData.textColor)

      requests.push({
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
      const dataRows = existingCommitments.map(recruit => ({
        values: [
          { userEnteredValue: { stringValue: recruit.name || '' } },
          { userEnteredValue: { stringValue: recruit.class || 'HS' } },
          { userEnteredValue: { stringValue: recruit.position || '' } },
          { userEnteredValue: { stringValue: recruit.archetype || '' } },
          { userEnteredValue: { stringValue: starsNumberToSymbol(recruit.stars) } },
          { userEnteredValue: recruit.nationalRank ? { numberValue: recruit.nationalRank } : { stringValue: '' } },
          { userEnteredValue: recruit.stateRank ? { numberValue: recruit.stateRank } : { stringValue: '' } },
          { userEnteredValue: recruit.positionRank ? { numberValue: recruit.positionRank } : { stringValue: '' } },
          { userEnteredValue: { stringValue: recruit.height || '' } },
          { userEnteredValue: recruit.weight ? { numberValue: recruit.weight } : { stringValue: '' } },
          { userEnteredValue: { stringValue: recruit.hometown || '' } },
          { userEnteredValue: { stringValue: recruit.state || '' } },
          { userEnteredValue: { stringValue: recruit.gemBust || '' } },
          { userEnteredValue: { stringValue: recruit.devTrait || 'Normal' } },
          { userEnteredValue: { stringValue: recruit.previousTeam || '' } }
        ]
      }))

      requests.push({
        updateCells: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1 + existingCommitments.length, startColumnIndex: 0, endColumnIndex: 15 },
          rows: dataRows,
          fields: 'userEnteredValue'
        }
      })
    }

    // Protect header row
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 15 },
          description: 'Header row - do not edit',
          warningOnly: true
        }
      }
    })

    // Execute all requests
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
    console.error('Error creating recruiting sheet:', error)
    throw error
  }
}

// Convert star symbols to number
function starsSymbolToNumber(starsStr) {
  if (!starsStr) return 0
  return (starsStr.match(/☆/g) || []).length
}

// Read recruiting commitments from Google Sheet
export async function readRecruitingFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/Commitments!A2:O100`,
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
    const rows = data.values || []

    // Parse rows into recruit objects
    // Non-portal classes: HS, JUCO Fr, JUCO So, JUCO Jr (regular recruits)
    // Portal classes: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr (transfer portal)
    const nonPortalClasses = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr']
    const recruits = rows
      .filter(row => row[0] && row[0].trim()) // Must have player name
      .map(row => {
        const recruitClass = row[1]?.trim() || 'HS'
        return {
          name: row[0]?.trim() || '',
          class: recruitClass,
          position: row[2]?.trim() || '',
          archetype: row[3]?.trim() || '',
          stars: starsSymbolToNumber(row[4]),
          nationalRank: row[5] ? parseInt(row[5]) : null,
          stateRank: row[6] ? parseInt(row[6]) : null,
          positionRank: row[7] ? parseInt(row[7]) : null,
          height: row[8]?.trim() || '',
          weight: row[9] ? parseInt(row[9]) : null,
          hometown: row[10]?.trim() || '',
          state: row[11]?.trim() || '',
          gemBust: row[12]?.trim() || '',
          devTrait: row[13]?.trim() || 'Normal',
          previousTeam: row[14]?.trim() || '',
          isPortal: !nonPortalClasses.includes(recruitClass) // Fr, So, Jr, etc. are portal transfers
        }
      })

    return recruits
  } catch (error) {
    console.error('Error reading recruiting data:', error)
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
    const response = await fetch(SHEETS_API_BASE, {
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
      { userEnteredValue: { stringValue: player.name || '' } },
      { userEnteredValue: { stringValue: player.position || '' } },
      // Show blank if overall is 0 or undefined, otherwise show the number
      player.overall ? { userEnteredValue: { numberValue: player.overall } } : { userEnteredValue: { stringValue: '' } },
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

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
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
    const response = await fetch(
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
    const response = await fetch(SHEETS_API_BASE, {
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
            { userEnteredValue: { stringValue: player.name || '' }, userEnteredFormat: { horizontalAlignment: 'LEFT' } },
            { userEnteredValue: { stringValue: player.position || '' }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { numberValue: player.overall || 0 }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
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

  const batchUpdateResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readEncourageTransfersFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const range = 'Encourage Transfers!A2:D'
    const response = await fetch(
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
    const rows = data.values || []

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
    const response = await fetch(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${dynastyName} - Recruiting Class Overalls ${year}`
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
            { userEnteredValue: { stringValue: recruit.name || '' }, userEnteredFormat: { horizontalAlignment: 'LEFT' } },
            { userEnteredValue: { stringValue: recruit.position || '' }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { stringValue: recruit.year || recruit.class || '' }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: { numberValue: recruit.stars || 0 }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            { userEnteredValue: recruit.overall ? { numberValue: recruit.overall } : { stringValue: '' }, userEnteredFormat: { horizontalAlignment: 'CENTER' } },
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

  const batchUpdateResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
    const response = await fetch(
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
    const response = await fetch(SHEETS_API_BASE, {
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
          // 10th tab: AI All-In-One — entire team's stats on one tab.
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
          })()
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create box score sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()

    // Extract sheet IDs for each tab; the unified tab is at the end.
    const sheetIds = {}
    STAT_TAB_ORDER.forEach((key, idx) => {
      sheetIds[key] = sheet.sheets[idx].properties.sheetId
    })
    const unifiedSheetId = sheet.sheets[STAT_TAB_ORDER.length].properties.sheetId

    // Initialize all tabs with headers and formatting
    await initializeBoxScoreSheet(sheet.spreadsheetId, accessToken, sheetIds, isUserTeam, rosterPlayers)
    await initializeUnifiedAITab(sheet.spreadsheetId, accessToken, unifiedSheetId, isUserTeam, rosterPlayers)

    // Pre-fill with existing player stats data if provided
    if (existingData) {
      await prefillPlayerStatsData(sheet.spreadsheetId, accessToken, existingData)
      await prefillUnifiedAITab(sheet.spreadsheetId, accessToken, existingData)
    }

    // Share sheet publicly for embedding
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

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
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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

    const response = await fetch(
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

// Initialize the unified AI tab: write banners, column headers, set
// formatting, apply roster dropdown to each section's data rows.
async function initializeUnifiedAITab(spreadsheetId, accessToken, sheetId, isUserTeam, rosterPlayers) {
  const layout = computeUnifiedTabLayout()
  const requests = []

  // Default cell formatting (consistent with the 9 individual tabs)
  requests.push({
    repeatCell: {
      range: { sheetId },
      cell: {
        userEnteredFormat: {
          textFormat: { fontFamily: 'Barlow', fontSize: 10 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  for (const section of layout.sections) {
    // Section banner: merge across the full width and write title centered
    requests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: section.bannerRow - 1,
          endRowIndex: section.bannerRow,
          startColumnIndex: 0,
          endColumnIndex: layout.maxCols,
        },
        mergeType: 'MERGE_ALL',
      },
    })
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: section.bannerRow - 1,
          endRowIndex: section.bannerRow,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: { stringValue: `═══ ${section.title.toUpperCase()} ═══` },
                userEnteredFormat: {
                  textFormat: { bold: true, fontSize: 12, fontFamily: 'Barlow' },
                  horizontalAlignment: 'CENTER',
                  backgroundColor: { red: 0.92, green: 0.92, blue: 0.95 },
                },
              },
            ],
          },
        ],
        fields: 'userEnteredValue,userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)',
      },
    })

    // Column header row
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: section.headerRow - 1,
          endRowIndex: section.headerRow,
          startColumnIndex: 0,
          endColumnIndex: section.headers.length,
        },
        rows: [
          {
            values: section.headers.map(h => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: {
                textFormat: { bold: true, italic: true, fontSize: 10, fontFamily: 'Barlow' },
                horizontalAlignment: 'CENTER',
                backgroundColor: { red: 0.97, green: 0.97, blue: 0.98 },
              },
            })),
          },
        ],
        fields: 'userEnteredValue,userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)',
      },
    })

    // Roster dropdown on column A across this section's data rows
    if (isUserTeam && rosterPlayers.length > 0) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: section.dataStart - 1,
            endRowIndex: section.dataEnd,
            startColumnIndex: 0,
            endColumnIndex: 1,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: rosterPlayers.map(name => ({ userEnteredValue: name })),
            },
            showCustomUi: true,
            strict: true,
          },
        },
      })
    }
  }

  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })

  if (!batchResponse.ok) {
    const error = await batchResponse.json()
    console.error('Failed to initialize AI All-In-One tab:', error)
    // Non-fatal: the 9 individual tabs are still usable.
  }
}

// Pre-fill the unified tab with existing data (same shape as the 9-tab
// prefill: existingData[key] is an array of player stat objects).
async function prefillUnifiedAITab(spreadsheetId, accessToken, existingData) {
  if (!existingData) return
  const layout = computeUnifiedTabLayout()

  // Build one full-tab values matrix (totalRows × maxCols)
  const matrix = Array.from({ length: layout.totalRows }, () => Array(layout.maxCols).fill(''))

  for (const section of layout.sections) {
    const tabData = existingData[section.key]
    if (!Array.isArray(tabData) || tabData.length === 0) continue

    // Use the SAME alias-aware helper the readers use. Without this, the
    // unified-tab writer also silently wipes RTG/Att/BT on every prefill.
    const headerToKey = buildHeaderKeyMap(section.key, section.headers)

    const capacity = section.dataEnd - section.dataStart + 1
    const rows = tabData.slice(0, capacity).map(playerStats =>
      section.headers.map((_, idx) => {
        const v = playerStats[headerToKey[idx]]
        return v !== null && v !== undefined ? String(v) : ''
      })
    )

    rows.forEach((rowVals, idx) => {
      const targetRow = section.dataStart - 1 + idx
      rowVals.forEach((v, col) => {
        matrix[targetRow][col] = v
      })
    })
  }

  const lastColLetter = String.fromCharCode(65 + layout.maxCols - 1)
  const range = `'${AI_UNIFIED_TAB.title}'!A1:${lastColLetter}${layout.totalRows}`
  const response = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values: matrix }),
    }
  )
  if (!response.ok) {
    const error = await response.json()
    console.error('Failed to prefill AI All-In-One tab:', error)
  }
}

// Read the unified tab back into the same { passing: [...], rushing: [...], ... } shape
// the 9-tab reader produces. Sections with no rows return [].
export async function readGameBoxScoreFromUnifiedTab(spreadsheetId) {
  try {
    const accessToken = await getAccessToken()
    const layout = computeUnifiedTabLayout()
    const lastColLetter = String.fromCharCode(65 + layout.maxCols - 1)
    const range = `'${AI_UNIFIED_TAB.title}'!A1:${lastColLetter}${layout.totalRows}`

    const response = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (!response.ok) {
      // Tab missing or unreadable — caller should fall back to 9-tab read.
      return null
    }
    const data = await response.json()
    const rows = data.values || []

    const boxScore = {}
    for (const section of layout.sections) {
      const headerToKey = buildHeaderKeyMap(section.key, section.headers)
      const sectionRows = []
      for (let r = section.dataStart; r <= section.dataEnd; r++) {
        const row = rows[r - 1] || []
        const playerName = (row[0] || '').trim()
        if (!playerName) continue

        const entry = { playerName }
        section.headers.forEach((header, idx) => {
          if (idx === 0) return
          const value = row[idx] || ''
          entry[headerToKey[idx]] = value === '' ? null : (isNaN(Number(value)) ? value : Number(value))
        })
        sectionRows.push(entry)
      }
      boxScore[section.key] = sectionRows
    }
    return boxScore
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
    const response = await fetch(SHEETS_API_BASE, {
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
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create scoring summary sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize with headers, formatting, and dropdowns
    await initializeScoringSummarySheet(sheet.spreadsheetId, accessToken, sheetId, homeTeamAbbr, awayTeamAbbr, homeRoster, awayRoster, dynastyTeams)

    // Pre-fill with existing scoring data if provided
    if (existingData && existingData.length > 0) {
      await prefillScoringSummaryData(sheet.spreadsheetId, accessToken, existingData)
    }

    // Share sheet publicly for embedding
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl
    }
  } catch (error) {
    console.error('Error creating scoring summary sheet:', error)
    throw error
  }
}

// Pre-fill scoring summary sheet with existing data
async function prefillScoringSummaryData(spreadsheetId, accessToken, scoringData) {
  if (!scoringData || scoringData.length === 0) return

  // Convert scoring data objects to row arrays
  // Headers: Team, Scorer, Passer, Yards, Score Type, PAT Result, Quarter, Time Left, Video Link
  const rows = scoringData.map(play => [
    play.team || '',
    play.scorer || '',
    play.passer || '',
    play.yards || '',
    play.scoreType || '',
    play.patResult || '',
    play.quarter || '',
    play.timeLeft || '',
    play.videoLink || ''
  ])

  // Write data to sheet starting at row 2 (after headers)
  const range = `'${SCORING_SUMMARY.title}'!A2:I${rows.length + 1}`
  const response = await fetch(
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

  // Add conditional formatting for team colors
  const teamFormattingRules = generateScoringTeamFormattingRules(sheetId, homeTeamAbbr, awayTeamAbbr, SCORING_SUMMARY.rowCount, dynastyTeams)
  requests.push(...teamFormattingRules)

  // Send batch update
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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

    // Read each tab
    for (const key of STAT_TAB_ORDER) {
      const tab = STAT_TABS[key]
      const range = `'${tab.title}'!A2:${String.fromCharCode(65 + tab.headers.length - 1)}${tab.rowCount + 1}`

      const response = await fetch(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      )

      if (!response.ok) {
        const error = await response.json()
        console.error(`Failed to read ${tab.title}:`, error)
        boxScore[key] = []
        continue
      }

      const data = await response.json()
      const rows = data.values || []

      const headerToKey = buildHeaderKeyMap(key, tab.headers)

      // Parse rows into objects using headers
      boxScore[key] = rows
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
    }

    // Merge in data from the AI All-In-One unified tab. If a section has
    // data in the unified tab, prefer it (the user pasted there); otherwise
    // keep what came from the dedicated tab.
    try {
      const unified = await readGameBoxScoreFromUnifiedTab(spreadsheetId)
      if (unified) {
        for (const key of STAT_TAB_ORDER) {
          const unifiedRows = unified[key]
          if (Array.isArray(unifiedRows) && unifiedRows.length > 0) {
            boxScore[key] = unifiedRows
          }
        }
      }
    } catch (e) {
      // Unified tab may not exist on legacy sheets — fine, we already have 9-tab data.
    }

    return boxScore
  } catch (error) {
    console.error('Error reading box score:', error)
    throw error
  }
}

// Read scoring summary from sheet
export async function readScoringSummaryFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Updated to column J (10 columns) to include Video Link
    const range = `'${SCORING_SUMMARY.title}'!A2:J${SCORING_SUMMARY.rowCount + 1}`
    const response = await fetch(
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
    const rows = data.values || []

    // Parse rows into objects - columns: Team, Scorer, Passer, Yards, Score Type, PAT Result, Quarter, Time Left, Video Link
    return rows
      .filter(row => {
        const hasTeam = row[0] && row[0].trim()
        const hasScoreType = row[4] && row[4].trim()
        const patResult = (row[5] || '').trim()
        const is2PTAttempt = patResult.includes('2PT')
        // Must have team AND (score type OR 2PT attempt)
        return hasTeam && (hasScoreType || is2PTAttempt)
      })
      .map(row => ({
        team: (row[0] || '').trim().toUpperCase(),
        scorer: (row[1] || '').trim(),
        passer: (row[2] || '').trim(),
        yards: (row[3] || '').trim(),
        scoreType: (row[4] || '').trim(),
        patResult: (row[5] || '').trim(),
        quarter: (row[6] || '').trim(),
        timeLeft: (row[7] || '').trim(),
        videoLink: (row[8] || '').trim()
      }))
  } catch (error) {
    console.error('Error reading scoring summary:', error)
    throw error
  }
}

// Team stats row labels for game team stats sheet (entry order)
const TEAM_STATS_ROWS = [
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
// existingData: optional object { home: {...}, away: {...} } to pre-fill (from game.boxScore.teamStats)
export async function createGameTeamStatsSheet(homeTeamAbbr, awayTeamAbbr, year, week, existingData = null, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    // Create the spreadsheet with 1 tab (3 columns: Stat, Away, Home)
    const response = await fetch(SHEETS_API_BASE, {
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
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Sheets API error:', error)
      throw new Error(`Failed to create team stats sheet: ${error.error?.message || 'Unknown error'}`)
    }

    const sheet = await response.json()

    // Get the sheet ID for the single tab
    const sheetId = sheet.sheets[0].properties.sheetId

    // Initialize the tab with headers, stat labels, and formatting
    await initializeTeamStatsSheet(sheet.spreadsheetId, accessToken, sheetId, homeTeamAbbr, awayTeamAbbr, dynastyTeams)

    // Pre-fill with existing team stats data if provided
    if (existingData && (existingData.home || existingData.away)) {
      await prefillTeamStatsData(sheet.spreadsheetId, accessToken, existingData)
    }

    // Share sheet publicly for embedding
    await shareSheetPublicly(sheet.spreadsheetId, accessToken)

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
  const batchResponse = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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

    const response = await fetch(
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

    // Header row contains: Stat, AwayAbbr, HomeAbbr
    const headerRow = rows[0]
    const awayTeamAbbr = headerRow[1] || ''
    const homeTeamAbbr = headerRow[2] || ''

    const teamStats = {
      away: { teamAbbr: awayTeamAbbr },
      home: { teamAbbr: homeTeamAbbr }
    }

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

      teamStats.away[camelKey] = awayValue === '' ? null : (isNaN(Number(awayValue)) ? awayValue : Number(awayValue))
      teamStats.home[camelKey] = homeValue === '' ? null : (isNaN(Number(homeValue)) ? homeValue : Number(homeValue))
    }

    return teamStats
  } catch (error) {
    console.error('Error reading team stats:', error)
    throw error
  }
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

  const response = await fetch(
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
    const response = await fetch(SHEETS_API_BASE, {
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
            values: [{ userEnteredValue: { stringValue: p.name || '' } }]
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
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
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
export async function readTransferDestinationsFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
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
    const rows = data.values || []

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
    const createResponse = await fetch(`${SHEETS_API_BASE}`, {
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

    // Add dropdowns for each year column (rows 2-500)
    years.forEach((_, i) => {
      requests.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 2 + i, endColumnIndex: 3 + i },
          rule: {
            condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: '' }, ...allTeamAbbrs.map(abbr => ({ userEnteredValue: abbr }))] },
            showCustomUi: true,
            strict: false
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
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    })

    // Write headers
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster History!A1:${String.fromCharCode(65 + headers.length - 1)}1?valueInputOption=RAW`, {
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
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster History!A2:${endCol}${rows.length + 1}?valueInputOption=RAW`, {
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
export async function readRosterHistoryFromSheet(spreadsheetId, years = [2025, 2026], dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()
    const endCol = String.fromCharCode(65 + 1 + years.length)

    const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/Roster History!A2:${endCol}500`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to read roster history: ${error.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const rows = data.values || []

    return rows
      .filter(row => row[0] && row[1]) // Must have name and PID
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
    const response = await fetch(SHEETS_API_BASE, {
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
  // Build pre-filled rows for transfers
  // Support both 'year' and 'incomingClass' field names for flexibility
  const dataRows = transfers.map(transfer => ({
    values: [
      { userEnteredValue: { stringValue: transfer.name || '' } },
      { userEnteredValue: { stringValue: transfer.position || '' } },
      { userEnteredValue: { stringValue: transfer.incomingClass || transfer.year || 'Fr' } }, // Current class they came in as
      { userEnteredValue: { stringValue: '' } } // New Class - user selects from dropdown
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
            { userEnteredValue: { stringValue: `${year} Recruitment Class` } },
            { userEnteredValue: { stringValue: `Updated ${year + 1} Class` } }
          ]
        }],
        fields: 'userEnteredValue'
      }
    },
    // Pre-fill transfer data
    {
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: transfers.length + 1, startColumnIndex: 0, endColumnIndex: 4 },
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
    // Add auto-filter to header row for sorting/filtering
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: totalRows + 1,
            startColumnIndex: 0,
            endColumnIndex: 4
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

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
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
export async function readPortalTransferClassFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const range = encodeURIComponent("'Portal Transfers'!A2:D100")
    const response = await fetch(
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
    const rows = data.values || []

    const results = rows
      .filter(row => row[0] && row[3]) // Must have player name and new class
      .map(row => ({
        playerName: row[0]?.trim() || '',
        position: row[1]?.trim() || '',
        currentClass: row[2]?.trim() || '',
        selectedClass: row[3]?.trim() || ''  // Use selectedClass to match handler expectations
      }))
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
    const response = await fetch(SHEETS_API_BASE, {
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
        { userEnteredValue: { stringValue: player.name || '' } },
        { userEnteredValue: { stringValue: player.position || '' } },
        { userEnteredValue: { stringValue: playerClass } }, // Current class
        { userEnteredValue: { numberValue: games } }, // Games played
        { userEnteredValue: { stringValue: defaultClass } } // New Class - pre-filled with progressed class
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

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
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
export async function readFringeCaseClassFromSheet(spreadsheetId, dynastyTeams = null) {
  try {
    const accessToken = await getAccessToken()

    const range = encodeURIComponent("'Fringe Cases'!A2:E100")
    const response = await fetch(
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
    const rows = data.values || []

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
