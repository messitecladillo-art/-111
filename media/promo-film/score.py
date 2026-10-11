"""Original score for the 证见 EVI-X film, synthesized from scratch with numpy (no samples).

96 BPM. D minor through the history and the logo hit, taiko drive under the product montage and the
nine seals, a quiet turn for the integrity lines, then D major for the dawn. Every accent is placed from
cues.json so picture and music stay locked. Usage: python3 score.py [out.wav]
"""
import json
import struct
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CUES = json.loads((HERE / 'cues.json').read_text(encoding='utf-8'))
SR = 48000
DUR = float(CUES['duration'])
N = int(SR * DUR)
BEAT = 60.0 / CUES['bpm']
rng = np.random.default_rng(20261011)

dry = np.zeros((2, N))
send = np.zeros((2, N))


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def tline(dur):
    return np.arange(int(dur * SR)) / SR


def place(sig, t0, gain=1.0, pan=0.0, rev=0.3):
    """Add a mono or stereo signal at t0 seconds with equal-power panning and a reverb send."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    n = min(sig.shape[1], N - max(i0, 0))
    if i0 < 0:
        sig = sig[:, -i0:]
        i0 = 0
        n = min(sig.shape[1], N)
    dry[:, i0:i0 + n] += sig[:, :n] * gain
    send[:, i0:i0 + n] += sig[:, :n] * gain * rev


def filt(x, lo=None, hi=None, order=2):
    """Zero-phase band shaping in the frequency domain."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if hi:
        m /= np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        m *= 1 / np.sqrt(1 + (np.maximum(lo, 1e-9) / np.maximum(f, 1e-9)) ** (2 * order))
    return np.fft.irfft(X * m, len(x))


def env_adsr(n, a, d, s, r, total):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-4), s))
    rel_start = total - r
    e = np.where(t > rel_start, e * np.clip(1 - (t - rel_start) / max(r, 1e-4), 0, 1), e)
    return e


# ——— instruments ———
def pad(midis, dur, attack=1.2, release=1.4, bright=.5, voices=3, vib=.0):
    t = tline(dur)
    out = np.zeros((2, len(t)))
    for m in midis:
        f0 = hz(m)
        for v in range(voices):
            det = (v - (voices - 1) / 2) * 7 / 1200
            ph = rng.uniform(0, 2 * np.pi, 12)
            vibr = 1 + vib * np.sin(2 * np.pi * (4.7 + v * .3) * t + ph[0]) * .003
            s = np.zeros(len(t))
            for h in range(1, 11):
                f = f0 * h * (1 + det)
                if f > 12000:
                    break
                s += (1 / h) * np.exp(-h * (1 - bright) * .55) * np.sin(2 * np.pi * f * t * vibr + ph[h])
            pan = (v - (voices - 1) / 2) * .6
            a = (pan + 1) * np.pi / 4
            out[0] += s * np.cos(a)
            out[1] += s * np.sin(a)
    e = env_adsr(len(t), attack, .5, .9, release, dur)
    return out * e / (len(midis) * voices) * 1.6


def piano(m, dur=4.0, vel=1.0):
    t = tline(dur)
    f0 = hz(m)
    s = np.zeros(len(t))
    B = .00035
    for string in (-.6, .6):
        for h in range(1, 12):
            f = f0 * h * np.sqrt(1 + B * h * h) * (1 + string / 1200)
            if f > 15000:
                break
            tau = 2.8 / (1 + .38 * h) * (1.4 if m < 60 else 1)
            s += (1 / h ** 1.15) * np.exp(-t / tau) * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
    s *= np.minimum(1, t / .004)
    ham = filt(rng.standard_normal(int(.03 * SR)), 900, 5000) * np.exp(-np.arange(int(.03 * SR)) / SR / .006)
    s[:len(ham)] += ham * .25
    s *= np.where(t > dur - .3, np.clip((dur - t) / .3, 0, 1), 1)
    return s * vel * .32


def bell(m, dur=3.5, vel=1.0):
    t = tline(dur)
    f0 = hz(m)
    s = np.zeros(len(t))
    for r, a, tau in ((1, 1, 2.6), (2.76, .5, 1.4), (5.4, .28, .8), (8.93, .16, .45), (2.0, .3, 2.0)):
        s += a * np.exp(-t / tau) * np.sin(2 * np.pi * f0 * r * t + rng.uniform(0, 6.28))
    s *= np.minimum(1, t / .002)
    return s * vel * .22


