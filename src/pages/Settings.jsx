import { useEffect, useRef, useState } from "react";
import {
  getProfile,
  saveProfile,
  clearRecords,
  getRecords,
  todayKey,
} from "../storage.js";
import { supabase } from "../supabase.js";
import { signIn, signOut, saveNickname, deleteAccount, updatePassword } from "../auth.js";
import {
  uploadAvatar, deleteAvatar, fetchMyAvatarUrl, resetServerWorkouts,
  fetchMyProfileInfo, updateMyProfileInfo,
} from "../api.js";
import { isPushSupported, getPushEnabled, enablePush, disablePush } from "../push.js";
import { toast } from "../toast.js";
import { compressImage } from "../image.js";
import { isStandalone, isIOS, canPromptInstall, promptInstall } from "../install.js";
import PrivacyModal from "../components/PrivacyModal.jsx";
import { INVALID_CREDENTIALS } from "../authErrors.js";
import {
  Banner,
  Button,
  cx,
  Card,
  CardTitle,
  Field,
  LinkButton,
  Modal,
  ModalText,
  ModalTitle,
  Page,
  PageTitle,
  PersonIcon,
  RowButton,
  Sub,
} from "../components/ui.jsx";
import {
  validateNickname, validateName, validatePhone, formatPhone, validatePassword,
} from "../validation.js";

