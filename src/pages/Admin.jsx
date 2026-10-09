import { useEffect, useState, useCallback } from "react";
import {
  fetchStats,
  fetchUsers,
  setUserActive,
  fetchGroupsAdmin,
  deleteGroupAdmin,
  fetchReports,
  resolveReport,
  fetchAnnouncementsAdmin,
  createAnnouncement,
  setAnnouncementActive,
  deleteAnnouncement,
  getPlaylistId,
  setPlaylistId,
} from "../admin.js";
import { toast } from "../toast.js";
import { Button, Card, CardTitle, Input, MiniButton, Page, PageTitle, Pill, Sub, cx } from "../components/ui.jsx";

const ADMIN_ROW = "flex items-center gap-2.5 border-b border-line py-3 last:border-b-0";
const ROW_TITLE = "truncate text-base font-semibold";
const THUMB = "size-14 flex-none rounded-md border border-line bg-surface-2 object-cover";

function fmtBytes(n) {
  if (!n) return "0 MB";
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export default function Admin({ onBack }) {
  return (
    <Page>
      <PageTitle>관리자</PageTitle>
      <Sub>서비스 현황을 확인하고 회원·그룹·신고를 관리해요.</Sub>

      <StatsSection />
      <ReportsSection />
      <UsersSection />
      <GroupsSection />
      <AnnouncementsSection />
      <ProgramSection />

      <Button variant="secondary" className="mt-5" onClick={onBack}>
        ← 설정으로 돌아가기
      </Button>
    </Page>
  );
}

// ── 대시보드 ─────────────────────────────────
function StatsSection() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <Card>
        <Sub className="text-brand">{error}</Sub>
      </Card>
    );

  const items = stats
    ? [
        ["전체 회원", stats.total_users],
        ["신규 가입 (7일)", stats.new_users_7d],
        ["오늘 운동", stats.active_today],
        ["활동 회원 (7일)", stats.active_7d],
        ["누적 운동 기록", stats.total_workouts],
        ["그룹 수", stats.total_groups],
        ["미처리 신고", stats.pending_reports],
        ["인증샷 용량", fmtBytes(stats.photos_bytes)],
      ]
    : [];

  return (
    <Card>
      <CardTitle>대시보드</CardTitle>
      {stats ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          {items.map(([label, value]) => (
            <div className="rounded-md border border-line bg-surface-2 p-3 text-center" key={label}>
              <div className="text-xl font-extrabold">{value}</div>
              <div className="mt-1 text-2xs text-dim">{label}</div>
            </div>
          ))}
        </div>
      ) : (
        <Sub className="mt-1.5">불러오는 중…</Sub>
      )}
    </Card>
  );
}

