"""Summarizes gesture-probe results by distance, and replays the recorded poses with looser gesture rules.

    python3 report.py clips/            # every clips/*.gesture.json

Clip names: <gesture>-<distance>m-<n>.<ext>, e.g. hold-15m-01.mov, wave-20m-02.mov, play-01.mov.
A gesture clip holds 3 deliberate gestures (see README); a play-* clip holds none, so every fire there is a false one.
Override the expected count with clips/expected.csv (file,expected).

The replay is a Python port of ReplayCore's ArmsUp, HoldTracker and WaveTracker (keep in sync). The "app" variant must
match the probe's own "standard" fires; the others show what looser rules would do on the same poses.
"""
import csv, glob, json, math, os, re, sys

# ---------- port of ReplayCore (ArmsUp.swift, WaveTracker.swift) ----------

def usable(p, conf):
    return p if (p is not None and p[2] >= conf) else None

def head_line(s, conf=0.2, nose_above=0.75):
    ls, rs = usable(s['ls'], conf), usable(s['rs'], conf)
    if ls is None or rs is None: return None
    width = abs(ls[0] - rs[0])
    if width <= 0: return None
    nose = usable(s['nose'], conf)
    if nose is not None: return nose[1], width
    return (ls[1] + rs[1]) / 2 - nose_above * width, width

def arms_up(s, conf=0.2, rise=0.35, elbows=True):
    lw, rw = usable(s['lw'], conf), usable(s['rw'], conf)
    head = head_line(s, conf)
    if lw is None or rw is None or head is None: return False
    line = head[0] - rise * head[1]
    if not (lw[1] < line and rw[1] < line): return False
    if elbows:
        le, re_ = usable(s['le'], conf), usable(s['re'], conf)
        if le is not None and s['ls'] is not None and not (le[1] < s['ls'][1]): return False
        if re_ is not None and s['rs'] is not None and not (re_[1] < s['rs'][1]): return False
    return True

class Hold:
    def __init__(self, hold=1.5, cooldown=3.0, gap=1.2, min_hits=3):
        self.hold, self.cooldown, self.gap, self.min_hits = hold, cooldown, gap, min_hits
        self.run_start = None; self.last_hit = None; self.hits = 0
        self.cooldown_until = -math.inf; self.awaiting = False

    def update(self, is_x, t):
        if self.last_hit is not None and t - self.last_hit > self.gap + 1e-9:
            self.run_start = None; self.last_hit = None; self.hits = 0; self.awaiting = False
        if not is_x: return False
        self.last_hit = t
        if self.awaiting: return False
        if self.run_start is None:
            self.run_start = t; self.hits = 0
        self.hits += 1
        if t - self.run_start >= self.hold - 1e-9 and self.hits >= self.min_hits and t >= self.cooldown_until:
            self.run_start = None; self.hits = 0; self.awaiting = True; self.cooldown_until = t + self.cooldown
            return True
        return False

class PersonHold:
    """ReplayCore PersonHold: one Hold per person id, a global 3 s cooldown after any fire."""
    def __init__(self, forget=10.0, cooldown=3.0, **hold_kw):
        self.holds = {}; self.forget = forget; self.cooldown = cooldown; self.cooldown_until = -math.inf; self.kw = hold_kw

    def update(self, people, t):
        fired = False
        for pid, up in people:
            h = self.holds.get(pid, (None, 0))[0] or Hold(**self.kw)
            self.holds[pid] = (h, t)
            if h.update(up, t): fired = True
        self.holds = {k: v for k, v in self.holds.items() if t - v[1] <= self.forget}
        if not fired or t < self.cooldown_until: return False
        self.cooldown_until = t + self.cooldown
        return True