export default function Settings({ session, onChanged, isAdmin, onOpenAdmin, onRequestLogin }) {
  const [nickname, setNickname] = useState(getProfile().nickname);
  const [showNickname, setShowNickname] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [askExport, setAskExport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPwChange, setShowPwChange] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  // 홈 화면에 앱 추가: 설치 창을 띄울 수 있으면 바로, 아니면(아이폰 등) 방법 안내
  async function installApp() {
    if (canPromptInstall()) {
      if (await promptInstall()) toast("홈 화면에 Absolid를 추가했어요.");
    } else {
      setShowInstall(true);
    }
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
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 바로 해제하면 iOS Safari 에서 다운로드가 취소될 수 있어 잠시 뒤 해제
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ── 운동 기록 초기화: 회원은 비밀번호 확인 후 → 기존 확인 알림 순서 ──
  const [askResetPw, setAskResetPw] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [resetPwError, setResetPwError] = useState("");
  const [resetPwBusy, setResetPwBusy] = useState(false);

  async function confirmReset() {
    const msg = session
      ? "모든 운동 기록을 삭제할까요? 서버에 저장된 기록과 인증샷도 함께 삭제되며 되돌릴 수 없어요."
      : "이 기기의 운동 기록을 삭제할까요? 되돌릴 수 없어요.";
    if (!confirm(msg)) return;
    clearRecords();
    if (session) {
      const ok = await resetServerWorkouts();
      if (!ok) {
        toast("서버 기록 삭제에 실패했어요. supabase/reset-delete-policies.sql 실행 여부를 확인해 주세요.");
        onChanged();
        return;
      }
    }
    toast("운동 기록을 모두 삭제했어요.");
    onChanged();
  }

  function reset() {
    if (session) {
      // 회원: 본인 확인(비밀번호) 먼저
      setResetPw("");
      setResetPwError("");
      setAskResetPw(true);
    } else {
      // 비회원은 비밀번호가 없으므로 기존 확인만
      confirmReset();
    }
  }

  async function verifyResetPw() {
    if (!resetPw) {
      setResetPwError("비밀번호를 입력해 주세요.");
      return;
    }
    setResetPwBusy(true);
    const { error } = await signIn(session.user.email, resetPw);
    setResetPwBusy(false);
    if (error) {
      setResetPwError(error);
      return;
    }
    setAskResetPw(false);
    // 모달이 닫힌 뒤 기존 확인 알림 표시
    setTimeout(confirmReset, 100);
  }

  return (
    <Page>
      <PageTitle>설정</PageTitle>
      <Sub>
        {session
          ? `${session.user.email} 계정으로 이용 중이에요.`
          : "비회원 모드예요 (기기 저장)"}
      </Sub>
      {!session && <GuestNotice />}

      <Card>
        <ProfilePhoto
          nickname={nickname}
          session={session}
          onChanged={onChanged}
        />
        <CardTitle className="mt-4.5 mb-1.5">내 프로필</CardTitle>
        <RowButton hint={nickname?.trim() || "설정 안 됨"} onClick={() => setShowNickname(true)}>
          닉네임 변경
        </RowButton>
        {session && (
          <RowButton hint="그룹 멤버에게는 비공개" onClick={() => setShowInfo(true)}>
            이름·전화번호 변경
          </RowButton>
        )}
        {session && (
          <RowButton hint="현재 비밀번호 확인 후 변경" onClick={() => setShowPwChange(true)}>
            비밀번호 변경
          </RowButton>
        )}
        {/* 비회원: 첫 화면(로그인)으로 이동 — 회원가입도 거기서 */}
        {!session && supabase && (
          <Button className="mt-3.5" onClick={onRequestLogin}>
            로그인하기
          </Button>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <RowButton hint="회원·그룹·신고 관리" onClick={onOpenAdmin}>
            관리자 페이지
          </RowButton>
        </Card>
      )}

      <Card>
        <CardTitle className="mb-1.5">기타</CardTitle>
        {!isStandalone() && (
          <RowButton hint={isIOS() ? "아이폰 알림 받으려면 필요" : "앱처럼 바로 실행"} onClick={installApp}>
            홈 화면에 앱 추가
          </RowButton>
        )}
        <PushToggleRow session={session} />
        <RowButton hint="구글시트에서 열기 가능" onClick={() => setAskExport(true)}>
          기록 내보내기 (CSV)
        </RowButton>
        <RowButton danger hint={session ? "서버 포함 전체 삭제" : "이 기기"} onClick={reset}>
          운동 기록 초기화
        </RowButton>
        {session && (
          <RowButton danger hint="계정·데이터 영구 삭제" onClick={() => setShowDelete(true)}>
            회원 탈퇴
          </RowButton>
        )}
      </Card>

      {session && (
        <LinkButton className="mx-auto mt-4 block px-2 py-1 text-sm underline" onClick={() => signOut()}>
          로그아웃
        </LinkButton>
      )}

      <Sub className="mt-4 text-center">Absolid v{__APP_VERSION__}</Sub>
      <div className="mt-2 flex items-center justify-center gap-2.5 text-xs text-dim [&>a]:hover:text-fg [&>a]:hover:underline">
        <a
          href="https://www.linkedin.com/in/jiwon-han-380b29274/"
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn
        </a>
        <span aria-hidden="true">·</span>
        <button className="hover:text-fg hover:underline" onClick={() => setShowPrivacy(true)}>
          개인정보 처리방침
        </button>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/goneonly/absolid"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>

      {showPrivacy && <PrivacyModal title="개인정보 처리방침" onClose={() => setShowPrivacy(false)} />}
      {showInstall && <InstallGuideModal onClose={() => setShowInstall(false)} />}
      {showNickname && (
        <NicknameModal
          session={session}
          initial={nickname}
          onSaved={(v) => {
            setNickname(v);
            onChanged();
          }}
          onClose={() => setShowNickname(false)}
        />
      )}
      {showInfo && session && <ProfileInfoModal onClose={() => setShowInfo(false)} />}
      {showPwChange && session && (
        <ChangePasswordModal email={session.user.email} onClose={() => setShowPwChange(false)} />
      )}

      {showDelete && session && (
        <DeleteAccountModal
          email={session.user.email}
          onClose={() => setShowDelete(false)}
        />
      )}

      {askExport && (
        <Modal label="기록 내보내기" onBackdrop={() => setAskExport(false)}>
          <ModalTitle>기록 내보내기 📄</ModalTitle>
          <ModalText>CSV를 다운로드 받겠습니까?</ModalText>
          <Button
            className="mt-4.5"
            onClick={() => {
              setAskExport(false);
              exportCSV();
            }}
          >
            네
          </Button>
          <Button variant="secondary" className="mt-2.5" onClick={() => setAskExport(false)}>
            아니오
          </Button>
        </Modal>
      )}

      {askResetPw && (
        <Modal label="비밀번호 확인">
          <ModalTitle>비밀번호 확인 🔒</ModalTitle>
          <ModalText>
            운동 기록 초기화는 되돌릴 수 없어요. 본인 확인을 위해 비밀번호를
            입력해 주세요.
          </ModalText>
          <Field
            id="reset-pw"
            label="비밀번호"
            className="mt-3"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={resetPw}
            error={resetPwError}
            onChange={(e) => {
              setResetPw(e.target.value);
              setResetPwError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") verifyResetPw();
            }}
          />
          <Button className="mt-3.5" disabled={resetPwBusy} onClick={verifyResetPw}>
            {resetPwBusy ? "확인 중…" : "확인"}
          </Button>
          <Button
            variant="secondary"
            className="mt-2.5"
            disabled={resetPwBusy}
            onClick={() => setAskResetPw(false)}
          >
            취소
          </Button>
        </Modal>
      )}
    </Page>
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
    if (!session || getProfile().avatar) return;
    let alive = true;
    fetchMyAvatarUrl().then((url) => {
      if (alive && url) setAvatar(url);
    });
    return () => {
      alive = false;
    };
  }, [session]);

  // 비회원은 기본 사진으로 고정
  if (!session) {
    return (
      <div className="flex flex-col items-center pt-1.5">
        <div className="relative flex size-24 items-center justify-center rounded-full border-2 border-line bg-surface-2 p-0 text-dot" aria-label="기본 프로필 사진">
          <PersonIcon className="size-12" />
        </div>
        <ProfileName nickname={nickname} />
        <div className="mt-1 text-xs text-dim">
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
      const dataUrl = await compressImage(file, { max: 512, quality: 0.85 });
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
    <div className="flex flex-col items-center pt-1.5">
      <button
        className="relative flex size-24 items-center justify-center rounded-full border-2 border-line bg-surface-2 p-0 text-dot disabled:opacity-60"
        aria-label={avatar ? "프로필 사진 관리" : "프로필 사진 업로드"}
        disabled={busy}
        onClick={() => (avatar ? setShowSheet(true) : fileRef.current?.click())}
      >
        {avatar ? (
          <img className="block size-full rounded-full object-cover" src={avatar} alt="프로필 사진" />
        ) : (
          <PersonIcon className="size-12" />
        )}
        <span
          className="absolute -right-0.5 -bottom-0.5 flex size-7.5 items-center justify-center rounded-full border-3 border-surface bg-brand text-white"
          aria-hidden="true"
        >
          <svg
            className="size-3.5"
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
      <ProfileName nickname={nickname} />
      {session && <div className="mt-1 text-xs text-dim">{session.user.email}</div>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />

      {showSheet && (
        <Modal label="프로필 사진" onBackdrop={() => setShowSheet(false)}>
          <ModalTitle>프로필 사진</ModalTitle>
          <Button
            variant="secondary"
            className="mt-4.5"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            사진 교체
          </Button>
          <Button variant="danger" className="mt-2.5" disabled={busy} onClick={removePhoto}>
            사진 삭제
          </Button>
          <Button variant="secondary" className="mt-2.5" onClick={() => setShowSheet(false)}>
            취소
          </Button>
        </Modal>
      )}
    </div>
  );
}

function ProfileName({ nickname }) {
  return (
    <div className="mt-3 text-lg font-bold">
      {nickname?.trim() || "닉네임을 설정해 주세요"}
    </div>
  );
}

// ── 운동 리마인더 푸시 알림 on/off (기타 카드 내 row) ──
// 오늘 운동 기록이 없으면 매일 저녁 브라우저 푸시로 알려줍니다 (회원 전용)
function PushToggleRow({ session }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = isPushSupported();

  useEffect(() => {
    if (session && supported) getPushEnabled().then(setEnabled);
  }, [session, supported]);

  // 비회원이거나 푸시 미지원 브라우저면 표시하지 않음
  if (!session || !supported) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast("리마인더 알림을 껐어요.");
      } else {
        await enablePush();
        setEnabled(true);
        toast("이제 운동 안 한 날 저녁에 알림을 보내드릴게요 🔔");
      }
    } catch (e) {
      toast(e.message || "알림 설정에 실패했어요.");
    }
    setBusy(false);
  }

  return (
    <RowButton
      disabled={busy}
      hint={busy ? "처리 중…" : enabled ? "켜짐 🔔" : "꺼짐 🔕"}
      onClick={toggle}
    >
      운동 리마인더 알림
    </RowButton>
  );
}

