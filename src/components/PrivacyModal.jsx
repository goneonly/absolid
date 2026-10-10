import { Button, Modal, ModalTitle } from "./ui.jsx";

// ── 개인정보 처리 동의 전문 모달 ───────────────
export default function PrivacyModal({ onClose, title = "개인정보 처리 동의 (필수)" }) {
  return (
    <Modal label={title} onBackdrop={onClose} className="max-h-[80dvh] overflow-y-auto">
      <ModalTitle>{title}</ModalTitle>
      <div className="mt-3.5 text-sm text-dim [&_li]:mt-1 [&_strong]:mt-3.5 [&_strong]:block [&_strong]:text-fg [&_ul]:mt-1.5 [&_ul]:ml-4.5 [&_ul]:list-disc [&>p]:mt-2">
        <p>
          본 서비스는 회원가입 및 운동 기록 관리 서비스를 제공하기 위해
          아래와 같이 개인정보를 수집·이용합니다.
        </p>
        <strong>수집 항목</strong>
        <ul>
          <li>이메일</li>
          <li>이름</li>
          <li>전화번호</li>
          <li>닉네임</li>
          <li>비밀번호(암호화 저장)</li>
          <li>프로필 사진 · 인증샷(선택 업로드)</li>
          <li>운동 기록(사용자가 직접 입력한 정보)</li>
        </ul>
        <strong>이용 목적</strong>
        <ul>
          <li>회원 식별 및 로그인</li>
          <li>운동 기록 저장 및 조회</li>
          <li>서비스 운영 및 오류 대응</li>
        </ul>
        <strong>보관 기간</strong>
        <ul>
          <li>
            회원 탈퇴 시까지 보관하며, 관련 법령에 따라 보관이 필요한 경우
            해당 기간 동안 보관합니다.
          </li>
        </ul>
        <p>
          이용자는 개인정보 수집 및 이용에 대한 동의를 거부할 수 있으나,
          동의하지 않을 경우 회원가입이 제한됩니다.
        </p>
      </div>
      <Button variant="secondary" className="mt-4" onClick={onClose}>
        닫기
      </Button>
    </Modal>
  );
}
