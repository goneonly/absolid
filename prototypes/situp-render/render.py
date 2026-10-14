# 장면 렌더 (Apple Silicon GPU/Metal 사용). GPU 설정은 .blend 가 아니라 사용자 환경설정이라 매번 켜야 함
# 실행: Blender -b scene.blend --python render.py -- [frames(예: 1,19,38 | all)] [percent] [samples]
import bpy, sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
frames = argv[0] if argv else "all"
sc = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
print("[render] devices:", [(d.name, d.type, d.use) for d in prefs.devices])
sc.cycles.device = 'GPU'
if len(argv) > 1: sc.render.resolution_percentage = int(argv[1])
if len(argv) > 2: sc.cycles.samples = int(argv[2])
if frames == "all":
    # 중단 후 다시 실행하면 이미 그린 프레임은 건너뜀
    sc.render.use_overwrite = False
    sc.render.use_placeholder = True
    bpy.ops.render.render(animation=True)
else:
    base = sc.render.filepath
    for f in [int(x) for x in frames.split(",")]:
        sc.frame_set(f)
        sc.render.filepath = f"{base}{f:04d}"
        bpy.ops.render.render(write_still=True)
