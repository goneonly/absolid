import { useRef, useState } from 'react'
import { Button, Modal, ModalText, ModalTitle } from './ui.jsx'
import { compressImage } from '../image.js'

export default function CompleteModal({ day, onSave, onSkip }) {
  const fileRef = useRef(null)
  const [photo, setPhoto] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try { setPhoto(await compressImage(file)) } catch { /* 무시 */ }
  }

  return (
    <Modal>
      <ModalTitle>🎉 Day {day} 운동 완료!</ModalTitle>
      <ModalText>오늘의 인증샷을 남겨볼까요? (선택)</ModalText>

      <button
        className="mt-4.5 flex min-h-50 w-full items-center justify-center overflow-hidden rounded-lg border-[1.5px] border-dashed border-line bg-surface-2 text-center text-lg font-semibold text-dim"
        onClick={() => fileRef.current?.click()}
      >
        {photo ? <img className="block w-full" src={photo} alt="인증샷 미리보기" /> : '📷 탭하여 사진 첨부'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />

      <Button className="mt-5" onClick={() => onSave(photo)}>
        {photo ? '사진과 함께 업로드' : '완료 기록하기'}
      </Button>
      <Button variant="secondary" className="mt-2.5" onClick={onSkip}>
        사진 없이 완료
      </Button>
    </Modal>
  )
}
