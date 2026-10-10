# 알림 설정 가이드 (운동 리마인더 · 응원 알림)

알림은 세 가지예요.

| 알림 | 언제 | 보내는 곳 |
|---|---|---|
| 홈 배너 | 저녁 6시 이후 앱을 열었는데 오늘 운동 전 | 앱 (설정 불필요) |
| 미운동 리마인더 푸시 | 매일 저녁 8시(KST), 오늘 운동 기록이 없는 사람 | `send-reminders` 함수 + 크론 |
| 응원 푸시 | 그룹 멤버가 👏/💪 응원을 보냈을 때 | `notify-cheer` 함수 |

푸시는 **로그인한 회원이 설정에서 알림을 켰을 때만** 가요. 아이폰은 iOS 16.4 이상에서 **홈 화면에 추가한 앱**으로 열어야 알림을 켤 수 있어요.

## 설정 순서 (처음 한 번, 약 15분)

모든 명령은 프로젝트 폴더의 터미널에서 실행해요. (`npx supabase login` 은 한 번 해 두었으면 생략)

### 1. DB 준비
SQL Editor 에서 `supabase/v0.8-cheers-and-push.sql` 실행 (응원 테이블·푸시 등록 함수).

### 2. 알림 키(VAPID) 만들기
```bash
npx web-push generate-vapid-keys
```
`Public Key` 와 `Private Key` 가 나와요. **Private Key 는 아래 3번 시크릿에만 넣고, 코드·채팅·깃에 올리지 마세요.**

### 3. 서버 시크릿 등록
`CRON_SECRET` 은 아무 긴 무작위 문자열이면 돼요. (예: `openssl rand -hex 32` 결과)
```bash
npx supabase secrets set --project-ref pqxtzuomckmroqjjkjdq VAPID_PUBLIC_KEY=공개키 VAPID_PRIVATE_KEY=개인키 VAPID_SUBJECT=mailto:내이메일 CRON_SECRET=무작위문자열
```

### 4. 함수 배포
```bash
npx supabase functions deploy send-reminders --project-ref pqxtzuomckmroqjjkjdq --no-verify-jwt
```
```bash
npx supabase functions deploy notify-cheer --project-ref pqxtzuomckmroqjjkjdq
```
(`send-reminders` 는 크론이 부르므로 로그인 토큰 검사를 끄고, 함수 안에서 `CRON_SECRET` 으로 확인해요.)

### 5. 매일 저녁 자동 발송(크론) 등록
1. Dashboard → **Database → Extensions** 에서 `pg_cron`, `pg_net` 켜기
2. SQL Editor 에서 `supabase/notifications-cron.sql` 의 `<CRON_SECRET>` 을 3번 값으로 바꿔 실행

### 6. 앱에 공개키 연결
Vercel → Project → Settings → **Environment Variables** 에 `VITE_VAPID_PUBLIC_KEY` = 2번의 Public Key 추가 → **Redeploy**.
이 값이 있어야 설정 화면에 "알림 (리마인더·응원)" 항목이 나타나요.

## 확인
- 앱 설정에서 알림 켜기 → 다른 계정으로 같은 그룹에서 응원 보내기 → 알림 도착
- 리마인더 수동 실행 (크론 기다리지 않고):
  ```bash
  curl -X POST https://pqxtzuomckmroqjjkjdq.supabase.co/functions/v1/send-reminders -H "x-cron-secret: 무작위문자열"
  ```
  `{"date":..., "targets":N, "sent":N, ...}` 가 나오면 성공
- 크론 실행 기록: SQL Editor 에서 `select * from cron.job_run_details order by start_time desc limit 5;`

## 문제 해결
- 설정에 알림 항목이 안 보임 → 6번(Vercel 환경 변수 + 재배포) 확인, 아이폰은 홈 화면 앱으로 열었는지 확인
- 알림 켜기에서 "알림 등록에 실패" → 1번 SQL 실행 여부 확인
- 알림이 안 옴 → 3·4번 확인, 브라우저/OS 알림 권한 확인
