// 관리자 모드 API — 모든 쓰기 권한은 서버 RLS(is_admin)로 검증됨
import { supabase } from "./supabase.js";
import { PLAYLIST_ID } from "./youtube.js";

// ── 역할 조회 (일반 사용자도 사용) ─────────────
export async function fetchMyRole() {
  if (!supabase) return { role: "user", isActive: true };
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) return { role: "user", isActive: true };
  const { data } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return {
    role: data?.role || "user",
    isActive: data?.is_active !== false,
  };
}

// ── 대시보드 ─────────────────────────────────
export async function fetchStats() {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw new Error("통계를 불러오지 못했어요. admin.sql 실행 여부를 확인해 주세요.");
  return data;
}

// ── 회원 관리 ────────────────────────────────
export async function fetchUsers(query = "") {
  let q = supabase
    .from("profiles")
    .select("id, nickname, full_name, phone, role, is_active, avatar_url, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (query.trim()) {
    const s = query.trim().replace(/[%,]/g, "");
    q = q.or(`nickname.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error("회원 목록을 불러오지 못했어요.");
  return data || [];
}

export async function setUserActive(id, active) {
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", id);
  if (error) throw new Error("변경에 실패했어요.");
}

// ── 그룹 관리 ────────────────────────────────
export async function fetchGroupsAdmin() {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, invite_code, max_members, created_at, group_members(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("그룹 목록을 불러오지 못했어요.");
  return (data || []).map((g) => ({
    ...g,
    memberCount: g.group_members?.[0]?.count ?? 0,
  }));
}

export async function deleteGroupAdmin(id) {
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) throw new Error("그룹 해산에 실패했어요.");
}

// ── 신고 ────────────────────────────────────
// 일반 사용자: 그룹에서 다른 멤버의 인증샷 신고
export async function submitReport(targetUserId, targetDate, reason) {
  const { data: s } = await supabase.auth.getSession();
  const reporter_id = s.session?.user?.id;
  if (!reporter_id) throw new Error("로그인이 필요해요.");
  const { error } = await supabase.from("reports").insert({
    reporter_id,
    target_user_id: targetUserId,
    target_date: targetDate,
    reason: (reason || "").slice(0, 200),
  });
  if (error) throw new Error("신고 접수에 실패했어요.");
}

// 관리자: 미처리 신고 목록 (신고 대상 사진·닉네임 포함)
export async function fetchReports() {
  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, reporter_id, target_user_id, target_date, reason, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("신고 목록을 불러오지 못했어요.");
  if (!reports?.length) return [];
  const ids = [...new Set(reports.flatMap((r) => [r.reporter_id, r.target_user_id]))];
  const [{ data: profs }, { data: works }] = await Promise.all([
    supabase.from("profiles").select("id, nickname").in("id", ids),
    supabase
      .from("workouts")
      .select("user_id, date, photo_url")
      .in("user_id", reports.map((r) => r.target_user_id))
      .in("date", reports.map((r) => r.target_date)),
  ]);
  const names = Object.fromEntries((profs || []).map((p) => [p.id, p.nickname]));
  const photoOf = {};
  for (const w of works || []) photoOf[`${w.user_id}|${w.date}`] = w.photo_url;
  return reports.map((r) => ({
    ...r,
    reporterName: names[r.reporter_id] || "이름 없음",
    targetName: names[r.target_user_id] || "이름 없음",
    photoUrl: photoOf[`${r.target_user_id}|${r.target_date}`] || null,
  }));
}

// 관리자: 신고 처리 — action: 'remove'(사진 삭제) | 'dismiss'(기각)
export async function resolveReport(report, action) {
  if (action === "remove") {
    await supabase.storage
      .from("photos")
      .remove([`${report.target_user_id}/${report.target_date}.jpg`]);
    await supabase
      .from("workouts")
      .update({ photo_url: null })
      .eq("user_id", report.target_user_id)
      .eq("date", report.target_date);
  }
  const { error } = await supabase
    .from("reports")
    .update({ status: action === "remove" ? "resolved" : "dismissed" })
    .eq("id", report.id);
  if (error) throw new Error("신고 처리에 실패했어요.");
}

// ── 공지 ────────────────────────────────────
// 일반 사용자: 홈 배너용 활성 공지 1건
export async function fetchActiveAnnouncement() {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("announcements")
      .select("id, message")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

export async function fetchAnnouncementsAdmin() {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, message, active, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error("공지 목록을 불러오지 못했어요.");
  return data || [];
}

export async function createAnnouncement(message) {
  const { error } = await supabase
    .from("announcements")
    .insert({ message: message.trim() });
  if (error) throw new Error("공지 등록에 실패했어요.");
}

export async function setAnnouncementActive(id, active) {
  const { error } = await supabase
    .from("announcements")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error("변경에 실패했어요.");
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error("삭제에 실패했어요.");
}

// ── 앱 설정 (운동 플레이리스트) ────────────────
export async function getPlaylistId() {
  if (!supabase) return PLAYLIST_ID;
  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "playlist_id")
      .maybeSingle();
    return data?.value || PLAYLIST_ID;
  } catch {
    return PLAYLIST_ID;
  }
}

export async function setPlaylistId(value) {
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "playlist_id", value: value.trim() });
  if (error) throw new Error("플레이리스트 변경에 실패했어요.");
}
