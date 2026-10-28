import json, sys, collections
rows = [json.loads(l) for l in open(sys.argv[1])]
H = [200, 140, 110, 90, 75, 60, 50, 40, 32]
pos = [r for r in rows if r['gt']]; neg = [r for r in rows if not r['gt']]
rpos = [r for r in rows if r['gt_raised']]; rneg = [r for r in rows if not r['gt_raised']]
print(f"people samples: {len(rows)}  arms-up (ArmsUp) GT: {len(pos)}  raised GT: {len(rpos)}  files: {len(set(r['file'] for r in rows))}")
print(f"{'H px':>5} | {'found':>6} {'joints':>6} | {'ArmsUp recall':>13} {'false+':>7} | {'raised recall':>13} {'false+':>7}")
for h in H:
    k = f'c{h}'; kr = f'r{h}'
    found = sum(r[k] != 'miss' for r in rows) / len(rows)
    readable = sum(r[k] in ('up', 'down') for r in rows) / len(rows)
    rec = sum(r[k] == 'up' for r in pos) / max(1, len(pos))
    fp = sum(r[k] == 'up' for r in neg) / max(1, len(neg))
    rrec = sum(r.get(kr) == 'up' for r in rpos) / max(1, len(rpos))
    rfp = sum(r.get(kr) == 'up' for r in rneg) / max(1, len(rneg))
    print(f"{h:>5} | {found:6.0%} {readable:6.0%} | {rec:13.0%} {fp:7.1%} | {rrec:13.0%} {rfp:7.1%}")
