# MetaHuman 바디 리그 공용 도구 — 리타게팅(retarget.py)과 직접 만든 동작(procedural.py)이 함께 씀
#
#  좌표계: armature 공간(cm). rest 포즈 기준 Y=위, X=몸의 왼쪽(+), Z=앞(+), 바닥은 y=0.
#  포즈는 '뼈별 월드(armature 공간) 회전 Q + 골반 위치'로 다루고, fk() 로 전체 뼈 행렬을 만든다.
import bpy, math
import numpy as np
from mathutils import Matrix, Vector, Quaternion

T = lambda n: "DHIbody:" + n
PELVIS = T("pelvis")
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
SIDES = ("l", "r")

# 트위스트 뼈: (뼈, 기준 뼈, 비틀림을 가져올 뼈, 비율)
#  - 아래팔/종아리: 손·발의 비틀림을 손목·발목 쪽부터 나눠 받음
#  - 위팔/허벅지: 자기 비틀림을 어깨·골반 쪽에서 되돌려 피부가 꼬이지 않게
TWIST = []
for _s in SIDES:
    TWIST += [
        (T(f"lowerarm_twist_01_{_s}"), T(f"lowerarm_{_s}"), T(f"hand_{_s}"), 0.7),
        (T(f"lowerarm_twist_02_{_s}"), T(f"lowerarm_{_s}"), T(f"hand_{_s}"), 0.35),
        (T(f"calf_twist_01_{_s}"), T(f"calf_{_s}"), T(f"foot_{_s}"), 0.65),
        (T(f"calf_twist_02_{_s}"), T(f"calf_{_s}"), T(f"foot_{_s}"), 0.33),
        (T(f"upperarm_twist_01_{_s}"), T(f"upperarm_{_s}"), None, -0.66),
        (T(f"upperarm_twist_02_{_s}"), T(f"upperarm_{_s}"), None, -0.33),
        (T(f"thigh_twist_01_{_s}"), T(f"thigh_{_s}"), None, -0.66),
        (T(f"thigh_twist_02_{_s}"), T(f"thigh_{_s}"), None, -0.33),
    ]


def rot(m):
    return m.to_3x3().normalized().to_quaternion()


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def swing_twist_angle(q, axis):
    v = Vector((q.x, q.y, q.z))
    p = axis * v.dot(axis)
    tw = Quaternion((q.w, p.x, p.y, p.z))
    if tw.magnitude < 1e-9: return 0.0
    tw.normalize()
    ang = 2 * math.atan2(Vector((tw.x, tw.y, tw.z)).dot(axis), tw.w)
    return (ang + math.pi) % (2 * math.pi) - math.pi


def smooth_loop(vals, half):
    """반복 루프용 원형 이동평균"""
    n = len(vals)
    return [sum(vals[(i + k) % n] for k in range(-half, half + 1)) / (2 * half + 1) for i in range(n)]


