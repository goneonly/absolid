# Mixamo 애니메이션(FBX) → MetaHuman 바디(FBX) 리타게팅 후 .blend 로 저장
# 실행: Blender -b --factory-startup --python retarget.py -- <model.fbx> <anim.fbx> <out.blend> [seconds] [fps]
#
# 방식: 두 뼈대를 같은 'T-포즈 기준'으로 맞춘 뒤(팔·다리·손가락 방향 정렬),
#       원본 뼈의 월드 회전 변화량(rest → 현재)을 대상 뼈에 그대로 적용한다.
#       척추는 뼈 개수가 달라(3 → 5) 척추 길이 비율로 회전을 보간해 나눠준다.
#       이후 엉덩이·발이 바닥에 닿도록 몸 기울기·높이를 풀고 다리는 IK 로 맞춘다.
import bpy, sys, os, math
from mathutils import Matrix, Vector, Quaternion

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig import Rig, T, PELVIS, X, SIDES, rot, import_fbx, smooth_loop

argv = sys.argv[sys.argv.index("--") + 1:]
MODEL, ANIM, OUT = argv[0], argv[1], argv[2]
SECONDS = float(argv[3]) if len(argv) > 3 else 2.5
FPS = int(argv[4]) if len(argv) > 4 else 60

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
rig = Rig(MODEL)
TREST, head = rig.TREST, rig.head

new = import_fbx(ANIM)
src = next(o for o in new if o.type == 'ARMATURE')
for o in new:
    if o.type == 'MESH':
        bpy.data.objects.remove(o)
f0, f1 = src.animation_data.action.frame_range
SRC_FPS = sc.render.fps  # FBX 임포트가 원본 fps(60)로 설정해 둠
src_dur = (f1 - f0) / SRC_FPS
S = lambda n: "mixamorig:" + n
SREST = {b.name: b.matrix_local.copy() for b in src.data.bones}

# ───────── 뼈 매핑 ─────────
FINGERS = (("thumb", "Thumb"), ("index", "Index"), ("middle", "Middle"), ("ring", "Ring"), ("pinky", "Pinky"))
DIRECT = {T("head"): S("Head")}  # target -> source
ALIGN = []  # 방향을 원본 T-포즈에 맞출 뼈: (대상 뼈, 대상 조준 자식, 원본 뼈, 원본 조준 자식)
for side, sd in (("l", "Left"), ("r", "Right")):
    DIRECT.update({
        T(f"clavicle_{side}"): S(f"{sd}Shoulder"),
        T(f"upperarm_{side}"): S(f"{sd}Arm"),
        T(f"lowerarm_{side}"): S(f"{sd}ForeArm"),
        T(f"hand_{side}"): S(f"{sd}Hand"),
        T(f"thigh_{side}"): S(f"{sd}UpLeg"),
        T(f"calf_{side}"): S(f"{sd}Leg"),
        T(f"foot_{side}"): S(f"{sd}Foot"),
        T(f"ball_{side}"): S(f"{sd}ToeBase"),
    })
    ALIGN += [
        (T(f"upperarm_{side}"), T(f"lowerarm_{side}"), S(f"{sd}Arm"), S(f"{sd}ForeArm")),
        (T(f"lowerarm_{side}"), T(f"hand_{side}"), S(f"{sd}ForeArm"), S(f"{sd}Hand")),
        (T(f"hand_{side}"), T(f"middle_01_{side}"), S(f"{sd}Hand"), S(f"{sd}HandMiddle1")),
        (T(f"thigh_{side}"), T(f"calf_{side}"), S(f"{sd}UpLeg"), S(f"{sd}Leg")),
        (T(f"calf_{side}"), T(f"foot_{side}"), S(f"{sd}Leg"), S(f"{sd}Foot")),
        (T(f"foot_{side}"), T(f"ball_{side}"), S(f"{sd}Foot"), S(f"{sd}ToeBase")),
    ]
    for f_t, f_s in FINGERS:
        for i in (1, 2, 3):
            DIRECT[T(f"{f_t}_0{i}_{side}")] = S(f"{sd}Hand{f_s}{i}")
        for i in (1, 2):
            ALIGN.append((T(f"{f_t}_0{i}_{side}"), T(f"{f_t}_0{i + 1}_{side}"), S(f"{sd}Hand{f_s}{i}"), S(f"{sd}Hand{f_s}{i + 1}")))

