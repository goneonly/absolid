# Absolid  — Abs + Solid 💪

초대 코드로 그룹을 만들어 날짜에 맞춰 복근 운동을 함께 하고 기록하는 모바일 웹앱.

## 개발 진행 상황
- [x] Day 1: 앱 뼈대 — 홈(streak), 운동 페이지(날짜별 영상 + 종료 감지), 완료 모달(사진 첨부), 하단바, 디자인 시스템
- [x] Day 2: Supabase 연동 코드 (회원가입/로그인 UI, 기록 동기화, DB 스키마) — 프로젝트 키 연결만 남음 (SUPABASE_SETUP.md)
- [x] Day 3–4: 그룹 만들기/초대 코드 참여, 멤버 운동현황 색상 표시(오늘 + 최근 7일)
- [x] Day 5: 사진 업로드 서버 저장 (Supabase Storage — supabase/storage.sql 실행 필요)
- [x] Day 6: 설정 고도화, 기록 CSV 내보내기(구글시트 호환) — 구글 로그인은 옵션이라 보류
- [x] Day 7: 검증 + Vercel 배포 (https://absolid.vercel.app)
- [x] Day 8: 미운동 리마인더 — 홈 배너(저녁 6시 이후) + 브라우저 푸시(매일 KST 20시, NOTIFICATIONS_SETUP.md)
- [x] v0.4: 보안·버그 패치(권한상승 차단·관리자 조회 복구·인증샷 비공개 signed URL·원자적 그룹참여), 비밀번호 재설정, 회원 탈퇴, 주간 리포트, CI(GitHub Actions) — `supabase/security-and-fixes.sql` 실행 필요

## 실행 방법 (개발자용)
```bash
npm install
npm run dev      # 개발 서버
npm run build    # 배포용 빌드
```

## 구조
- `src/supabase.js` — Supabase 클라이언트 (.env 키 없으면 로컬 모드)
- `src/auth.js`, `src/useAuth.js` — 회원가입/로그인/세션
- `src/api.js` — 운동 기록 서버 동기화
- `supabase/schema.sql` — DB 테이블 + 보안 정책(RLS)
- `src/App.jsx` — 화면 전환(홈/운동/그룹/설정)
- `src/pages/` — Home(streak), Workout(영상+완료감지), Group, Settings
- `src/components/` — BottomNav(그룹|시작|설정), CompleteModal(사진 첨부)
- `src/storage.js` — 기록/streak 계산 (현재 localStorage, Day 2에 Supabase로 확장)
- `src/youtube.js` — YouTube IFrame API 로더, 플레이리스트 ID
- `src/push.js`, `public/sw.js` — 브라우저 푸시 구독/수신 (Day 8)
- `supabase/functions/send-reminders/` — 미운동 회원 푸시 발송 Edge Function (Day 8)

## 핵심 규칙
- 오늘의 영상 = 이번 달 "일(day)" 번째 영상, 31일은 Day 30
- 영상이 끝나야(다음 영상으로 넘어가거나 ENDED) 운동 완료 처리


Personal Project w/ Full Vibe Coding
