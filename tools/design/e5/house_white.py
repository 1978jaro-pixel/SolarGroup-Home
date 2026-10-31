"""Schválený solárny dom na BIELOM pozadí → vrstvy pre PvScene (návrh E5).

    python3 tools/design/e5/house_white.py <zdroj.png> <výstupný adresár>

Výstup (rám 1536 × 1024, rovnaký ako pôvodná scéna):
  pv-house-white-1536.webp, pv-house-white-768.webp – dom bez zapečených čísel, panely a vedenia nesvietia,
  pv-house-white-glow.webp – svietiace panely (RGBA výrez), pv-house-white.json – súradnice vrstiev.
Vodiace čiary s bodkami ostávajú (patria ku grafike), čísla dopĺňa aplikácia.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

FRAME_W, FRAME_H = 1536, 1024
S = 0.966  # mierka zdroja → rám
OY = 80  # odrezaný biely okraj nad textom
# zapečený text (zdrojové súradnice) – na čisto bielom pozadí, prekryje sa bielou
TEXT = [(205, 85, 432, 226), (840, 85, 1188, 226), (140, 1005, 342, 1140), (540, 1005, 746, 1140), (1018, 1005, 1186, 1140)]
PANELS = (255, 290, 945, 495)  # obdĺžnik panelov
LED = ((1157, 633), 18)  # stavová LED wallboxu – ponechať zelenú
# spodné vodiace čiary sa skrátia (bodka nad popisom), aby nezasahovali do dynamických hodnôt
BOTTOM_LINES = [237, 632, 1093]
LINE_END = 930


TEAL_PANELS = "--teal" in sys.argv
if TEAL_PANELS:
    sys.argv.remove("--teal")


def frame_xy(x: float, y: float) -> tuple[float, float]:
    ox = (FRAME_W - SRC_W * S) / 2
    return round(x * S + ox, 1), round((y - OY) * S, 1)


def main() -> None:
    global SRC_W
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    SRC_W = img.shape[1]
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    green = G - np.maximum(R, B)
    h, w = G.shape

    # 1) zapečené čísla preč (čisto biele pozadie → biela)
    clean = img.copy()
    for x0, y0, x1, y1 in TEXT:
        clean[y0:y1, x0:x1] = np.median(img[y0 - 4 : y0, x0:x1].reshape(-1, 3), axis=0)

    for lx0 in BOTTOM_LINES:
        x0, x1 = lx0 - 7, lx0 + 8
        ref = np.concatenate([img[LINE_END:1004, x0 - 6 : x0], img[LINE_END:1004, x1 : x1 + 6]], axis=1)
        clean[LINE_END:1004, x0:x1] = np.median(ref.reshape(-1, 3), axis=0)
        yy0, xx0 = np.mgrid[LINE_END - 6 : LINE_END + 7, x0:x1]
        dot = (xx0 - lx0) ** 2 + (yy0 - LINE_END) ** 2 <= 16
        clean[LINE_END - 6 : LINE_END + 7, x0:x1][dot] = (34, 34, 36)

    # 2) svietiace panely: tyrkysová žiara (G výrazne nad R, G/B blízko 1) – bežné panely sú modré (B > G)
    px0, py0, px1, py1 = PANELS
    pan = np.zeros((h, w), bool)
    pan[py0:py1, px0:px1] = True
    teal = np.clip((G - R - 60) / 80, 0, 1) * np.clip((G / np.maximum(B, 1) - 0.72) / 0.3, 0, 1)
    glow_m = cv2.GaussianBlur((teal * pan).astype(np.float32), (0, 0), 2.5)
    # podklad bez žiary: tmavomodré panely s rovnakou kresbou (jas z pôvodného obrázka)
    lum0 = 0.3 * R + 0.59 * G + 0.11 * B
    blue = np.stack([lum0 * 0.22, lum0 * 0.48, lum0 * 0.9], -1) * 0.8
    k = np.clip(glow_m * 1.3, 0, 1)[..., None]
    if TEAL_PANELS:
        # predloha 0.5.3: panely ostávajú tyrkysovozelené aj bez výroby, iba tlmenejšie (žiara ich rozjasní)
        lum3 = lum0[..., None]
        muted = clean * 0.62 + lum3 * np.array([0.0, 0.08, 0.06]) * 0.4
        dim = clean * (1 - k) + muted * k
    else:
        dim = clean * (1 - k) + blue * k

    # 3) vedenia a kábel auta bez svetla (zelená → neutrálna sivá podľa jasu), mimo panelov a LED
    cond = np.clip((G - R - 10) / 40, 0, 1) * np.clip((G / np.maximum(B, 1) - 0.8) / 0.25, 0, 1) * (~pan)
    yy, xx = np.mgrid[0:h, 0:w]
    (lx, ly), lr = LED
    cond[(xx - lx) ** 2 + (yy - ly) ** 2 < lr**2] = 0
    cond = np.clip(cv2.GaussianBlur(cond.astype(np.float32), (0, 0), 1.5) * 1.4, 0, 1)
    lum = 0.3 * dim[..., 0] + 0.59 * dim[..., 1] + 0.11 * dim[..., 2]
    grey = np.stack([lum * 0.8] * 3, -1)
    base = dim * (1 - cond[..., None]) + grey * cond[..., None]

    # 4) do rámu 1536 × 1024 (biele okraje)
    def to_frame(a: np.ndarray, fill) -> Image.Image:
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        sw, sh = round(w * S), round(h * S)
        im = im.resize((sw, sh), Image.LANCZOS)
        fr = Image.new(im.mode, (FRAME_W, FRAME_H), fill)
        fr.paste(im, (round((FRAME_W - sw) / 2), round(-OY * S)))
        return fr

    bg = tuple(int(v) for v in np.median(img[5:40, 5:40].reshape(-1, 3), axis=0))
    fr = to_frame(base, bg)
    fr.save(out / "pv-house-white-1536.webp", quality=90, method=6)
    fr.resize((768, 512), Image.LANCZOS).save(out / "pv-house-white-768.webp", quality=90, method=6)

    # vrstva svietiacich panelov: originál v paneloch, priehľadnosť podľa žiary
    rgba = np.dstack([img, np.clip(glow_m * 1.3, 0, 1) * 255])
    full = to_frame(rgba, (0, 0, 0, 0))
    gx0, gy0 = frame_xy(px0, py0)
    gx1, gy1 = frame_xy(px1, py1)
    box = (int(gx0), int(gy0), int(gx1) + 1, int(gy1) + 1)
    full.crop(box).save(out / "pv-house-white-glow.webp", quality=90, method=6, lossless=False)

    f = frame_xy
    flows = {
        "pv": [f(592, 478), f(592, 607)],
        "house": [f(550, 662), f(357, 671)],
        "battery": [f(645, 657), f(760, 652)],
        "grid": [f(586, 812), f(586, 712)],
        "ev": [f(1161, 688), f(1163, 745), f(1120, 795), f(1047, 796)],
    }
    # vysunuté Porsche: nový kábel – tok iba po jeho viditeľnej časti (porsche_white.py → *-kabel.json)
    if len(sys.argv) > 3:
        vis = json.loads(Path(sys.argv[3]).read_text())["visible"]
        flows["ev"] = [f(*vis[0]), f(*vis[1]), f(*vis[1]), f(*vis[2])]
    meta = {
        "frame": [FRAME_W, FRAME_H],
        "glow": {"x": box[0], "y": box[1], "w": box[2] - box[0], "h": box[3] - box[1]},
        "flows": flows,
        # popisy: stred (center) alebo ľavý okraj (start) a horný okraj textu ako na predlohe
        "labels": {
            "pv": [*f((216 + 420) / 2, 95), "center"],
            "battery": [*f(851, 95), "start"],
            "house": [*f((149 + 331) / 2, 980), "center"],
            "grid": [*f((551 + 735) / 2, 980), "center"],
            "ev": [*f((1029 + 1174) / 2, 980), "center"],
        },
        "background": bg,
    }
    (out / "pv-house-white.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