# 척추 체인: 고관절 높이(0) ~ 목 시작(1) 기준으로 정규화한 위치에서 원본 회전을 보간
SRC_CHAIN = [S("Hips"), S("Spine"), S("Spine1"), S("Spine2"), S("Neck"), S("Head")]
TGT_CHAIN = [PELVIS, T("spine_01"), T("spine_02"), T("spine_03"), T("spine_04"), T("spine_05"), T("neck_01"), T("neck_02")]

# ───────── 1) 대상 뼈대를 원본 T-포즈 방향으로 정렬한 기준 회전(RT) ─────────
A = {n: m.copy() for n, m in TREST.items()}


def rotate_subtree(n, q, pivot):
    M = Matrix.Translation(pivot) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pivot)
    for d in rig.descendants(n):
        A[d] = M @ A[d]


for t, tc, s, scn in ALIGN:
    h = A[t].translation.copy()
    sdir = SREST[scn].translation - SREST[s].translation
    rotate_subtree(t, (A[tc].translation - h).rotation_difference(sdir), h)
    if t.startswith(T("hand_")):  # 손바닥 방향(검지-새끼 축)까지 맞춤
        side = t[-1]; sd = "Left" if side == "l" else "Right"
        axis = sdir.normalized()
        tv = A[T(f"index_01_{side}")].translation - A[T(f"pinky_01_{side}")].translation
        sv = SREST[S(f"{sd}HandIndex1")].translation - SREST[S(f"{sd}HandPinky1")].translation
        tv -= axis * tv.dot(axis); sv -= axis * sv.dot(axis)
        ang = tv.angle(sv)
        if tv.cross(sv).dot(axis) < 0: ang = -ang
        rotate_subtree(t, Quaternion(axis, ang), A[t].translation.copy())
RT = {n: rot(A[n]) for n in rig.ORDER}

s_hip = (SREST[S("LeftUpLeg")].translation.y + SREST[S("RightUpLeg")].translation.y) / 2
t_hip = rig.hipc_rest.y
s_neck, t_neck = SREST[S("Neck")].translation.y, head(T("neck_01")).y
sp = [(SREST[n].translation.y - s_hip) / (s_neck - s_hip) for n in SRC_CHAIN + [S("HeadTop_End")]]
tp = [(head(n).y - t_hip) / (t_neck - t_hip) for n in TGT_CHAIN + [T("head")]]
S_KEYS = [(sp[i] + sp[i + 1]) / 2 for i in range(len(SRC_CHAIN))]   # 원본 뼈 중간점
T_MIDS = [(tp[i] + tp[i + 1]) / 2 for i in range(len(TGT_CHAIN))]   # 대상 뼈 중간점


def chain_delta(param, deltas):
    if param <= S_KEYS[0]: return deltas[0]
    for i in range(len(S_KEYS) - 1):
        a, b = S_KEYS[i], S_KEYS[i + 1]
        if param <= b:
            return deltas[i].slerp(deltas[i + 1], (param - a) / (b - a))
    return deltas[-1]


def leg_len(rest, up, low, foot):
    return (rest[low].translation - rest[up].translation).length + (rest[foot].translation - rest[low].translation).length


K = leg_len(TREST, T("thigh_l"), T("calf_l"), T("foot_l")) / leg_len(SREST, S("LeftUpLeg"), S("LeftLeg"), S("LeftFoot"))

# ───────── 2) 프레임마다 원본 포즈 → 대상 포즈 ─────────
n_frames = round(SECONDS * FPS)
sc.frame_set(int(f0)); p0 = {pb.name: pb.matrix.copy() for pb in src.pose.bones}
sc.frame_set(int(f1)); p1 = {pb.name: pb.matrix.copy() for pb in src.pose.bones}
loop_err = max((p0[n].translation - p1[n].translation).length for n in p0)
print(f"[retarget] src {f0}-{f1} @ {SRC_FPS}fps = {src_dur:.3f}s, loop err {loop_err:.2f}cm, K={K:.3f}")

