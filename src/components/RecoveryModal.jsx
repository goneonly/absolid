import { useState } from "react";
import { updatePassword } from "../auth.js";
import { validatePassword } from "../validation.js";
import { toast } from "../toast.js";

// 비밀번호 재설정 메일의 링크로 들어오면(PASSWORD_RECOVERY) 뜨는 새 비밀번호 설정 모달
export default function RecoveryModal({ onClose }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e1 = validatePassword(pw);
    if (e1) {
      setErr(e1);
      return;
    }
    if (pw !== pw2) {
      setErr("비밀번호가 서로 달라요.");
      return;
    }
    setBusy(true);
    const res = await updatePassword(pw);
    setBusy(false);
    if (res?.error) {
      setErr(res.error);
      return;
    }
    toast("비밀번호를 변경했어요. 새 비밀번호로 이용해 주세요.");
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="새 비밀번호 설정">
        <h3>새 비밀번호 설정 🔑</h3>
        <p className="sub" style={{ marginTop: 8 }}>
          안전한 새 비밀번호를 입력해 주세요. (6자 이상, 영문+숫자)
        </p>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="rec-pw">새 비밀번호</label>
          <input
            id="rec-pw"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr("");
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="rec-pw2">새 비밀번호 확인</label>
          <input
            id="rec-pw2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => {
              setPw2(e.target.value);
              setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          {err && <p className="field-error">{err}</p>}
        </div>
        <button className="cta" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>
          {busy ? "변경 중…" : "비밀번호 변경"}
        </button>
      </div>
    </div>
  );
}
