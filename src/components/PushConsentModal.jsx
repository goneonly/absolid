import { useEffect, useState } from "react";
import { enablePush } from "../push.js";
import { toast } from "../toast.js";

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
      <div className="modal-backdrop">
        <div className="modal" role="dialog" aria-modal="true" aria-label="알림 안내">
          <h3>알겠어요 👌</h3>
          <p className="sub" style={{ marginTop: 8 }}>
            운동 리마인더 알림은 <strong>설정 → 기타</strong>에서 언제든 켤 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="푸시 알림 동의">
        <h3>운동 리마인더 알림 🔔</h3>
        <p className="sub" style={{ marginTop: 8 }}>
          운동을 안 한 날 저녁에 브라우저 알림으로 알려드릴까요? 꾸준한 streak에
          도움이 돼요.
        </p>
        <button
          className="cta"
          style={{ marginTop: 18 }}
          disabled={busy}
          onClick={agree}
        >
          {busy ? "설정 중…" : "동의하고 알림 받기"}
        </button>
        <button
          className="cta secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => setStep("declined")}
        >
          미동의 (다음에 할게요)
        </button>
      </div>
    </div>
  );
}