// ── 신고 처리 ────────────────────────────────
function ReportsSection() {
  const [reports, setReports] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetchReports()
      .then(setReports)
      .catch((e) => toast(e.message))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handle(report, action) {
    const msg = action === "remove" ? "이 사진을 삭제할까요?" : "신고를 기각할까요?";
    if (!confirm(msg)) return;
    try {
      await resolveReport(report, action);
      toast(action === "remove" ? "사진을 삭제했어요." : "신고를 기각했어요.");
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <Card>
      <CardTitle>신고 처리</CardTitle>
      {!loaded ? (
        <Sub className="mt-1.5">불러오는 중…</Sub>
      ) : reports.length === 0 ? (
        <Sub className="mt-1.5">미처리 신고가 없어요. 👍</Sub>
      ) : (
        reports.map((r) => (
          <div className={ADMIN_ROW} key={r.id}>
            {r.photoUrl ? (
              <img className={THUMB} src={r.photoUrl} alt="신고된 인증샷" />
            ) : (
              <div className={cx(THUMB, "flex items-center justify-center text-2xs text-dim")}>삭제됨</div>
            )}
            <div className="min-w-0 flex-1">
              <div className={ROW_TITLE}>
                {r.targetName} <span className="text-base text-dim">({r.target_date})</span>
              </div>
              <div className="text-xs text-dim">
                신고자: {r.reporterName}
                {r.reason && <> · 사유: {r.reason}</>}
              </div>
              <div className="mt-2 flex gap-2">
                <MiniButton danger onClick={() => handle(r, "remove")}>
                  사진 삭제
                </MiniButton>
                <MiniButton onClick={() => handle(r, "dismiss")}>
                  기각
                </MiniButton>
              </div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

// ── 회원 관리 ────────────────────────────────
function UsersSection() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback((q = "") => {
    fetchUsers(q)
      .then(setUsers)
      .catch((e) => toast(e.message))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(u) {
    const msg = u.is_active
      ? `${u.nickname || "이 회원"}을(를) 비활성 처리할까요? 로그인이 차단돼요.`
      : `${u.nickname || "이 회원"}의 비활성을 해제할까요?`;
    if (!confirm(msg)) return;
    try {
      await setUserActive(u.id, !u.is_active);
      toast(u.is_active ? "비활성 처리했어요." : "활성화했어요.");
      load(query);
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <Card>
      <CardTitle>회원 관리</CardTitle>
      <Input
        className="mt-3"
        placeholder="닉네임·이름·전화번호 검색"
        value={query}
        onChange={(e) => { setQuery(e.target.value); load(e.target.value); }}
      />
      {!loaded ? (
        <Sub className="mt-1.5">불러오는 중…</Sub>
      ) : users.length === 0 ? (
        <Sub className="mt-2.5">결과가 없어요.</Sub>
      ) : (
        users.map((u) => (
          <div className={ADMIN_ROW} key={u.id}>
            <div className="min-w-0 flex-1">
              <div className={ROW_TITLE}>
                {u.nickname || "닉네임 없음"}
                {u.role === "admin" && <Pill>관리자</Pill>}
                {!u.is_active && <Pill danger>비활성</Pill>}
              </div>
              <div className="text-xs text-dim">
                {u.full_name || "이름 미등록"}
                {u.phone && <> · {u.phone}</>}
              </div>
            </div>
            {u.role !== "admin" && (
              <MiniButton
                danger={u.is_active}
                onClick={() => toggleActive(u)}
              >
                {u.is_active ? "비활성" : "활성화"}
              </MiniButton>
            )}
          </div>
        ))
      )}
    </Card>
  );
}

// ── 그룹 관리 ────────────────────────────────
function GroupsSection() {
  const [groups, setGroups] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetchGroupsAdmin()
      .then(setGroups)
      .catch((e) => toast(e.message))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(g) {
    if (!confirm(`'${g.name}' 그룹을 해산할까요? 멤버들의 운동 기록은 유지돼요.`)) return;
    try {
      await deleteGroupAdmin(g.id);
      toast("그룹을 해산했어요.");
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <Card>
      <CardTitle>그룹 관리</CardTitle>
      {!loaded ? (
        <Sub className="mt-1.5">불러오는 중…</Sub>
      ) : groups.length === 0 ? (
        <Sub className="mt-1.5">그룹이 없어요.</Sub>
      ) : (
        groups.map((g) => (
          <div className={ADMIN_ROW} key={g.id}>
            <div className="min-w-0 flex-1">
              <div className={ROW_TITLE}>{g.name}</div>
              <div className="text-xs text-dim">
                {g.invite_code} · {g.memberCount}/{g.max_members}명
                {g.memberCount === 0 && <Pill danger>빈 그룹</Pill>}
              </div>
            </div>
            <MiniButton danger onClick={() => remove(g)}>해산</MiniButton>
          </div>
        ))
      )}
    </Card>
  );
}

// ── 공지 ────────────────────────────────────
function AnnouncementsSection() {
  const [list, setList] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchAnnouncementsAdmin().then(setList).catch((e) => toast(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await createAnnouncement(message);
      setMessage("");
      toast("공지를 등록했어요. 홈 상단에 표시돼요.");
      load();
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }

  async function toggle(a) {
    try {
      await setAnnouncementActive(a.id, !a.active);
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  async function remove(a) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    try {
      await deleteAnnouncement(a.id);
      load();
    } catch (e) {
      toast(e.message);
    }
  }

  return (
    <Card>
      <CardTitle>공지</CardTitle>
      <div className="mt-3 flex gap-2">
        <Input
          className="flex-1"
          placeholder="홈 배너에 띄울 공지 내용"
          maxLength={100}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <MiniButton onClick={add} disabled={busy || !message.trim()}>
          등록
        </MiniButton>
      </div>
      {list.map((a) => (
        <div className={ADMIN_ROW} key={a.id}>
          <div className="min-w-0 flex-1">
            <div className={cx(ROW_TITLE, !a.active && "opacity-50")}>
              {a.message}
            </div>
            <div className="text-xs text-dim">
              {a.active ? "게시 중" : "숨김"}
            </div>
          </div>
          <MiniButton onClick={() => toggle(a)}>
            {a.active ? "숨기기" : "게시"}
          </MiniButton>
          <MiniButton danger onClick={() => remove(a)}>삭제</MiniButton>
        </div>
      ))}
    </Card>
  );
}

// ── 운동 프로그램 ─────────────────────────────
function ProgramSection() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPlaylistId().then(setValue);
  }, []);

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await setPlaylistId(value);
      toast("플레이리스트를 변경했어요. 다음 운동부터 적용돼요.");
    } catch (e) {
      toast(e.message);
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardTitle>운동 프로그램</CardTitle>
      <Sub className="mt-1.5">
        YouTube 플레이리스트 ID (Day 1~30 순서의 30개 영상)
      </Sub>
      <div className="mt-2.5 flex gap-2">
        <Input
          className="flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <MiniButton onClick={save} disabled={busy || !value.trim()}>
          저장
        </MiniButton>
      </div>
    </Card>
  );
}
