#!/usr/bin/env python3
"""
Migrate an old CFB Tracker spreadsheet (.xlsx) to a Dynasty Tracker
JSON file that can be imported via the app's "Import File" button.

Usage:
    python3 migrate_tracker_spreadsheet.py <path-to-xlsx> [output.json]

Scope:
- Coach identity (name + HC position)
- Per-year team records → coachTeamByYear, teamRecordsByTeamYear
- Per-year game schedule + scores → games[]
- Player roster (from Individual sheet) → players[]
- Awards by year → awardsByYear
- TeamBuilder slot for the user's team (placeholder replacesTeam — user
  edits via Danger Zone after import)

Out of scope (the Tracker spreadsheets are very free-form here, and
covering every variant reliably would be a larger project):
- Per-year box-score / detailed game stats
- Per-player season-by-season stats
- All-Americans / All-Conference (data is there but layout is wide-
  per-year and parsing the free-form labels is brittle)
- CFP bracket details
- Coordinator names + schemes per year

Requires: openpyxl  (pip install openpyxl)
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import openpyxl


# ---- helpers ----------------------------------------------------------

def num(v):
    """Try to coerce v to int. Return None if not numeric."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    try:
        n = int(v)
        return n
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None


def s(v):
    """Stringify v cleanly."""
    if v is None:
        return ''
    return str(v).strip()


