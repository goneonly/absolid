import { useRef, useState } from 'react'

// 사진을 긴 변 720px 이하 JPEG dataURL로 압축 (localStorage 용량 보호)
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const MAX = 720
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function CompleteModal({ day, onSave, onSkip }) {
  const fileRef = useRef(null)
  const [photo, setPhoto] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try { setPhoto(await compressImage(file)) } catch { /* 무시 */ }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h3>🎉 Day {day} 운동 완료!</h3>
        <p className="sub">오늘의 인증샷을 남겨볼까요? (선택)</p>

        <button className="photo-box" onClick={() => fileRef.current?.click()}>
          {photo ? <img src={photo} alt="인증샷 미리보기" /> : '📷 탭하여 사진 첨부'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />

        <button className="cta" onClick={() => onSave(photo)}>
          {photo ? '사진과 함께 업로드' : '완료 기록하기'}
        </button>
        <button className="cta secondary" style={{ marginTop: 10 }} onClick={onSkip}>
          사진 없이 완료
        </button>
      </div>
    </div>
  )
}
