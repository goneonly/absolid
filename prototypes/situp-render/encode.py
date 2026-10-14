# 렌더된 PNG 프레임 → H.264 MP4 (Blender 내장 FFmpeg 사용, 별도 설치 불필요)
# 실행: Blender -b --factory-startup --python encode.py -- <frames_dir> <out.mp4> [fps] [width]
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
FRAMES, OUT = argv[0], argv[1]
FPS = int(argv[2]) if len(argv) > 2 else 30
WIDTH = int(argv[3]) if len(argv) > 3 else 1920

files = sorted(f for f in os.listdir(FRAMES) if f.endswith(".png"))
sc = bpy.context.scene
sc.sequence_editor_create()
strip = sc.sequence_editor.strips.new_image("frames", os.path.join(FRAMES, files[0]), channel=1, frame_start=1)
for f in files[1:]:
    strip.elements.append(f)
sc.frame_start, sc.frame_end = 1, len(files)
sc.render.fps = FPS
sc.render.resolution_x, sc.render.resolution_y = WIDTH, WIDTH * 9 // 16
sc.render.resolution_percentage = 100
strip.transform.filter = 'BILINEAR'
sc.render.image_settings.media_type = 'VIDEO'
sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg
ff.format = 'MPEG4'
ff.codec = 'H264'
ff.constant_rate_factor = 'HIGH'
ff.ffmpeg_preset = 'BEST'
ff.gopsize = FPS
ff.audio_codec = 'NONE'
sc.view_settings.view_transform = 'Standard'  # 이미 톤매핑된 PNG 이므로 그대로 통과
sc.render.filepath = OUT
bpy.ops.render.render(animation=True)
print("[encode] wrote", OUT, len(files), "frames")
