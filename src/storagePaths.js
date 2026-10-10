// Supabase Storage 버킷 이름과 파일 경로 규칙 — 업로드·삭제·서명은 모두 여기서 만든 경로를 사용
// (supabase/functions/delete-account 의 그룹 사진 경로도 groupPhotoPath 와 같은 규칙)
export const BUCKET = {
  photos: 'photos',            // 인증샷 (비공개, signed URL 로만 열람)
  avatars: 'avatars',          // 프로필 사진 (공개)
  groupPhotos: 'group-photos', // 그룹 사진 (공개, 그룹장만 변경)
}

// 인증샷: photos/{userId}/{YYYY-MM-DD}.jpg
export const workoutPhotoPath = (userId, dateKey) => `${userId}/${dateKey}.jpg`
// 인증샷 파일 이름 → 날짜 키 (오래된 사진 정리용)
export const workoutPhotoDate = (fileName) => fileName.replace(/\.jpg$/, '')

// 프로필 사진: avatars/{userId}/avatar.jpg
export const avatarPath = (userId) => `${userId}/avatar.jpg`

// 그룹 사진: group-photos/{groupId}/photo.jpg
export const groupPhotoPath = (groupId) => `${groupId}/photo.jpg`

// 폴더 목록(list) 결과의 파일 이름 → 전체 경로
export const inFolder = (folder, fileName) => `${folder}/${fileName}`

// DB의 photo_url → photos 버킷 안 경로
// (지금은 경로를 저장하지만, 과거에 public URL 로 저장된 값도 경로를 추출해 호환)
export function photoObjectPath(value) {
  if (!value) return null
  const marker = `/${BUCKET.photos}/`
  const i = value.indexOf(marker)
  return i >= 0 ? value.slice(i + marker.length) : value // 이미 경로면 그대로
}
