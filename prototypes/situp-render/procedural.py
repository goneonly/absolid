# 관절 각도로 정의한 운동 동작(exercises/*.py) → MetaHuman 리그 키프레임 → .blend
# 실행: Blender -b --factory-startup --python procedural.py -- <model.fbx> <exercise> <out.blend> [seconds] [fps]
#
#  포즈는 '서 있는 rest 포즈 기준 해부학 각도'(도)로 적는다. 몸 전체 방향(누움 등)은 마지막에 돌린다.
#    굴곡(flex)·신전(ext)은 좌우축(X), 외전(abd)은 앞뒤축(Z) 회전.
#  누운 운동(contact='supine')은 프레임마다 다음을 풀어 바닥에 자연스럽게 눕힌다.
#    ① 요추: 흉곽은 바닥에 평평하게 둔 채 등 아랫부분(천골~허리)과 등 윗부분이 함께 닿게  ② 목: 뒤통수가 바닥에 닿게
#    ③ 어깨·손목: 아래팔과 손바닥이 바닥에 닿게
import bpy, sys, os, math, importlib
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rig import Rig, T, PELVIS, X, Z, SIDES, smooth_loop

argv = sys.argv[sys.argv.index("--") + 1:]
MODEL, EXERCISE, OUT = argv[0], argv[1], argv[2]
SECONDS = float(argv[3]) if len(argv) > 3 else 2.5
FPS = int(argv[4]) if len(argv) > 4 else 60

bpy.ops.wm.read_factory_settings(use_empty=True)
rig = Rig(MODEL)
ex = importlib.import_module(f"exercises.{EXERCISE}")
head = rig.head
rad = math.radians
rx = lambda d: Quaternion(X, rad(d))
rz = lambda d: Quaternion(Z, rad(d))
SIGN = {"l": 1, "r": -1}  # 왼쪽(+X) 기준 외전 부호


def bone_dir(a, b):
    return (head(T(b)) - head(T(a))).normalized()


# rest(A-포즈) 방향: MetaHuman 은 팔꿈치가 40° 가량 굽어 있어 각도를 '더하는' 대신 목표 방향으로 겨눈다
REST_DIR = {}
for s in SIDES:
    REST_DIR[s] = dict(
        upper=bone_dir(f"upperarm_{s}", f"lowerarm_{s}"), fore=bone_dir(f"lowerarm_{s}", f"hand_{s}"),
        thigh=bone_dir(f"thigh_{s}", f"calf_{s}"), calf=bone_dir(f"calf_{s}", f"foot_{s}"),
        knuckle=head(T(f"index_01_{s}")) - head(T(f"pinky_01_{s}")),
        hand=bone_dir(f"hand_{s}", f"middle_01_{s}"))
DOWN = Vector((0, -1, 0))
BODY = {"supine": rx(-90)}  # 앞(+Z)이 위(+Y)를 보도록, 머리는 -Z 쪽


def signed_angle(v, want, axis):
    v = v - axis * v.dot(axis); want = want - axis * want.dot(axis)
    a = v.angle(want, 0.0)
    return a if v.cross(want).dot(axis) > 0 else -a


