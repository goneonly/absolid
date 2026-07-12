# Supabase 연결 가이드 (약 10분, 무료)

로그인·그룹·서버 저장 기능을 켜려면 Supabase 무료 프로젝트가 필요해요.
아래 순서대로 따라 하면 됩니다.

## 1. 계정 및 프로젝트 만들기
1. https://supabase.com 접속 → **Start your project** → GitHub 또는 이메일로 가입
2. **New project** 클릭
   - Name: `absday`
   - Database Password: 아무 강한 비밀번호 (메모해 두세요)
   - Region: `Northeast Asia (Seoul)` 선택
3. 1~2분 뒤 프로젝트가 준비됩니다.

## 2. DB 테이블 만들기
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 폴더의 `supabase/schema.sql` 파일 내용을 전부 복사해 붙여넣기
3. **Run** 클릭 → "Success" 확인

## 2-1. 사진 저장소 만들기 (Day 5)
같은 방법으로 **SQL Editor → New query**에 `supabase/storage.sql` 내용을 붙여넣고 **Run**.
(인증샷 업로드용 공개 버킷과 보안 규칙이 만들어져요)

## 3. 이메일 인증 끄기 (데모용, 선택)
회원가입 시 메일 인증 없이 바로 로그인되게 하려면:
1. **Authentication → Sign In / Providers → Email**
2. **Confirm email** 스위치 끄기 → Save

## 4. 앱에 키 연결하기
1. **Project Settings(톱니) → API Keys** 에서 두 값을 복사
   - Project URL (예: `https://abcd1234.supabase.co`)
   - `anon` `public` 키 (긴 문자열)
2. 이 폴더의 `.env.example`을 복사해 `.env` 파일을 만들고 값 붙여넣기:
   ```
   VITE_SUPABASE_URL=복사한 Project URL
   VITE_SUPABASE_ANON_KEY=복사한 anon 키
   ```

## 5. 확인
`npm run dev`로 앱을 켜면 설정 탭에 로그인/회원가입이 활성화되어 있어야 해요.
(Vercel 배포 시에는 같은 두 값을 Vercel 환경 변수에도 등록합니다 — Day 7에 함께 진행)