base = []  # 프레임별 (Q, 골반 위치)
for i in range(n_frames):
    # 반복 재생용: 마지막 프레임이 첫 프레임과 겹치지 않도록 [0, dur) 구간을 균등 샘플
    fr = f0 + (i / n_frames * src_dur) * SRC_FPS
    sc.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
    SP = {pb.name: pb.matrix.copy() for pb in src.pose.bones}
    D = {n: rot(SP[n]) @ rot(SREST[n]).inverted() for n in SP}  # 원본 월드 회전 변화량
    chain_d = [D[n] for n in SRC_CHAIN]
    Q = {n: chain_delta(T_MIDS[k], chain_d) @ RT[n] for k, n in enumerate(TGT_CHAIN)}
    for n, s in DIRECT.items():
        Q[n] = D[s] @ RT[n]
    s_hipc = (SP[S("LeftUpLeg")].translation + SP[S("RightUpLeg")].translation) / 2
    base.append((Q, rig.pelvis_for_hipc(Q[PELVIS], s_hipc * K)))
bpy.data.objects.remove(src)

# ───────── 3) 접지 보정 ─────────
#  엉덩이는 항상 바닥에 닿고, 등·머리는 바닥을 뚫지 않게: 몸 전체를 고관절 중심 기준
#  좌우축(X)으로 dθ 만큼 기울이고 dy 만큼 내린다. 발은 원래 자리(바닥 높이)에 IK 로 고정.
FOOT_KEEP = set()  # 발 회전은 foot_rots 로 따로 고정
for s in SIDES:
    FOOT_KEEP |= {n for n in rig.descendants(T(f"foot_{s}")) if n in DIRECT}


def apply_fix(Q, ppos, dth, foot_targets, foot_rots, exact=True):
    R = Quaternion(X, dth)
    P0 = rig.fk(Q, ppos)
    hipc = (P0[T("thigh_l")].translation + P0[T("thigh_r")].translation) / 2
    Q2 = {n: (R @ q if n not in FOOT_KEEP else q) for n, q in Q.items()}
    p2 = hipc + R.to_matrix() @ (ppos - hipc)
    for _ in range(2 if exact else 1):  # IK 로 허벅지가 바뀌면 둔부 모양도 살짝 바뀌므로 한 번 더 맞춤
        Q2 = rig.leg_ik(Q2, p2, foot_targets, foot_rots)
        p2 = p2 + Vector((0, -rig.region_min_y(rig.fk(Q2, p2), "butt")["butt"], 0))
    return rig.leg_ik(Q2, p2, foot_targets, foot_rots), p2


foot_info = []
for Q, ppos in base:
    P = rig.fk(Q, ppos)
    y = rig.skin(P)[:, 1]
    targets = {s: P[T(f"foot_{s}")].translation - Vector((0, float(y[rig.SUB[f"feet_{s}"]].min()), 0)) for s in SIDES}
    foot_info.append((targets, {s: Q[T(f"foot_{s}")] for s in SIDES}))
# 발 위치는 반복 내내 거의 고정 — 프레임 평균의 수평 위치로 고정해 미끄러짐 제거
for s in SIDES:
    ax = sum(t[s].x for t, _ in foot_info) / n_frames
    az = sum(t[s].z for t, _ in foot_info) / n_frames
    for t, _ in foot_info:
        t[s] = Vector((ax, t[s].y, az))

CANDS = sorted([math.radians(d) for d in range(-20, 21)], key=abs)
raw_th = []
for i, (Q, ppos) in enumerate(base):
    chosen = CANDS[-1]
    for th in CANDS:
        Q2, p2 = apply_fix(Q, ppos, th, *foot_info[i], exact=False)
        if rig.region_min_y(rig.fk(Q2, p2), "torso")["torso"] >= -0.3:
            chosen = th; break
    raw_th.append(chosen)
sm_th = smooth_loop(raw_th, max(1, round(FPS / 10)))  # ±0.1초 창
print("[retarget] tilt deg:", [round(math.degrees(t), 1) for t in sm_th[::6]])

frames = []
for i, (Q, ppos) in enumerate(base):
    Q2, p2 = apply_fix(Q, ppos, sm_th[i], *foot_info[i])
    P = rig.fk(Q2, p2)
    if i % 12 == 0:
        m = rig.region_min_y(P, "butt", "torso", "feet")
        print(f"[retarget] f{i + 1:03d} butt {m['butt']:5.1f} torso {m['torso']:5.1f} feet {m['feet']:5.1f} cm")
    frames.append(P)

rig.write_keys(frames, set(DIRECT) | set(TGT_CHAIN), FPS)
print("[retarget] blender min z (cm):", rig.floor_check())
rig.arm["loop_err_cm"] = loop_err
rig.arm["cam_dir"] = (-0.60, -0.72, 0.40)  # 옆-앞 3/4: 일어날 때 복근이 정면으로 보이게
bpy.ops.wm.save_as_mainfile(filepath=OUT)