def bass(m, dur, vel=1.0):
    t = tline(dur)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * 2 * f * t) + .12 * np.sin(2 * np.pi * 3 * f * t)
    s = np.tanh(1.6 * s)
    e = np.minimum(1, t / .006) * np.exp(-t / (dur * .8))
    return s * e * vel * .38


def sub_boom(dur=4.5, vel=1.0):
    t = tline(dur)
    f = 26 + 48 * np.exp(-t * 3.2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 1.0) * np.minimum(1, t / .003)
    n = filt(rng.standard_normal(len(t)), None, 220) * np.exp(-t * 4) * 1.4
    click = filt(rng.standard_normal(len(t)), 1500, 7000) * np.exp(-t * 60) * .3
    return (s + n + click) * vel * .95


def crash(dur=3.0, vel=1.0):
    t = tline(dur)
    n = np.vstack([filt(rng.standard_normal(len(t)), 3500, 14000), filt(rng.standard_normal(len(t)), 3500, 14000)])
    return n * np.exp(-t * 1.6) * vel * .22


def reverse_swell(dur=1.6, vel=1.0):
    t = tline(dur)
    n = np.vstack([filt(rng.standard_normal(len(t)), 2500, 12000), filt(rng.standard_normal(len(t)), 2500, 12000)])
    e = (t / dur) ** 3
    return n * e * vel * .28


def taiko(f0=72, dur=1.4, vel=1.0):
    t = tline(dur)
    f = f0 * (1 + .7 * np.exp(-t * 28))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.2)
    thump = filt(rng.standard_normal(len(t)), 70, 600) * np.exp(-t * 22) * .9
    slap = filt(rng.standard_normal(len(t)), 1200, 5000) * np.exp(-t * 70) * .25
    return (body + thump + slap) * np.minimum(1, t / .002) * vel * .9


def seal(vel=1.0):
    dur = 2.2
    t = tline(dur)
    s = taiko(58, dur, 1.0)
    knock = filt(rng.standard_normal(len(t)), 500, 2600) * np.exp(-t * 55) * .7
    ring = sum(a * np.exp(-t / tau) * np.sin(2 * np.pi * f * t) for f, a, tau in ((1180, .5, 1.1), (1873, .32, .8), (2690, .22, .55), (3440, .14, .4)))
    boom = sub_boom(dur, .45)
    return (s + knock + ring * .45 + boom) * vel


def kick(vel=1.0):
    t = tline(.5)
    f = 48 + 90 * np.exp(-t * 35)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * vel * .9


def hat(vel=1.0):
    t = tline(.12)
    return filt(rng.standard_normal(len(t)), 7000, 16000) * np.exp(-t * 55) * vel * .18


def whoosh(dur=.9, vel=1.0):
    t = tline(dur)
    n = filt(rng.standard_normal(len(t)), 350, 4500)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    pan = np.linspace(-.8, .8, len(t))
    a = (pan + 1) * np.pi / 4
    return np.vstack([n * e * np.cos(a), n * e * np.sin(a)]) * vel * .32


def riser(dur, vel=1.0):
    t = tline(dur)
    noise = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    S = 18
    for k in range(S):
        fc = 300 * 2 ** (k * 5 / S)
        w = np.clip(1 - np.abs(t / dur * (S - 1) - k), 0, 1)
        out += filt(noise, fc / 1.4, fc * 1.4) * w
    f = hz(62) * 2 ** (t / dur)
    tone = (np.sin(2 * np.pi * np.cumsum(f) / SR) + .5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)) * .25
    e = (t / dur) ** 2.2
    s = (out * .7 + tone) * e
    return np.vstack([s, np.roll(s, 240)]) * vel * .5


