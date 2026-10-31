"""Odstráni zo schváleného obrázka solárneho domu texty, hodnoty, odkazové čiary a zapečené žiariace vedenia.

Použitie: python solar_house_clean.py docs/design/schvaleny-solarny-dom-zdroj.png <pracovný-adresár>
Výstup: <pracovný-adresár>/clean2.png (vstup pre solar_house_night.py). Súradnice platia pre zdroj 1651 × 953.
"""
import os
import sys

import cv2
import numpy as np

src = cv2.imread(os.path.abspath(sys.argv[1]))
os.chdir(sys.argv[2])
h, w = src.shape[:2]
B, G, R = [src[:, :, i].astype(int) for i in range(3)]
bluish = (B - R) > 35
m = np.zeros((h, w), np.uint8)
def rect(x0, y0, x1, y1, only_blue=False):
    if only_blue:
        sub = np.zeros((h, w), bool); sub[y0:y1, x0:x1] = True
        m[sub & bluish] = 255
    else:
        m[y0:y1, x0:x1] = 255
# žiariace vedenia na stene (vrátane rúrky), mimo meniča (722–840 × 490–602)
rect(762, 364, 800, 485)
rect(762, 608, 800, 722)
rect(470, 540, 716, 573)
rect(846, 540, 982, 573)
rect(764, 704, 840, 728)
rect(760, 718, 805, 770, True)          # odraz na podlahe
# odkazové čiary a body
rect(592, 62, 624, 190)
rect(1050, 126, 1086, 142)
rect(1052, 126, 1066, 456)
rect(1046, 454, 1072, 480)
rect(304, 694, 328, 792)
rect(1399, 693, 1423, 792)
rect(814, 706, 840, 792)
rect(600, 186, 632, 210)
# texty a ikony popisov
for (x0, y0, x1, y1) in [(285, 30, 585, 135), (150, 778, 445, 900), (722, 790, 985, 900),
                         (1090, 95, 1455, 200), (1275, 795, 1555, 905)]:
    m[y0:y1, x0:x1] = 255
m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=2)
out = cv2.inpaint(src, m, 5, cv2.INPAINT_TELEA)
# kábel nabíjačky: modrá žiara → sivý kábel
cab = np.zeros((h, w), bool); cab[600:725, 1440:1525] = True
bb, gg, rr = [out[:, :, i].astype(int) for i in range(3)]
cm = cab & ((bb - rr) > 30)
gray = ((bb + gg + rr) / 3 * 0.5).astype(np.uint8)
for i in range(3):
    out[:, :, i][cm] = gray[cm]
cv2.imwrite('clean.png', out)

# --- dočistenie: klonovanie susedných pásov na streche, odfarbenie modrých závojov na stene ---
out = cv2.imread('clean.png')
out[200:458, 1049:1069] = src[200:458, 1029:1049]
out[180:216, 598:634] = src[180:216, 562:598]
out[440:500, 1040:1080] = out[440:500, 990:1030] if False else out[440:500, 1040:1080]
o = out.astype(np.float32)
bb, gg, rr = o[:, :, 0], o[:, :, 1], o[:, :, 2]
zone = np.zeros((h, w), bool)
zone[362:770, 735:825] = True
zone[515:600, 462:1000] = True
zone[430:505, 1030:1090] = True
zone[690:800, 290:345] = True
zone[690:800, 1385:1440] = True
zone[690:800, 800:860] = True
zone[490:602, 722:840] = False          # menič ostáva
zone[0:150, :] = False
excess = np.clip((bb - rr) - 14, 0, None)
sel = zone & (excess > 0)
lum = (bb + gg + rr) / 3
for i, k in enumerate((1.03, 1.0, 0.97)):
    ch = o[:, :, i]
    ch[sel] = np.clip(lum[sel] * k, 0, 255)
cv2.imwrite('clean2.png', o.astype(np.uint8))