class FireGate:
    """ReplayCore FireGate: after a fire, nothing until nobody had the arms up for `release` and `cooldown` passed."""
    def __init__(self, cooldown=3.0, release=1.0):
        self.cooldown, self.release = cooldown, release
        self.last_fire = -math.inf; self.last_raised = -math.inf; self.awaiting = False

    def update(self, fired, any_raised, t):
        if any_raised: self.last_raised = t
        if self.awaiting:
            if not (t - self.last_raised > self.release + 1e-9 and t - self.last_fire >= self.cooldown - 1e-9): return False
            self.awaiting = False
        if not fired: return False
        self.awaiting = True; self.last_fire = t
        return True

class Wave:
    def __init__(self, window=1.6, min_span=1.0, min_samples=5, raised_fraction=0.75, min_range=0.4, min_path=0.8,
                 cooldown=3.0, release=0.8, match=0.15):
        self.__dict__.update(window=window, min_span=min_span, min_samples=min_samples, raised_fraction=raised_fraction,
                             min_range=min_range, min_path=min_path, cooldown=cooldown, release=release, match=match)
        self.tracks = []; self.cooldown_until = -math.inf; self.awaiting = False; self.last_raised = -math.inf

    @staticmethod
    def measure(s, conf=0.2):
        lw, rw = s['lw'], s['rw']
        if lw is None or rw is None or lw[2] < conf or rw[2] < conf: return None
        head = head_line(s, conf)
        if head is None or s['ls'] is None or s['rs'] is None: return None
        mid = (s['ls'][0] + s['rs'][0]) / 2
        return (lw[1] < head[0] and rw[1] < head[0], (lw[0] - mid) / head[1], (rw[0] - mid) / head[1])

    def update(self, sightings, t):
        self.tracks = [k for k in self.tracks if k['samples'] and t - k['samples'][-1][0] <= self.window]
        used = set(); any_raised = False
        for s in sightings:
            m = Wave.measure(s)
            if m is None: continue
            best, bd = None, self.match
            sid = s.get('id', -1)
            for i, k in enumerate(self.tracks):
                if i in used: continue
                if sid >= 0:
                    if k.get('id', -1) == sid: best = i; break
                    continue
                if k.get('id', -1) >= 0: continue
                d = max(abs(k['x'] - s['x']), abs(k['y'] - s['y']))
                if d <= bd: best, bd = i, d
            if best is None:
                self.tracks.append({'x': s['x'], 'y': s['y'], 'id': s.get('id', -1), 'samples': []}); best = len(self.tracks) - 1
            used.add(best)
            k = self.tracks[best]; k['x'], k['y'] = s['x'], s['y']
            k['samples'].append((t, m[0], m[1], m[2]))
            k['samples'] = [x for x in k['samples'] if t - x[0] <= self.window + 1e-9]
            if m[0]: any_raised = True
        if any_raised: self.last_raised = t
        if self.awaiting:
            if t - self.last_raised > self.release + 1e-9: self.awaiting = False
            else: return False
        if t < self.cooldown_until: return False
        for k in self.tracks:
            if self.waves(k['samples']):
                self.awaiting = True; self.cooldown_until = t + self.cooldown; self.last_raised = t; self.tracks = []
                return True
        return False

    def waves(self, samples):
        if len(samples) < self.min_samples or samples[-1][0] - samples[0][0] < self.min_span - 1e-9: return False
        raised = [x for x in samples if x[1]]
        if len(raised) / len(samples) < self.raised_fraction: return False
        return self.swings([x[2] for x in raised]) and self.swings([x[3] for x in raised])

    def swings(self, xs):
        if not xs or max(xs) - min(xs) < self.min_range: return False
        return sum(abs(xs[i] - xs[i - 1]) for i in range(1, len(xs))) >= self.min_path

# ---------- variants ----------

VARIANTS = {
    'app': dict(),
    'previousHold': dict(gap=0.8, min_hits=4),   # HoldTracker before gesture v2
    'rise0.2': dict(rise=0.2),
    'noElbows': dict(elbows=False),
    'hold1.2s': dict(hold=1.2),
}

