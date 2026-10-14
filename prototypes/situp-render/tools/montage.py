# 여러 PNG 를 격자로 이어 붙인 미리보기 시트 (모든 이미지는 같은 크기여야 함)
# 실행: Blender -b --factory-startup --python tools/montage.py -- <out.png> <cols> <img1> <img2> ...
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
out, cols, files = argv[0], int(argv[1]), argv[2:]
imgs = []
for f in files:
    im = bpy.data.images.load(f)
    w, h = im.size
    imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
h, w = imgs[0].shape[:2]
rows = (len(imgs) + cols - 1) // cols
sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32); sheet[..., 3] = 1
for i, a in enumerate(imgs):
    r, c = i // cols, i % cols
    rr = rows - 1 - r  # Blender 픽셀은 아래쪽부터 → 위 행부터 채우도록 뒤집어 배치
    sheet[rr * h:(rr + 1) * h, c * w:(c + 1) * w] = a[:h, :w]
o = bpy.data.images.new("sheet", cols * w, rows * h, alpha=True)
o.pixels = sheet.ravel()
o.filepath_raw = out; o.file_format = 'PNG'; o.save()
