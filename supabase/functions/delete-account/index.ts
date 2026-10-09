// 회원 탈퇴 — Supabase Edge Function
// 로그인한 본인이 호출하면 계정과 모든 데이터를 삭제합니다.
// 배포: supabase functions deploy delete-account
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 자동 주입)
//
// 동작:
//   1) 호출자의 JWT 로 본인 user_id 확인 (남의 계정 삭제 불가)
//   2) service_role 로:
//      - 속한 그룹에서 빠지며 그룹장 위임 (남은 멤버가 없는 그룹만 삭제 + 그룹 사진 정리)
//      - Storage 의 본인 인증샷/프로필 사진 삭제
//      - auth.users 삭제 → profiles/workouts/group_members/push_subscriptions/reports 자동 cascade
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1) 호출자 인증 — Authorization 헤더의 JWT 로 본인만 확인
  const authHeader = req.headers.get('Authorization') || ''
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: uErr } = await asUser.auth.getUser()
  if (uErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const uid = user.id

  // 2) service_role 로 정리
  const admin = createClient(url, serviceKey)
  try {
    // 그룹장 위임 — 예전처럼 그룹을 지우면 남은 멤버들까지 그룹을 잃음 (v0.5-groups-and-fixes.sql)
    const { data: deletedGroups, error: hErr } = await admin.rpc('handoff_user_groups', { p_uid: uid })
    if (hErr) throw hErr
    // setof uuid 응답은 문자열 배열 (객체 형태로 와도 처리)
    const emptied = ((deletedGroups || []) as Array<string | Record<string, string>>)
      .map((r) => (typeof r === 'string' ? r : r.handoff_user_groups))
      .filter(Boolean)
      .map((gid) => `${gid}/photo.jpg`)
    if (emptied.length) await admin.storage.from('group-photos').remove(emptied)

    // Storage 사진 삭제 (photos + avatars)
    for (const bucket of ['photos', 'avatars']) {
      const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 })
      if (files?.length) {
        await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`))
      }
    }

    // 계정 삭제 → 나머지 테이블 cascade
    const { error: dErr } = await admin.auth.admin.deleteUser(uid)
    if (dErr) throw dErr
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
