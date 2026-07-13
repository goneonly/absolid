import { useEffect, useRef, useState } from 'react'
import { loadYouTubeAPI, PLAYLIST_ID } from '../youtube.js'
import { todayWorkoutDay, todayKey, saveRecord } from '../storage.js'
import CompleteModal from '../components/CompleteModal.jsx'
import { pushRecord, uploadPhoto } from '../api.js'

export default function Workout({ onDone }) {
  const holderRef = useRef(null)
  const playerRef = useRef(null)
  const startedRef = useRef(false)
  const finishedRef = useRef(false)
  const [showModal, setShowModal] = useState(false)
  const day = todayWorkoutDay()

  useEffect(() => {
    let cancelled = false
    loadYouTubeAPI().then(YT => {
      if (cancelled || !holderRef.current) return
      playerRef.current = new YT.Player(holderRef.current, {
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: e => {
            // 플레이리스트의 (day-1)번째 영상 = 오늘의 Day 영상
            e.target.cuePlaylist({ listType: 'playlist', list: PLAYLIST_ID, index: day - 1 })
          },
          onStateChange: e => {
            const YTState = window.YT.PlayerState
            if (finishedRef.current) return
            if (e.data === YTState.PLAYING) {
              // 재생이 시작된 뒤 다음 영상으로 자동 전환되면 = 오늘 영상 끝
              const idx = e.target.getPlaylistIndex()
              if (startedRef.current && idx !== day - 1) {
                e.target.pauseVideo()
                finish()
              } else {
                startedRef.current = true
              }
            }
            if (e.data === YTState.ENDED) finish() // 플레이리스트 마지막 영상(day 30)인 경우
          },
        },
      })
    })
    return () => {
      cancelled = true
      try { playerRef.current?.destroy() } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    setShowModal(true)
  }

  function handleSave(photo) {
    const completedAt = new Date().toISOString()
    // 로그인 상태면 서버에도 저장 + 인증샷 업로드 (Day 5)
    pushRecord(todayKey(), day, completedAt)
      .then(() => uploadPhoto(todayKey(), photo))
      .catch(() => {})
    saveRecord(todayKey(), {
      completed: true,
      completedAt,
      day,
      ...(photo ? { photo } : {}),
    })
    setShowModal(false)
    onDone()
  }

  return (
    <main className="page">
      <h2>Day {day} 복근 운동</h2>
      <p className="sub">영상이 끝나면 자동으로 운동 완료 처리돼요.</p>

      <div className="hero">
        <span className="day-chip">DAY {day}</span>
        <div className="ratio">
          <div className="yt-holder" ref={holderRef} />
        </div>
      </div>

      <section className="card workout-note">
        <div style={{ fontWeight: 700, fontSize: 15 }}>오늘의 루틴</div>
        <p className="sub" style={{ marginTop: 6 }}>
          중간에 나가면 완료로 기록되지 않아요. 끝까지 함께해요! 💪
        </p>
      </section>

      <button className="demo-link" onClick={finish}>
        (데모용) 영상 끝까지 본 것으로 처리하기
      </button>

      <p className="copyright">XYZ Fitness - 30 days six pack abs</p>

      {showModal && (
        <CompleteModal
          day={day}
          onSave={handleSave}
          onSkip={() => handleSave(null)}
        />
      )}
    </main>
  )
}