class Rig:
    def __init__(self, model_path):
        new = import_fbx(model_path)
        self.body = next(o for o in new if o.type == 'MESH')
        par = self.body.parent
        self.arm = par if par and par.type == 'ARMATURE' else next(o for o in new if o.type == 'ARMATURE')
        for o in new:  # 여성 FBX 에는 Maya 리그 보조 객체(포즈 드라이버·트위스트 셋업 등)가 같이 들어 있음
            if o not in (self.arm, self.body):
                bpy.data.objects.remove(o)
        # 뼈 이름 통일: 남성 FBX 는 'DHIbody:pelvis', 여성은 'pelvis' → 접두사를 붙여 같은 이름으로
        if not any(b.name.startswith("DHIbody:") for b in self.arm.data.bones):
            for b in self.arm.data.bones:
                b.name = "DHIbody:" + b.name
            for g in self.body.vertex_groups:  # 뼈 이름을 바꾸면 보통 같이 바뀌지만 안전하게 확인
                if not g.name.startswith("DHIbody:") and ("DHIbody:" + g.name) in self.arm.data.bones:
                    g.name = "DHIbody:" + g.name
        self.arm.name, self.body.name = "Body_Rig", "Body"
        self.arm.animation_data_clear()
        for pb in self.arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)

        bones = self.arm.data.bones
        self.TREST = {b.name: b.matrix_local.copy() for b in bones}
        self.ORDER = [b.name for b in bones]  # Blender 는 부모가 자식보다 먼저 나옴
        self.PARENT = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.CHILDREN = {n: [] for n in self.ORDER}
        for n, p in self.PARENT.items():
            if p: self.CHILDREN[p].append(n)
        self.REL = {n: (self.TREST[p].inverted() @ self.TREST[n]) if p else self.TREST[n].copy() for n, p in self.PARENT.items()}
        self.RREST = {n: rot(m) for n, m in self.TREST.items()}
        self.head = lambda n: self.TREST[n].translation.copy()
        self.hipc_rest = (self.head(T("thigh_l")) + self.head(T("thigh_r"))) / 2
        self._setup_regions()

    # ───────── 계층 ─────────
    def descendants(self, n):
        out, st = [], [n]
        while st:
            x = st.pop(); out.append(x); st.extend(self.CHILDREN[x])
        return out

    def fk(self, Q, ppos):
        """Q: 뼈별 월드 회전, ppos: 골반 위치 → 모든 뼈의 포즈 행렬 (Q 에 없는 뼈는 부모를 따라감)"""
        P = {}
        for n in self.ORDER:
            par = self.PARENT[n]
            follow = (P[par] @ self.REL[n]) if par else self.REL[n]
            if n in Q:
                pos = ppos if n == PELVIS else follow.translation
                P[n] = Matrix.Translation(pos) @ Q[n].to_matrix().to_4x4()
            else:
                P[n] = follow
        return P

    def pelvis_for_hipc(self, q_pelvis, hipc):
        """골반 회전이 q 일 때 고관절 중심이 hipc 에 오도록 하는 골반 위치"""
        off = self.RREST[PELVIS].to_matrix().inverted() @ (self.hipc_rest - self.head(PELVIS))
        return hipc - q_pelvis.to_matrix() @ off

    # ───────── 접지 판정용 스키닝(LBS) — 필요한 정점만 numpy 로 직접 변형 ─────────
    def _setup_regions(self):
        me = self.body.data
        nv = len(me.vertices)
        loc = np.empty(nv * 3, dtype=np.float32); me.vertices.foreach_get("co", loc); loc = loc.reshape(-1, 3)
        to_arm = np.array(self.arm.matrix_world.inverted() @ self.body.matrix_world)
        rest_arm = loc @ to_arm[:3, :3].T + to_arm[:3, 3]
        self.rest_local = loc
        hz, fwd, lat = rest_arm[:, 1], rest_arm[:, 2], rest_arm[:, 0]  # 높이, 앞(+)/뒤(-), 좌(+)/우(-)

        # 체형마다 키가 달라서 높이 기준은 뼈 위치(랜드마크)로 잡는다
        h = lambda n: self.head(T(n)).y
        hip, knee, ankle = h("thigh_l"), h("calf_l"), h("foot_l")
        waist = h("spine_01") + 0.5 * (h("spine_02") - h("spine_01"))
        hip_w = abs(self.head(T("thigh_l")).x)

        gname = {g.index: g.name for g in self.body.vertex_groups}
        arm_w = {s: np.zeros(nv) for s in SIDES}
        armkeys = ("upperarm", "lowerarm", "hand_", "thumb", "index", "middle", "ring", "pinky")
        lower_w = {s: np.zeros(nv) for s in SIDES}
        hand_w = {s: np.zeros(nv) for s in SIDES}
        pelvis_w = np.zeros(nv)
        for v in me.vertices:
            for g in v.groups:
                nm = gname[g.group].split(":")[-1]
                if nm in ("pelvis", "spine_01", "spine_02", "spine_03"):
                    pelvis_w[v.index] += g.weight
                s = nm[-1]
                if s in SIDES and any(k in nm for k in armkeys):
                    arm_w[s][v.index] += g.weight
                    if nm.startswith("lowerarm"):
                        lower_w[s][v.index] += g.weight
                    elif not nm.startswith("upperarm"):
                        hand_w[s][v.index] += g.weight
        not_arm = (arm_w["l"] + arm_w["r"]) < 0.3
        self.REGION = {
            "butt": (hz > hip - 0.46 * (hip - knee)) & (hz < waist) & (fwd < 2) & (np.abs(lat) < 2.15 * hip_w),
            # 누운 자세 접지용 등 아랫부분(천골~요추): 골반·요추에만 붙은 정점이라 고관절을 굽혀도 안 움직이고,
            # 골반을 뒤로 말면 접점이 천골에서 허리로 자연스럽게 옮겨감
            "lowback": (hz > hip - 0.2 * (hip - knee)) & (hz < h("spine_04")) & (fwd < 0) & (pelvis_w > 0.9) & not_arm,
            "torso": hz >= waist,  # 팔 포함: 등·팔꿈치 모두 바닥 관통 금지
            "upperback": (hz > h("spine_04")) & (hz < h("neck_01")) & (fwd < 0) & not_arm,
            "head": hz > h("head"),
            "feet": hz < 1.27 * ankle,
            "forearm_l": lower_w["l"] > 0.5,
            "forearm_r": lower_w["r"] > 0.5,
            "hand_l": hand_w["l"] > 0.5,
            "hand_r": hand_w["r"] > 0.5,
        }
        self.REGION["feet_l"] = self.REGION["feet"] & (lat > 0)
        self.REGION["feet_r"] = self.REGION["feet"] & (lat < 0)

        need = np.zeros(nv, bool)
        for m in self.REGION.values(): need |= m
        idx = np.nonzero(need)[0]
        KMAX = 8
        Wt = np.zeros((len(idx), KMAX), np.float32); Bi = np.zeros((len(idx), KMAX), np.int32)
        bl, bid = [], {}
        for r, vi in enumerate(idx):
            gs = sorted(((g.weight, gname[g.group]) for g in me.vertices[vi].groups if gname[g.group] in self.TREST), reverse=True)[:KMAX]
            tot = sum(w for w, _ in gs) or 1
            for k, (w, bn) in enumerate(gs):
                if bn not in bid: bid[bn] = len(bl); bl.append(bn)
                Wt[r, k] = w / tot; Bi[r, k] = bid[bn]
        self._idx, self._Wt, self._Bi, self._bones = idx, Wt, Bi, bl
        self._rest_inv = np.array([np.array(self.TREST[b].inverted()) for b in bl])
        self._V = np.c_[rest_arm[idx], np.ones(len(idx))]
        self.SUB = {k: m[idx] for k, m in self.REGION.items()}

    def skin(self, P, rows=None):
        M = np.array([np.array(P[b]) for b in self._bones]) @ self._rest_inv
        Wt, Bi, V = (self._Wt, self._Bi, self._V) if rows is None else (self._Wt[rows], self._Bi[rows], self._V[rows])
        out = np.zeros((len(V), 3))
        for k in range(Wt.shape[1]):
            out += Wt[:, k:k + 1] * np.einsum('nij,nj->ni', M[Bi[:, k], :3, :], V)
        return out

    def region_min_y(self, P, *names):
        rows = np.zeros(len(self._idx), bool)
        for n in names: rows |= self.SUB[n]
        y = self.skin(P, rows)[:, 1]
        return {n: float(y[self.SUB[n][rows]].min()) for n in names}

    # ───────── 다리 2본 IK ─────────
    def leg_ik(self, Q, ppos, foot_targets, foot_rots):
        P = self.fk(Q, ppos)
        for s in SIDES:
            t, c, f = T(f"thigh_{s}"), T(f"calf_{s}"), T(f"foot_{s}")
            a = (self.head(c) - self.head(t)).length
            b = (self.head(f) - self.head(c)).length
            H, K0, F0 = P[t].translation, P[c].translation, P[f].translation
            Ft = foot_targets[s]
            d = max(abs(a - b) + 1e-3, min(a + b - 1e-3, (Ft - H).length))
            u = (Ft - H).normalized()
            pole = (K0 - H) - u * (K0 - H).dot(u)
            pole.normalize()
            cos_a = (a * a + d * d - b * b) / (2 * a * d)
            Kn = H + (u * cos_a + pole * math.sqrt(max(0.0, 1 - cos_a * cos_a))) * a
            Fn = H + u * d
            Q[t] = (K0 - H).rotation_difference(Kn - H) @ Q[t]
            Q[c] = (F0 - K0).rotation_difference(Fn - Kn) @ Q[c]
            Q[f] = foot_rots[s]
        return Q

    # ───────── 트위스트 뼈 분배 (P 를 직접 수정) ─────────
    def apply_twist(self, P):
        TR, RR = self.TREST, self.RREST
        for t, base, drv, w in TWIST:
            if drv:  # 자식(손/발)의 비틀림을 기준 뼈 축으로 분해
                E = (rot(P[base]).inverted() @ rot(P[drv])) @ (RR[base].inverted() @ RR[drv]).inverted()
                axis = (RR[base].inverted().to_matrix() @ (self.head(drv) - self.head(base))).normalized()
            else:    # 자기 자신의 비틀림(부모 기준)
                par = self.PARENT[base]
                E = (RR[par].inverted() @ RR[base]).inverted() @ (rot(P[par]).inverted() @ rot(P[base]))
                nxt = T("lowerarm_" + base[-1]) if "upperarm" in base else T("calf_" + base[-1])
                axis = (RR[base].inverted().to_matrix() @ (self.head(nxt) - self.head(base))).normalized()
            ang = swing_twist_angle(E, axis) * w
            q = rot(P[base]) @ Quaternion(axis, ang) @ (RR[base].inverted() @ RR[t])
            P[t] = Matrix.Translation((P[base] @ self.REL[t]).translation) @ q.to_matrix().to_4x4()
        return P

    def basis(self, P, keyed):
        out = {}
        for n in keyed:
            par = self.PARENT[n]
            out[n] = (self.TREST[n].inverted() @ self.TREST[par] @ P[par].inverted() @ P[n]) if par else (self.TREST[n].inverted() @ P[n])
        return out

    # ───────── 키프레임 기록 · 검증 · 저장 ─────────
    def write_keys(self, frames_P, keyed, fps):
        sc = bpy.context.scene
        sc.render.fps = fps
        sc.frame_start, sc.frame_end = 1, len(frames_P)
        keyed = set(keyed) | {t for t, *_ in TWIST}
        prev = {}
        for i, P in enumerate(frames_P):
            for n, m in self.basis(self.apply_twist(P), keyed).items():
                pb = self.arm.pose.bones[n]
                pb.rotation_mode = 'QUATERNION'
                loc, q, _ = m.decompose()
                if n in prev and prev[n].dot(q) < 0: q.negate()  # 보간 시 뒤집힘 방지
                prev[n] = q
                pb.location, pb.rotation_quaternion = loc, q
                pb.keyframe_insert("location", frame=i + 1)
                pb.keyframe_insert("rotation_quaternion", frame=i + 1)

    def floor_check(self, step=5):
        """실제 Blender 변형 결과의 프레임별 최저점(cm)"""
        sc = bpy.context.scene
        dg = bpy.context.evaluated_depsgraph_get()
        mw = self.body.matrix_world
        mins = []
        for f in range(sc.frame_start, sc.frame_end + 1, step):
            sc.frame_set(f)
            ev = self.body.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3) @ np.array(mw.to_3x3()).T + np.array(mw.translation)
            mins.append(round(float(co[:, 2].min()) * 100, 1))
            ev.to_mesh_clear()
        return mins