# ——— harmony ———
CH = {
    'Dm': [50, 53, 57, 62, 69], 'Bb': [46, 50, 53, 58, 65], 'F': [53, 57, 60, 65, 69], 'C': [48, 52, 55, 60, 67],
    'Gm': [43, 50, 55, 58, 62], 'Asus': [45, 50, 52, 57, 64], 'A': [45, 49, 52, 57, 64], 'Dm9': [50, 57, 62, 64, 65, 69],
    'D': [50, 54, 57, 62, 66], 'A/C#': [49, 52, 57, 61, 64], 'Bm': [47, 54, 59, 62, 66], 'G': [43, 50, 55, 59, 62],
    'Dadd9': [38, 50, 57, 62, 64, 66, 69],
}
ROOT = {'Dm': 38, 'Bb': 34, 'F': 41, 'C': 36, 'Gm': 31, 'Asus': 33, 'A': 33, 'Dm9': 38, 'D': 38, 'A/C#': 37, 'Bm': 35, 'G': 31, 'Dadd9': 38}


def chord_pad(name, t0, dur, gain=1.0, **kw):
    place(pad(CH[name], dur + kw.pop('tail', 1.2), **kw), t0, gain, rev=.55)


# ——— drone across the whole film ———
dr_len = 77.0
dr = pad([38, 45], dr_len, attack=3.5, release=4.0, bright=.25, voices=3)
dr_t = tline(dr_len)
dr *= .75 + .25 * np.sin(2 * np.pi * dr_t / 9.0)
place(dr, .2, .3, rev=.35)

# ——— I. History (0–15) ———
place(bell(81, 4, .7), CUES['opening']['t'], .8, -.2, .7)
for name, a, b in (('Dm', 0, 5), ('Bb', 5, 7.5), ('F', 7.5, 10), ('C', 10, 12.5)):
    chord_pad(name, a, b - a, .28, attack=2.0 if a == 0 else 1.0, bright=.35)
motif = [(74, 2.5), (77, 3.125), (81, 3.75), (79, 5.0), (77, 5.625), (76, 6.25), (74, 7.5), (77, 8.125), (81, 8.75), (84, 10.0), (82, 10.625), (81, 11.25)]
for m, t0 in motif:
    place(piano(m, 3.6, .85), t0, .62, .15, .65)
for h in CUES['history']:
    place(whoosh(.8, .55), h['t'] - .62, .8)
    place(taiko(52, 1.6, .45), h['t'], .55, 0, .5)
    place(sub_boom(2.5, .25), h['t'], .5)
ti = CUES['title']['t']
place(reverse_swell(1.5, .9), ti - 1.5, 1.0)
place(sub_boom(4.5, .8), ti, .75)
place(taiko(48, 2.0, .9), ti, .7)
chord_pad('Dm', ti, 2.6, .5, attack=.05, bright=.6)
for m in (62, 69, 74, 81):
    place(piano(m, 4.5, .8), ti, .55, 0, .7)

# ——— II. Today (15–30) ———
for name, a in (('Dm', 15), ('Bb', 17.5), ('F', 20), ('C', 22.5), ('Gm', 25), ('Asus', 27.5)):
    chord_pad(name, a, 2.5 if a < 27.5 else 1.875, .32 + .05 * (a - 15) / 2.5, attack=.8, bright=.45, tail=.6)
for k, line in enumerate(CUES['today'][:4]):
    place(whoosh(.9, .45), line['t'] - .5, .8)
    place(piano([81, 77, 86, 84][k], 3.5, .7), line['t'], .8, -.25, .7)
