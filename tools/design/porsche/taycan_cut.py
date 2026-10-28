import cv2, numpy as np
c = cv2.imread('taycan.png')
h, w = c.shape[:2]
mask = np.zeros((h, w), np.uint8)
rect = (300, 430, 1095, 500)  # x, y, w, h
bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
cv2.grabCut(c, mask, rect, bgd, fgd, 8, cv2.GC_INIT_WITH_RECT)
m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
# najväčšia súvislá oblasť
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = np.where(lab == k, 255, 0).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
cv2.imwrite('car_mask.png', m)
# ŠPZ preč (inpaint v rámci auta)
pm = np.zeros((h, w), np.uint8); pm[738:798, 390:560] = 255
c2 = cv2.inpaint(c, pm, 6, cv2.INPAINT_TELEA)
cv2.imwrite('car_noplate.png', c2)
vis = c2.copy(); vis[m == 0] = (0, 0, 255)
cv2.imwrite('car_vis.png', cv2.resize(vis, (800, 600)))