// ── 회원 탈퇴 모달 (비밀번호 재확인 필수) ───────
function DeleteAccountModal({ email, onClose }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!pw) {
      setErr("비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    // 본인 확인
    const { error: signInErr } = await signIn(email, pw);
    if (signInErr) {
      setBusy(false);
      setErr(signInErr);
      return;
    }
    const res = await deleteAccount();
    setBusy(false);
    if (res?.error) {
      setErr(res.error);
      return;
    }
    toast("계정과 모든 데이터를 삭제했어요. 그동안 함께해 주셔서 고마워요.");
    // deleteAccount 내부에서 로그아웃되어 세션이 사라지면 이 모달은 자동으로 닫힘
  }

  return (
    <Modal label="회원 탈퇴" onBackdrop={onClose}>
      <ModalTitle>회원 탈퇴 😢</ModalTitle>
      <ModalText>
        탈퇴하면 계정과 운동 기록·인증샷·그룹 정보가 <strong>모두 영구 삭제</strong>
        되며 되돌릴 수 없어요. 계속하려면 비밀번호를 입력해 주세요.
      </ModalText>
      <Field
        id="del-pw"
        label="비밀번호"
        className="mt-3"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={pw}
        error={err}
        onChange={(e) => {
          setPw(e.target.value);
          setErr("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirmDelete();
        }}
      />
      <Button className="mt-3.5" disabled={busy} onClick={confirmDelete}>
        {busy ? "처리 중…" : "탈퇴하기"}
      </Button>
      <Button variant="secondary" className="mt-2.5" disabled={busy} onClick={onClose}>
        취소
      </Button>
    </Modal>
  );
}

// ── 비회원 안내: 기록이 이 기기에만 있다는 경고 ──
function GuestNotice() {
  const count = Object.values(getRecords()).filter((r) => r?.completed).length;
  return (
    <Banner className="mt-4 mb-0">
      ⚠️ {count > 0 ? `운동 기록 ${count}개가 이 기기에만 저장돼 있어요.` : "비회원 기록은 이 기기에만 저장돼요."}
      <br />
      브라우저 데이터를 지우면 사라지고, 나중에 로그인해도 오늘·어제 기록만 계정으로 옮겨져요.
    </Banner>
  );
}

// ── 닉네임 변경 ──
function NicknameModal({ session, initial, onSaved, onClose }) {
  const [value, setValue] = useState(initial || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const err = validateNickname(value);
    setError(err);
    if (err) return;
    const nick = value.trim();
    setBusy(true);
    saveProfile({ ...getProfile(), nickname: nick });
    if (session) await saveNickname(nick);
    setBusy(false);
    onSaved(nick);
    toast("닉네임을 변경했어요.");
    onClose();
  }

  return (
    <Modal label="닉네임 변경" onBackdrop={busy ? undefined : onClose}>
      <ModalTitle>닉네임 변경 ✏️</ModalTitle>
      <ModalText>그룹에서 다른 멤버에게 보이는 이름이에요.</ModalText>
      <Field
        id="nick"
        label="닉네임 (2~12자, 한글·영문·숫자·_)"
        className="mt-3"
        autoFocus
        value={value}
        placeholder="그룹에 표시될 이름"
        maxLength={12}
        error={error}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Button className="mt-3.5" disabled={busy} onClick={submit}>
        {busy ? "저장 중…" : "저장"}
      </Button>
      <Button variant="secondary" className="mt-2.5" disabled={busy} onClick={onClose}>
        취소
      </Button>
    </Modal>
  );
}

// ── 이름·전화번호 변경 (가입 때 입력한 값 — '회원만 받기' 그룹 참여 조건) ──
function ProfileInfoModal({ onClose }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMyProfileInfo()
      .then((info) => {
        if (!alive || !info) return;
        setFullName(info.fullName);
        setPhone(info.phone);
        setLoaded(true);
      })
      .catch((e) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    // 둘 다 선택 입력 — 적었다면 형식 검사
    const errs = {
      fullName: fullName.trim() ? validateName(fullName) : "",
      phone: phone ? validatePhone(phone) : "",
    };
    setErrors(errs);
    if (errs.fullName || errs.phone) return;
    setBusy(true);
    try {
      await updateMyProfileInfo({ fullName: fullName.trim(), phone: phone ? formatPhone(phone) : "" });
      toast("이름·전화번호를 저장했어요.");
      onClose();
    } catch (e) {
      setErrors({ phone: e.message });
    }
    setBusy(false);
  }

  return (
    <Modal label="이름·전화번호 변경" onBackdrop={busy ? undefined : onClose}>
      <ModalTitle>이름·전화번호 변경 📇</ModalTitle>
      <ModalText>그룹 멤버에게는 보이지 않아요. '회원만 받기' 그룹에 참여하려면 둘 다 필요해요.</ModalText>
      {!loaded ? (
        <Sub className={cx("mt-4 text-center", loadError && "text-brand")}>{loadError || "불러오는 중…"}</Sub>
      ) : (
        <>
          <Field
            id="full-name"
            label="이름"
            className="mt-3"
            value={fullName}
            maxLength={20}
            placeholder="홍길동"
            autoComplete="name"
            error={errors.fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setErrors((p) => ({ ...p, fullName: "" }));
            }}
          />
          <Field
            id="phone"
            label="전화번호"
            type="tel"
            value={phone}
            maxLength={13}
            placeholder="010-0000-0000"
            autoComplete="tel"
            inputMode="numeric"
            error={errors.phone}
            onChange={(e) => {
              setPhone(formatPhone(e.target.value));
              setErrors((p) => ({ ...p, phone: "" }));
            }}
          />
        </>
      )}
      <Button className="mt-3.5" disabled={busy || !loaded} onClick={submit}>
        {busy ? "저장 중…" : "저장"}
      </Button>
      <Button variant="secondary" className="mt-2.5" disabled={busy} onClick={onClose}>
        취소
      </Button>
    </Modal>
  );
}

