import { useState } from "react";
import { updatePassword } from "../auth.js";
import { validatePassword } from "../validation.js";
import { toast } from "../toast.js";
import { Button, Field, Modal, ModalText, ModalTitle } from "./ui.jsx";

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
    <Modal label="새 비밀번호 설정">
      <ModalTitle>새 비밀번호 설정 🔑</ModalTitle>
      <ModalText>안전한 새 비밀번호를 입력해 주세요. (6자 이상, 영문+숫자)</ModalText>
      <Field
        id="rec-pw"
        label="새 비밀번호"
        className="mt-3"
        type="password"
        autoFocus
        autoComplete="new-password"
        value={pw}
        onChange={(e) => {
          setPw(e.target.value);
          setErr("");
        }}
      />
      <Field
        id="rec-pw2"
        label="새 비밀번호 확인"
        type="password"
        autoComplete="new-password"
        value={pw2}
        error={err}
        onChange={(e) => {
          setPw2(e.target.value);
          setErr("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Button className="mt-3.5" disabled={busy} onClick={submit}>
        {busy ? "변경 중…" : "비밀번호 변경"}
      </Button>
    </Modal>
  );
}
