"""Biela Tesla → biele Porsche Taycan v schválenom obrázku domu na bielom pozadí (návrh E5).

    python3 tools/design/e5/porsche_white.py <zdroj.png> <car_noplate.png> <car_mask.png> <výstup.png> [mierka]

Výrez Porsche je ten istý ako v E2 (tools/design/porsche/taycan_cut.py): karoséria prefarbená na bielu,
zrkadlená (predok vpravo ako pri Tesle), umiestnená tak, aby predok a spodok kolies sedeli s pôvodným autom.
Retuš: zadná stena garáže pokračuje po stĺpcoch, tieň na podlahe a nabíjací kábel ostávajú z originálu.
"""

import sys

import cv2
import numpy as np

# predok auta (najpravejší bod nárazníka) a spodok kolies; Porsche na fotke je natočené viac bokom ako Tesla,
# preto je predok o kúsok vpravo – predné koleso je pri stĺpe garáže čiastočne vidieť ako pri Tesle
NOSE = (1158, 797)
OPENING = (940, 562, 1222, 812)  # otvor garáže; ľavý stĺp zakrýva zadok auta
TESLA = [(938, 628), (1012, 630), (1046, 674), (1108, 700), (1140, 716), (1152, 742), (1152, 790), (1128, 801), (938, 801)]
WALL_BOTTOM = 788  # pod touto výškou je podlaha s tieňom – ostáva z originálu


def main() -> None:
    src, car_p, mask_p, out_p = sys.argv[1:5]
    sc = float(sys.argv[5]) if len(sys.argv) > 5 else 0.32
    house = cv2.imread(src)
    hh, hw = house.shape[:2]
    Bc, Gc, Rc = [house[:, :, i].astype(int) for i in range(3)]
    xx = np.arange(hw)[None, :]
    yy = np.arange(hh)[:, None]
    # nabíjací kábel (iba jasné jadro, nie odlesky na Tesle) – ostáva navrchu
    cable = ((Gc - Rc) > 80) & (Gc > 170) & (xx > 1000) & (yy > 640) & (yy < 830)
    # iba súvislé časti dlhého kábla (drobné zelené odlesky na Tesle sa zahodia)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cable.astype(np.uint8), 8)
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 120]
    cable = np.isin(lab, keep)
    cable = cv2.dilate(cable.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0

    # 1) Tesla preč: stena garáže pokračuje po stĺpcoch, smerom dole jemne tmavne
    tesla = np.zeros((hh, hw), np.uint8)
    cv2.fillPoly(tesla, [np.array(TESLA, np.int32)], 255)
    tesla[cable] = 0
    fill = house.astype(np.float32).copy()
    # pri wallboxe (vpravo) nie je nad autom stena – tam retuš z okolia
    right = tesla.copy()
    right[:, :1128] = 0
    inp = cv2.inpaint(house, right, 9, cv2.INPAINT_TELEA).astype(np.float32)
    fill[right > 0] = inp[right > 0]
    for x in range(TESLA[0][0], 1128):
        col = tesla[:, x] > 0
        if not col.any():
            continue
        ytop = int(np.argmax(col))
        ref = house[max(ytop - 7, 0) : ytop - 2, max(x - 1, 0) : x + 2].reshape(-1, 3).astype(np.float32).mean(0)
        for y in np.where(col)[0]:
            if y > WALL_BOTTOM:
                # podlaha: farba podlahy tesne pod autom (tieň zachovaný)
                fill[y, x] = house[min(hh - 1, 806), x]
                continue
            fill[y, x] = ref * (1 - 0.16 * min(1, (y - ytop) / 140))
    wm = (tesla > 0).astype(np.float32)
    smooth = cv2.GaussianBlur(fill, (0, 0), 3)
    rng = np.random.default_rng(3)
    clean = np.where(wm[..., None] > 0, smooth + rng.normal(0, 0.8, fill.shape), fill)

    # 2) Porsche: biela karoséria (rovnako ako E2), zrkadlenie, mierka
    car = cv2.imread(car_p)
    m = cv2.imread(mask_p, 0)
    hsv = cv2.cvtColor(car, cv2.COLOR_BGR2HSV).astype(np.float32)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    paint = (V > 70) & (H > 70) & (H < 110) & (S > 18)
    pw = cv2.GaussianBlur(paint.astype(np.float32), (0, 0), 1.2)
    gray = cv2.cvtColor(car, cv2.COLOR_BGR2GRAY).astype(np.float32)
    white = np.clip(gray * 1.22 + 46, 0, 255)
    car = car.astype(np.float32) * (1 - pw[..., None]) + np.stack([white * 0.985, white * 0.99, white], -1) * pw[..., None]
    cv2.fillPoly(m, [np.array([(322, 690), (332, 845), (600, 858), (875, 850), (905, 780), (885, 690)], np.int32)], 255)
    cv2.circle(m, (995, 778), 108, 255, -1)  # predné koleso – segmentácia vynechala časť disku
    m = cv2.GaussianBlur(m, (5, 5), 0)
    car = cv2.flip(car, 1)
    m = cv2.flip(m, 1)
    ys, xs = np.where(m > 128)
    nose_x, bottom_y = xs.max(), ys.max()
    car_s = cv2.resize(car, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    m_s = cv2.resize(m, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    ox, oy = int(NOSE[0] - nose_x * sc), int(NOSE[1] - bottom_y * sc)

    # 3) svetlo scény: svetlá garáž (teplé svetlo zľava hore), spodok auta mierne tmavší
    ky = np.linspace(0, 1, car_s.shape[0])[:, None, None]
    kx = np.linspace(0, 1, car_s.shape[1])[None, :, None]
    graded = car_s * np.array([0.96, 0.985, 1.0]) * (1.04 - 0.16 * ky) * (1.0 + 0.04 * (1 - kx))
    graded = np.clip(graded, 0, 255)

    # 4) kontaktný tieň pod kolesami (jemný – na svetlej podlahe)
    out = clean.astype(np.float32)
    sh = np.zeros((hh, hw), np.float32)
    cv2.ellipse(sh, (NOSE[0] - 95, NOSE[1] - 1), (120, 6), 0, 0, 360, 0.6, -1)
    sh = cv2.GaussianBlur(sh, (0, 0), 4)
    x0o, y0o, x1o, y1o = OPENING
    sh[:, :x0o] = 0
    out *= 1 - sh[..., None] * 0.6

    # 5) vloženie auta iba v otvore garáže
    opening = np.zeros((hh, hw), np.float32)
    opening[y0o:y1o, x0o:x1o] = 1
    alpha = np.zeros((hh, hw), np.float32)
    layer = np.zeros_like(out)
    y0, x0 = max(oy, 0), max(ox, 0)
    y1, x1 = min(oy + car_s.shape[0], hh), min(ox + car_s.shape[1], hw)
    alpha[y0:y1, x0:x1] = m_s[y0 - oy : y1 - oy, x0 - ox : x1 - ox]
    layer[y0:y1, x0:x1] = graded[y0 - oy : y1 - oy, x0 - ox : x1 - ox]
    alpha *= opening
    out = out * (1 - alpha[..., None]) + layer * alpha[..., None]
    # 6) kábel z originálu navrchu
    out[cable] = house[cable]
    cv2.imwrite(out_p, np.clip(out, 0, 255).astype(np.uint8))
    print("mierka", sc, "posun", ox, oy)


if __name__ == "__main__":
    main()
