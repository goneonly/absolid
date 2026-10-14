# 리타게팅된 .blend 에 근육 강화·재질·조명·카메라·렌더 설정을 더해 렌더용 장면으로 저장
# 실행: Blender -b <animated.blend> --python build_scene.py -- <out.blend> <frames_dir> [preview] [outfit=male|female] [muscle=2.4]
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, FRAMES = argv[0], argv[1]
OPTS = dict(a.split("=", 1) for a in argv[2:] if "=" in a)
PREVIEW = "preview" in argv[2:]
OUTFIT = OPTS.get("outfit", "male")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import muscle

MUSCLE_AMOUNT = float(OPTS.get("muscle", 2.4))
SKIN = (0.46, 0.37, 0.31)      # 따뜻한 클레이 톤 (linear)
SHORTS = (0.018, 0.019, 0.022)
BRAND = (1.0, 0.045, 0.026)    # #ff3b30 (linear 근사)
MAT_Z = 0.008                  # 운동 매트 두께(m)

sc = bpy.context.scene
body = bpy.data.objects["Body"]
rig = bpy.data.objects["Body_Rig"]
me = body.data
n = len(me.vertices)

# ───────── 반바지 영역 (rest 포즈 기준, 메시 로컬 Z-up cm) ─────────
co = np.empty(n * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
hz, fy = co[:, 2], co[:, 1]
arm = np.zeros(n)
arm_groups = {g.index for g in body.vertex_groups if any(k in g.name for k in ("upperarm", "lowerarm", "hand_", "thumb", "index", "middle", "ring", "pinky"))}
for v in me.vertices:
    for g in v.groups:
        if g.group in arm_groups: arm[v.index] += g.weight


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# 체형마다 키가 달라 높이는 뼈 위치 기준 (메시 로컬 높이 = armature rest 의 y)
bh = lambda n: rig.data.bones["DHIbody:" + n].head_local.y
OUT_P = dict(  # 의상 경계(cm) — 셰이더에서 픽셀 단위로 계산하고, 근육 감쇠용 정점 마스크에도 같은 값 사용
    waist=bh("spine_01") + 0.3 * (bh("spine_02") - bh("spine_01")) - 0.2,  # 허리선(앞쪽은 1.5cm 낮게)
    leg=bh("thigh_l") - 0.53 * (bh("thigh_l") - bh("calf_l")),              # 밑단(바깥쪽은 2cm 높게)
    band=2.2,                                                               # 레드 허리 밴드 폭
    under=bh("spine_04") + float(OPTS.get("bra_lo", 0.25)) * (bh("spine_05") - bh("spine_04")),  # 브라 밑선
    top=bh("spine_05") + float(OPTS.get("bra_hi", -0.18)) * (bh("spine_05") - bh("spine_04")),  # 브라 윗선(옆, 겨드랑이보다 살짝 아래)
    strap_x=0.6 * abs(rig.data.bones["DHIbody:upperarm_l"].head_local.x),   # 어깨끈 위치
    strap_top=bh("neck_01") + 0.5 * (bh("head") - bh("neck_01")),
)
waist = OUT_P["waist"] + 1.5 * smoothstep(-8, 8, fy)
leg = OUT_P["leg"] + 2.0 * smoothstep(0, 25, np.abs(co[:, 0]))
cover = smoothstep(leg - 0.4, leg + 0.4, hz) * (1 - smoothstep(waist - 0.4, waist + 0.4, hz))
if OUTFIT == "female":
    cover = np.maximum(cover, smoothstep(OUT_P["under"] - 0.4, OUT_P["under"] + 0.4, hz) * (1 - smoothstep(OUT_P["top"] - 0.4, OUT_P["top"] + 0.4, hz)))
cover *= arm < 0.3

# 근육 강화 (천이 덮는 부위는 약하게)
muscle.enhance(body, MUSCLE_AMOUNT, damp=0.75 * cover)

at = me.attributes.get("rest_co") or me.attributes.new("rest_co", 'FLOAT_VECTOR', 'POINT')
at.data.foreach_set("vector", co.astype(np.float32).ravel())  # 근육 강화 전 rest 좌표 (x, y=앞(-)/뒤(+), z=높이)
at = me.attributes.get("not_arm") or me.attributes.new("not_arm", 'FLOAT', 'POINT')
at.data.foreach_set("value", np.clip((0.45 - arm) / 0.3, 0, 1).astype(np.float32))

for p in me.polygons: p.use_smooth = True
sub = body.modifiers.new("Subdivision", 'SUBSURF')
sub.levels, sub.render_levels = 1, 1

# ───────── 재질 ─────────
def node(nt, kind, loc, **inputs):
    nd = nt.nodes.new(kind); nd.location = loc
    for k, v in inputs.items(): nd.inputs[k].default_value = v
    return nd


mat = bpy.data.materials.new("Body"); mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear(); L = nt.links
out = node(nt, "ShaderNodeOutputMaterial", (1200, 0))
skin = node(nt, "ShaderNodeBsdfPrincipled", (500, 200))
skin.inputs["Roughness"].default_value = 0.48
skin.inputs["Subsurface Weight"].default_value = 0.25
skin.inputs["Subsurface Radius"].default_value = (1.0, 0.45, 0.25)
skin.inputs["Subsurface Scale"].default_value = 0.004
skin.inputs["Specular IOR Level"].default_value = 0.45
skin.inputs["Sheen Weight"].default_value = 0.15
# 근육 사이 홈은 살짝 어둡고, 볼록한 근육 면은 살짝 밝게
relief = nt.nodes.new("ShaderNodeVertexColor"); relief.layer_name = "relief"; relief.location = (-600, 300)
sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-400, 300); L.new(relief.outputs["Color"], sep.inputs["Color"])
rmap = node(nt, "ShaderNodeMapRange", (-200, 300)); rmap.inputs["To Min"].default_value = 0.64; rmap.inputs["To Max"].default_value = 1.15
L.new(sep.outputs["Red"], rmap.inputs["Value"])
ao = node(nt, "ShaderNodeAmbientOcclusion", (-400, 0)); ao.inputs["Distance"].default_value = 0.05
aomap = node(nt, "ShaderNodeMapRange", (-200, 0)); aomap.inputs["To Min"].default_value = 0.72
L.new(ao.outputs["AO"], aomap.inputs["Value"])
base = node(nt, "ShaderNodeRGB", (-200, 500)); base.outputs[0].default_value = (*SKIN, 1)
m1 = nt.nodes.new("ShaderNodeMix"); m1.data_type = 'RGBA'; m1.blend_type = 'MULTIPLY'; m1.location = (50, 400)
m1.inputs["Factor"].default_value = 1
L.new(base.outputs[0], m1.inputs[6]); L.new(rmap.outputs[0], m1.inputs[7])
m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = 'RGBA'; m2.blend_type = 'MULTIPLY'; m2.location = (250, 300)
m2.inputs["Factor"].default_value = 1
L.new(m1.outputs[2], m2.inputs[6]); L.new(aomap.outputs[0], m2.inputs[7])
L.new(m2.outputs[2], skin.inputs["Base Color"])

