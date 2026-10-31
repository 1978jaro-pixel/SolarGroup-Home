"""SolarGroup Home E2 – vrstvy schváleného domu (biele Porsche Taycan).

Vstup: obrázok domu s Porsche (1536 × 1024, výstup tools/design/porsche/taycan_composite.py).
Výstup do <cieľ>:
  pv-house-base-1536.webp, pv-house-base-768.webp  – dom bez čísel a popisov, panely a vedenia nesvietia
  pv-house-glow.webp                               – iba svietiace panely (s priehľadnosťou), výrez
  pv-house-glow.json                               – poloha výrezu v pixeloch zdroja
Použitie: python house_layers.py <vstup.png> <cieľový-adresár>
"""
import json
import os
import sys

import cv2
import numpy as np

src_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
img = cv2.imread(src_path)
h, w = img.shape[:2]
assert (w, h) == (1536, 1024), "očakávaný zdroj 1536 × 1024"
f = img.astype(np.int32)
B, G, R = f[..., 0], f[..., 1], f[..., 2]

# 1) čísla a popisy (svetlý text na tmavom pozadí) – retuš okolitého prechodu
text = np.zeros((h, w), np.uint8)
for x0, y0, x1, y1 in [(290, 55, 545, 185), (1010, 55, 1395, 185), (235, 830, 450, 960), (675, 830, 890, 960), (1185, 830, 1350, 960)]:
    box = np.zeros((h, w), bool)
    box[y0:y1, x0:x1] = True
    text[box & ((B + G + R) > 200)] = 255
text = cv2.dilate(text, np.ones((3, 3), np.uint8), iterations=3)
clean = cv2.inpaint(img, text, 9, cv2.INPAINT_TELEA)

# 2) svietiace panely: polygón strechy s panelmi
panel_poly = np.array([(384, 228), (912, 240), (1058, 396), (452, 394)], np.int32)
pmask = np.zeros((h, w), np.uint8)
cv2.fillPoly(pmask, [panel_poly], 255)
pmask_f = cv2.GaussianBlur(pmask.astype(np.float32) / 255, (0, 0), 1.2)
hsv = cv2.cvtColor(clean, cv2.COLOR_BGR2HSV).astype(np.float32)
hsv[..., 1] *= 0.38
hsv[..., 2] *= 0.46
dark_panels = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
base = clean.astype(np.float32) * (1 - pmask_f[..., None]) + dark_panels * pmask_f[..., None]

# ďalšie kroky pracujú s vyčisteným obrázkom (bez textu)
f = clean.astype(np.int32)
B, G, R = f[..., 0], f[..., 1], f[..., 2]

# 3) vedenia: zelená žiara → neutrálne tmavé lišty (aktívne toky kreslí aplikácia)
corr = np.zeros((h, w), np.uint8)
for p, q in [((733, 404), (733, 516)), ((733, 606), (733, 704)), ((502, 581), (684, 566)), ((790, 564), (942, 554)), ((1306, 596), (1294, 668))]:
    cv2.line(corr, p, q, 255, 30)
greenish = ((G - R) > 22) & (G > 70)
sel = (corr > 0) & greenish
lum = (0.3 * R + 0.59 * G + 0.11 * B)
k = np.clip(((G - R) - 22) / 80.0, 0, 1)
for ch, t in enumerate((0.52, 0.55, 0.58)):
    c = base[..., ch]
    c[sel] = (c * (1 - k) + lum * t * 0.75 * k)[sel]
# podlaha: zelené odrazy pod vedeniami → iba odfarbiť (jas podlahy ostáva)
floor = np.zeros((h, w), np.uint8)
cv2.ellipse(floor, (733, 735), (46, 40), 0, 0, 360, 255, -1)
cv2.line(floor, (733, 700), (733, 820), 255, 60)
cv2.line(floor, (1296, 670), (1296, 740), 255, 50)
# podlaha: farba okolitej podlahy, jas (odrazy) ostáva; mimo vedení
ref = clean[880:960, 560:700].reshape(-1, 3).astype(np.float32).mean(0)
ref_l = 0.11 * ref[0] + 0.59 * ref[1] + 0.3 * ref[2]
fsel = (floor > 0) & (corr == 0) & ((G - R) > 12)
fl = (0.11 * B + 0.59 * G + 0.3 * R).astype(np.float32)
fw = cv2.GaussianBlur(fsel.astype(np.float32), (0, 0), 3) * np.clip(((G - R) - 12) / 30.0, 0, 1)
target = ref[None, None, :] * (fl / ref_l)[..., None] * 0.92
base = base * (1 - fw[..., None]) + target * fw[..., None]
base = np.clip(base, 0, 255).astype(np.uint8)
cv2.imwrite(os.path.join(out_dir, "_base.png"), base)
cv2.imwrite(os.path.join(out_dir, "pv-house-base-1536.webp"), base, [cv2.IMWRITE_WEBP_QUALITY, 92])
cv2.imwrite(os.path.join(out_dir, "pv-house-base-768.webp"), cv2.resize(base, (768, 512), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 92])

# 4) vrstva žiary panelov = pôvodné panely s priehľadnosťou, iba výrez
x, y, bw, bh = cv2.boundingRect(panel_poly)
x, y = x - 4, y - 4
bw, bh = bw + 8, bh + 8
glow = np.dstack([clean[y:y + bh, x:x + bw], (pmask_f[y:y + bh, x:x + bw] * 255).astype(np.uint8)])
cv2.imwrite(os.path.join(out_dir, "pv-house-glow.webp"), glow, [cv2.IMWRITE_WEBP_QUALITY, 92])
json.dump({"x": x, "y": y, "w": bw, "h": bh, "W": w, "H": h}, open(os.path.join(out_dir, "pv-house-glow.json"), "w"))
print("glow", x, y, bw, bh)
