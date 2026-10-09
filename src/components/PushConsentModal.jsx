import { useEffect, useState } from "react";
import { enablePush } from "../push.js";
import { toast } from "../toast.js";
import { Button, Modal, ModalText, ModalTitle } from "./ui.jsx";

// 가입 완료 후 1회: 푸시 알림 동의/미동의 모달
// - 동의 → 브라우저 권한 요청 + 구독
// - 미동의 → "설정에서 켤 수 있어요" 안내 모달이 잠깐 떴다가 자동으로 닫힘
export default function PushConsentModal({ onClose }) {
  const [step, setStep] = useState("ask"); // ask | declined
  const [busy, setBusy] = useState(false);

  // 미동의 안내 모달은 2.5초 뒤 자동으로 내려감
  useEffect(() => {
    if (step !== "declined") return;
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [step, onClose]);

  async function agree() {
    setBusy(true);
    try {
      await enablePush();
      toast("이제 운동 안 한 날 저녁에 알림을 보내드릴게요 🔔");
      onClose();
    } catch (e) {
      toast(e.message || "알림 설정에 실패했어요.");
      setStep("declined");
    }
    setBusy(false);
  }

  if (step === "declined") {
    return (
      <Modal label="알림 안내">
        <ModalTitle>알겠어요 👌</ModalTitle>
        <ModalText>
          운동 리마인더 알림은 <strong>설정 → 기타</strong>에서 언제든 켤 수 있어요.
        </ModalText>
      </Modal>
    );
  }

  return (
    <Modal label="푸시 알림 동의">
      <ModalTitle>운동 리마인더 알림 🔔</ModalTitle>
      <ModalText>
        운동을 안 한 날 저녁에 브라우저 알림으로 알려드릴까요? 꾸준한 streak에
        도움이 돼요.
      </ModalText>
      <Button className="mt-4.5" disabled={busy} onClick={agree}>
        {busy ? "설정 중…" : "동의하고 알림 받기"}
      </Button>
      <Button
        variant="secondary"
        className="mt-2.5"
        disabled={busy}
        onClick={() => setStep("declined")}
      >
        미동의 (다음에 할게요)
      </Button>
    </Modal>
  );
}
