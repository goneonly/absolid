import { describe, expect, it } from 'vitest'
import {
  BUCKET, workoutPhotoPath, workoutPhotoDate, avatarPath, groupPhotoPath, inFolder, photoObjectPath,
} from './storagePaths.js'

// 경로 규칙은 DB 보안 정책과 맞물려 있음:
// 첫 폴더 = 사용자 id(인증샷·프로필) / 그룹 id(그룹 사진) — supabase/*.sql 의 storage.foldername(name)[1] 검사
const UID = '11111111-2222-3333-4444-555555555555'
const GID = '99999999-8888-7777-6666-555555555555'

describe('스토리지 경로', () => {
  it('버킷 이름', () => {
    expect(BUCKET).toEqual({ photos: 'photos', avatars: 'avatars', groupPhotos: 'group-photos' })
  })
  it('인증샷: {사용자}/{날짜}.jpg ↔ 날짜', () => {
    const path = workoutPhotoPath(UID, '2026-10-14')
    expect(path).toBe(`${UID}/2026-10-14.jpg`)
    expect(workoutPhotoDate('2026-10-14.jpg')).toBe('2026-10-14')
  })
  it('프로필·그룹 사진은 각자 폴더 안', () => {
    expect(avatarPath(UID).split('/')[0]).toBe(UID)
    expect(groupPhotoPath(GID)).toBe(`${GID}/photo.jpg`)
    expect(inFolder(UID, 'a.jpg')).toBe(`${UID}/a.jpg`)
  })
  it('photo_url → 버킷 안 경로 (예전에 저장된 public URL 호환)', () => {
    const path = `${UID}/2026-10-14.jpg`
    expect(photoObjectPath(path)).toBe(path)
    expect(photoObjectPath(`https://x.supabase.co/storage/v1/object/public/photos/${path}`)).toBe(path)
    expect(photoObjectPath(null)).toBeNull()
    expect(photoObjectPath('')).toBeNull()
  })
})
