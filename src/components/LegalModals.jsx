import { Button, Modal, ModalTitle } from "./ui.jsx";

// 개인정보 처리방침 · 이용약관 — 내용을 바꾸면 TERMS_VERSION(시행일)도 함께 바꿔 주세요
// (회원가입 시 동의한 버전이 profiles.terms_version 에 저장됨)
export const TERMS_VERSION = "2026-10-10";
const EFFECTIVE_DATE = "2026년 10월 10일";
const CONTACT_URL = "https://github.com/goneonly/absolid/issues";

const BODY =
  "mt-3.5 text-sm text-dim [&_li]:mt-1 [&_strong]:mt-4 [&_strong]:block [&_strong]:text-fg [&_ul]:mt-1.5 [&_ul]:ml-4.5 [&_ul]:list-disc [&_ol]:mt-1.5 [&_ol]:ml-4.5 [&_ol]:list-decimal [&>p]:mt-2 [&_a]:text-fg [&_a]:underline";

function LegalModal({ title, onClose, children }) {
  return (
    <Modal label={title} onBackdrop={onClose} className="max-h-[85dvh] overflow-y-auto">
      <ModalTitle>{title}</ModalTitle>
      <div className={BODY}>{children}</div>
      <Button variant="secondary" className="mt-5" onClick={onClose}>
        닫기
      </Button>
    </Modal>
  );
}

// ── 개인정보 처리방침 (개인정보 보호법 제30조 기재 항목) ──
export function PrivacyModal({ onClose, title = "개인정보 처리방침" }) {
  return (
    <LegalModal title={title} onClose={onClose}>
      <p>
        Absolid(이하 &lsquo;서비스&rsquo;)는 이용자의 개인정보를 소중히 다루며, 개인정보 보호법에
        따라 아래와 같이 처리합니다.
      </p>

      <strong>1. 수집하는 개인정보</strong>
      <ul>
        <li>회원가입(필수): 이메일, 비밀번호(암호화 저장), 이름, 전화번호, 만 14세 이상 여부, 약관 동의 일시</li>
        <li>선택 입력: 닉네임, 프로필 사진, 인증샷, 그룹 사진</li>
        <li>이용 중 생성: 운동 기록(날짜·완료 시각·영상 시청 확인 정보), 그룹 참여 정보, 신고 내역, 알림 구독 정보(알림을 켠 경우)</li>
        <li>자동 수집: 로그인 상태와 기록을 유지하기 위한 브라우저 저장소 정보, 개인을 식별할 수 없는 형태의 방문 통계</li>
        <li>비회원: 운동 기록·닉네임은 이용자의 기기에만 저장되며 서버로 보내지 않습니다.</li>
      </ul>

      <strong>2. 이용 목적</strong>
      <ul>
        <li>회원 식별, 로그인, 계정 복구</li>
        <li>운동 기록 저장·조회 및 영상 시청 완료 확인</li>
        <li>그룹 기능(멤버 운동 현황, 리더보드, 인증샷 공유) 제공</li>
        <li>운동 리마인더 알림 발송(동의한 경우)</li>
        <li>부정 이용 방지, 신고 처리, 서비스 오류 대응 및 개선</li>
      </ul>

      <strong>3. 보유 및 이용 기간</strong>
      <ul>
        <li>회원 탈퇴 시까지 보유하며, 탈퇴하면 지체 없이 파기합니다.</li>
        <li>인증샷은 해당 날짜로부터 30일이 지나면 자동으로 삭제합니다.</li>
        <li>관계 법령에 따라 보관이 필요한 경우에는 해당 기간 동안 보관합니다.</li>
      </ul>

      <strong>4. 파기 절차 및 방법</strong>
      <p>
        회원 탈퇴 시 계정, 운동 기록, 사진, 그룹 참여 정보를 즉시 삭제하며 복구할 수 없습니다.
        전자 파일은 복구할 수 없는 방법으로 삭제합니다.
      </p>

      <strong>5. 제3자 제공</strong>
      <p>
        개인정보를 제3자에게 제공하지 않습니다. 다만 서비스 특성상 같은 그룹 멤버에게는 닉네임,
        프로필 사진, 운동 현황, 인증샷이 공개됩니다. 이름과 전화번호는 공개되지 않습니다.
      </p>

      <strong>6. 처리 위탁 및 국외 이전</strong>
      <ul>
        <li>
          Supabase Inc.(미국) — 회원 인증, 데이터·사진 저장
          <br />이전 국가: 일본(Amazon Web Services 도쿄 리전) · 이전 항목: 1번의 회원 정보 전체 ·
          이전 시기와 방법: 서비스 이용 시 암호화된 네트워크로 전송 · 보유 기간: 3번과 같음
        </li>
        <li>
          Vercel Inc.(미국) — 웹사이트 제공 및 방문 통계
          <br />이전 국가: 미국 등 Vercel 서버 소재 국가 · 이전 항목: 접속 정보(IP 주소 등), 방문 통계 ·
          이전 시기와 방법: 웹사이트 접속 시 암호화된 네트워크로 전송
        </li>
        <li>
          운동 영상은 YouTube(Google LLC)를 통해 재생되며, 재생 시 Google의 개인정보처리방침이
          적용됩니다.
        </li>
      </ul>
      <p>
        국외 이전을 거부할 수 있으나, 이 경우 회원 기능은 이용할 수 없고 비회원(기기 저장)으로만
        이용할 수 있습니다.
      </p>

      <strong>7. 이용자의 권리와 행사 방법</strong>
      <ul>
        <li>열람·정정: 설정 → 내 프로필에서 직접 확인하고 수정할 수 있습니다.</li>
        <li>삭제·처리 정지: 설정 → 회원 탈퇴로 언제든 요청할 수 있습니다.</li>
        <li>그 밖의 요청은 아래 문의처로 연락하시면 지체 없이 처리합니다.</li>
      </ul>

      <strong>8. 안전성 확보 조치</strong>
      <ul>
        <li>비밀번호 암호화 저장, 모든 통신 구간 HTTPS 암호화</li>
        <li>데이터베이스 접근 권한 통제(본인·같은 그룹 단위), 인증샷 비공개 저장</li>
      </ul>

      <strong>9. 만 14세 미만 아동</strong>
      <p>서비스는 만 14세 미만 아동의 회원가입을 받지 않습니다.</p>

      <strong>10. 개인정보 보호책임자 및 문의</strong>
      <p>
        개인정보 보호책임자: Absolid 운영자
        <br />
        문의:{" "}
        <a href={CONTACT_URL} target="_blank" rel="noreferrer">
          GitHub 문의 게시판
        </a>
      </p>

      <strong>11. 시행일</strong>
      <p>이 처리방침은 {EFFECTIVE_DATE}부터 적용됩니다.</p>
    </LegalModal>
  );
}