def replay(samples, rise=0.35, gap=1.2, min_hits=3, elbows=True, hold=1.5):
    h, w, g = PersonHold(hold=hold, gap=gap, min_hits=min_hits), Wave(), FireGate()
    fires = []
    for s in samples:
        sightings = s['sightings']
        people = {}
        for x in sightings:
            pid = x.get('id', -1)
            people[pid] = people.get(pid, False) or arms_up(x, rise=rise, elbows=elbows)
        held = h.update(list(people.items()), s['t'])
        waved = w.update(sightings, s['t'])
        any_raised = any(arms_up(x) or (Wave.measure(x) or (False,))[0] for x in sightings)
        if g.update(held or waved, any_raised, s['t']): fires.append(s['t'])
    return fires

def debounce(fires, ms=3000):
    """The app's trigger bus drops a trigger within 3 s of the last accepted one (hold and wave on the same gesture)."""
    out = []
    for t in fires:
        if not out or (t - out[-1]) * 1000 >= ms: out.append(t)
    return out

def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else '.'
    expected = {}
    exp_path = os.path.join(folder, 'expected.csv')
    if os.path.exists(exp_path):
        with open(exp_path) as f:
            for row in csv.DictReader(f): expected[row['file']] = int(row['expected'])
    rows = []
    for path in sorted(glob.glob(os.path.join(folder, '*.gesture.json'))):
        d = json.load(open(path))
        name = d['file']
        m = re.match(r'([a-z]+)-(\d+)m', name)
        gesture, dist = (m.group(1), int(m.group(2))) if m else (name.split('-')[0], None)
        exp = expected.get(name, 0 if gesture == 'play' else 3)
        r = {'file': name, 'gesture': gesture, 'dist': dist, 'expected': exp, 'minutes': d['duration'] / 60}
        r['wholeFrame'] = len(debounce(d['wholeFrame']['fires']))
        r['standard'] = len(debounce(d['standard']['fires']))
        for v, kw in VARIANTS.items(): r[v] = len(debounce(replay(d['standard']['samples'], **kw)))
        px = [s['smallestPx'] for s in d['standard']['samples'] if s['smallestPx'] > 0]
        r['px'] = sorted(px)[len(px) // 2] if px else 0
        r['posed'] = sum(1 for s in d['standard']['samples'] if s['sightings']) / max(1, len(d['standard']['samples']))
        rows.append(r)
        if r['app'] != r['standard']:
            print(f"warning: the Python port disagrees with the app on {name}: {r['app']} vs {r['standard']}")
    cols = ['wholeFrame', 'standard'] + [v for v in VARIANTS if v != 'app']
    print(f"{'file':28} {'dist':>4} {'exp':>3} {'px':>4} {'pose%':>5} | " + ' '.join(f'{c:>16}' for c in cols))
    for r in rows:
        print(f"{r['file'][:28]:28} {str(r['dist'] or ''):>4} {r['expected']:>3} {r['px']:>4} {r['posed']:5.0%} | "
              + ' '.join(f'{r[c]:>16}' for c in cols))
    print('\nHits (capped at expected) / expected, by gesture and distance; false fires per 10 min of play:')
    groups = sorted({(r['gesture'], r['dist']) for r in rows if r['gesture'] != 'play'}, key=lambda g: (g[0], g[1] or 0))
    for g in groups:
        rs = [r for r in rows if (r['gesture'], r['dist']) == g]
        exp = sum(r['expected'] for r in rs)
        print(f"  {g[0]:6} {str(g[1]) + ' m':>5}: " + '  '.join(f"{c} {sum(min(r[c], r['expected']) for r in rs)}/{exp}" for c in cols))
    play = [r for r in rows if r['gesture'] == 'play']
    if play:
        minutes = sum(r['minutes'] for r in play)
        print(f"  play   ({minutes:.0f} min): " + '  '.join(f"{c} {sum(r[c] for r in play) * 10 / max(minutes, 1e-9):.1f}" for c in cols))

if __name__ == '__main__':
    main()
