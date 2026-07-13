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

function fmtBytes(n) {
  if (!n) return "0 MB";
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export default function Admin({ onBack }) {
  return (
    <main className="page">
      <h2>관리자</h2>
      <p className="sub">서비스 현황을 확인하고 회원·그룹·신고를 관리해요.</p>

      <StatsSection />
      <ReportsSection />
      <UsersSection />
      <GroupsSection />
      <AnnouncementsSection />
      <ProgramSection />

      <button className="cta secondary" style={{ marginTop: 20 }} onClick={onBack}>
        ← 설정으로 돌아가기
      </button>
    </main>
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
      <section className="card">
        <p className="sub" style={{ color: "var(--red)" }}>{error}</p>
      </section>
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
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>대시보드</div>
      {stats ? (
        <div className="stat-grid">
          {items.map(([label, value]) => (
            <div className="stat" key={label}>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="sub" style={{ marginTop: 6 }}>불러오는 중…</p>
      )}
    </section>
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
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>신고 처리</div>
      {!loaded ? (
        <p className="sub" style={{ marginTop: 6 }}>불러오는 중…</p>
      ) : reports.length === 0 ? (
        <p className="sub" style={{ marginTop: 6 }}>미처리 신고가 없어요. 👍</p>
      ) : (
        reports.map((r) => (
          <div className="admin-row" key={r.id}>
            {r.photoUrl ? (
              <img className="report-thumb" src={r.photoUrl} alt="신고된 인증샷" />
            ) : (
              <div className="report-thumb empty">삭제됨</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="admin-row-title">
                {r.targetName} <span className="sub">({r.target_date})</span>
              </div>
              <div className="sub" style={{ fontSize: 12 }}>
                신고자: {r.reporterName}
                {r.reason && <> · 사유: {r.reason}</>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="mini-btn danger" onClick={() => handle(r, "remove")}>
                  사진 삭제
                </button>
                <button className="mini-btn" onClick={() => handle(r, "dismiss")}>
                  기각
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </section>
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
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>회원 관리</div>
      <input
        className="input"
        style={{ marginTop: 12 }}
        placeholder="닉네임·이름·전화번호 검색"
        value={query}
        onChange={(e) => { setQuery(e.target.value); load(e.target.value); }}
      />
      {!loaded ? (
        <p className="sub" style={{ marginTop: 6 }}>불러오는 중…</p>
      ) : users.length === 0 ? (
        <p className="sub" style={{ marginTop: 10 }}>결과가 없어요.</p>
      ) : (
        users.map((u) => (
          <div className="admin-row" key={u.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="admin-row-title">
                {u.nickname || "닉네임 없음"}
                {u.role === "admin" && <span className="pill">관리자</span>}
                {!u.is_active && <span className="pill danger">비활성</span>}
              </div>
              <div className="sub" style={{ fontSize: 12 }}>
                {u.full_name || "이름 미등록"}
                {u.phone && <> · {u.phone}</>}
              </div>
            </div>
            {u.role !== "admin" && (
              <button
                className={"mini-btn" + (u.is_active ? " danger" : "")}
                onClick={() => toggleActive(u)}
              >
                {u.is_active ? "비활성" : "활성화"}
              </button>
            )}
          </div>
        ))
      )}
    </section>
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
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>그룹 관리</div>
      {!loaded ? (
        <p className="sub" style={{ marginTop: 6 }}>불러오는 중…</p>
      ) : groups.length === 0 ? (
        <p className="sub" style={{ marginTop: 6 }}>그룹이 없어요.</p>
      ) : (
        groups.map((g) => (
          <div className="admin-row" key={g.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="admin-row-title">{g.name}</div>
              <div className="sub" style={{ fontSize: 12 }}>
                {g.invite_code} · {g.memberCount}/{g.max_members}명
                {g.memberCount === 0 && <span className="pill danger">빈 그룹</span>}
              </div>
            </div>
            <button className="mini-btn danger" onClick={() => remove(g)}>해산</button>
          </div>
        ))
      )}
    </section>
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
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>공지</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="홈 배너에 띄울 공지 내용"
          maxLength={100}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="mini-btn" onClick={add} disabled={busy || !message.trim()}>
          등록
        </button>
      </div>
      {list.map((a) => (
        <div className="admin-row" key={a.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="admin-row-title" style={{ opacity: a.active ? 1 : 0.5 }}>
              {a.message}
            </div>
            <div className="sub" style={{ fontSize: 12 }}>
              {a.active ? "게시 중" : "숨김"}
            </div>
          </div>
          <button className="mini-btn" onClick={() => toggle(a)}>
            {a.active ? "숨기기" : "게시"}
          </button>
          <button className="mini-btn danger" onClick={() => remove(a)}>삭제</button>
        </div>
      ))}
    </section>
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
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>운동 프로그램</div>
      <p className="sub" style={{ marginTop: 6 }}>
        YouTube 플레이리스트 ID (Day 1~30 순서의 30개 영상)
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="mini-btn" onClick={save} disabled={busy || !value.trim()}>
          저장
        </button>
      </div>
    </section>
  );
}