// ── 이용약관 ──
export function TermsModal({ onClose }) {
  return (
    <LegalModal title="이용약관" onClose={onClose}>
      <strong>제1조 (목적)</strong>
      <p>이 약관은 Absolid(이하 &lsquo;서비스&rsquo;)의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다.</p>

      <strong>제2조 (서비스 내용)</strong>
      <ul>
        <li>날짜별 복근 운동 영상 제공(YouTube에 공개된 외부 영상을 재생합니다)</li>
        <li>운동 기록, 연속 기록(streak), 주간 리포트</li>
        <li>그룹 참여, 멤버 운동 현황, 리더보드, 인증샷 공유</li>
      </ul>

      <strong>제3조 (회원가입)</strong>
      <ol>
        <li>만 14세 이상인 사람만 회원으로 가입할 수 있습니다.</li>
        <li>가입 시 본인의 정확한 정보를 입력해야 하며, 다른 사람의 정보를 사용해서는 안 됩니다.</li>
      </ol>

      <strong>제4조 (이용자의 의무)</strong>
      <ul>
        <li>운동하지 않고 기록을 남기는 등 기록을 부정하게 조작하지 않습니다.</li>
        <li>다른 사람의 얼굴·신체 등이 담긴 사진을 동의 없이 올리지 않습니다.</li>
        <li>음란하거나 불쾌감을 주는 사진, 다른 사람의 권리를 침해하는 게시물을 올리지 않습니다.</li>
        <li>서비스의 정상적인 운영을 방해하지 않습니다.</li>
      </ul>

      <strong>제5조 (게시물)</strong>
      <ol>
        <li>이용자가 올린 사진의 권리는 이용자에게 있으며, 같은 그룹 멤버에게 공개됩니다.</li>
        <li>신고된 게시물이 약관이나 법령을 위반하면 운영자가 삭제할 수 있습니다.</li>
      </ol>

      <strong>제6조 (이용 제한)</strong>
      <p>제4조를 위반하면 사전 안내 없이 게시물 삭제 또는 계정 이용 제한 조치를 할 수 있습니다.</p>

      <strong>제7조 (운동 관련 주의)</strong>
      <ol>
        <li>서비스의 운동 영상과 기록 기능은 의학적 조언이 아닙니다.</li>
        <li>건강 상태에 맞게 무리하지 말고, 통증이나 이상이 있으면 즉시 운동을 멈추고 전문가와 상담하세요.</li>
        <li>운동 중 발생한 부상에 대해 운영자는 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.</li>
      </ol>

      <strong>제8조 (서비스 변경·중단)</strong>
      <p>
        서비스는 현재 베타 버전으로, 기능이 변경되거나 일시적으로 중단될 수 있습니다. 중요한 변경은
        앱 공지로 미리 알립니다.
      </p>

      <strong>제9조 (책임의 제한)</strong>
      <p>
        서비스는 무료로 제공되며, 운영자는 고의 또는 중대한 과실이 없는 한 서비스 이용으로 발생한
        손해에 대해 책임을 지지 않습니다. 외부 영상(YouTube)의 게시 중단 등으로 인한 이용 불가에도
        같습니다.
      </p>

      <strong>제10조 (탈퇴)</strong>
      <p>이용자는 설정 → 회원 탈퇴로 언제든 탈퇴할 수 있으며, 탈퇴 시 데이터는 즉시 삭제됩니다.</p>

      <strong>제11조 (준거법)</strong>
      <p>이 약관은 대한민국 법률에 따르며, 분쟁은 민사소송법상 관할 법원에서 해결합니다.</p>

      <p className="mt-4">이 약관은 {EFFECTIVE_DATE}부터 적용됩니다.</p>
    </LegalModal>
  );
}
