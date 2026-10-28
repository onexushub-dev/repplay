"""Monte Carlo: chance that a held gesture fires, given the share of samples where the pose reads the arms up."""
import random, sys
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__file__), '..'))
from report import Hold
random.seed(1)

def trial(p, hold_s, **kw):
    h = Hold(**kw); t = 0; armed = -1
    while t < hold_s:
        hit = random.random() < p
        if h.update(hit, t): return True
        if hit: armed = t + 2
        t += 0.125 if t < armed else 0.25
    return False

for p in [0.88, 0.74, 0.51, 0.43, 0.28, 0.11]:
    row = []
    for hold_s in [2.0, 3.0]:
        for name, kw in [('previous', dict(gap=0.8, min_hits=4)), ('v2', {})]:
            row.append(f"{name}@{hold_s:.0f}s {sum(trial(p, hold_s, **kw) for _ in range(4000)) / 4000:.0%}")
    print(f"p={p:.2f}: " + '  '.join(row))
