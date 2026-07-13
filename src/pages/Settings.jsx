import { useEffect, useRef, useState } from "react";
import {
  getProfile,
  saveProfile,
  clearRecords,
  getRecords,
  todayKey,
} from "../storage.js";
import { supabase } from "../supabase.js";
import { signUp, signIn, signOut, saveNickname } from "../auth.js";
import { uploadAvatar, deleteAvatar } from "../api.js";
import { toast } from "../toast.js";
import {
  validateEmail,
  validateName,
  validatePhone,
  formatPhone,
  validatePassword,
  validateNickname,
} from "../validation.js";

// 프로필 사진을 512px 이하 JPEG dataURL로 압축
function compressImage(file, max = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Settings({ session, onChanged, isAdmin, onOpenAdmin }) {
  const [nickname, setNickname] = useState(getProfile().nickname);
  const [nickError, setNickError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    const err = validateNickname(nickname);
    setNickError(err);
    if (err) return;
    saveProfile({ ...getProfile(), nickname: nickname.trim() });
    if (session) await saveNickname(nickname.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChanged();
  }

  // 기록을 CSV로 내려받기 — 구글시트에서 파일 > 가져오기로 바로 열 수 있어요 (Day 6)
  function exportCSV() {
    const records = getRecords();
    const rows = [["날짜", "Day", "완료 시각", "사진"]];
    for (const k of Object.keys(records).sort()) {
      const r = records[k];
      if (r.completed)
        rows.push([k, r.day || "", r.completedAt || "", r.photoUrl || ""]);
    }
    const csv = "﻿" + rows.map((r) => r.join(",")).join("\r\n"); // BOM: 엑셀/시트 한글 깨짐 방지
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `absolid-records-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    if (confirm("이 기기의 운동 기록을 삭제할까요? 되돌릴 수 없어요.")) {
      clearRecords();
      onChanged();
    }
  }

  return (
    <main className="page">
      <h2>설정</h2>
      <p className="sub">
        {session
          ? `${session.user.email} 계정으로 이용 중이에요.`
          : "지금은 비회원(기기 저장) 모드예요."}
      </p>

      <section className="card">
        <ProfilePhoto
          nickname={nickname}
          session={session}
          onChanged={onChanged}
        />
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 18 }}>
          내 프로필
        </div>
        <div className="field">
          <label htmlFor="nick">닉네임</label>
          <input
            id="nick"
            value={nickname}
            placeholder="그룹에 표시될 이름"
            maxLength={12}
            onChange={(e) => {
              setNickname(e.target.value);
              setNickError("");
            }}
          />
          {nickError && <p className="field-error">{nickError}</p>}
        </div>
        <button
          className="cta secondary"
          style={{ marginTop: 14 }}
          onClick={save}
        >
          {saved ? "저장됐어요 ✓" : "저장"}
        </button>
      </section>

      <AccountCard session={session} nickname={nickname} />

      <section className="card">
        <button className="row-btn" onClick={exportCSV}>
          기록 내보내기 (CSV){" "}
          <span className="hint">구글시트에서 열기 가능</span>
        </button>
        <button className="row-btn danger" onClick={reset}>
          운동 기록 초기화 (이 기기)
        </button>
      </section>

      {isAdmin && (
        <section className="card">
          <button className="row-btn" onClick={onOpenAdmin}>
            관리자 페이지 <span className="hint">회원·그룹·신고 관리</span>
          </button>
        </section>
      )}

      <p className="sub" style={{ marginTop: 16, textAlign: "center" }}>
        Absolid v{__APP_VERSION__}
      </p>
      <div className="footer-links">
        <a
          href="https://www.linkedin.com/in/jiwon-han-380b29274/"
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn
        </a>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/goneonly/absolid"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}

// ── LinkedIn 스타일 프로필 사진 ─────────────────
// 회원 전용: 사진 없음 → 탭하면 바로 업로드 / 사진 있음 → 탭하면 교체·삭제 모달
// 비회원: 기본 아이콘 고정 (업로드/수정/삭제 불가)
function ProfilePhoto({ nickname, session, onChanged }) {
  const fileRef = useRef(null);
  const [avatar, setAvatar] = useState(getProfile().avatar || "");
  const [showSheet, setShowSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  // 새 기기에서 로그인한 경우: 서버에 저장된 프로필 사진 불러오기
  useEffect(() => {
    if (!session || !supabase || getProfile().avatar) return;
    let alive = true;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.avatar_url) setAvatar(data.avatar_url);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  // 비회원은 기본 사진으로 고정
  if (!session) {
    return (
      <div className="profile-hero">
        <div className="avatar" aria-label="기본 프로필 사진">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.2 0-8 2.2-8 5.4V21h16v-1.6c0-3.2-3.8-5.4-8-5.4Z" />
          </svg>
        </div>
        <div className="profile-name">
          {nickname?.trim() || "닉네임을 설정해 주세요"}
        </div>
        <div className="profile-email">
          프로필 사진은 로그인 후 설정할 수 있어요
        </div>
      </div>
    );
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하의 사진만 업로드할 수 있어요.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      saveProfile({ ...getProfile(), avatar: dataUrl });
      setAvatar(dataUrl);
      if (session) {
        // 로그인 시 서버에도 저장 — 실패하면 안내 (사진은 이 기기에는 남음)
        const url = await uploadAvatar(dataUrl);
        if (!url)
          toast("서버 업로드에 실패했어요. 사진은 이 기기에서만 보여요.");
      }
      onChanged();
    } catch {
      alert("사진을 불러오지 못했어요. 다른 사진으로 시도해 주세요.");
    }
    setBusy(false);
    setShowSheet(false);
  }

  async function removePhoto() {
    setBusy(true);
    const p = getProfile();
    delete p.avatar;
    saveProfile(p);
    setAvatar("");
    if (session) await deleteAvatar();
    setBusy(false);
    setShowSheet(false);
    onChanged();
  }

  return (
    <div className="profile-hero">
      <button
        className="avatar"
        aria-label={avatar ? "프로필 사진 관리" : "프로필 사진 업로드"}
        disabled={busy}
        onClick={() => (avatar ? setShowSheet(true) : fileRef.current?.click())}
      >
        {avatar ? (
          <img src={avatar} alt="프로필 사진" />
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.2 0-8 2.2-8 5.4V21h16v-1.6c0-3.2-3.8-5.4-8-5.4Z" />
          </svg>
        )}
        <span className="avatar-badge" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      </button>
      <div className="profile-name">
        {nickname?.trim() || "닉네임을 설정해 주세요"}
      </div>
      {session && <div className="profile-email">{session.user.email}</div>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />

      {showSheet && (
        <div className="modal-backdrop" onClick={() => setShowSheet(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>프로필 사진</h3>
            <button
              className="cta secondary"
              style={{ marginTop: 18 }}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              사진 교체
            </button>
            <button
              className="cta secondary"
              style={{ marginTop: 10, color: "var(--red)" }}
              disabled={busy}
              onClick={removePhoto}
            >
              사진 삭제
            </button>
            <button
              className="cta secondary"
              style={{ marginTop: 10 }}
              onClick={() => setShowSheet(false)}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountCard({ session, nickname }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  if (!supabase) {
    return (
      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>계정</div>
        <p className="sub" style={{ marginTop: 6 }}>
          서버(Supabase) 연결 대기 중이에요. 프로젝트 키를 연결하면
          로그인·회원가입이 열립니다. 연결 방법은 SUPABASE_SETUP.md 문서를
          참고해 주세요.
        </p>
      </section>
    );
  }

  if (session) {
    return (
      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>계정</div>
        <p className="sub" style={{ marginTop: 6 }}>
          {session.user.email}
        </p>
        <p className="sub" style={{ marginTop: 4 }}>
          기록이 계정에 안전하게 저장돼요. 어느 기기서든 이어갈 수 있어요.
        </p>
        <button
          className="cta secondary"
          style={{ marginTop: 14 }}
          onClick={() => signOut()}
        >
          로그아웃
        </button>
      </section>
    );
  }

  // 필드별 엄격 검증 — 통과 못 하면 제출 자체를 막음
  function validateAll() {
    const errs = {};
    if (mode === "signup") {
      errs.fullName = validateName(fullName);
      errs.phone = validatePhone(phone);
      errs.password = validatePassword(password);
      errs.agreed = agreed ? "" : "개인정보 수집·이용에 동의해 주세요.";
    } else {
      errs.password = !password ? "비밀번호를 입력해 주세요." : "";
    }
    errs.email = validateEmail(email);
    setFieldErrors(errs);
    return !Object.values(errs).some(Boolean);
  }

  function clearFieldError(key) {
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!validateAll()) return;
    setBusy(true);
    // 온보딩 플래그는 가입 요청 "전"에 저장해야 함 —
    // 가입 성공 시 세션 발급(App의 팝업 체크)이 응답보다 먼저 일어나기 때문
    if (mode === "signup") {
      localStorage.setItem("absolid.onboarding.v1", "pending");
    }
    const fn =
      mode === "signup"
        ? () =>
            signUp(
              email.trim(),
              password,
              nickname,
              fullName.trim(),
              formatPhone(phone),
            )
        : () => signIn(email.trim(), password);
    const res = await fn();
    setBusy(false);
    if (res?.error) {
      if (mode === "signup") {
        localStorage.removeItem("absolid.onboarding.v1"); // 가입 실패 시 롤백
      }
      setError(res.error);
      return;
    }
    if (mode === "signup" && !res?.data?.session) {
      setNotice(
        "가입 확인 메일을 보냈어요. 메일함에서 인증 후 로그인해 주세요.",
      );
    }
  }

  return (
    <section className="card">
      <div style={{ fontWeight: 700, fontSize: 15 }}>
        {mode === "signup" ? "회원가입" : "로그인"}
      </div>
      <p className="sub" style={{ marginTop: 6 }}>
        회원이 되면 기록이 계정에 저장되고, 그룹 만들기·사진 업로드를 쓸 수
        있어요.
      </p>
      <form onSubmit={submit} noValidate>
        {mode === "signup" && (
          <>
            <div className="field">
              <label htmlFor="name">이름</label>
              <input
                id="name"
                required
                value={fullName}
                maxLength={20}
                placeholder="홍길동"
                autoComplete="name"
                aria-invalid={!!fieldErrors.fullName}
                onBlur={() =>
                  setFieldErrors((p) => ({
                    ...p,
                    fullName: fullName ? validateName(fullName) : "",
                  }))
                }
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearFieldError("fullName");
                }}
              />
              {fieldErrors.fullName && 