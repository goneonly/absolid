import { describe, expect, it } from 'vitest'
import { authErrorMessage, INVALID_CREDENTIALS, NETWORK_ERROR } from './authErrors.js'

const UNKNOWN = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'

describe('인증 오류 → 한국어 메시지', () => {
  it('오류 코드로 먼저 판단한다 (영문 문장이 바뀌어도 동작)', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'something new' })).toBe(INVALID_CREDENTIALS)
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toContain('이메일 인증')
    expect(authErrorMessage({ code: 'user_already_exists' })).toBe('이미 가입된 이메일이에요.')
    expect(authErrorMessage({ code: 'email_exists' })).toBe('이미 가입된 이메일이에요.')
    expect(authErrorMessage({ code: 'same_password' })).toContain('다른 비밀번호')
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toContain('메일 요청')
  })

  it.each([
    [{ name: 'AuthRetryableFetchError', message: '{}' }],
    [{ message: 'Failed to fetch' }],          // Chrome
    [{ message: 'Load failed' }],              // Safari
    [{ message: 'NetworkError when attempting to fetch resource.' }], // Firefox
    [{ message: 'Network request failed' }],
  ])('서버에 닿지 못한 경우 연결 안내: %o', (err) => {
    expect(authErrorMessage(err)).toBe(NETWORK_ERROR)
  })

  it('요청이 너무 많으면(429) 잠시 후 안내', () => {
    expect(authErrorMessage({ status: 429, message: 'Too many' })).toContain('시도가 너무 많아요')
  })

  it('코드가 없는 예전 응답은 메시지 문장으로 판단', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe(INVALID_CREDENTIALS)
    expect(authErrorMessage({ message: 'User already registered' })).toBe('이미 가입된 이메일이에요.')
  })

  it('알 수 없는 오류·빈 값은 일반 안내 (영문 원문을 그대로 보여주지 않음)', () => {
    expect(authErrorMessage({ code: 'unexpected_failure', message: 'Database error' })).toBe(UNKNOWN)
    expect(authErrorMessage(null)).toBe(UNKNOWN)
    expect(authErrorMessage(undefined)).toBe(UNKNOWN)
  })
})
