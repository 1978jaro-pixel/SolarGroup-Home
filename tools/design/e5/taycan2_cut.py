"""Výrez bieleho Porsche Taycan z fotky dodanej používateľom (31. 10. 2026) – grabCut s ručnými pomôckami.

    python3 tools/design/e5/taycan2_cut.py <foto.jpg> <maska.png>

Fotka 1125 × 790: auto natočené predkom vpravo (ako auto v garáži), netreba zrkadliť.
"""

import sys

import cv2
import numpy as np


def poly(*p):
    return [np.array(p, np.int32)]


def main() -> None:
    im = cv2.imread(sys.argv[1])
    h, w = im.shape[:2]
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    cv2.fillPoly(mask, poly((50, 560), (60, 420), (95, 300), (180, 240), (330, 195), (640, 198), (800, 300), (845, 300),
                            (1000, 370), (1060, 420), (1075, 600), (1010, 645), (440, 662), (300, 652), (150, 580)), cv2.GC_PR_FGD)
    # isté popredie: karoséria, čierna strecha, zadné bočné okno, pravé zrkadlo, vzdialenejšie predné koleso
    for p in (
        poly((200, 330), (500, 300), (800, 340), (1000, 450), (1000, 560), (450, 580), (200, 520)),
        poly((305, 214), (340, 201), (628, 204), (655, 219)),
        poly((192, 315), (206, 262), (246, 234), (298, 229), (300, 325)),
        poly((788, 306), (828, 309), (836, 321), (827, 330), (797, 329)),
        poly((884, 606), (998, 606), (994, 627), (962, 636), (906, 636), (884, 624)),
    ):
        cv2.fillPoly(mask, p, cv2.GC_FGD)
    # kolesá (tmavé pneumatiky splývajú s tieňom na podlahe)
    cv2.ellipse(mask, (112, 475), (55, 100), 0, 0, 360, cv2.GC_FGD, -1)
    cv2.ellipse(mask, (365, 530), (72, 120), 0, 0, 360, cv2.GC_FGD, -1)
    # podlaha a tieň pod prahom medzi kolesami nie sú auto
    cv2.fillPoly(mask, poly((168, 578), (288, 620), (288, 700), (168, 700)), cv2.GC_BGD)
    bg = np.zeros((1, 65), np.float64)
    fg = np.zeros((1, 65), np.float64)
    cv2.grabCut(im, mask, None, bg, fg, 8, cv2.GC_INIT_WITH_MASK)
    m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    m = np.where(lab == big, 255, 0).astype(np.uint8)
    cv2.imwrite(sys.argv[2], m)


if __name__ == "__main__":
    main()
