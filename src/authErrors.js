// Supabase 인증 오류 → 사용자에게 보여줄 한국어 메시지
// 영문 메시지 문장은 바뀔 수 있어 고정값인 error_code 와 HTTP 상태로 먼저 구분하고,
// error_code 가 없는 예전 서버 응답만 메시지 문장으로 보조 판단
const BY_CODE = {
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않아요.',
  email_not_confirmed: '이메일 인증이 필요해요. 메일함을 확인해 주세요.',
  user_already_exists: '이미 가입된 이메일이에요.',
  email_exists: '이미 가입된 이메일이에요.',
  weak_password: '비밀번호가 너무 약해요. 영문과 숫자를 섞어 6자 이상으로 입력해 주세요.',
  same_password: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
  email_address_invalid: '이메일 형식이 올바르지 않아요.',
  validation_failed: '입력한 정보를 다시 확인해 주세요.',
  over_request_rate_limit: '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.',
  over_email_send_rate_limit: '메일 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
}

const BY_MESSAGE = {
  'Invalid login credentials': BY_CODE.invalid_credentials,
  'Email not confirmed': BY_CODE.email_not_confirmed,
  'User already registered': BY_CODE.user_already_exists,
  'Password should be at least 6 characters.': BY_CODE.weak_password,
  'Unable to validate email address: invalid format': BY_CODE.email_address_invalid,
}

export const INVALID_CREDENTIALS = BY_CODE.invalid_credentials
export const NETWORK_ERROR = '서버에 연결할 수 없어요. 광고 차단 프로그램이나 네트워크를 확인해 주세요.'
const RATE_LIMIT_ERROR = BY_CODE.over_request_rate_limit
const UNKNOWN_ERROR = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'

// 브라우저가 서버에 닿지 못했을 때 (요청 차단·오프라인 등) — 브라우저마다 문구가 다름
function isNetworkError(error) {
  const msg = String(error?.message || '')
  return (
    error?.name === 'AuthRetryableFetchError' ||
    /failed to fetch|load failed|networkerror|network request failed/i.test(msg)
  )
}

export function authErrorMessage(error) {
  if (!error) return UNKNOWN_ERROR
  if (BY_CODE[error.code]) return BY_CODE[error.code]
  if (isNetworkError(error)) return NETWORK_ERROR
  if (error.status === 429) return RATE_LIMIT_ERROR
  return BY_MESSAGE[error.message] || UNKNOWN_ERROR
}
