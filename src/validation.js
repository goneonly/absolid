// 입력 검증 헬퍼 — 오류 메시지를 반환하고, 통과하면 빈 문자열('') 반환

// 이메일: 아이디@도메인.TLD(2자 이상) 형식 강제 → "test@gmail" 같은 입력 차단
export function validateEmail(email) {
  const v = (email || '').trim()
  if (!v) return '이메일을 입력해 주세요.'
  const re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/
  if (!re.test(v)) return '올바른 이메일 형식이 아니에요. (예: name@example.com)'
  if (v.length > 254) return '이메일이 너무 길어요.'
  return ''
}

// 이름: 한글(완성형) 또는 영문 2~20자, 자음/모음만 입력·숫자·특수문자 차단
export function validateName(name) {
  const v = (name || '').trim()
  if (!v) return '이름을 입력해 주세요.'
  if (v.length < 2) return '이름은 2자 이상 입력해 주세요.'
  if (v.length > 20) return '이름은 20자 이하로 입력해 주세요.'
  if (!/^([가-힣]+|[A-Za-z]+( [A-Za-z]+)*)$/.test(v)) return '이름은 한글 또는 영문만 입력할 수 있어요.'
  return ''
}

// 전화번호: 한국 휴대폰 번호(01X, 10~11자리)만 허용
export function validatePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (!digits) return '전화번호를 입력해 주세요.'
  if (!/^01[016789]\d{7,8}$/.test(digits)) return '올바른 휴대폰 번호가 아니에요. (예: 010-1234-5678)'
  return ''
}

// 전화번호 자동 하이픈 (입력 중 포맷팅)
export function formatPhone(raw) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

// 비밀번호(가입): 6자 이상, 공백 금지, 영문+숫자 조합
export function validatePassword(pw) {
  if (!pw || pw.length < 6) return '비밀번호는 6자 이상이어야 해요.'
  if (pw.length > 72) return '비밀번호는 72자 이하로 입력해 주세요.'
  if (/\s/.test(pw)) return '비밀번호에는 공백을 쓸 수 없어요.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '비밀번호는 영문과 숫자를 함께 사용해 주세요.'
  return ''
}

// 닉네임: 2~12자, 한글/영문/숫자/밑줄만
export function validateNickname(nick) {
  const v = (nick || '').trim()
  if (!v) return '닉네임을 입력해 주세요.'
  if (v.length < 2 || v.length > 12) return '닉네임은 2~12자로 입력해 주세요.'
  if (!/^[가-힣A-Za-z0-9_]+$/.test(v)) return '닉네임에는 한글, 영문, 숫자, _만 쓸 수 있어요.'
  return ''
}
