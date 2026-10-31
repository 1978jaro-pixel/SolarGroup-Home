import cv2, numpy as np, sys
SC = float(sys.argv[1]) if len(sys.argv) > 1 else 0.36
NOSE = (int(sys.argv[2]) if len(sys.argv) > 2 else 1276, int(sys.argv[3]) if len(sys.argv) > 3 else 692)
car = cv2.imread('car_noplate.png'); m = cv2.imread('car_mask.png', 0)
# biela farba karosérie: lak (stredne svetlý, mierne sýty) → neutrálna biela; sklo, pneumatiky, svetlá ostávajú
hsv = cv2.cvtColor(car, cv2.COLOR_BGR2HSV).astype(np.float32)
Hh, Ss, Vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
paint = (Vv > 70) & (Hh > 70) & (Hh < 110) & (Ss > 18)
pw = cv2.GaussianBlur(paint.astype(np.float32), (0, 0), 1.2)
gray = cv2.cvtColor(car, cv2.COLOR_BGR2GRAY).astype(np.float32)
white = np.clip(gray * 1.22 + 46, 0, 255)
white3 = np.stack([white * 0.985, white * 0.99, white], -1)
car = (car.astype(np.float32) * (1 - pw[..., None]) + white3 * pw[..., None]).astype(np.uint8)
# doplnenie tmavých častí predného nárazníka (mriežky), ktoré segmentácia vynechala
cv2.fillPoly(m, [np.array([(322, 690), (332, 845), (600, 858), (875, 850), (905, 780), (885, 690)], np.int32)], 255)
# odstrániť prípadné pozadie pod autom mimo karosérie (tiene ostanú z masky)
m = cv2.GaussianBlur(m, (5, 5), 0)
# zrkadlenie: predok vpravo ako pri pôvodnom aute
car = cv2.flip(car, 1); m = cv2.flip(m, 1)
H, W = m.shape
# bod predku (najpravejší bod nárazníka) a spodok predného kolesa v zrkadlenej fotke
ys, xs = np.where(m > 128)
nose_x = xs.max(); bottom_y = ys.max()
car_s = cv2.resize(car, None, fx=SC, fy=SC, interpolation=cv2.INTER_AREA)
m_s = cv2.resize(m, None, fx=SC, fy=SC, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
ox = int(NOSE[0] - nose_x * SC); oy = int(NOSE[1] - bottom_y * SC)
house = cv2.imread('house.png'); hh, hw = house.shape[:2]
# 1) odstrániť Teslu: maska pôvodného auta (bez kábla), retuš
B, G, R = [house[:, :, i].astype(int) for i in range(3)]
tesla = np.zeros((hh, hw), np.uint8)
cv2.fillPoly(tesla, [np.array([(1108, 534), (1150, 538), (1205, 573), (1252, 598), (1279, 610), (1283, 670), (1262, 702), (1108, 706)], np.int32)], 255)
cable = ((G - R) > 40) & (G > 110)
cable_top = cable & (np.arange(hw)[None, :] > 1271)
tesla[cable & (np.arange(hw)[None, :] > 1262)] = 0
clean = cv2.inpaint(house, tesla, 7, cv2.INPAINT_NS)
# zjemnenie retušovanej plochy (iba stena za autom)
soft = cv2.GaussianBlur(clean, (0, 0), 5)
tm = cv2.GaussianBlur(tesla.astype(np.float32) / 255, (0, 0), 3)[..., None]
clean = (clean * (1 - tm) + soft * tm).astype(np.uint8)
# zadná stena: každý stĺpec pokračuje farbou steny tesne nad autom, smerom dole mierne tmavne
fillw = clean.astype(np.float32)
for x in range(1108, 1284):
    col = tesla[:, x] > 0
    if not col.any():
        continue
    ytop = int(np.argmax(col))
    ref = house[max(ytop - 6, 0):ytop - 2, max(x - 1, 0):x + 2].reshape(-1, 3).mean(0)
    ys = np.where(col)[0]
    for y in ys:
        if y > 688:
            break
        k = 1 - 0.18 * min(1, (y - ytop) / 150)
        fillw[y, x] = ref * k
rng = np.random.default_rng(1)
noise = rng.normal(0, 1.0, fillw.shape)
wm = ((tesla > 0) & (np.arange(hh)[:, None] <= 688)).astype(np.float32)
sm = cv2.GaussianBlur(fillw, (0, 0), 2.5)
fillw = np.where(wm[..., None] > 0, sm + noise, fillw)
clean = np.clip(fillw, 0, 255).astype(np.uint8)
cv2.imwrite('house_notesla.png', clean)
# 2) svetlo scény: jemne teplé, spodok tmavší
yy = np.linspace(0, 1, car_s.shape[0])[:, None, None]
graded = car_s.astype(np.float32) * np.array([0.90, 0.95, 1.0]) * (0.98 - 0.22 * yy)
graded = np.clip(graded, 0, 255)
# 3) kontaktný tieň pod autom
out = clean.astype(np.float32)
sh = np.zeros((hh, hw), np.float32)
cy = NOSE[1] - 2
cv2.ellipse(sh, (NOSE[0] - int(150 * SC / 0.36), cy), (int(170 * SC / 0.36), 11), 0, 0, 360, 0.75, -1)
sh = cv2.GaussianBlur(sh, (0, 0), 6)[..., None]
out = out * (1 - sh * 0.9)
# 4) vloženie auta, iba v otvore garáže (ľavý stĺp zakrýva zadok auta)
opening = np.zeros((hh, hw), np.float32)
cv2.fillPoly(opening, [np.array([(1105, 478), (1368, 478), (1368, 760), (1105, 760)], np.int32)], 1.0)
alpha = np.zeros((hh, hw), np.float32); layer = np.zeros_like(out)
y0, x0 = max(oy, 0), max(ox, 0)
y1, x1 = min(oy + car_s.shape[0], hh), min(ox + car_s.shape[1], hw)
alpha[y0:y1, x0:x1] = m_s[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
layer[y0:y1, x0:x1] = graded[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
alpha *= opening
a = alpha[..., None]
out = out * (1 - a) + layer * a
# 5) kábel z pôvodného obrázka ostáva navrchu
cable_top &= alpha < 0.5
out[cable_top] = house[cable_top]
cv2.imwrite('composite.png', out.astype(np.uint8))
cv2.imwrite('comp_zoom.png', cv2.resize(out.astype(np.uint8)[440:720, 1060:1400], (1020, 840), interpolation=cv2.INTER_LANCZOS4))
print('scale', SC, 'offset', ox, oy)