sil = CUES['silence']
x = 17.5
while x < sil - .01:
    chord = ['Dm', 'Bb', 'F', 'C', 'Gm', 'Asus'][int((x - 15) // 2.5)]
    downbeat = abs(((x - 15) / BEAT) % 4) < 1e-6
    place(bass(ROOT[chord] + 12, BEAT / 2 * .95, 1.0 if downbeat else .7), x, .45 + .35 * (x - 17.5) / (sil - 17.5), 0, .1)
    x += BEAT / 2
x = 20.0
while x < sil - .01:
    place(kick(.5 + .5 * (x - 20) / (sil - 20)), x, .7 + .6 * (x - 20) / (sil - 20), 0, .1)
    x += BEAT * 2 if x < 25 else BEAT
x = 27.5
while x < sil - .01:
    place(hat(.6 + (x - 27.5)), x, .6, .3, .1)
    x += BEAT / 4
place(riser(sil - 25.0, 1.0), 25.0, 1.7, rev=.4)
chord_pad('Gm', 25.0, 2.5, .25, attack=1.5, bright=.7, voices=4, tail=.4)
chord_pad('A', 27.5, 1.875, .35, attack=1.2, bright=.8, voices=4, tail=.2)
place(reverse_swell(1.0, 1.2), CUES['logo'] - 1.0, 1.0)

# ——— III. Logo (30–35) ———
lg = CUES['logo']
place(sub_boom(5.0, 1.0), lg, 1.5)
place(taiko(46, 2.6, 1.0), lg, 1.3)
place(crash(3.5, 1.0), lg, 1.4, rev=.6)
chord_pad('Dm9', lg, 5.0, 1.35, attack=.03, release=2.0, bright=.75, voices=4)
for k, m in enumerate([86, 93, 89, 88, 86, 81, 84, 86]):
    place(bell(m, 3, .55), lg + 1.0 + k * BEAT / 2, .55, (-1) ** k * .4, .8)

# ——— IV. Product (35–50) ———
for k, t0 in enumerate(CUES['chain']):
    place(bell([86, 89, 93, 98][k], 3.5, .85), t0, .8, -.3 + k * .2, .7)
    place(taiko(64, 1.2, .5), t0, .7)
for name, a in (('Dm', 35), ('Dm', 37.5), ('Bb', 40), ('F', 42.5), ('C', 45), ('Dm', 47.5)):
    chord_pad(name, a, 2.5, .5, attack=.4, bright=.55, tail=.4)
seq = ['Dm', 'Bb', 'F', 'C', 'Dm']
for bar in range(5):
    t0 = 37.5 + bar * 2.5
    ch = seq[bar]
    for e in range(8):
        tt = t0 + e * BEAT / 2
        place(bass(ROOT[ch] + 12 + (7 if e in (3, 7) else 0), BEAT / 2 * .9, .9 if e % 2 == 0 else .65), tt, .72, 0, .08)
        place(hat(.7 if e % 2 else .45), tt, .5, .35, .08)
        arp = CH[ch][1:] + [CH[ch][1] + 12]
        place(piano(arp[e % len(arp)] + 12, 1.6, .38), tt, .55, .3 if e % 2 else -.3, .5)
    for e, v, f0 in ((0, 1.0, 58), (3, .5, 82), (4, .8, 66), (6, .45, 82), (7, .55, 74)):
        place(taiko(f0, 1.2, v), t0 + e * BEAT / 2, 1.1, 0, .25)
    place(kick(.8), t0, 1.0)
    place(kick(.6), t0 + 2 * BEAT, 1.0)
for s in CUES['shots']:
    place(whoosh(1.0, .8), s['t'] - .4, .9)
for c in CUES['cuts']:
    place(whoosh(.45, .7), c['t'] - .25, .8)
    place(taiko(70, .8, .55), c['t'], .7)

# ——— V. Nine gates (50–60) ———
for name, a, b in (('Dm', 50, 55), ('Bb', 55, 57.5), ('A', 57.5, 60)):
    chord_pad(name, a, b - a, .45, attack=.3, bright=.4, tail=.5)
stab = [62, 65, 69, 74, 62, 65, 69, 74, 77]
for k, gt in enumerate(CUES['gates']):
    t0 = gt['t'] + .2
    place(seal(1.0 if k < 4 else .85), t0, .95, (-1) ** k * .15, .35)
    place(piano(stab[k], 2.2, .7), t0, .7, 0, .5)
    place(piano(stab[k] - 12, 2.2, .5), t0, .6, 0, .5)
x = 55.0
while x < 58.0:
    place(kick(.55), x, .8)
    x += BEAT
place(riser(60.0 - CUES['gatesCaption'], .8), CUES['gatesCaption'], .8, rev=.4)

# ——— VI. Integrity (60–65) ———
for k, v in enumerate(CUES['integrity']):
    place(sub_boom(3.0, .55), v['t'], .7)
    place(taiko(50, 1.8, .6), v['t'], .6)
    for m in ([53, 57, 60, 65], [52, 55, 60, 64], [50, 53, 57, 62])[k]:
        place(piano(m + 12, 3.2, .6), v['t'], .5, 0, .7)
chord_pad('F', 60.0, 1.25, .3, attack=.2, bright=.4, tail=.8)
chord_pad('C', 61.25, 1.25, .3, attack=.2, bright=.4, tail=.8)
chord_pad('Dm', 62.5, 1.25, .3, attack=.2, bright=.4, tail=.8)
chord_pad('Asus', 63.75, 1.25, .3, attack=.4, bright=.4, tail=.6)
place(reverse_swell(1.2, .9), CUES['dawn'] - 1.2, .9)

# ——— VII. Dawn (65–72.5), D major ———
dw = CUES['dawn']
place(sub_boom(4.0, .5), dw, .8)
place(crash(4.0, .6), dw, .7, rev=.7)
for name, a, b in (('D', 65, 67.5), ('A/C#', 67.5, 68.75), ('Bm', 68.75, 70), ('G', 70, 71.25), ('A', 71.25, 72.5)):
    chord_pad(name, a, b - a, .5, attack=1.0 if a == 65 else .35, bright=.65, voices=4, vib=1.0, tail=.6)
melody = [(69, 65.0), (74, 65.625), (78, 66.25), (76, 67.5), (78, 68.125), (81, 68.75), (79, 70.0), (78, 70.625), (76, 71.25), (74, 71.875)]
for m, t0 in melody:
    place(piano(m, 3.4, .9), t0, .9, .1, .6)
    place(pad([m], 1.5, attack=.15, release=.8, bright=.7, voices=2, vib=1.0), t0, .22, -.2, .6)
for k in range(5):
    t0 = 67.5 + k * 1.25
    place(taiko(60, 1.4, .55 if k % 2 == 0 else .35), t0, .7)
    place(kick(.45), t0, .6)

# ——— VIII. End card (72.5–80) ———
ec = CUES['endCard']
place(sub_boom(5.0, .6), ec, .9)
place(taiko(48, 2.4, .7), ec, .8)
chord_pad('Dadd9', ec, 6.0, .85, attack=.05, release=3.5, bright=.6, voices=4, vib=1.0)
for m in (50, 57, 62, 66, 69, 76):
    place(piano(m, 6.0, .7), ec, .75, 0, .8)
for k, m in enumerate([90, 93, 98, 93, 90, 86]):
    place(bell(m, 3.5, .45), ec + .6 + k * BEAT, .5, (-1) ** k * .45, .85)


# ——— reverb ———
def impulse(rt60=3.0, length=3.4):
    t = tline(length)
    decay = np.exp(-6.91 * t / rt60)
    irs = []
    for ch in range(2):
        n = rng.standard_normal(len(t))
        dark = filt(n, None, 2500)
        mix = np.exp(-t / .6)
        ir = (n * mix + dark * (1 - mix)) * decay
        ir[:int(.018 * SR)] = 0
        for d, a in ((.023, .5), (.031, .35), (.047, .3), (.061, .22)):
            ir[int((d + ch * .004) * SR)] += a
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.array(irs)


def convolve(x, h):
    n = len(x) + len(h) - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)[:len(x)]


ir = impulse()
wet = np.vstack([convolve(filt(send[c], 120, None), ir[c]) for c in range(2)])
mix = dry + wet * .55

# ——— master ———
mix = filt(mix[0], 28, None), filt(mix[1], 28, None)
mix = np.vstack(mix)
fade = np.ones(N)
fi = int(77.0 * SR)
fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
mix *= fade
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix *= 10 ** (-1.0 / 20) / (np.max(np.abs(mix)) + 1e-9)

out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'score.wav'
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(str(out), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms = np.sqrt(np.mean(mix ** 2, axis=1))
print(f'wrote {out} · {DUR:.1f}s · rms L/R {20 * np.log10(rms[0]):.1f}/{20 * np.log10(rms[1]):.1f} dBFS')
for a, b in ((0, 15), (15, 30), (30, 35), (35, 50), (50, 60), (60, 65), (65, 72.5), (72.5, 80)):
    seg = mix[:, int(a * SR):int(b * SR)]
    print(f'  {a:>5}–{b:<5} rms {20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12):6.1f} dBFS  peak {20 * np.log10(np.max(np.abs(seg)) + 1e-12):5.1f}')
