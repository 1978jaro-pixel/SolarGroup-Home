"""Biela Tesla → biele Porsche Taycan zo štúdiovej fotky (31. 10. 2026), auto vysunuté z garáže.

    python3 tools/design/e5/porsche3_white.py <zdroj.png> <foto.jpg> <maska.png> <výstup.png> [mierka nos_x spodok_y]

Maska: tools/design/e5/taycan3_cut.py. Aby auto nepôsobilo nalepene: farba a ostrosť zladené so scénou (teplé
svetlo v garáži, denné pred ňou), mäkký okraj so svetlom okolia, tieň pod autom aj pod kolesami a slabý odraz na
lesklej podlahe ako pri dome.

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
    sc = float(sys.argv[5]) if len(sys.argv) > 5 else 0.43
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

    # 2) Porsche z fotky: už biele, predok vpravo – iba mäkký okraj masky
    car = cv2.imread(car_p).astype(np.float32)
    m = cv2.imread(mask_p, 0)
    ys, xs = np.where(m > 128)
    nose_x, bottom_y = xs.max(), ys.max()
    car_s = cv2.resize(car, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    car_s = cv2.GaussianBlur(car_s, (0, 0), 0.55)  # ostrosť ako render domu (zmenšená fotka je „ostrejšia“)
    m_s = cv2.resize(m, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    ox, oy = int(NOSE[0] - nose_x * sc), int(NOSE[1] - bottom_y * sc)

    # 3) svetlo scény: štúdiová fotka je studená a plochá → biela ako stena domu, v garáži teplé svetlo stropného
    #    svietidla (vzadu a hore), pred garážou denné svetlo; spodok auta mierne tmavší (zatienený podlahou)
    hgt, wid = car_s.shape[:2]
    ky = np.linspace(0, 1, hgt)[:, None, None]
    gx = (np.arange(wid)[None, :, None] + ox).astype(np.float32)
    inside = np.clip((1190 - gx) / 120, 0, 1)  # 1 = hlboko v garáži, 0 = pred garážou
    lum = car_s.mean(axis=2, keepdims=True)
    graded = car_s * 0.9 + lum * 0.1  # menej sýte odlesky štúdia
    graded = graded * np.array([0.985, 0.99, 0.995])  # biela ako stena domu (BGR)
    warm = np.array([0.86, 0.95, 1.02])  # teplé svetlo garáže (BGR)
    graded = graded * (1 - 0.55 * inside) + graded * warm * 0.9 * (0.55 * inside)
    graded = graded * (1.02 - 0.12 * ky**2)
    graded = np.clip(graded, 0, 255)

    # 4) kontaktný tieň pod kolesami (jemný – na svetlej podlahe)
    out = clean.astype(np.float32)
    sh = np.zeros((hh, hw), np.float32)
    def at(x: float, y: float) -> tuple[int, int]:
        return int(ox + x * sc), int(oy + y * sc)

    # tieň pod celým autom (mäkký) a tmavšie kontaktné tiene pod kolesami
    cv2.fillPoly(sh, [np.array([at(150, 500), at(560, 548), at(680, 540), at(1040, 506), at(1030, 494), at(220, 470)], np.int32)], 0.55)
    cv2.ellipse(sh, at(607, 546), (int(62 * sc), 4), 0, 0, 360, 1.0, -1)  # bližšie predné koleso
    cv2.ellipse(sh, at(905, 520), (int(45 * sc), 3), 0, 0, 360, 0.9, -1)  # vzdialenejšie predné koleso
    cv2.ellipse(sh, at(152, 497), (int(45 * sc), 3), 0, 0, 360, 0.9, -1)  # zadné koleso
    sh = cv2.GaussianBlur(sh, (0, 0), 3)
    x0o, y0o, x1o, y1o = OPENING
    sh[:, :x0o] = 0
    out *= 1 - sh[..., None] * 0.62

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
    # odraz na lesklej podlahe: zrkadlené auto pod čiarou dotyku, slabé a rýchlo miznúce
    base_y = NOSE[1]
    refl = np.zeros_like(out)
    ra = np.zeros((hh, hw), np.float32)
    span = 46
    for d in range(1, span):
        ys_, yd = base_y - d, base_y + d
        if ys_ < 0 or yd >= hh:
            break
        refl[yd] = layer[ys_]
        ra[yd] = alpha[ys_] * 0.16 * (1 - d / span) ** 1.6
    refl = cv2.GaussianBlur(refl, (0, 0), 1.6)
    ra = cv2.GaussianBlur(ra, (0, 0), 1.6)
    out = out * (1 - ra[..., None]) + refl * ra[..., None]
    # okraj auta: 1 px prechod a jemné svetlo okolia (light wrap), aby nebol „vystrihnutý“ lem
    soft = cv2.GaussianBlur(alpha, (0, 0), 0.7)
    env = cv2.GaussianBlur(out, (0, 0), 6)
    rim = np.clip(soft - cv2.erode(soft, np.ones((3, 3), np.uint8)), 0, 1)[..., None]
    layer = layer * (1 - rim * 0.35) + env * (rim * 0.35)
    alpha = soft
    out = out * (1 - alpha[..., None]) + layer * alpha[..., None]
    # zvyšok zelenej žiary pôvodného kábla na stene a podlahe (kábel už nesvieti) – neutralizovať, LED wallboxu ostáva
    rx0, ry0, rx1, ry1 = 1000, 652, 1265, 905
    reg = out[ry0:ry1, rx0:rx1]
    Bv, Gv, Rv = reg[..., 0], reg[..., 1], reg[..., 2]
    excess = np.clip(Gv - np.maximum(Rv, Bv * 0.97), 0, None)
    reg[..., 1] = Gv - excess
    reg[..., 0] = Bv - np.clip(Bv - Rv - 4, 0, None) * np.clip(excess / 6, 0, 1)  # tyrkysový nádych
    out[ry0:ry1, rx0:rx1] = reg
    # jemné zrno ako v rendri domu
    out += np.random.default_rng(7).normal(0, 0.9, out.shape) * alpha[..., None]
    cv2.imwrite(out_p, np.clip(out, 0, 255).astype(np.uint8))
    import json

    # viditeľná časť kábla (pred autom) – po nej beží animovaný tok nabíjania
    vis = [(float(x), float(y)) for x, y in bez if alpha[min(hh - 1, int(round(y))), min(hw - 1, int(round(x)))] < 0.5]
    with open(out_p.rsplit(".", 1)[0] + "-kabel.json", "w") as f:
        json.dump({"cable": CABLE, "visible": [vis[0], vis[len(vis) // 2], vis[-1]]}, f)
    print("mierka", sc, "posun", ox, oy)


if __name__ == "__main__":
    main()
