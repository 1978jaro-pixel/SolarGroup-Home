"""Večerné ladenie vyčisteného domu: tmavomodrá obloha, chladné steny, teplé svetlo v interiéri a garáži,
lesklá podlaha s odrazom. Výstup night.png → frontend/src/assets/design/solar-house-1651.webp (a 826 px).

Použitie: python solar_house_night.py <pracovný-adresár>
"""
import os
import sys

import cv2
import numpy as np

os.chdir(sys.argv[1])
img = cv2.imread('clean2.png').astype(np.float32) / 255
h, w = img.shape[:2]
def polymask(pts, blur=1.6):
    m = np.zeros((h, w), np.float32)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1.0)
    return cv2.GaussianBlur(m, (0, 0), blur)[..., None]
HORIZON = 727
house = polymask([(71, 412), (287, 149), (970, 224), (1164, 401), (1597, 404), (1624, 468),
                  (1624, HORIZON), (76, HORIZON)])
glass = polymask([(156, 430), (300, 240), (463, 418), (463, 722), (156, 706)], 2.5)
garage = polymask([(1153, 455), (1547, 455), (1547, 722), (1153, 722)], 2.5)
B, G, R = img[..., 0], img[..., 1], img[..., 2]
cyan = np.clip(((B - R) - 0.25) * 4.0, 0, 1) * np.clip((B - 0.6) * 3, 0, 1)
cyan = cv2.GaussianBlur(cyan, (0, 0), 1.5)[..., None]
build = img * np.array([0.70, 0.60, 0.50], np.float32) * 0.92 + 0.02
lit = img * 0.97
inside = np.maximum(glass, garage * 0.92)
houseimg = build * (1 - inside) + lit * inside
houseimg = houseimg * (1 - cyan) + img * cyan
yy = np.arange(h, dtype=np.float32)[:, None, None] / h
sky = np.concatenate([0.17 + 0.11 * yy, 0.10 + 0.07 * yy, 0.06 + 0.045 * yy], axis=2) * np.ones((1, w, 1), np.float32)
out = sky * (1 - house) + houseimg * house
# podlaha: tmavá s rozmazaným zrkadlovým odrazom domu
floor_base = np.array([0.15, 0.09, 0.055], np.float32)
L = h - HORIZON
src = out[HORIZON - L:HORIZON][::-1]
refl = cv2.GaussianBlur(src, (0, 0), 6)
fade = np.linspace(0.38, 0.0, L, dtype=np.float32)[:, None, None]
floor = floor_base * (1 - fade) + refl * fade
out[HORIZON:] = floor
out = np.clip(out, 0, 1)
cv2.imwrite('night.png', (out * 255).astype(np.uint8))
