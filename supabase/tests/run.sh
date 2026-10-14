#!/usr/bin/env bash
# DB 보안 테스트 — supabase/*.sql 을 빈 Postgres 에 실행 순서대로 적용한 뒤 tests/*.test.sql 로 공격·권한을 검증
#
# 사용: npm run test:db
#   - PGHOST 가 설정돼 있으면 그 서버를 사용 (CI 의 Postgres 서비스)
#   - 없으면 임시 로컬 Postgres 를 띄웠다가 끝나면 지움 (initdb·pg_ctl·psql 필요, 예: brew install postgresql@16)
#
# 두 가지 설치 상태를 모두 검증:
#   처음 설치 — 모든 SQL 을 한 번씩
#   재실행    — 재실행 안전 SQL 을 한 번 더 (운영 DB 에 같은 파일을 다시 실행해도 정책이 깨지지 않는지)
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_DIR="$(dirname "$TESTS_DIR")"
export LC_ALL=C LANG=C

# Supabase SQL Editor 실행 순서 (docs/SUPABASE_SETUP.md) — 새 SQL 파일을 만들면 여기에도 추가
MIGRATIONS=(
  schema storage avatars
  profiles-update groups-update profiles-security-fix admin security-and-fixes notifications
  v0.5-groups-and-fixes v0.6-security v0.7-workout-verify-and-consent v0.8-cheers-and-push
)
FIRST_RERUNNABLE=3 # schema·storage·avatars 는 최초 1회용 (재실행 시 정책 중복 오류)

# ── Postgres 준비 ──
if [ -z "${PGHOST:-}" ]; then
  for bin in initdb pg_ctl psql; do
    command -v "$bin" >/dev/null || { echo "❌ $bin 이 없어요. PostgreSQL 을 설치하거나 PGHOST 를 지정해 주세요."; exit 1; }
  done
  TMP="$(mktemp -d)"
  export PGHOST=127.0.0.1 PGPORT=$((55000 + RANDOM % 1000)) PGUSER=postgres
  initdb -D "$TMP/data" -U postgres -A trust --locale=C -E UTF8 >/dev/null
  pg_ctl -D "$TMP/data" -l "$TMP/log" -w \
    -o "-p $PGPORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
  trap 'pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1; rm -rf "$TMP"' EXIT
fi
export PGUSER="${PGUSER:-postgres}"

psql_q() { PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 "$@"; }

# 실패 시 해당 출력에서 원인만 보여 주고 종료 ('psql:경로:41: ERROR:  FAIL: …' → '41행: …')
fail() {
  echo "❌ $1"
  grep -E "ERROR|FATAL" "$2" | head -5 | sed -E 's/^psql:[^:]*:([0-9]+): (ERROR|FATAL): +(FAIL: )?/   \1행: /'
  exit 1
}

TOTAL=0
run_suite() { # $1 = 데이터베이스 이름, $2 = 재실행 여부
  local db="$1" rerun="$2" log
  log="$(mktemp)"
  psql_q -d postgres -c "drop database if exists $db" -c "create database $db" >/dev/null

  # Supabase 환경 + SQL 파일 (각 파일은 SQL Editor 처럼 한 트랜잭션)
  local files=("$TESTS_DIR/stub.sql")
  for m in "${MIGRATIONS[@]}"; do files+=("$SQL_DIR/$m.sql"); done
  if [ "$rerun" = 1 ]; then
    for m in "${MIGRATIONS[@]:$FIRST_RERUNNABLE}"; do files+=("$SQL_DIR/$m.sql"); done
  fi
  files+=("$TESTS_DIR/helpers.sql" "$TESTS_DIR/fixtures.sql")
  for f in "${files[@]}"; do
    psql_q -d "$db" -1 -f "$f" >"$log" 2>&1 \
      || fail "적용 실패: ${f#"$SQL_DIR"/}" "$log"
  done

  # 테스트 (각 파일은 끝에서 rollback → 서로 영향 없음)
  local n
  for t in "$TESTS_DIR"/*.test.sql; do
    PGOPTIONS='-c client_min_messages=notice' psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$t" >"$log" 2>&1 \
      || fail "$(basename "$t")" "$log"
    n=$(grep -c "ok - " "$log" || true)
    TOTAL=$((TOTAL + n))
    printf '  ✓ %-28s %3d\n' "$(basename "$t")" "$n"
  done
  psql_q -d postgres -c "drop database $db" >/dev/null
  rm -f "$log"
}

echo "▶ 처음 설치"
run_suite absolid_test_fresh 0
echo "▶ 재실행 (재실행 안전 SQL 을 한 번 더 적용)"
run_suite absolid_test_rerun 1
echo "✅ DB 보안 테스트 통과 — 검사 $((TOTAL / 2))개 × 설치 상태 2가지"
