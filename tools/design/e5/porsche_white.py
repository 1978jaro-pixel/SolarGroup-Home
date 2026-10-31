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
TESLA = [(942, 628), (1012, 630), (1046, 674), (1108, 700), (1140, 716), (1152, 742), (1152, 790), (1128, 801), (942, 801)]
WALL_BOTTOM = 788  # pod touto výškou je podlaha s tieňom – ostáva z originálu
# nový nabíjací kábel (Bézierova krivka): zásuvka wallboxu → port na pravom prednom blatníku za autom
CABLE = [(1161, 690), (1170, 707), (1196, 708), (1213, 736)]


def main() -> None:
    src, car_p, mask_p, out_p = sys.argv[1:5]
    sc = float(sys.argv[5]) if len(sys.argv) > 5 else 0.32
    global NOSE
    if len(sys.argv) > 7:
        NOSE = (int(sys.argv[6]), int(sys.argv[7]))
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

    # 1) Tesla aj pôvodný kábel preč (auto je vysunuté – kábel sa vedie nanovo)
    tesla = np.zeros((hh, hw), np.uint8)
    cv2.fillPoly(tesla, [np.array(TESLA, np.int32)], 255)
    glow = ((Gc - Rc) > 18) & ((Gc / np.maximum(Bc, 1)) > 0.8) & (xx > 1000) & (xx < 1200) & (yy > 686) & (yy < 830)
    old_cable = cv2.dilate((glow | cable).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    tesla[old_cable] = 255
    fill = house.astype(np.float32).copy()
    # pri wallboxe (vpravo) nie je nad autom stena – tam retuš z okolia
    right = tesla.copy()
    right[:, :1128] = 0
    right[(yy > 800) & (tesla > 0)] = 255  # podlaha pod pôvodným káblom
    inp = cv2.inpaint(house, right, 9, cv2.INPAINT_TELEA).astype(np.float32)
    fill[right > 0] = inp[right > 0]
    for x in range(TESLA[0][0], 1128):
        col = tesla[:, x] > 0
        if not col.any():
            continue
        ytop = int(np.argmax(col))
        ref = house[max(ytop - 7, 0) : ytop - 2, max(x - 1, 0) : x + 2].reshape(-1, 3).astype(np.float32).mean(0)
        for y in np.where(col)[0]:
            if right[y, x]:
                continue
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
    # predné koleso celé aj s pneumatikou – segmentácia vynechala časť disku a tmavú gumu
    cv2.ellipse(m, (1003, 782), (90, 128), 0, 0, 360, 255, -1)
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
    cv2.ellipse(sh, (NOSE[0] - 115, NOSE[1] - 2), (130, 8), 0, 0, 360, 0.75, -1)  # tieň pod predkom
    cv2.ellipse(sh, (NOSE[0] - 215, NOSE[1]), (30, 5), 0, 0, 360, 0.95, -1)  # predné koleso
    sh = cv2.GaussianBlur(sh, (0, 0), 4)
    x0o, y0o, x1o, y1o = OPENING
    sh[:, :x0o] = 0
    out *= 1 - sh[..., None] * 0.75

    # nový nabíjací kábel: z wallboxu dole k portu na pravom prednom blatníku – vedie ZA autom
    t = np.linspace(0, 1, 200)[:, None]
    P = np.array(CABLE, np.float32)
    bez = ((1 - t) ** 3) * P[0] + 3 * ((1 - t) ** 2) * t * P[1] + 3 * (1 - t) * t**2 * P[2] + t**3 * P[3]
    up = 4
    big = cv2.resize(out, None, fx=up, fy=up, interpolation=cv2.INTER_LINEAR)
    pts = (bez * up).astype(np.int32).reshape(-1, 1, 2)
    cv2.polylines(big, [pts + np.array([0, 2 * up])], False, (150, 150, 150), 4 * up, cv2.LINE_AA)  # jemný tieň
    cv2.polylines(big, [pts], False, (52, 55, 58), 6 * up, cv2.LINE_AA)
    cv2.polylines(big, [pts - np.array([up, 0])], False, (120, 124, 128), 1 * up, cv2.LINE_AA)  # odlesk
    out = cv2.resize(big, (hw, hh), interpolation=cv2.INTER_AREA)

    # vzdialenejšie (pravé) predné koleso: na fotke ho skrýva roh nárazníka a tieň; po vysunutí na svetlú
    # podlahu musí byť pod rohom vidieť spodok pneumatiky (menšia – je ďalej), nárazník ju zhora prekryje
    fx, fy = NOSE[0] - 48, NOSE[1] - 33
    tire = np.zeros((hh * 4, hw * 4), np.float32)
    cv2.ellipse(tire, (fx * 4, fy * 4), (15 * 4, 31 * 4), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
    tire = cv2.resize(tire, (hw, hh), interpolation=cv2.INTER_AREA)
    shade = np.clip((yy - (fy + 10)) / 26, 0, 1)  # spodok mierne svetlejší (odraz od podlahy)
    tcol = np.stack([22 + 26 * shade] * 3, -1)
    tcol = tcol + np.clip(1 - np.abs(xx - (fx - 9)) / 2.5, 0, 1)[..., None] * 18  # odlesk na boku gumy
    sh2 = np.zeros((hh, hw), np.float32)
    cv2.ellipse(sh2, (fx - 2, NOSE[1] - 3), (22, 4), 0, 0, 360, 0.95, -1)
    out *= 1 - cv2.GaussianBlur(sh2, (0, 0), 2.5)[..., None] * 0.7
    out = out * (1 - tire[..., None]) + tcol * tire[..., None]

    # 5) vloženie auta iba v otvore garáže
    opening = np.zeros((hh, hw), np.float32)
    opening[y0o:, x0o:] = 1  # predok vysunutý pred garáž – orezáva iba ľavý stĺp a horný preklad
    alpha = np.zeros((hh, hw), np.float32)
    layer = np.zeros_like(out)
    y0, x0 = max(oy, 0), max(ox, 0)
    y1, x1 = min(oy + car_s.shape[0], hh), min(ox + car_s.shape[1], hw)
    alpha[y0:y1, x0:x1] = m_s[y0 - oy : y1 - oy, x0 - ox : x1 - ox]
    layer[y0:y1, x0:x1] = graded[y0 - oy : y1 - oy, x0 - ox : x1 - ox]
    alpha *= opening
    out = out * (1 - alpha[..., None]) + layer * alpha[..., None]
    cv2.imwrite(out_p, np.clip(out, 0, 255).astype(np.uint8))
    import json

    # viditeľná časť kábla (pred autom) – po nej beží animovaný tok nabíjania
    vis = [(float(x), float(y)) for x, y in bez if alpha[min(hh - 1, int(round(y))), min(hw - 1, int(round(x)))] < 0.5]
    with open(out_p.rsplit(".", 1)[0] + "-kabel.json", "w") as f:
        json.dump({"cable": CABLE, "visible": [vis[0], vis[len(vis) // 2], vis[-1]]}, f)
    print("mierka", sc, "posun", ox, oy)


if __name__ == "__main__":
    main()