cloth = node(nt, "ShaderNodeBsdfPrincipled", (500, -300))
cloth.inputs["Roughness"].default_value = 0.85
cloth.inputs["Sheen Weight"].default_value = 0.6
cloth.inputs["Sheen Tint"].default_value = (0.6, 0.6, 0.65, 1)


class Expr:
    """셰이더 노드로 스칼라 식을 만드는 작은 도우미 (값은 float 상수 또는 소켓)"""
    def __init__(self, nt):
        self.nt, self.i = nt, 0

    def _node(self, kind):
        n = self.nt.nodes.new(kind); n.location = (-1400 + (self.i % 8) * 160, -900 - (self.i // 8) * 160); self.i += 1
        return n

    def _in(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        else: L.new(v, sock)

    def math(self, op, a, b=0.0):
        n = self._node("ShaderNodeMath"); n.operation = op
        self._in(n.inputs[0], a); self._in(n.inputs[1], b)
        return n.outputs[0]

    def S(self, e0, e1, x):  # smoothstep(e0, e1, x)
        n = self._node("ShaderNodeMapRange"); n.interpolation_type = 'SMOOTHSTEP'
        self._in(n.inputs["Value"], x); self._in(n.inputs["From Min"], e0); self._in(n.inputs["From Max"], e1)
        return n.outputs["Result"]

    def step_between(self, x, lo, hi, e=0.12):  # lo < x < hi (경계 e cm 안티에일리어싱)
        return self.math('MULTIPLY', self.S(self.math('SUBTRACT', lo, e), self.math('ADD', lo, e), x),
                         self.math('SUBTRACT', 1.0, self.S(self.math('SUBTRACT', hi, e), self.math('ADD', hi, e), x)))


E = Expr(nt)
rc = nt.nodes.new("ShaderNodeAttribute"); rc.attribute_name = "rest_co"; rc.location = (-1700, -900)
sxyz = nt.nodes.new("ShaderNodeSeparateXYZ"); sxyz.location = (-1550, -900); L.new(rc.outputs["Vector"], sxyz.inputs[0])
ax, fyv, hzv = E.math('ABSOLUTE', sxyz.outputs["X"]), sxyz.outputs["Y"], sxyz.outputs["Z"]
na = nt.nodes.new("ShaderNodeAttribute"); na.attribute_name = "not_arm"; na.location = (-1700, -1100)
not_arm = E.S(0.4, 0.6, na.outputs["Fac"])

waist_l = E.math('ADD', OUT_P["waist"], E.math('MULTIPLY', 1.5, E.S(-8.0, 8.0, fyv)))
leg_l = E.math('ADD', OUT_P["leg"], E.math('MULTIPLY', 2.0, E.S(0.0, 25.0, ax)))
cover = E.step_between(hzv, leg_l, waist_l)
red = E.math('MULTIPLY', cover, E.S(E.math('SUBTRACT', waist_l, OUT_P["band"] + 0.12), E.math('SUBTRACT', waist_l, OUT_P["band"] - 0.12), hzv))
if OUTFIT == "female":
    front = E.math('SUBTRACT', 1.0, E.S(-4.0, 2.0, fyv))  # 앞쪽 1 → 뒤쪽 0
    # 윗선: 앞 가운데가 파인 스쿱 네크라인, 등 쪽은 2cm 낮게
    scoop = E.math('MULTIPLY', E.math('MULTIPLY', 4.0, E.math('SUBTRACT', 1.0, E.S(0.0, 8.0, ax))), front)
    top_l = E.math('SUBTRACT', E.math('SUBTRACT', OUT_P["top"], scoop), E.math('MULTIPLY', 2.0, E.math('SUBTRACT', 1.0, front)))
    bra = E.step_between(hzv, OUT_P["under"], top_l)
    # 어깨끈: 브라 윗선부터 어깨 위를 넘어가는 폭 2.4cm 띠
    strap = E.math('MULTIPLY', E.step_between(E.math('ABSOLUTE', E.math('SUBTRACT', ax, OUT_P["strap_x"])), -1.0, 1.2),
                   E.step_between(hzv, E.math('SUBTRACT', top_l, 0.5), OUT_P["strap_top"]))
    cover = E.math('MAXIMUM', cover, E.math('MAXIMUM', bra, strap))
    red = E.math('MAXIMUM', red, E.math('MULTIPLY', bra, E.math('SUBTRACT', 1.0, E.S(OUT_P["under"] + 1.6, OUT_P["under"] + 1.8, hzv))))
cover = E.math('MULTIPLY', cover, not_arm)
red = E.math('MULTIPLY', red, not_arm)

cmix = nt.nodes.new("ShaderNodeMix"); cmix.data_type = 'RGBA'; cmix.location = (250, -350)
cmix.inputs[6].default_value = (*SHORTS, 1); cmix.inputs[7].default_value = (*BRAND, 1)
L.new(red, cmix.inputs["Factor"])
L.new(cmix.outputs[2], cloth.inputs["Base Color"])
mix = nt.nodes.new("ShaderNodeMixShader"); mix.location = (950, 0)
L.new(cover, mix.inputs[0]); L.new(skin.outputs[0], mix.inputs[1]); L.new(cloth.outputs[0], mix.inputs[2])
L.new(mix.outputs[0], out.inputs["Surface"])
me.materials.clear(); me.materials.append(mat)

# ───────── 동작 전체를 감싸는 범위 → 매트·카메라 배치 ─────────
dg = bpy.context.evaluated_depsgraph_get()
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
pts = []  # 프레이밍용 표본 정점
for f in range(sc.frame_start, sc.frame_end + 1, 4):
    sc.frame_set(f)
    ev = body.evaluated_get(dg)
    em = ev.to_mesh()
    c = np.empty(len(em.vertices) * 3); em.vertices.foreach_get("co", c)
    c = c.reshape(-1, 3)[::25] @ np.array(ev.matrix_world.to_3x3()).T + np.array(ev.matrix_world.translation)
    ev.to_mesh_clear()
    pts.append(c)
    lo = Vector(np.minimum(lo, c.min(0))); hi = Vector(np.maximum(hi, c.max(0)))
pts = np.concatenate(pts)
rig.location.z += MAT_Z
pts[:, 2] += MAT_Z
print("[scene] motion bbox", tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi))

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
floor = bpy.context.object; floor.name = "Floor"
fm = bpy.data.materials.new("Floor"); fm.use_nodes = True
fb = fm.node_tree.nodes["Principled BSDF"]
fb.inputs["Base Color"].default_value = (0.010, 0.010, 0.012, 1); fb.inputs["Roughness"].default_value = 0.6
floor.data.materials.append(fm)

mat_len, mat_w = (hi.y - lo.y) + 0.25, 0.72
bpy.ops.mesh.primitive_cube_add(location=(0, (lo.y + hi.y) / 2, MAT_Z / 2))
yoga = bpy.context.object; yoga.name = "Mat"
yoga.dimensions = (mat_w, mat_len, MAT_Z)
bpy.ops.object.transform_apply(scale=True)
bev = yoga.modifiers.new("Bevel", 'BEVEL'); bev.width = 0.004; bev.segments = 3
ym = bpy.data.materials.new("Mat"); ym.use_nodes = True
yb = ym.node_tree.nodes["Principled BSDF"]
yb.inputs["Base Color"].default_value = (0.028, 0.029, 0.034, 1); yb.inputs["Roughness"].default_value = 0.75
yoga.data.materials.append(ym)

# ───────── 카메라: 운동별 방향(rig["cam_dir"])에서 동작 전체가 화면의 MARGIN 안에 들어오도록 ─────────
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
cam.data.sensor_width = 36
direction = Vector(rig.get("cam_dir", (-0.60, -0.72, 0.40))).normalized()
MARGIN = 0.80
fwd = -direction
right = fwd.cross(Vector((0, 0, 1))).normalized(); up = right.cross(fwd)
tan_h = (18 / 50) * MARGIN; tan_v = tan_h * 9 / 16
R = np.array([right, up, fwd])
ctr = Vector(pts.mean(0))
for _ in range(3):  # 투영 범위의 중심으로 조준점을 옮기며 거리 계산
    v = (pts - np.array(ctr)) @ R.T  # (x, y, 깊이)
    dist = max(float((np.abs(v[:, 0]) / tan_h - v[:, 2]).max()), float((np.abs(v[:, 1]) / tan_v - v[:, 2]).max()))
    px, py = v[:, 0] / (dist + v[:, 2]), v[:, 1] / (dist + v[:, 2])
    ctr += right * ((px.max() + px.min()) / 2 * dist) + up * ((py.max() + py.min()) / 2 * dist)
cam.location = ctr + direction * dist
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
print(f"[scene] camera dist {dist:.2f} target", tuple(round(x, 2) for x in ctr))


# ───────── 조명 ─────────
def area(name, loc, energy, size, color=(1, 1, 1), aim=None, spread=None, size_y=None):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.color = color
    if size_y: l.shape = 'RECTANGLE'; l.size = size; l.size_y = size_y
    else: l.size = size
    if spread: l.spread = math.radians(spread)
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = ((aim or ctr) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


# 조명 배치는 싯업 카메라(-0.60, -0.72) 기준으로 잡은 값을 카메라 방위각만큼 돌려 운동마다 같은 느낌 유지
torso = Vector((ctr.x, ctr.y, 0.4))
spin = math.atan2(direction.y, direction.x) - math.atan2(-0.72, -0.60)
def lp(x, y, z):
    c, s_ = math.cos(spin), math.sin(spin)
    return (torso.x + x * c - y * s_, torso.y + x * s_ + y * c, z)
# 림 라이트는 라이트 링킹으로 몸에만 비춤 (바닥이 붉게 물들지 않게)
body_only = bpy.data.collections.new("BodyOnly"); body_only.objects.link(body)
key = area("Key", lp(-1.8, 0.2, 2.1), 120, 1.0, (1.0, 0.96, 0.92), torso)
area("Top", lp(0.0, 0.75, 2.25), 70, 1.4, (1, 1, 1), torso, size_y=0.4)
for lt in (area("RimRed", lp(1.4, 0.9, 1.5), 100, 0.5, BRAND, torso),
           area("RimBack", lp(-0.9, 1.7, 1.5), 70, 0.6, (0.85, 0.9, 1.0), torso)):
    lt.light_linking.receiver_collection = body_only
area("Fill", tuple(cam.location + Vector((0, 0, 0.4))), 14, 2.0, (0.9, 0.93, 1.0), torso)

world = bpy.data.worlds.new("World"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.0055, 0.0057, 0.0066, 1)

# ───────── 렌더 설정 ─────────
sc.render.engine = 'CYCLES'
sc.cycles.device = 'GPU'
sc.cycles.samples = 64 if PREVIEW else 128
sc.cycles.adaptive_threshold = 0.015
sc.cycles.use_denoising = True
sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.resolution_percentage = 50 if PREVIEW else 100
# 모션블러는 변형 메시 BVH 비용으로 빠른 프레임이 5~6배 느려짐 → 끄고 60fps 로 부드러움 확보
sc.render.use_motion_blur = False
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.0
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_depth = '8'
sc.render.filepath = os.path.join(FRAMES, "f_")
sc.frame_set(sc.frame_start)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("[scene] saved", OUT)
