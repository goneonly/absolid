# 근육 디테일 강화: 메시에 이미 조형된 근육 굴곡(복근 마디·흉근·삼각근 경계 등)만 골라 증폭
#
#  1) 위치를 라플라시안 평활 → 원본과의 차이를 법선 방향 스칼라 d 로 (볼록 +, 오목 -)
#  2) d 를 다시 넓게 평활한 값을 빼서 팔다리 굵기 같은 큰 곡률은 제거 (= 근육 크기의 굴곡만 남김)
#  3) 머리·손·발은 가중치 마스크로 제외하고, 남은 굴곡을 법선 방향으로 AMOUNT 배 더함
#  결과 굴곡값은 'relief' 색 속성으로도 저장해 셰이더에서 근육 사이 홈을 살짝 어둡게 쓰는 데 활용
import numpy as np

EXCLUDE = ("head", "neck_02", "hand_", "thumb", "index", "middle", "ring", "pinky", "foot_", "ball_", "toe")


def _neighbors(me):
    n = len(me.vertices)
    e = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    a = np.r_[e[:, 0], e[:, 1]]; b = np.r_[e[:, 1], e[:, 0]]
    deg = np.bincount(a, minlength=n).astype(np.float64)
    return a, b, deg


def _smooth(x, a, b, deg, iters, lam=0.5):
    x = x.copy()
    for _ in range(iters):
        if x.ndim == 1:
            avg = np.bincount(a, weights=x[b], minlength=len(x)) / deg
        else:
            avg = np.stack([np.bincount(a, weights=x[b, k], minlength=len(x)) for k in range(x.shape[1])], 1) / deg[:, None]
        x += lam * (avg - x)
    return x


def enhance(obj, amount=1.2, small=24, large=160, denoise=2, damp=None):
    """damp: 정점별 감쇠(0~1, 1이면 강화 없음) — 반바지 안쪽처럼 천이 덮는 부위용"""
    me = obj.data
    n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    nor = np.empty(n * 3); me.vertices.foreach_get("normal", nor); nor = nor.reshape(-1, 3)
    a, b, deg = _neighbors(me)

    d = np.einsum('ij,ij->i', co - _smooth(co, a, b, deg, small), nor)
    d_hp = d - _smooth(d, a, b, deg, large)
    d_hp = _smooth(d_hp, a, b, deg, denoise)

    # 마스크: 제외 부위 뼈 가중치 합을 빼고 부드럽게
    excl = np.zeros(n)
    gidx = [g.index for g in obj.vertex_groups if any(k in g.name.split(":")[-1] for k in EXCLUDE)]
    gset = set(gidx)
    for v in me.vertices:
        for g in v.groups:
            if g.group in gset:
                excl[v.index] += g.weight
    mask = _smooth(np.clip(1 - excl, 0, 1), a, b, deg, 12)
    if damp is not None:
        mask *= 1 - _smooth(np.asarray(damp, dtype=np.float64), a, b, deg, 6)

    co += (amount * mask * d_hp)[:, None] * nor
    me.vertices.foreach_set("co", co.ravel())
    me.update()

    # 셰이더용 굴곡 속성 (-1 홈 ~ +1 볼록)
    rel = np.clip(d_hp / (np.percentile(np.abs(d_hp[mask > 0.5]), 98) + 1e-9), -1, 1) * mask
    attr = me.color_attributes.get("relief") or me.color_attributes.new("relief", 'FLOAT_COLOR', 'POINT')
    col = np.zeros((n, 4)); col[:, 0] = rel * 0.5 + 0.5; col[:, 1] = mask; col[:, 3] = 1
    attr.data.foreach_set("color", col.ravel())
    return d_hp, mask
