# Absolid — Abs + Solid 💪

친구들과 그룹을 만들어 매일 복근 운동을 함께 하고 기록하는 모바일 웹앱(PWA)

**🔗 https://absolid.vercel.app**

## 주요 기능

- **매일 운동** — 날짜에 맞는 Day 1~30 영상을 끝까지 보면 자동 완료, 인증샷 첨부
- **기록** — 연속 streak, 주간 리포트, CSV 내보내기
- **그룹** — 초대 코드로 여러 그룹 참여, 멤버 현황·리더보드·오늘의 인증샷, 그룹 사진
- **알림** — 저녁에 운동 안 했으면 홈 배너 + 브라우저 푸시
- **비회원 모드** — 로그인 없이 기기에 기록 (로그인하면 서버로 동기화)
- **관리자** — 대시보드, 회원·그룹·신고·공지 관리

## 기술 스택

React 18 · Vite 5 · Tailwind CSS 4 · Supabase (Auth · Postgres · Storage · Edge Functions) · Vercel

## 시작하기

```bash
npm install
cp .env.example .env   # Supabase 키 입력 (없으면 비회원 모드로만 동작)
npm run dev
```

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 배포용 빌드 |
| `npm run lint` | ESLint 검사 (CI에서 빌드와 함께 실행) |

서버 설정은 문서를 참고하세요.

- [Supabase 설정](docs/SUPABASE_SETUP.md) — DB·스토리지·SQL 실행 순서·Edge Function 배포
- [푸시 알림 설정](docs/NOTIFICATIONS_SETUP.md) — VAPID 키·리마인더 발송

## 프로젝트 구조

```
src/
├── pages/          # 화면: Login, Home, Workout, Group, Settings, Admin
├── components/     # ui.jsx(공통 UI), 모달, 리더보드, 주간 리포트
├── api.js          # 서버 통신 (기록·그룹·사진)
├── auth.js         # 회원가입·로그인·탈퇴
├── admin.js        # 관리자 기능
├── storage.js      # 기기 저장소(localStorage) — 키는 이 파일에서만 관리
├── storagePaths.js # Storage 버킷·파일 경로 규칙
└── index.css       # 디자인 토큰 (색상·폰트 크기·라운드)
supabase/
├── *.sql           # DB 스키마·보안 정책 (실행 순서는 Supabase 설정 문서)
└── functions/      # delete-account(회원 탈퇴), send-reminders(푸시 발송)
```

## 핵심 규칙

- 오늘의 영상은 이번 달 날짜와 같은 Day (31일은 Day 30)
- 영상이 끝나야(다음 영상으로 넘어가거나 종료) 운동 완료로 기록
- 스타일은 `index.css`에 정의된 토큰만 사용 (임의 색상·크기 금지)

---

Personal Project w/ Full Vibe Coding