// ── 비밀번호 변경 (현재 비밀번호로 본인 확인 후) ──
function ChangePasswordModal({ email, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const errs = {
      current: current ? "" : "현재 비밀번호를 입력해 주세요.",
      next: validatePassword(next) || (next && next === current ? "현재 비밀번호와 다른 비밀번호를 입력해 주세요." : ""),
      confirmPw: next === confirmPw ? "" : "새 비밀번호가 서로 달라요.",
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    const check = await signIn(email, current);
    if (check?.error) {
      setBusy(false);
      // 비밀번호 불일치만 '현재 비밀번호' 오류로, 연결 실패 등은 원래 안내 그대로
      setErrors({ current: check.error === INVALID_CREDENTIALS ? "현재 비밀번호가 올바르지 않아요." : check.error });
      return;
    }
    const res = await updatePassword(next);
    setBusy(false);
    if (res?.error) {
      setErrors({ next: res.error });
      return;
    }
    toast("비밀번호를 변경했어요.");
    onClose();
  }

  const clear = (key) => setErrors((p) => ({ ...p, [key]: "" }));

  return (
    <Modal label="비밀번호 변경" onBackdrop={busy ? undefined : onClose}>
      <ModalTitle>비밀번호 변경 🔑</ModalTitle>
      <Field
        id="pw-current"
        label="현재 비밀번호"
        className="mt-3"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={current}
        error={errors.current}
        onChange={(e) => {
          setCurrent(e.target.value);
          clear("current");
        }}
      />
      <Field
        id="pw-next"
        label="새 비밀번호 (6자 이상, 영문+숫자)"
        type="password"
        autoComplete="new-password"
        value={next}
        error={errors.next}
        onChange={(e) => {
          setNext(e.target.value);
          clear("next");
        }}
      />
      <Field
        id="pw-confirm"
        label="새 비밀번호 확인"
        type="password"
        autoComplete="new-password"
        value={confirmPw}
        error={errors.confirmPw}
        onChange={(e) => {
          setConfirmPw(e.target.value);
          clear("confirmPw");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Button className="mt-3.5" disabled={busy} onClick={submit}>
        {busy ? "변경 중…" : "비밀번호 변경"}
      </Button>
      <Button variant="secondary" className="mt-2.5" disabled={busy} onClick={onClose}>
        취소
      </Button>
    </Modal>
  );
}

// ── 홈 화면에 앱 추가 방법 (설치 창을 띄울 수 없는 브라우저용) ──
function InstallGuideModal({ onClose }) {
  const ios = isIOS();
  const steps = ios
    ? ["Safari 로 이 사이트를 열어요.", "아래쪽 공유 버튼(□↑)을 눌러요.", "'홈 화면에 추가'를 누르고 '추가'를 눌러요."]
    : ["Chrome 으로 이 사이트를 열어요.", "오른쪽 위 메뉴(⋮)를 눌러요.", "'앱 설치' 또는 '홈 화면에 추가'를 눌러요."];
  return (
    <Modal label="홈 화면에 앱 추가" onBackdrop={onClose}>
      <ModalTitle>홈 화면에 앱 추가 📲</ModalTitle>
      <ModalText>앱처럼 바로 실행할 수 있어요.</ModalText>
      <ol className="mt-4 space-y-2.5 rounded-md bg-surface-2 px-4 py-3.5 text-base">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2.5">
            <span className="flex size-5.5 flex-none items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      {ios && (
        <p className="mt-3 text-xs text-dim">
          아이폰은 홈 화면에 추가한 앱에서만 운동 리마인더 알림을 받을 수 있어요 (iOS 16.4 이상).
        </p>
      )}
      <Button variant="secondary" className="mt-4" onClick={onClose}>
        확인
      </Button>
    </Modal>
  );
}
