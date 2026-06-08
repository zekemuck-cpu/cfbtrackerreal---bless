#!/usr/bin/env python3
"""
teamcrafters_scraper.py
Scrape CFB player ratings from TeamCrafters roster pages into CSV/TSV.

The roster tables are server-rendered, so a plain HTTP fetch + HTML parse
works (no headless browser needed).

Examples
--------
  # One team (Colorado State = 647) for the default roster version:
  python3 teamcrafters_scraper.py --team 647

  # Every team in a roster version, written as TSV:
  python3 teamcrafters_scraper.py --all --out all_players.tsv

  # A different roster version:
  python3 teamcrafters_scraper.py --all --version update-01-29-2026

Be polite: there is a delay between requests by default. This is a small
community site, so don't hammer it.
"""

import argparse
import csv
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE = "https://www.teamcrafters.net"
DEFAULT_VERSION = "update-02-17-2026"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; roster-scraper/1.0)"}

# The 9 numeric columns, in the order they appear in the table.
STAT_COLUMNS = ["OVR", "SPD", "STR", "AGI", "ACC", "COD", "INJ", "STA", "AWR"]

# Player cell text looks like:  TE#81•6'5" 250lbs•SRRS•Physical Route Runner
# (positions can be multi-letter like ROLB; year is FR/SO/JR/SR + optional RS)
BIO_RE = re.compile(
    r"^(?P<pos>[A-Z]+)#(?P<num>\d+)\u2022"
    r"(?P<height>\d+'\d+\")\s+(?P<weight>\d+)lbs\u2022"
    r"(?P<year>FR|SO|JR|SR)(?P<redshirt>RS)?\u2022"
    r"(?P<archetype>.+)$"
)

OUTPUT_COLUMNS = (
    ["team_id", "team", "name", "pos", "num", "height", "weight",
     "year", "redshirt", "archetype", "abilities"]
    + STAT_COLUMNS
    + ["url", "raw_bio"]
)


def get_session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def fetch(session, url):
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def find_ratings_table(soup):
    """Return the table whose header row contains OVR + SPD."""
    for table in soup.find_all("table"):
        head = table.find("tr")
        if not head:
            continue
        htext = head.get_text(" ", strip=True).upper()
        if "OVR" in htext and "SPD" in htext:
            return table
    return None


def parse_row(tds, version, team_id, team_name):
    cell = tds[0]
    a = cell.find("a")
    name = a.get_text(strip=True) if a else ""
    href = a["href"] if (a and a.has_attr("href")) else ""
    if href and href.startswith("/"):
        href = BASE + href
    abilities = [img.get("alt", "").strip()
                 for img in cell.find_all("img") if img.get("alt")]

    # Remove the name link + ability icons, leaving just the bio text.
    if a:
        a.extract()
    for img in cell.find_all("img"):
        img.extract()
    bio = cell.get_text(strip=True)

    row = {c: "" for c in OUTPUT_COLUMNS}
    row.update({"team_id": team_id, "team": team_name, "name": name,
                "url": href, "abilities": "; ".join(abilities)})

    m = BIO_RE.match(bio)
    if m:
        row["pos"] = m.group("pos")
        row["num"] = m.group("num")
        row["height"] = m.group("height")
        row["weight"] = m.group("weight")
        row["year"] = m.group("year")
        row["redshirt"] = "yes" if m.group("redshirt") else "no"
        row["archetype"] = m.group("archetype").strip()
    else:
        row["raw_bio"] = bio  # keep the raw text if the pattern ever changes

    # The 9 stat cells follow the player cell.
    for col, td in zip(STAT_COLUMNS, tds[1:1 + len(STAT_COLUMNS)]):
        val = td.get_text(strip=True)
        row[col] = int(val) if val.isdigit() else val
    return row


def scrape_team(session, version, team_id):
    url = f"{BASE}/rosters/CFB26/{version}/{team_id}"
    soup = BeautifulSoup(fetch(session, url), "html.parser")
    h1 = soup.find("h1")
    team_name = h1.get_text(strip=True) if h1 else ""
    table = find_ratings_table(soup)
    if table is None:
        return team_name, []
    players = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 1 + len(STAT_COLUMNS):
            continue
        if not tds[0].find("a"):  # skip header / non-player rows
            continue
        players.append(parse_row(tds, version, team_id, team_name))
    return team_name, players


def get_team_ids(session, version):
    """Pull every team id from the roster-version index page."""
    html = fetch(session, f"{BASE}/rosters/CFB26/{version}")
    ids = re.findall(rf"/rosters/CFB26/{re.escape(version)}/(\d+)\b", html)
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def write_rows(rows, out_path, delimiter):
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS, delimiter=delimiter)
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description="Scrape TeamCrafters CFB rosters.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--team", help="Single team id, e.g. 647")
    g.add_argument("--all", action="store_true", help="Scrape every team")
    ap.add_argument("--version", default=DEFAULT_VERSION,
                    help=f"Roster version slug (default: {DEFAULT_VERSION})")
    ap.add_argument("--out", help="Output file (default players.csv)")
    ap.add_argument("--format", choices=["csv", "tsv"],
                    help="Output format (inferred from --out extension if unset)")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="Seconds to wait between team requests (default 1.0)")
    ap.add_argument("--limit", type=int,
                    help="With --all, only scrape the first N teams (for testing)")
    args = ap.parse_args()

    out = args.out or "players.csv"
    fmt = args.format or ("tsv" if out.lower().endswith(".tsv") else "csv")
    delimiter = "\t" if fmt == "tsv" else ","

    session = get_session()

    if args.team:
        team_ids = [args.team]
    else:
        print("Fetching team list...", file=sys.stderr)
        team_ids = get_team_ids(session, args.version)
        if args.limit:
            team_ids = team_ids[:args.limit]
        print(f"Found {len(team_ids)} teams.", file=sys.stderr)

    all_rows = []
    for n, tid in enumerate(team_ids, 1):
        try:
            team_name, players = scrape_team(session, args.version, tid)
        except requests.RequestException as e:
            print(f"  [{n}/{len(team_ids)}] team {tid}: request failed ({e})",
                  file=sys.stderr)
            continue
        if not players:
            print(f"  [{n}/{len(team_ids)}] team {tid} ({team_name}): "
                  f"no table found (page may be empty or layout changed)",
                  file=sys.stderr)
        else:
            print(f"  [{n}/{len(team_ids)}] team {tid} ({team_name}): "
                  f"{len(players)} players", file=sys.stderr)
            all_rows.extend(players)
        if len(team_ids) > 1 and n < len(team_ids):
            time.sleep(args.delay)

    write_rows(all_rows, out, delimiter)
    print(f"\nWrote {len(all_rows)} players to {out} ({fmt}).", file=sys.stderr)


if __name__ == "__main__":
    main()
