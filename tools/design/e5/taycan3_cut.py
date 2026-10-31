"""Výrez bieleho Porsche Taycan zo štúdiovej fotky (biele auto na bielom pozadí, dodané 31. 10. 2026).

    python3 tools/design/e5/taycan3_cut.py <foto.jpg> <maska.png>

Biele na bielom: obrys je ručne odčítaný zo zväčšenín (súradnice fotky 1125 × 606); grabCut dolaďuje iba úzky
pás okolo neho. Sklo (vidieť cez neho stenu štúdia) a tieň na podlahe sa riešia pevne – sklo patrí autu, tieň nie.
"""

import sys

import cv2
import numpy as np

OUTLINE = [
    (80, 318), (100, 309), (150, 292), (208, 277), (260, 250), (305, 229), (360, 214), (400, 208), (470, 209),
    (560, 214), (620, 222), (690, 250), (750, 277), (790, 297), (800, 303), (840, 313), (923, 318), (998, 340),
    (1010, 346), (1032, 382), (1048, 417), (1051, 455), (1051, 492), (1040, 501), (961, 509), (871, 519),
    (786, 503), (700, 512), (674, 535), (607, 546), (543, 538), (532, 510), (495, 502), (300, 478), (215, 468),
    (200, 486), (156, 499), (114, 485), (100, 452), (85, 434), (79, 383),
]


def smooth_outline(pts: list[tuple[int, int]], up: int, n: int = 12) -> np.ndarray:
    """Uzavretá Catmull-Rom krivka cez body obrysu (bez zubov), v mierke ``up``."""
    P = np.array(pts, np.float32)
    out = []
    for i in range(len(P)):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % len(P)], P[(i + 2) % len(P)]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return (np.array(out) * up).astype(np.int32)


def main() -> None:
    im = cv2.imread(sys.argv[1])
    h, w = im.shape[:2]
    sil = np.zeros((h, w), np.uint8)
    cv2.fillPoly(sil, [np.array(OUTLINE, np.int32)], 255)
    inner = cv2.erode(sil, np.ones((9, 9), np.uint8))
    outer = cv2.dilate(sil, np.ones((13, 13), np.uint8))
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    mask[outer > 0] = cv2.GC_PR_BGD
    mask[sil > 0] = cv2.GC_PR_FGD
    mask[inner > 0] = cv2.GC_FGD
    bg = np.zeros((1, 65), np.float64)
    fg = np.zeros((1, 65), np.float64)
    cv2.grabCut(im, mask, None, bg, fg, 6, cv2.GC_INIT_WITH_MASK)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # grabCut nesmie „ujsť“ ďaleko od obrysu (biele na bielom): výsledok len v páse ±6 px od ručného obrysu
    m = np.where(cv2.dilate(sil, np.ones((7, 7), np.uint8)) > 0, m, 0)
    m = np.maximum(m, inner)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    m = np.where(lab == big, 255, 0).astype(np.uint8)
    # horná časť (biele na bielom): vyhladený ručný obrys, mierne zúžený, s mäkkým okrajom;
    # dolná časť (kolesá, prah, tmavé diely – dobrý kontrast): výsledok grabCut
    up = 4
    big_sil = np.zeros((h * up, w * up), np.uint8)
    cv2.fillPoly(big_sil, [smooth_outline(OUTLINE, up)], 255, cv2.LINE_AA)
    soft = cv2.resize(big_sil, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)
    soft = cv2.erode(soft, np.ones((3, 3), np.uint8))
    yy = np.arange(h, dtype=np.float32)[:, None]
    k = np.clip((yy - 440) / 30, 0, 1)  # 0 hore → 1 dole
    final = soft * (1 - k) + np.minimum(soft + 0, cv2.GaussianBlur(m, (3, 3), 0).astype(np.float32)) * k
    cv2.imwrite(sys.argv[2], np.clip(final, 0, 255).astype(np.uint8))
    if len(sys.argv) > 3:  # kontrola: obrys na fotke
        vis = im.copy()
        cv2.polylines(vis, [smooth_outline(OUTLINE, 1)], True, (0, 0, 255), 1, cv2.LINE_AA)
        cv2.imwrite(sys.argv[3], vis)


if __name__ == "__main__":
    main()
