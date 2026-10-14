import { describe, expect, it } from 'vitest'
import {
  validateEmail, validateName, validatePhone, formatPhone, validatePassword, validateNickname,
} from './validation.js'

const ok = ''

describe('이메일', () => {
  it.each(['name@example.com', ' a.b+c@sub.domain.co.kr ', 'x_y-z%1@a-b.io'])('통과: %s', (v) => {
    expect(validateEmail(v)).toBe(ok)
  })
  it.each([
    ['', '입력해'], [null, '입력해'], ['test@gmail', '형식'], ['no-at.com', '형식'],
    ['a@-bad.com', '형식'], ['a@bad-.com', '형식'], ['a@b.c', '형식'], ['a b@c.com', '형식'],
  ])('거부: %s', (v, msg) => {
    expect(validateEmail(v)).toContain(msg)
  })
  it('254자 초과 거부', () => {
    expect(validateEmail(`${'a'.repeat(250)}@ex.com`)).toContain('너무 길어요')
  })
})

describe('이름', () => {
  it.each(['김민준', 'Kim', 'Min Jun Kim', '  이서연  '])('통과: %s', (v) => {
    expect(validateName(v)).toBe(ok)
  })
  it.each([
    ['', '입력해'], ['김', '2자 이상'], ['가'.repeat(21), '20자 이하'],
    ['ㄱㄴㄷ', '한글 또는 영문'], ['김민준1', '한글 또는 영문'], ['Kim민준', '한글 또는 영문'], ['Kim  Lee', '한글 또는 영문'],
  ])('거부: %s', (v, msg) => {
    expect(validateName(v)).toContain(msg)
  })
})

describe('휴대폰 번호', () => {
  it.each(['010-1234-5678', '01012345678', '011-123-4567', '019 1234 5678'])('통과: %s', (v) => {
    expect(validatePhone(v)).toBe(ok)
  })
  it.each([['', '입력해'], ['02-123-4567', '올바른'], ['010-123-456', '올바른'], ['012-1234-5678', '올바른'], ['010123456789', '올바른']])(
    '거부: %s', (v, msg) => {
      expect(validatePhone(v)).toContain(msg)
    },
  )
  it.each([
    ['010', '010'], ['0101', '010-1'], ['0101234', '010-1234'], ['01012345', '010-123-45'],
    ['0101234567', '010-123-4567'], ['01012345678', '010-1234-5678'], ['010-1234-56789', '010-1234-5678'], ['', ''],
  ])('입력 중 하이픈: %s → %s', (raw, want) => {
    expect(formatPhone(raw)).toBe(want)
  })
})

describe('비밀번호', () => {
  it.each(['abc123', 'Passw0rd!', 'a1'.repeat(36)])('통과: %s', (v) => {
    expect(validatePassword(v)).toBe(ok)
  })
  it.each([
    ['', '6자 이상'], ['ab12', '6자 이상'], ['a1'.repeat(36) + 'x', '72자 이하'],
    ['abc 123', '공백'], ['abcdef', '영문과 숫자'], ['123456', '영문과 숫자'],
  ])('거부: %s', (v, msg) => {
    expect(validatePassword(v)).toContain(msg)
  })
})

describe('닉네임', () => {
  it.each(['민준', 'runner_01', '  복근왕  ', 'a'.repeat(12)])('통과: %s', (v) => {
    expect(validateNickname(v)).toBe(ok)
  })
  it.each([['', '입력해'], ['a', '2~12자'], ['a'.repeat(13), '2~12자'], ['민 준', '한글, 영문'], ['hi!', '한글, 영문']])(
    '거부: %s', (v, msg) => {
      expect(validateNickname(v)).toContain(msg)
    },
  )
})
