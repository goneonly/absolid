import { useEffect, useRef, useState } from "react";
import { loadYouTubeAPI } from "../youtube.js";
import { getPlaylistId } from "../admin.js";
import { todayWorkoutDay, todayKey, saveRecord } from "../storage.js";
import CompleteModal from "../components/CompleteModal.jsx";
import { pushRecord, uploadPhoto } from "../api.js";
import { toast } from "../toast.js";

const FINISH_RATIO = 0.8; // 영상 80% 이상 시청 시 수동 완료 버튼 활성화

export default function Workout({ onDone, session }) {
  const holderRef = useRef(null);
  const playerRef = useRef(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const [showModal, setShowModal] = useState(false);
  const [canFinish, setCanFinish] = useState(false);
  const day = todayWorkoutDay();

  useEffect(() => {
    let cancelled = false;
    // 관리자가 설정한 플레이리스트를 우선 사용 (없으면 기본값)
    Promise.all([getPlaylistId(), loadYouTubeAPI()]).then(([playlistId, YT]) => {
      if (cancelled || !holderRef.current) return;
      playerRef.current = new YT.Player(holderRef.current, {
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: (e) => {
            // 플레이리스트의 (day-1)번째 영상 = 오늘의 Day 영상
            e.target.cuePlaylist({
              listType: "playlist",
              list: playlistId,
              index: day - 1,
            });
          },
          onStateChange: (e) => {
            const YTState = window.YT.PlayerState;
            if (finishedRef.current) return;
            if (e.data === YTState.PLAYING) {
              // 재생이 시작된 뒤 다음 영상으로 자동 전환되면 = 오늘 영상 끝
              const idx = e.target.getPlaylistIndex();
              if (startedRef.current && idx !== day - 1) {
                e.target.pauseVideo();
                finish();
              } else {
                startedRef.current = true;
              }
            }
            if (e.data === YTState.ENDED) finish(); // 플레이리스트 마지막 영상(day 30)인 경우
          },
        },
      });
    });

    // 자동 판정 백업: 시청률 80% 도달 시 수동 완료 버튼 활성화
    const timer = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime || !p?.getDuration) return;
      try {
        const dur = p.getDuration();
        if (dur > 0 && p.getCurrentTime() / dur >= FINISH_RATIO) {
          setCanFinish(true);
          clearInterval(timer);
        }
      } catch {
        /* 플레이어 준비 전엔 무시 */
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setShowModal(true);
  }

  function handleSave(photo) {
    const completedAt = new Date().toISOString();
    // 로컬 저장은 즉시, 서버 저장·업로드는 백그라운드로 (실패 시 토스트 안내)
    pushRecord(todayKey(), day, completedAt)
      .then(() => uploadPhoto(todayKey(), photo))
      .then((url) => {
        if (session && photo && !url) {
          toast("인증샷 서버 업로드에 실패했어요. 사진은 이 기기에만 저장돼요.");
        }
      })
      .catch(() => {
        if (session) {
          toast("서버 저장에 실패했어요. 다음 접속 때 자동으로 다시 동기화돼요.");
        }
      });
    saveRecord(todayKey(), {
      completed: true,
      completedAt,
      day,
      ...(photo ? { photo } : {}),
    });
    setShowModal(false);
    onDone();
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

      {canFinish && (
        <button className="cta" onClick={finish}>
          운동 완료
        </button>
      )}

      {import.meta.env.DEV && (
        <button className="demo-link" onClick={finish}>
          (개발용) 영상 끝까지 본 것으로 처리하기
        </button>
      )}

      <p className="copyright"> © XYZ Fitness - 30 days six pack abs</p>

      {showModal && (
        <CompleteModal
          day={day}
          onSave={handleSave}
          onSkip={() => handleSave(null)}
        />
      )}
    </main>
  );
}
