# 레그레이즈: 누워서 다리를 편 채 바닥 위 15cm 정도에서 수직까지 올렸다가 천천히 내림
# pose(t): t=0~1 한 회(루프) 진행도 → 해부학 각도(도). 각도 의미는 procedural.py 참고.
CONTACT = "supine"
CAM_DIR = (-0.93, -0.20, 0.34)  # 거의 옆에서, 살짝 발 쪽·위에서: 다리 각도와 복부가 함께 보이게

BOTTOM, TOP = 12.0, 88.0  # 고관절 굴곡(도): 발이 바닥에 닿지 않는 높이 ~ 수직


def _ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)  # smootherstep: 시작·끝 속도 0


def pose(t):
    # 아래 잠깐 멈춤 → 올리기(0.9초) → 위에서 멈춤 → 천천히 내리기(1.1초) → 아래 멈춤 (2.5초 기준)
    if t < 0.05:   k = 0.0
    elif t < 0.41: k = _ease((t - 0.05) / 0.36)
    elif t < 0.51: k = 1.0
    elif t < 0.95: k = 1.0 - _ease((t - 0.51) / 0.44)
    else:          k = 0.0
    return {
        "body": "supine",
        "hip_flex": BOTTOM + (TOP - BOTTOM) * k,
        "leg_abd": 1.0,             # 두 다리를 거의 붙임
        "knee": 3 + 4 * k,          # 완전히 잠그지 않은 무릎
        "ankle": 20,                # 발끝을 살짝 뻗음
        # 골반·허리 각도는 접지 계산(procedural.solve_supine)이 등 아랫부분이 바닥에 붙도록 정함
        "thoracic": -6,            # 누우면 등 윗부분이 바닥에 펴짐
        "neck": 0,
        "head": 0,
        "arm_abd": 14,              # 팔은 몸 옆에, 손바닥은 바닥
        "shoulder_ext": 6,
        "elbow": 4,
        "palm_down": 1.0,
        "finger_straight": 0.7,     # 손가락을 거의 펴서 손바닥을 바닥에
    }
