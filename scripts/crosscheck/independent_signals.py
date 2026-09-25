#!/usr/bin/env python3
"""
Independent re-implementation of the V1 BUY decision rules, written from
docs/v1/strategy-rules-v1.md (default config) WITHOUT reusing any TypeScript code.
It rebuilds Bid candles from the Exness tick zips and lists every 'signal' candle.
Used to cross-check the TypeScript engine's signals on real data.

  python3 scripts/crosscheck/independent_signals.py docs/data/Exness_EURUSD_2026_0?.zip \
      --end 2026-09-25T00:00:00Z > signals.txt
"""
import io, sys, zipfile, datetime as dt

TF_MIN = {"M15": 15, "M30": 30, "H1": 60}
# Default config/v1.yaml values (points: 1 pip = 10 points)
P = {
    "M15": dict(tol=20, swing=80, rng=30),
    "M30": dict(tol=30, swing=100, rng=40),
    "H1": dict(tol=50, swing=150, rng=50),
}
EMA_F, EMA_S, RSI_N, WARMUP = 50, 200, 14, 1000
PULLBACK, SWING_LB = 3, 20
RSI_OS, RSI_MID, RSI_LB = 35, 50, 5
PIN_WB, PIN_WR, PIN_UP = 2.0, 0.6, 0.2
WIN_START, WIN_END = 8 * 60, 23 * 60  # Dubai minutes, inclusive
DUBAI = dt.timedelta(hours=4)

def parse_ts(s):
    s = s.strip('"')
    return int(dt.datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc).timestamp() * 1000) + int(s[20:23])

def load_m15(files, end_ms):
    candles = {}  # open_ms -> [o,h,l,c]
    order = []
    for f in sorted(files):
        with zipfile.ZipFile(f) as z:
            for name in z.namelist():
                with z.open(name) as fh:
                    next(fh)
                    for raw in io.TextIOWrapper(fh):
                        parts = raw.rstrip("\n").split(",")
                        t = parse_ts(parts[2])
                        if t >= end_ms:
                            continue
                        bid = round(float(parts[3]) * 100000)
                        b = t - t % (15 * 60000)
                        c = candles.get(b)
                        if c is None:
                            candles[b] = [bid, bid, bid, bid]
                            order.append(b)
                        else:
                            if bid > c[1]: c[1] = bid
                            if bid < c[2]: c[2] = bid
                            c[3] = bid
    return [(b, *candles[b]) for b in order]

def resample(m15, minutes):
    out, cur = [], None
    size = minutes * 60000
    for b, o, h, l, c in m15:
        k = b - b % size
        if cur and cur[0] == k:
            cur[2] = max(cur[2], h); cur[3] = min(cur[3], l); cur[4] = c
        else:
            if cur: out.append(tuple(cur))
            cur = [k, o, h, l, c]
    if cur: out.append(tuple(cur))
    return out

def ema(xs, n):
    out = [None] * len(xs)
    if len(xs) < n: return out
    a = 2 / (n + 1)
    v = sum(xs[:n]) / n
    out[n - 1] = v
    for k in range(n, len(xs)):
        v = v + a * (xs[k] - v)
        out[k] = v
    return out

def rsi(xs, n):
    out = [None] * len(xs)
    if len(xs) <= n: return out
    g = sum(max(xs[k] - xs[k - 1], 0) for k in range(1, n + 1)) / n
    l = sum(max(xs[k - 1] - xs[k], 0) for k in range(1, n + 1)) / n
    f = lambda g, l: (100.0 if g > 0 else 50.0) if l == 0 else 100 - 100 / (1 + g / l)
    out[n] = f(g, l)
    for k in range(n + 1, len(xs)):
        d = xs[k] - xs[k - 1]
        g = (g * (n - 1) + max(d, 0)) / n
        l = (l * (n - 1) + max(-d, 0)) / n
        out[k] = f(g, l)
    return out

def signals(candles, tf):
    p = P[tf]
    closes = [c[4] for c in candles]
    ef, es, r = ema(closes, EMA_F), ema(closes, EMA_S), rsi(closes, RSI_N)
    res = []
    for i in range(WARMUP, len(candles)):
        b, o, h, l, c = candles[i]
        close_t = dt.datetime.fromtimestamp((b + TF_MIN[tf] * 60000) / 1000, dt.timezone.utc) + DUBAI
        m = close_t.hour * 60 + close_t.minute
        if not (WIN_START <= m <= WIN_END): continue
        # Rule 1
        if not (ef[i] > es[i] and c > ef[i] and c > es[i]): continue
        # Rule 2
        T = [k for k in range(i - PULLBACK + 1, i + 1) if candles[k][3] <= ef[k] + p["tol"]]
        if not T: continue
        t = T[0]
        if not any(candles[j][2] - ef[j] >= p["swing"] for j in range(max(0, t - SWING_LB), t)): continue
        # Rule 3
        rising = r[i] > r[i - 1]
        mn = min(r[k] for k in range(i - RSI_LB, i + 1))
        if not ((mn <= RSI_OS and r[i] > RSI_OS and rising) or (r[i] > RSI_MID and rising)): continue
        # Rule 4
        pb, po, ph, pl, pc = candles[i - 1]
        engulf = pc < po and c > o and o <= pc and c >= po and abs(c - o) > abs(pc - po) and (i - 1 in T or i in T)
        rg = h - l; body = abs(c - o); lw = min(o, c) - l; uw = h - max(o, c)
        pin = rg >= p["rng"] and rg > 0 and lw >= PIN_WB * body and lw >= PIN_WR * rg and uw <= PIN_UP * rg and i in T
        if engulf or pin:
            res.append(dt.datetime.fromtimestamp(b / 1000, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"))
    return res

if __name__ == "__main__":
    args = sys.argv[1:]
    end = args[args.index("--end") + 1]
    files = [a for a in args if a.endswith(".zip")]
    end_ms = int(dt.datetime.fromisoformat(end.replace("Z", "+00:00")).timestamp() * 1000)
    m15 = load_m15(files, end_ms)
    series = {"M15": m15, "M30": resample(m15, 30), "H1": resample(m15, 60)}
    for tf in ("M15", "M30", "H1"):
        for s in signals(series[tf], tf):
            print(f"EURUSD|{tf}|{s}")
