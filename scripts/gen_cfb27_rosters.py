#!/usr/bin/env python3
"""Generate per-team CFB 27 roster JSON (with per-player launch attributes) from
the 'CFB27 Player Ratings (Base Launch).xlsx' workbook.

Output: src/data/cfb27Rosters/{tid}.json  (one file per team, keyed by app tid)
Each player carries an `attributes` map keyed by the app's canonical attribute
names (src/utils/recruitAttributes.js ATTRIBUTE_COLUMNS).
"""
import zipfile, re, html, json, os
import xml.etree.ElementTree as ET

XLSX = "CFB27 Player Ratings (Base Launch).xlsx"
OUT_DIR = "src/data/cfb27Rosters"
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# ---- canonical attribute set (must match ATTRIBUTE_COLUMNS) ----
CANONICAL = {
 'Awareness','Speed','Acceleration','Strength','Agility','Change of Direction','Jumping',
 'Stamina','Toughness','Injury',
 'Throw Power','Short Accuracy','Medium Accuracy','Deep Accuracy','Throw On Run','Under Pressure','Break Sack','Play Action',
 'Carrying','Break Tackle','Juke Move','Spin Move','BC Vision','Stiff Arm','Trucking',
 'Catching','Catch In Traffic','Spectacular Catch','Short Route','Medium Route','Deep Route','Release',
 'Run Block','Run Block Power','Run Block Finesse','Pass Block','Pass Block Power','Pass Block Finesse','Impact Blocking','Lead Block',
 'Block Shedding','Tackle','Hit Power','Power Moves','Finesse Moves','Pursuit','Play Recognition',
 'Man Coverage','Zone Coverage','Press',
 'Kick Power','Kick Accuracy','Punt Power','Punt Accuracy','Kick Return',
}
HEADER_MAP = {
 'Change Of Direction':'Change of Direction','Deep Route Running':'Deep Route',
 'Medium Route Running':'Medium Route','Short Route Running':'Short Route',
 'Throw Acc Deep':'Deep Accuracy','Throw Acc Mid':'Medium Accuracy','Throw Acc Short':'Short Accuracy',
 'Throw On The Run':'Throw On Run','Throw Under Pressure':'Under Pressure',
}
def canon(header):
    h = HEADER_MAP.get(header, header)
    return h if h in CANONICAL else None

YEAR_MAP = {'Freshman':'Fr','Sophomore':'So','Junior':'Jr','Senior':'Sr'}

# ---- sheet name -> app tid (from src/data/teamRegistry.js) ----
def load_registry():
    js = open('src/data/teamRegistry.js').read()
    reg = {}
    for m in re.finditer(r'tid:\s*(\d+),\s*\n\s*abbr:\s*"([^"]*)",\s*\n\s*name:\s*"([^"]*)"', js):
        reg[int(m.group(1))] = m.group(3)
    return reg
REG = load_registry()
EXACT_ALIAS = {  # sheet name -> school string that prefixes the registry name
 'Cal':'California','BYU':'Brigham Young','FAU':'Florida Atlantic',
 'FIU':'Florida International','UMass':'Massachusetts','Southern Miss':'Southern Mississippi',
 'Miami (Ohio)':'Miami Redhawks','Miami':'Miami Hurricanes','UL Monroe':'Monroe',
 'USF':'South Florida','NC State':'North Carolina State','San José State':'San Jose State',
 'Louisiana':'Lafayette',
}
def tid_for(sheet_name):
    search = EXACT_ALIAS.get(sheet_name, sheet_name)
    cands = [(t, rn) for t, rn in REG.items()
             if rn.lower() == search.lower() or rn.lower().startswith(search.lower()+' ')]
    if not cands:
        return None
    cands.sort(key=lambda c: len(c[1]))
    return cands[0][0]

# ---- xlsx reader ----
z = zipfile.ZipFile(XLSX)
sst = []
root = ET.fromstring(z.read('xl/sharedStrings.xml'))
for si in root.findall(f'{NS}si'):
    sst.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))
