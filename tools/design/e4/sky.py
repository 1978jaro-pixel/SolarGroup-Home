"""Procedurálna obloha s oblakmi pre kartu Počasie (E4) – vlastná grafika bez cudzích fotografií.

    python3 tools/design/e4/sky.py <výstupný adresár> [šírka výška]

Vytvorí sky-<stav>.webp pre stavy jasno, polojasno, zamracene, dazd, sneh, hmla.
Obloha ostáva svetlá a modrá aj pri zamračenom a daždivom počasí.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

VARIANTS = {
    #           obloha hore      obloha dole      pokrytie  sivosť  seed
    "jasno": ((52, 118, 205), (150, 196, 240), 0.80, 0.00, 3),
    "polojasno": ((60, 122, 204), (152, 194, 236), 0.56, 0.10, 7),
    "zamracene": ((78, 128, 196), (160, 195, 232), 0.36, 0.22, 23),
    "dazd": ((84, 124, 180), (156, 186, 220), 0.30, 0.34, 13),
    "sneh": ((112, 146, 196), (186, 208, 236), 0.34, 0.16, 17),
    "hmla": ((120, 150, 190), (190, 208, 230), 0.30, 0.10, 19),
}


def fbm(w: int, h: int, seed: int, octaves: int = 6, base: float = 2.2, gain: float = 0.5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        ch = max(2, int(base * 2**o))
        cw = max(2, int(ch * w / h))
        grid = (rng.random((ch + 1, cw + 1)) * 255).astype(np.uint8)
        layer = np.asarray(Image.fromarray(grid).resize((w, h), Image.BICUBIC), np.float32) / 255
        out += layer * amp
        total += amp
        amp *= gain
    out /= total
    return (out - out.min()) / (out.max() - out.min())


def warp(d: np.ndarray, seed: int, amount: float) -> np.ndarray:
    """Posun vzorky šumom – oblaky dostanú mäkké, nepravidelné tvary namiesto „vaty“."""
    h, w = d.shape
    wx = (fbm(w, h, seed + 101, 4) - 0.5) * amount * w
    wy = (fbm(w, h, seed + 202, 4) - 0.5) * amount * h
    yy, xx = np.mgrid[0:h, 0:w]
    xs = np.clip((xx + wx).astype(int), 0, w - 1)
    ys = np.clip((yy + wy).astype(int), 0, h - 1)
    return d[ys, xs]


def blur(a: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def render(name: str, w: int, h: int) -> Image.Image:
    top, bottom, cover, grey, seed = VARIANTS[name]
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    sky = np.array(top, np.float32) * (1 - y[..., None]) + np.array(bottom, np.float32) * y[..., None]
    sky = np.broadcast_to(sky, (h, w, 3)).copy()

    d = warp(fbm(w, h, seed, gain=0.47), seed, 0.18)
    # viac oblakov hore, spodok (panel s predpoveďou) pokojnejší
    d = d * (1.1 - 0.45 * y) + 0.05 * (1 - y)
    thr = cover
    a = smoothstep(thr, thr + 0.2, d)
    a = blur(a, w / 500)
    # objem: svetlo zhora – horné okraje jasné, spodky modrošedé
    soft = blur(d, w / 90)
    s_ = max(3, h // 35)
    above = np.vstack([np.repeat(soft[:1], s_, axis=0), soft[:-s_]])
    lit = np.clip((soft - above) * 7 + 0.5, 0, 1)
    depth = smoothstep(thr + 0.05, thr + 0.45, soft)
    white = np.array([250, 251, 254], np.float32)
    shade = np.array([158 - 25 * grey, 176 - 25 * grey, 206 - 15 * grey], np.float32)
    mix = np.clip(0.75 * (1 - lit) * depth + 0.25 * (1 - depth) + grey * 0.6, 0, 1)[..., None]
    cloud = white * (1 - mix) + shade * mix
    out = sky * (1 - a[..., None]) + cloud * a[..., None]

    if name == "dazd":
        rng = np.random.default_rng(seed + 1)
        streak = np.zeros((h, w), np.float32)
        for _ in range(w // 3):
            x0, y0, ln = rng.integers(0, w), rng.integers(int(h * 0.35), h), rng.integers(h // 30, h // 12)
            for k in range(ln):
                xx, yy = x0 - k // 4, y0 + k
                if 0 <= xx < w and 0 <= yy < h:
                    streak[yy, xx] = 1
        streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
        out = out * (1 - 0.22 * streak[..., None]) + 235 * 0.22 * streak[..., None]
    if name == "hmla":
        haze = smoothstep(0.3, 1.0, y)[..., None]
        out = out * (1 - 0.35 * haze) + 225 * 0.35 * haze

    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    return img.filter(ImageFilter.GaussianBlur(max(0.5, w / 1800)))


def main() -> None:
    dst = Path(sys.argv[1])
    w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1100, 760)
    dst.mkdir(parents=True, exist_ok=True)
    for name in VARIANTS:
        render(name, w, h).save(dst / f"sky-{name}.webp", quality=88, method=6)
        print(dst / f"sky-{name}.webp")


if __name__ == "__main__":
    main()
