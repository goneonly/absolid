# 운동 리마인더 알림 설정 가이드 (약 15분)

> **📌 현재 상태 (2026-07-16): 여기서 중단하기로 결정**
> - ✅ 완료: 프론트 코드(토글·동의 모달·sw.js), VAPID 키 생성(`.env`), DB 테이블(`notifications.sql` 실행됨)
> - ⏸️ 안 함: Vercel 환경 변수 등록, Edge Function 배포(4단계), 크론(5단계)
> - 결과: **배포 사이트에서는 푸시 UI가 아예 보이지 않음** (`VITE_VAPID_PUBLIC_KEY`가 없으면 자동으로 숨겨지도록 설계됨). 앱 내 저녁 리마인더 배너는 계속 동작.
> - 나중에 재개하려면: 아래 4~5단계 + Vercel 환경 변수 등록만 하면 됨. **재개 전까지 Vercel에 `VITE_VAPID_PUBLIC_KEY`를 등록하지 말 것** — 등록하면 알림을 켤 수 있는데 실제 발송은 안 되는 반쪽 상태가 됨.

오늘 운동 기록이 없는 회원에게 알림을 보내는 기능이에요. 두 가지가 있습니다.

1. **앱 내 배너** — 저녁 6시 이후 홈 화면에 리마인더 배너 표시. **추가 설정 없이 바로 동작**해요.
2. **브라우저 푸시** — 앱을 닫아도 매일 저녁 8시(KST)에 알림 도착. 아래 설정이 필요해요.

---

## 브라우저 푸시 설정

### 1~2. VAPID 키 (✅ 완료됨)
VAPID 키는 이미 생성되어 `.env`에 들어 있어요:
- `VITE_VAPID_PUBLIC_KEY` — 클라이언트 구독용 공개키
- `VAPID_PRIVATE_KEY` — 발송용 비공개키 (VITE_ 접두사가 없어 번들에 포함되지 않음)

`.env`를 바꾼 뒤에는 **dev 서버를 재시작**해야 반영돼요.
Vercel 배포 시 `VITE_VAPID_PUBLIC_KEY`를 환경 변수에 등록하세요 (비공개키는 Vercel에 올릴 필요 없음).

### 3. DB 테이블 만들기
Supabase **SQL Editor → New query**에 `supabase/notifications.sql` 내용을 붙여넣고 **Run**.
(푸시 구독 저장 테이블 + 보안 정책)

### 4. Edge Function 배포
[Supabase CLI](https://supabase.com/docs/guides/cli) 설치 후:
```bash
supabase login
supabase link --project-ref <PROJECT_REF>   # Project Settings > General 에서 확인
supabase secrets set VAPID_PUBLIC_KEY=<.env의 VITE_VAPID_PUBLIC_KEY 값> VAPID_PRIVATE_KEY=<.env의 VAPID_PRIVATE_KEY 값> VAPID_SUBJECT=mailto:본인이메일
supabase functions deploy send-reminders
```

### 5. 매일 자동 실행 (크론)
1. Dashboard **Database → Extensions**에서 `pg_cron`, `pg_net` 활성화
2. `supabase/notifications.sql` 하단의 주석 처리된 `cron.schedule(...)` 부분에
   `<PROJECT_REF>`와 `<SERVICE_ROLE_KEY>`(Project Settings → API Keys)를 채워
   SQL Editor에서 실행
3. 기본 스케줄은 `0 11 * * *` (UTC 11:00 = **KST 저녁 8시**). 시간을 바꾸려면 이 값을 수정

### 6. 확인
1. `npm run dev` → **설정 탭 → 운동 리마인더 → 알림 켜기 🔔** (로그인 필요)
2. 수동 발송 테스트:
   ```bash
   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
   ```
   응답 예: `{"date":"2026-07-15","targets":3,"sent":3,"cleaned":0}`
   (오늘 운동을 아직 안 했다면 본인에게 알림이 와야 해요)

## 동작 방식
- 회원이 설정에서 알림을 켜면 이 브라우저의 푸시 구독이 `push_subscriptions` 테이블에 저장돼요 (기기별 1개).
- 매일 KST 20:00에 Edge Function이 **오늘 운동 기록이 없는 구독자**에게만 Web Push를 보내요.
- 만료·취소된 구독은 발송 시 자동 정리됩니다.

## 참고
- 푸시는 HTTPS(또는 localhost)에서만 동작해요 — Vercel 배포 환경은 OK.
- iOS Safari는 **홈 화면에 추가(PWA)한 경우에만** 푸시를 지원해요 (iOS 16.4+).
- 사용자가 브라우저에서 알림 권한을 거부하면 브라우저 설정에서 직접 다시 허용해야 해요.