def build(p):
    """해부학 각도 dict → 뼈별 월드 회전 Q. 회전량은 모두 rest 기준 '변화량'(D)으로 계산"""
    g = lambda k, d=0.0: p.get(k, d)
    side = lambda k, s, d=0.0: p.get(f"{k}_{s}", p.get(k, d))
    D = {PELVIS: BODY[g("body", "supine")] @ rx(-g("pelvic_tilt"))}  # +면 후방경사(허리가 바닥에 붙음)
    prev = PELVIS
    lumbar, thoracic = g("lumbar"), g("thoracic")
    for n, f in (("spine_01", lumbar / 3), ("spine_02", lumbar / 3), ("spine_03", lumbar / 3),
                 ("spine_04", thoracic / 2), ("spine_05", thoracic / 2),
                 ("neck_01", g("neck") / 2), ("neck_02", g("neck") / 2), ("head", g("head"))):
        D[T(n)] = D[prev] @ rx(f)
        prev = T(n)
    chest = D[T("spine_05")]
    for s in SIDES:
        r = REST_DIR[s]
        # 다리: 허벅지·종아리를 목표 방향으로 (외전 → 고관절 굴곡, 무릎은 뒤로 접힘), 발목은 종아리 기준
        th = rx(-side("hip_flex", s)) @ rz(SIGN[s] * side("leg_abd", s)) @ DOWN
        ca = rx(-side("hip_flex", s) + side("knee", s)) @ rz(SIGN[s] * side("leg_abd", s)) @ DOWN
        R_th, R_ca = r["thigh"].rotation_difference(th), r["calf"].rotation_difference(ca)
        D[T(f"thigh_{s}")] = D[PELVIS] @ R_th
        D[T(f"calf_{s}")] = D[PELVIS] @ R_ca
        D[T(f"foot_{s}")] = D[PELVIS] @ R_ca @ rx(side("ankle", s))  # +면 발끝을 뻗음
        D[T(f"ball_{s}")] = D[T(f"foot_{s}")]
        # 팔: 위팔(외전 → 어깨 신전, +면 손이 등 쪽), 아래팔(팔꿈치는 앞으로 굽힘)
        up = rx(side("shoulder_ext", s)) @ rz(SIGN[s] * side("arm_abd", s)) @ DOWN
        fo = rx(side("shoulder_ext", s) - side("elbow", s)) @ rz(SIGN[s] * side("arm_abd", s)) @ DOWN
        R_up, R_fo = r["upper"].rotation_difference(up), r["fore"].rotation_difference(fo)
        # 손바닥이 뒤(누우면 바닥)를 향하도록 아래팔 축으로 돌림: 검지-새끼 축이 몸 안쪽을 향하게
        ang = signed_angle(R_fo @ r["knuckle"], Vector((-SIGN[s], 0, 0)), fo) * side("palm_down", s, 1.0)
        D[T(f"clavicle_{s}")] = chest
        D[T(f"upperarm_{s}")] = chest @ R_up
        D[T(f"lowerarm_{s}")] = chest @ R_fo
        R_hand = Quaternion(fo, ang) @ R_fo
        # 손목 신전(+면 손등 쪽으로 젖힘): 손바닥이 뒤를 볼 때 손등은 앞(+Z) → 축 = 아래팔 × 앞
        wrist_axis = fo.cross(Vector((0, 0, 1))).normalized()
        R_hand = Quaternion(wrist_axis, rad(side("wrist_ext", s))) @ R_hand
        D[T(f"hand_{s}")] = chest @ R_hand
        # 손가락 펴기: 마디 방향을 손 방향(손목→가운데 손가락 뿌리) 쪽으로 straighten 비율만큼
        k = side("finger_straight", s)
        if k:
            hdir = r["hand"]
            for f in ("index", "middle", "ring", "pinky"):
                for i in (1, 2, 3):
                    a, b = f"{f}_0{min(i, 2)}_{s}", f"{f}_0{min(i, 2) + 1}_{s}"
                    d0 = bone_dir(a, b)
                    D[T(f"{f}_0{i}_{s}")] = chest @ R_hand @ Quaternion().slerp(d0.rotation_difference(hdir), k)
    return {n: d @ rig.RREST[n] for n, d in D.items()}


HIPC = Vector((0, 60, 0))  # 고관절 중심을 원점 위에 두고 바닥 높이는 접지 단계에서 맞춤


def pose_at(p, tilt=0.0):
    """각도 + 몸 기울기 → (Q, 골반 위치). 기울기는 고관절 중심을 지나는 좌우축 회전"""
    Q = build(p)
    R = rx(tilt)
    Q = {n: R @ q for n, q in Q.items()}
    return Q, rig.pelvis_for_hipc(Q[PELVIS], HIPC)


BUTT_SINK = 1.0   # 엉덩이 살은 바닥에 1cm 까지 눌릴 수 있음
HEAD_GAP = 1.0    # 뒤통수는 바닥 위 1cm (목을 과하게 젖히지 않게)


def back_contact(P):
    """누운 자세의 등 아래쪽 접점 높이: 천골·허리 또는 (눌림을 감안한) 엉덩이 중 낮은 쪽"""
    m = rig.region_min_y(P, "lowback", "butt", "upperback")
    return min(m["lowback"], m["butt"] + BUTT_SINK), m["upperback"]


def lowered(Q, ppos):
    """등 아래·위 접점 중 낮은 쪽이 바닥(y=0)에 오도록 내린 골반 위치"""
    lo, up = back_contact(rig.fk(Q, ppos))
    return ppos + Vector((0, -min(lo, up), 0))


def bisect(f, lo, hi, iters=18):
    """f 가 단조일 때 f(x)=0 인 x (범위 밖이면 가까운 끝)"""
    flo, fhi = f(lo), f(hi)
    if flo * fhi > 0:
        return lo if abs(flo) < abs(fhi) else hi
    for _ in range(iters):
        mid = (lo + hi) / 2
        fm = f(mid)
        if (fm > 0) == (flo > 0): lo, flo = mid, fm
        else: hi = mid
    return (lo + hi) / 2


