# Supabase 연결 가이드 (약 10분, 무료)

로그인·그룹·서버 저장 기능을 켜려면 Supabase 무료 프로젝트가 필요해요.
아래 순서대로 따라 하면 됩니다.

## 1. 계정 및 프로젝트 만들기
1. https://supabase.com 접속 → **Start your project** → GitHub 또는 이메일로 가입
2. **New project** 클릭
   - Name: `absolid`
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

## 2-2. 회원정보 보안 패치 (필수)
**SQL Editor → New query**에 `supabase/profiles-security-fix.sql` 내용을 붙여넣고 **Run**.
(기존 정책이 실명·전화번호·그룹 초대코드를 anon key만으로 전체 조회 가능하게 열어뒀던
문제를 막습니다 — 이미 배포된 프로젝트라면 반드시 적용하세요)

## 2-3. 보안·버그 통합 패치 (v0.4, 필수)
`admin.sql` 실행 후, **SQL Editor → New query**에 `supabase/security-and-fixes.sql` 내용을 붙여넣고 **Run**. 다음을 한 번에 적용합니다.
- **권한 상승 차단**: 일반 사용자가 스스로 `role='admin'`으로 바꾸던 문제를 트리거로 차단 (기존 `auto-admin.sql` 대체 — 이제 이 파일은 실행할 필요 없음)
- **관리자 회원 조회 복구**: 관리자 화면의 회원 목록·신고자 이름이 보이도록 profiles 조회 정책 추가
- **그룹 참여 원자화**: 정원 초과 경합 방지 + 한 사람은 한 그룹만
- **회원 탈퇴**: 본인 프로필 삭제 정책

> ⚠️ **인증샷 비공개 전환 순서**: 이 파일에는 `photos` 버킷을 비공개로 바꾸는 문장이 포함돼 있어요. **v0.4 프론트엔드를 먼저 배포한 뒤** 실행하세요(프론트가 signed URL로 사진을 불러오도록 바뀌었기 때문). 순서가 바뀌면 잠깐 사진이 안 보일 수 있어요. 과거 사진도 자동 호환됩니다.

## 2-3-1. 여러 그룹 참여·그룹 사진·점검 패치 (v0.5, 필수)
`security-and-fixes.sql` 실행 후, **SQL Editor → New query**에 `supabase/v0.5-groups-and-fixes.sql` 내용을 붙여넣고 **Run**. (재실행 안전)
- **여러 그룹 참여**: 한 사람이 여러 그룹에 참여할 수 있어요. 그룹 생성·참여·나가기는 서버 함수(`create_group`/`join_group`/`leave_group`)로만 처리
- **그룹장 위임**: 그룹장이 나가거나 탈퇴하면 가장 먼저 참여한 멤버에게 자동 위임, 마지막 멤버가 나가면 그룹 삭제
- **그룹 사진**: `group-photos` 버킷 + 그룹장만 변경
- **보안**: 정원·회원제한을 건너뛴 직접 가입 차단, 인증샷은 본인·같은 그룹 멤버·관리자만 열람
- **버그**: SQL Editor에서 관리자 지정이 되돌려지던 문제, 관리자 통계의 '오늘'이 UTC 기준이던 문제

> 이 SQL을 실행한 뒤 아래 2-4의 `delete-account` 엣지 함수를 **다시 배포**해야 탈퇴 시 그룹장 위임이 적용돼요.

## 2-4. 회원 탈퇴 기능 (선택 — 엣지 함수)
계정·데이터 완전 삭제를 켜려면 Supabase CLI로 배포하세요:
```bash
supabase functions deploy delete-account
```
(미배포 시 설정의 "회원 탈퇴" 버튼은 실패 안내만 표시됩니다.)

## 2-5. 비밀번호 재설정 메일 (설정 확인)
**Authentication → URL Configuration**의 **Site URL**에 배포 주소(예: `https://absolid.vercel.app`)를 넣어야 재설정 링크가 앱으로 돌아옵니다. (로컬 테스트는 `http://localhost:5173`)

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