relroot = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
RNS = '{http://schemas.openxmlformats.org/package/2006/relationships}'
rid2t = {r.get('Id'): r.get('Target') for r in relroot.findall(f'{RNS}Relationship')}
wbroot = ET.fromstring(z.read('xl/workbook.xml'))
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
sheets = []
for s in wbroot.find(f'{NS}sheets').findall(f'{NS}sheet'):
    nm = html.unescape(s.get('name'))
    tgt = rid2t[s.get(RID)]
    if not tgt.startswith('xl/'): tgt = 'xl/' + tgt
    sheets.append((nm, tgt))

def colidx(ref):
    L = re.match(r'[A-Z]+', ref).group(0); n = 0
    for c in L: n = n*26 + ord(c)-64
    return n-1

def read_rows(fname):
    r = ET.fromstring(z.read(fname))
    rows = []
    for row in r.iter(f'{NS}row'):
        cells = {}
        for c in row.findall(f'{NS}c'):
            t = c.get('t'); v = c.find(f'{NS}v'); isv = c.find(f'{NS}is')
            if t == 's' and v is not None: val = sst[int(v.text)]
            elif t == 'inlineStr' and isv is not None: val = ''.join(x.text or '' for x in isv.iter(f'{NS}t'))
            else: val = v.text if v is not None else None
            cells[colidx(c.get('r'))] = val
        mx = max(cells) if cells else -1
        rows.append([cells.get(i) for i in range(mx+1)])
    return rows

def num(v):
    if v is None or str(v).strip() == '': return None
    try: return int(round(float(v)))
    except ValueError: return None

os.makedirs(OUT_DIR, exist_ok=True)
total_players = 0; written = 0; unmatched = []
for sheet_name, fname in sheets:
    rows = read_rows(fname)
    if not rows: continue
    header = [h if h is not None else '' for h in rows[0]]
    tid = tid_for(sheet_name)
    if tid is None:
        unmatched.append(sheet_name); continue
    # attribute column index -> canonical name
    attr_cols = {}
    for i, h in enumerate(header):
        cn = canon(h)
        if cn: attr_cols[i] = cn
    idx = {h: i for i, h in enumerate(header)}
    players = []
    for row in rows[1:]:
        def cell(col): return row[idx[col]] if col in idx and idx[col] < len(row) else None
        first = (cell('First Name') or '').strip()
        last = (cell('Last Name') or '').strip()
        if not first and not last: continue
        attributes = {}
        for i, cn in attr_cols.items():
            val = num(row[i]) if i < len(row) else None
            if val is not None: attributes[cn] = val
        players.append({
            'name': (first + ' ' + last).strip(),
            'firstName': first,
            'lastName': last,
            'position': (cell('Position') or '').strip(),
            'jerseyNumber': str(num(cell('Jersey #')) if num(cell('Jersey #')) is not None else '').strip() or '',
            'height': (cell('Height') or '').strip(),
            'weight': num(cell('Weight')),
            'class': YEAR_MAP.get((cell('Year') or '').strip(), 'Fr'),
            'archetype': '',
            'devTrait': '',
            'overall': num(cell('Overall Rating')) or 0,
            'hometown': (cell('Hometown') or '').strip(),
            'state': (cell('Home State') or '').strip(),
            'redshirt': (cell('Redshirt') or '').strip(),
            'abilities': [],
            'attributes': attributes,
        })
    out = {'tid': tid, 'teamName': sheet_name, 'source': 'CFB27 Player Ratings (Base Launch)', 'players': players}
    with open(os.path.join(OUT_DIR, f'{tid}.json'), 'w') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    total_players += len(players); written += 1

print(f"wrote {written} team files, {total_players} players -> {OUT_DIR}")
if unmatched:
    print("UNMATCHED SHEETS:", unmatched)
