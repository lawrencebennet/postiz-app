#!/usr/bin/env python3
"""Structured diff of two `pg_dump --schema-only` files.

usage: schema-diff.py before.sql after.sql

Lists new/dropped tables, new/dropped/altered columns, indexes, constraints and enums,
and flags anything that can lose or rewrite data. Pure stdlib.
"""
import re
import sys


def parse(path):
    s = open(path).read()
    tables, indexes, constraints, enums = {}, {}, {}, {}
    for m in re.finditer(r'CREATE TABLE public\.("?[\w]+"?) \((.*?)\n\);', s, re.S):
        name = m.group(1).strip('"')
        cols = {}
        for line in m.group(2).strip().split('\n'):
            line = line.strip().rstrip(',')
            cm = re.match(r'("?[\w]+"?) (.+)', line)
            if cm:
                cols[cm.group(1).strip('"')] = cm.group(2)
        tables[name] = cols
    for m in re.finditer(r'CREATE (?:UNIQUE )?INDEX ("?[\w]+"?) ON public\.("?\w+"?) (.*?);', s):
        full = m.group(0)
        indexes[m.group(1).strip('"')] = (m.group(2).strip('"'), full)
    for m in re.finditer(r'ALTER TABLE ONLY public\.("?\w+"?)\s+ADD CONSTRAINT ("?\w+"?) (.*?);', s, re.S):
        constraints[m.group(2).strip('"')] = (m.group(1).strip('"'), ' '.join(m.group(3).split()))
    for m in re.finditer(r'CREATE TYPE public\.("?\w+"?) AS ENUM \((.*?)\);', s, re.S):
        enums[m.group(1).strip('"')] = re.findall(r"'([^']*)'", m.group(2))
    return tables, indexes, constraints, enums


def main(a, b):
    ta, ia, ca, ea = parse(a)
    tb, ib, cb, eb = parse(b)
    out = []
    p = out.append
    risk = []

    new_t = sorted(set(tb) - set(ta))
    drop_t = sorted(set(ta) - set(tb))
    p(f'## New tables ({len(new_t)})')
    p(', '.join(new_t) or '-')
    p(f'\n## Dropped tables ({len(drop_t)})')
    p(', '.join(drop_t) or '-')
    if drop_t:
        risk.append('DROPPED TABLES: ' + ', '.join(drop_t))

    p('\n## New columns on existing tables')
    n = 0
    for t in sorted(set(ta) & set(tb)):
        for c in sorted(set(tb[t]) - set(ta[t])):
            n += 1
            d = tb[t][c]
            p(f'  {t}.{c}: {d}')
            if 'NOT NULL' in d and 'DEFAULT' not in d:
                risk.append(f'NOT NULL column without default added to existing table: {t}.{c} (fails if table has rows)')
    if not n:
        p('  -')

    p('\n## Dropped columns')
    n = 0
    for t in sorted(set(ta) & set(tb)):
        for c in sorted(set(ta[t]) - set(tb[t])):
            n += 1
            p(f'  {t}.{c}: {ta[t][c]}')
            risk.append(f'DROPPED COLUMN {t}.{c}')
    if not n:
        p('  -')

    p('\n## Altered columns')
    n = 0
    for t in sorted(set(ta) & set(tb)):
        for c in sorted(set(ta[t]) & set(tb[t])):
            if ta[t][c] != tb[t][c]:
                n += 1
                p(f'  {t}.{c}: {ta[t][c]}  ->  {tb[t][c]}')
                risk.append(f'ALTERED COLUMN {t}.{c}: {ta[t][c]} -> {tb[t][c]}')
    if not n:
        p('  -')

    p('\n## Indexes')
    for k in sorted(set(ib) - set(ia)):
        p(f'  + {k} on {ib[k][0]}' + ('  [UNIQUE]' if 'UNIQUE' in ib[k][1] else ''))
        if 'UNIQUE' in ib[k][1] and ib[k][0] in ta:
            risk.append(f'NEW UNIQUE INDEX {k} on existing table {ib[k][0]} (fails on duplicates)')
    for k in sorted(set(ia) - set(ib)):
        p(f'  - {k} on {ia[k][0]}')
    for k in sorted(set(ia) & set(ib)):
        if ia[k][1] != ib[k][1]:
            p(f'  ~ {k} changed')

    p('\n## Constraints (PK/FK/unique)')
    for k in sorted(set(cb) - set(ca)):
        p(f'  + {k} on {cb[k][0]}: {cb[k][1][:110]}')
        if cb[k][0] in ta and 'FOREIGN KEY' in cb[k][1]:
            risk.append(f'NEW FOREIGN KEY {k} on existing table {cb[k][0]} (fails on orphan rows)')
    for k in sorted(set(ca) - set(cb)):
        p(f'  - {k} on {ca[k][0]}')

    p('\n## Enums')
    for k in sorted(set(eb) - set(ea)):
        p(f'  + new enum {k}')
    for k in sorted(set(ea) - set(eb)):
        p(f'  - dropped enum {k}')
        risk.append(f'DROPPED ENUM {k}')
    for k in sorted(set(ea) & set(eb)):
        if ea[k] != eb[k]:
            p(f'  ~ {k}: +{sorted(set(eb[k]) - set(ea[k]))} -{sorted(set(ea[k]) - set(eb[k]))}')
            if set(ea[k]) - set(eb[k]):
                risk.append(f'ENUM VALUE REMOVED in {k}')

    p('\n## Data-loss / rewrite flags')
    for r in risk:
        p('  ! ' + r)
    if not risk:
        p('  none')
    print('\n'.join(out))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