def ranknum(v):
    """Parse '#24' or 24 into 24. Return None if not parseable."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    m = re.match(r'^#?(\d+)$', str(v).strip())
    return int(m.group(1)) if m else None


# ---- main migration ---------------------------------------------------

def migrate(xlsx_path: Path, output_path: Path):
    print(f'Reading {xlsx_path} …')
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)

    # --- Identify the user's team + start year ----------------------------
    # The Team sheet has a row per coached year. First data row is the start.
    team_sheet = wb['Team']
    team_rows = [r for r in team_sheet.iter_rows(values_only=True)]
    user_team_abbr = None
    start_year = None
    last_active_year = None
    team_records = {}  # year -> {wins, losses, conf, role}

    for row in team_rows:
        year = num(row[1]) if len(row) > 1 else None
        role = s(row[2]) if len(row) > 2 else ''
        school = s(row[3]) if len(row) > 3 else ''
        conf = s(row[5]) if len(row) > 5 else ''
        wins = num(row[8]) if len(row) > 8 else None
        losses = num(row[9]) if len(row) > 9 else None
        if year and school and (wins is not None or losses is not None):
            if start_year is None:
                start_year = year
                user_team_abbr = school
            last_active_year = year
            team_records[year] = {
                'wins': wins or 0,
                'losses': losses or 0,
                'conference': conf,
                'role': role or 'HC',
            }

    if not user_team_abbr:
        sys.exit('Could not find user team in Team sheet')

    print(f'  → User team: {user_team_abbr}')
    print(f'  → Years: {start_year}–{last_active_year}  ({len(team_records)} seasons)')

    # --- Identify coach role + full school name from a year sheet -------
    # The Tracker spreadsheets don't actually carry the coach's NAME
    # anywhere reliable (the "Current Job:" header references the team,
    # not the coach). We default the name to a placeholder for the
    # user to overwrite post-import.
    coach_name = '[Your Name]'  # user edits after import
    coach_position = 'HC'
    user_team_full_name = None

    for y in range(start_year, last_active_year + 1):
        name = str(y)
        if name not in wb.sheetnames:
            continue
        ws = wb[name]
        for row in ws.iter_rows(values_only=True, max_row=6):
            for i, cell in enumerate(row):
                if isinstance(cell, str) and cell.strip().lower().startswith('current job'):
                    # Adjacent cells in same row carry role + school name.
                    nearby = [s(row[j]) for j in range(i + 1, min(i + 10, len(row)))]
                    coach_position_label = next((c for c in nearby if c in ('Head Coach', 'Offensive Coordinator', 'Defensive Coordinator')), '')
                    coach_position = {
                        'Head Coach': 'HC',
                        'Offensive Coordinator': 'OC',
                        'Defensive Coordinator': 'DC',
                    }.get(coach_position_label, 'HC')
                    # School name is the next non-meta string after the role.
                    after_at = False
                    for c in nearby:
                        if c == 'at':
                            after_at = True
                            continue
                        if after_at and c and not c.endswith(':'):
                            user_team_full_name = c
                            break
                    break
            if user_team_full_name:
                break
        if user_team_full_name:
            break

    if not user_team_full_name:
        user_team_full_name = f'{user_team_abbr} Dynasty Team'
    print(f'  → School: {user_team_full_name}')
    print(f'  → Coach role: {coach_position} (name placeholder — edit after import)')

    # --- Build the dynasty skeleton --------------------------------------
    # We use a placeholder replacesTeam — the user will set the real one
    # via the TeamBuilder edit modal after import.
    PLACEHOLDER_REPLACED_FBS = 'GASO'  # Georgia Southern — small FBS slot

    dynasty = {
        'name': f'{user_team_abbr} Dynasty (imported)',
        'dynastyName': f'{user_team_abbr} Dynasty (imported)',
        'teamName': user_team_full_name,
        'coachName': coach_name,
        'coachPosition': coach_position,
        'startYear': start_year,
        'currentYear': last_active_year,
        'currentWeek': 0,
        'currentPhase': 'preseason',
        'conference': team_records.get(last_active_year, {}).get('conference') or '',
        'storageType': 'local',
        'customTeams': {
            user_team_abbr: {
                'name': user_team_full_name,
                'abbreviation': user_team_abbr,
                'logoUrl': '',
                'backgroundColor': '#990000',
                'textColor': '#ffffff',
                'primaryColor': '#990000',
                'secondaryColor': '#ffffff',
                'replacesTeam': PLACEHOLDER_REPLACED_FBS,
            }
        },
        # `teams` is populated on import by applyMigrations after collapsing
        # customTeams. We don't write it ourselves.
        'games': [],
        'players': [],
        'recruits': [],
        'schedule': [],
        'rankings': [],
        'nextPID': 1,
        'preseasonSetup': {
            'scheduleEntered': True,
            'rosterEntered': True,
            'teamRatingsEntered': False,
            'coachingStaffEntered': False,
            'conferencesEntered': False,
        },
        'teamRatings': {'overall': None, 'offense': None, 'defense': None},
        'coachingStaff': {'hcName': coach_name if coach_position == 'HC' else None,
                          'ocName': coach_name if coach_position == 'OC' else None,
                          'dcName': coach_name if coach_position == 'DC' else None},
        'coachCareer': [],
        'coachTeamByYear': {},
        'awardsByYear': {},
        'teamRecordsByTeamYear': {},
        'conferenceByTeamYear': {},
    }

    # --- Year-by-year coach team + records ------------------------------
    for year, rec in team_records.items():
        dynasty['coachTeamByYear'][str(year)] = {
            'team': user_team_abbr,
            'teamName': user_team_full_name,
        }
        dynasty['coachCareer'].append({
            'startYear': year,
            'endYear': year,
            'teamAbbr': user_team_abbr,
            'teamName': user_team_full_name,
            'position': rec['role'] or 'HC',
            'conference': rec['conference'],
            'wins': rec['wins'],
            'losses': rec['losses'],
        })
        dynasty['teamRecordsByTeamYear'].setdefault(user_team_abbr, {})[str(year)] = {
            'wins': rec['wins'],
            'losses': rec['losses'],
            'lastUpdated': '',
        }
        if rec['conference']:
            dynasty['conferenceByTeamYear'].setdefault(user_team_abbr, {})[str(year)] = rec['conference']

    # --- Games from each year sheet -------------------------------------
    games = []
    next_game_id = 1

    def make_game(week, opp, user_score, cpu_score, year, *,
                  game_type='regular', is_bowl=False, is_cc=False, bowl_name=None,
                  user_rank=None, opp_rank=None, site=None):
        nonlocal next_game_id
        gid = f'imported-game-{next_game_id}'
        next_game_id += 1
        # Determine winner
        won = (user_score is not None and cpu_score is not None and user_score > cpu_score)
        # Site → home/away/neutral
        location = (site or '').lower() if site else None
        is_home = location == 'home'
        is_away = location == 'away'
        is_neutral = location == 'neutral' or is_bowl or is_cc

        return {
            'id': gid,
            'week': week,
            'year': year,
            'gameType': game_type,
            'userTeam': user_team_abbr,  # legacy field
            'opponent': opp,              # legacy field
            'team1': user_team_abbr,
            'team2': opp,
            'team1Score': user_score if user_score is not None else 0,
            'team2Score': cpu_score if cpu_score is not None else 0,
            'team1Rank': user_rank,
            'team2Rank': opp_rank,
            'teamScore': user_score if user_score is not None else 0,
            'opponentScore': cpu_score if cpu_score is not None else 0,
            'userRank': user_rank,
            'opponentRank': opp_rank,
            'result': 'win' if won else 'loss' if (user_score is not None and cpu_score is not None) else None,
            'winner': user_team_abbr if won else opp,
            'isPlayed': user_score is not None and cpu_score is not None and (user_score > 0 or cpu_score > 0),
            'isBowlGame': is_bowl,
            'bowlGameName': bowl_name,
            'isConferenceChampionship': is_cc,
            'isPlayoff': False,
            'location': location,
            'isHome': is_home,
            'isAway': is_away,
            'isNeutral': is_neutral,
        }

    for year, rec in team_records.items():
        sheet_name = str(year)
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        for row in rows:
            if not row or len(row) < 11:
                continue
            week_cell = row[1]
            week_label = s(week_cell)
            # Regular-season weeks are numbers 1-13
            user_score = num(row[8])
            cpu_score = num(row[9])
            if user_score is None and cpu_score is None:
                continue

            opp = s(row[5])
            user_rank = ranknum(row[4])
            opp_rank = ranknum(row[6])
            site = s(row[7]) or None

            week_num = num(week_cell)
            is_cc = 'conf' in week_label.lower() and 'champ' in week_label.lower()
            is_bowl = 'bowl' in week_label.lower()
            bowl_name = s(row[2]) if is_bowl else None

            if week_num is not None:
                games.append(make_game(
                    week_num, opp, user_score, cpu_score, year,
                    game_type='regular',
                    user_rank=user_rank, opp_rank=opp_rank, site=site,
                ))
            elif is_cc:
                games.append(make_game(
                    14, opp, user_score, cpu_score, year,
                    game_type='conference_championship',
                    is_cc=True,
                    user_rank=user_rank, opp_rank=opp_rank, site=site,
                ))
            elif is_bowl:
                # Bowl week index from "Bowl Wk1", "Bowl Wk2", etc.
                m = re.search(r'wk\s*(\d+)', week_label.lower())
                bowl_week = 14 + (int(m.group(1)) if m else 1)
                games.append(make_game(
                    bowl_week, opp, user_score, cpu_score, year,
                    game_type='bowl',
                    is_bowl=True, bowl_name=bowl_name,
                    user_rank=user_rank, opp_rank=opp_rank, site=site,
                ))

    print(f'  → Games extracted: {len(games)}')
    dynasty['games'] = games

    # --- Players from Individual sheet ----------------------------------
    ind = wb['Individual']
    next_pid = 1
    players = []
    for row in ind.iter_rows(values_only=True):
        if not row or len(row) < 13:
            continue
        team = s(row[1])
        name = s(row[2])
        position = s(row[3])
        school = s(row[4])
        if not (team and name and position and school):
            continue
        if school != user_team_abbr:
            continue  # skip players on other teams (we only have detail for the user's)
        year_started = num(row[6])
        stars_cell = s(row[7])
        stars = stars_cell.count('☆') if stars_cell else None
        nat_rank = num(row[10])
        dev_trait = s(row[12]) or 'Normal'
        ovr_cell = s(row[14]) if len(row) > 14 else ''
        # Overall progression like "67 → 70 → 72"
        ovr_progression = re.findall(r'\d+', ovr_cell) if ovr_cell else []
        first_year_for_player = year_started or start_year
        teams_by_year = {}
        overall_by_year = {}
        if ovr_progression:
            for offset, ovr in enumerate(ovr_progression):
                yr = first_year_for_player + offset
                if yr <= last_active_year:
                    teams_by_year[str(yr)] = user_team_abbr
                    overall_by_year[str(yr)] = int(ovr)
        else:
            teams_by_year[str(first_year_for_player)] = user_team_abbr

        pid = next_pid
        next_pid += 1
        players.append({
            'pid': pid,
            'id': f'imported-player-{pid}',
            'name': name,
            'position': position,
            'team': user_team_abbr,
            'year': 'Sr',  # default; spreadsheet doesn't carry per-player class info
            'stars': stars,
            'nationalRank': nat_rank,
            'devTrait': dev_trait if dev_trait else 'Normal',
            'overall': int(ovr_progression[-1]) if ovr_progression else None,
            'teamsByYear': teams_by_year,
            'overallByYear': overall_by_year,
            'classByYear': {},
            'statsByYear': {},
            'movements': [],
            'yearStarted': first_year_for_player,
        })

    print(f'  → Players extracted: {len(players)}')
    dynasty['players'] = players
    dynasty['nextPID'] = next_pid

    # --- Awards by year (limited to user-team-relevant entries) ---------
    awards_sheet = wb['Awards']
    aw_rows = list(awards_sheet.iter_rows(values_only=True))
    # Header row 2-3 names the awards. Layout (per the user's sheet):
    # Col 0: USER team marker (STONY)
    # Col 1: year
    # Col 2: Heisman team, Col 4: Heisman player
    # Col 6: Maxwell team, Col 8: Maxwell player
    # Col 10: Walter Camp team, Col 12: Walter Camp player
    # Col 14: Bear Bryant team, Col 16: Bear Bryant player (coach)
    # …pattern continues
    award_columns = [
        ('heisman', 2, 4),
        ('maxwell', 6, 8),
        ('walterCamp', 10, 12),
        ('bearBryantCoachOfTheYear', 14, 16),
        ('daveyOBrien', 18, 20),
        ('chuckBednarik', 22, 24),
    ]
    award_data = {}
    for row in aw_rows:
        year = num(row[1]) if len(row) > 1 else None
        if not year:
            continue
        year_data = {}
        for award_key, team_col, player_col in award_columns:
            if team_col >= len(row) or player_col >= len(row):
                continue
            team = s(row[team_col])
            player = s(row[player_col])
            if team and player:
                year_data[award_key] = {'team': team, 'player': player}
        if year_data:
            award_data[str(year)] = year_data

    print(f'  → Award years extracted: {len(award_data)}')
    dynasty['awardsByYear'] = award_data

    # --- Output ---------------------------------------------------------
    print(f'\nWriting {output_path}…')
    output_path.write_text(json.dumps(dynasty, indent=2, default=str))
    print(f'  → {output_path.stat().st_size / 1024:.1f} KB')
    print('\nDone. Import this file via the homepage "Import File" button.')
    print('After import:')
    print(f'  1. Open Danger Zone → Edit your TeamBuilder team ({user_team_abbr}) and:')
    print(f'     • Set the team it should "Replace" (currently a placeholder)')
    print(f'     • Adjust colors / logo / full name as desired')
    print(f'  2. Player roster years are from progression notation; double-check class field')
    print(f'  3. Conference standings auto-rebuild from games + records')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('xlsx', type=Path, help='Path to the Tracker .xlsx')
    parser.add_argument('output', nargs='?', type=Path, default=None,
                        help='Output JSON path (default: <xlsx-name>-migrated.json)')
    args = parser.parse_args()

    if not args.xlsx.exists():
        sys.exit(f'File not found: {args.xlsx}')
    output = args.output or args.xlsx.with_suffix('').with_name(args.xlsx.stem + '-migrated.json')
    migrate(args.xlsx, output)
