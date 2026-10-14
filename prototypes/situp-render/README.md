# situp-render — 3D 운동 영상 렌더 파이프라인 (Blender)

MetaHuman 바디 FBX(남/여) + 동작 → 근육 디테일을 살린 2.5초 루프 영상(mp4).

동작 소스는 두 가지:
- **Mixamo FBX 리타게팅** (`retarget.py`) — 싯업
- **관절 각도로 직접 정의** (`procedural.py` + `exercises/*.py`) — 레그레이즈. Mixamo 에 없는 동작용

| 파일 | 하는 일 |
| --- | --- |
| `rig.py` | 공용: FK, 접지 판정용 스키닝, 다리 IK, 트위스트 뼈 분배, 키프레임 기록 |
| `retarget.py` | Mixamo(T-포즈) → MetaHuman(A-포즈). 척추 3→5 분배, 엉덩이·발 접지(다리 IK) |
| `procedural.py` | `exercises/<이름>.py` 의 `pose(t)` 각도 → 키프레임. 누운 운동은 등·엉덩이·뒤통수·손바닥 접지를 자동으로 풂 |
| `exercises/legraise.py` | 레그레이즈 동작 정의 (각도·타이밍·카메라 방향) |
| `build_scene.py` | 근육 강화(`muscle.py`), 의상(반바지 / 여성은 스포츠 브라 추가), 매트, 조명, 자동 프레이밍 카메라, Cycles 설정 |
| `render.py` | Apple GPU(Metal)로 프레임 렌더 |
| `encode.py` | PNG 프레임 → H.264 mp4 (Blender 내장 FFmpeg) |
| `tools/montage.py` | 미리보기 시트(여러 프레임을 격자로) |

## 실행

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender   # brew install --cask blender
M=~/Downloads/source/Rigged_M_med_nrw_combined.fbx   # 남성 / 여성 FBX 경로
W=$PWD/work; mkdir -p $W/frames   # work/ 는 git 제외 (/tmp 는 재부팅 때 지워짐)

# 1) 동작 — 둘 중 하나
$B -b --factory-startup --python retarget.py   -- $M ~/Downloads/Situps.fbx $W/anim.blend 2.5 60
$B -b --factory-startup --python procedural.py -- $M legraise              $W/anim.blend 2.5 60

# 2) 장면 (preview: 50%·64샘플 / outfit=female: 스포츠 브라 / muscle=근육 강화 배율)
$B -b $W/anim.blend --python build_scene.py -- $W/scene.blend $W/frames/ outfit=male

# 3) 렌더 → 4) 인코딩
$B -b $W/scene.blend --python render.py -- all          # 또는 1,30,60 처럼 일부 프레임 + 해상도% 
$B -b --factory-startup --python encode.py -- $W/frames out/legraise-male.mp4 60 1920
```

- 렌더는 중단 후 다시 실행하면 이미 그린 프레임을 건너뛴다. 남/여를 한 스크립트로 이어서 돌려두면 밤새 렌더하기 편하다.
- 여성은 `outfit=female muscle=2.0` (어깨끈 스포츠 브라 + 반바지). 의상 경계는 rest 좌표로 셰이더에서 픽셀 단위 계산이라 메시 해상도와 무관하게 매끈하다.
- 파일 이름 규칙: `out/<운동>-<male|female>[-720p].mp4` — 앱 설정에서 모델을 고르면 같은 운동의 해당 파일을 쓰면 된다.
- M1 Pro 기준 1080p·128샘플 프레임당 약 25초 (150프레임 ≈ 1시간). 모션블러는 켜면 빠른 프레임이 5~6배 느려져서 끄고 60fps 로 대신함.

## 새 운동 추가 (`exercises/<이름>.py`)

`CONTACT`(현재 `"supine"` 누운 운동만), `CAM_DIR`(카메라 방향), `pose(t)` (t=0~1 한 회 → 각도 dict) 를 정의한다. 각도는 서 있는 rest 포즈 기준 도(°):
`hip_flex`, `leg_abd`, `knee`, `ankle`, `pelvic_tilt`, `lumbar`, `thoracic`, `neck`, `head`, `arm_abd`, `shoulder_ext`, `elbow`, `wrist_ext`, `palm_down`, `finger_straight` (좌우 다르게: `hip_flex_l` 처럼 접미사).
누운 운동은 요추·목·어깨·손목 각도를 접지에 맞게 자동 보정하므로 대략적인 값만 주면 된다.

## 근육 강화 원리 (`muscle.py`)

메시에 이미 조형된 굴곡을 밴드패스로 골라 법선 방향으로 증폭한다. 큰 곡률(팔다리 굵기)은 빼고 근육 크기의 굴곡만 남기므로 체형은 유지되고 복근 마디·흉근·삼각근 경계만 또렷해진다. 머리·손·발은 제외, 의상 안쪽은 약하게. 같은 값을 `relief` 색 속성으로 저장해 셰이더에서 근육 사이 홈을 살짝 어둡게 쓴다. 기본 2.4배 (3 이상은 옆구리가 울퉁불퉁해짐).

## 에셋 · 라이선스

- 남성: [Male Base Mesh - Rigged metahuman UE5](https://sketchfab.com/3d-models/male-base-mesh-rigged-metahuman-ue5-aa64da462bfe40dfa24d48a668bd64e0)
- 여성: [Metahuman_female_rigged](https://sketchfab.com/3d-models/metahuman-female-rigged-be92d09cb91b421babf7cb7f4dc26af1)
- 둘 다 PolytricityLtd, **CC BY 4.0** → 앱에 출처 표기 필요. Mixamo 애니메이션은 원본 파일 재배포 불가.

FBX·.blend·프레임 PNG 는 저장소에 올리지 않는다.