def solve_supine(p, tilt0):
    # ① 엉덩이·등 윗부분 동시 접지: 가슴(흉곽)은 바닥에 평평하게 둔 채 요추 굴곡으로 흡수
    #    (요추를 λ 만큼 굽히고 몸 전체를 -λ 돌리면 흉곽 방향은 그대로)
    def g(lam):
        Q, pp = pose_at(dict(p, lumbar=p.get("lumbar", 0) + lam), tilt0 - lam)
        lo, up = back_contact(rig.fk(Q, pp))
        return lo - up
    lam = bisect(g, -25, 25)
    q = dict(p, lumbar=p.get("lumbar", 0) + lam)
    tilt = tilt0 - lam
    # ② 뒤통수 접지 (목 굴곡 보정)
    def h(a):
        Q, pp = pose_at(dict(q, neck=q.get("neck", 0) + a), tilt)
        pp = lowered(Q, pp)
        return rig.region_min_y(rig.fk(Q, pp), "head")["head"] - HEAD_GAP
    neck = bisect(h, -45, 30)
    # ③ 아래팔 접지(어깨 신전 보정) → 손바닥 접지(손목 신전 보정), 좌우 따로
    arms, wrists = {}, {}
    for s in SIDES:
        def with_arm(b, w=None, s=s):
            ext = q.get(f"shoulder_ext_{s}", q.get("shoulder_ext", 0)) + b
            extra = {f"shoulder_ext_{s}": ext}
            if w is not None: extra[f"wrist_ext_{s}"] = q.get(f"wrist_ext_{s}", q.get("wrist_ext", 0)) + w
            Q, pp = pose_at(dict(q, neck=q.get("neck", 0) + neck, **extra), tilt)
            return rig.fk(Q, lowered(Q, pp))
        arms[s] = bisect(lambda b: rig.region_min_y(with_arm(b), f"forearm_{s}")[f"forearm_{s}"], -40, 60)
        wrists[s] = bisect(lambda w: rig.region_min_y(with_arm(arms[s], w), f"hand_{s}")[f"hand_{s}"], -40, 50)
    return lam, tilt, neck, arms, wrists


def initial_tilt(p):
    """첫 프레임 기준으로 엉덩이·등이 함께 닿는 몸 기울기 (이후 프레임은 흉곽 방향을 이 값으로 고정)"""
    def g(th):
        Q, pp = pose_at(p, th)
        lo, up = back_contact(rig.fk(Q, pp))
        return lo - up
    return bisect(g, -25, 25)


def final_pose(p, lam, tilt, neck, arms, wrists):
    q = dict(p, lumbar=p.get("lumbar", 0) + lam, neck=p.get("neck", 0) + neck)
    for s in SIDES:
        q[f"shoulder_ext_{s}"] = p.get(f"shoulder_ext_{s}", p.get("shoulder_ext", 0)) + arms[s]
        q[f"wrist_ext_{s}"] = p.get(f"wrist_ext_{s}", p.get("wrist_ext", 0)) + wrists[s]
    Q, pp = pose_at(q, tilt)
    return Q, lowered(Q, pp)


n_frames = round(SECONDS * FPS)
params = [ex.pose(i / n_frames) for i in range(n_frames)]
assert ex.CONTACT == "supine", "현재는 누운 운동만 지원"
tilt0 = initial_tilt(params[0])
sol = [solve_supine(p, tilt0) for p in params]
half = max(1, round(FPS / 15))
lam = smooth_loop([s[0] for s in sol], half)
tilt = [tilt0 - v for v in lam]
neck = smooth_loop([s[2] for s in sol], half)
arms = {s: smooth_loop([x[3][s] for x in sol], half) for s in SIDES}
wrists = {s: smooth_loop([x[4][s] for x in sol], half) for s in SIDES}
print(f"[procedural] tilt0 {tilt0:.1f}")
print("[procedural] lumbar+", [round(v, 1) for v in lam[::10]])
print("[procedural] neck", [round(v, 1) for v in neck[::10]])
print("[procedural] arm_l", [round(v, 1) for v in arms["l"][::10]], "wrist_l", [round(v, 1) for v in wrists["l"][::30]])

frames = []
for i, p in enumerate(params):
    Q, pp = final_pose(p, lam[i], tilt[i], neck[i], {s: arms[s][i] for s in SIDES}, {s: wrists[s][i] for s in SIDES})
    P = rig.fk(Q, pp)
    if i % 15 == 0:
        m = rig.region_min_y(P, "lowback", "butt", "upperback", "head", "forearm_l", "hand_l", "hand_r", "feet")
        print(f"[procedural] f{i + 1:03d} " + " ".join(f"{k} {v:5.1f}" for k, v in m.items()))
    frames.append(P)
    keyed = set(Q)

rig.write_keys(frames, keyed, FPS)
print("[procedural] blender min z (cm):", rig.floor_check(10))
rig.arm["cam_dir"] = ex.CAM_DIR
bpy.ops.wm.save_as_mainfile(filepath=OUT)
