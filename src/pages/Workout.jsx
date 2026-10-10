import { useEffect, useRef, useState } from "react";
import { loadYouTubeAPI } from "../youtube.js";
import { getPlaylistId } from "../admin.js";
import { todayWorkoutDay, todayKey, saveRecord } from "../storage.js";
import CompleteModal from "../components/CompleteModal.jsx";
import { startWorkoutSession, completeWorkout, uploadPhoto } from "../api.js";
import { toast } from "../toast.js";
import { Button, Card, CardTitle, Page, PageTitle, Sub } from "../components/ui.jsx";

const FINISH_RATIO = 0.8; // 영상 80% 이상 시청 시 수동 완료 버튼 활성화

export default function Workout({ onDone, session }) {
  const holderRef = useRef(null);
  const playerRef = useRef(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const startIndexRef = useRef(null); // 실제 시작 인덱스 (요청 인덱스가 클램프될 수 있어 기록)
  const sessionRef = useRef(null); // 서버 시청 세션 id (Promise) — 회원만
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
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
            // (영상 수가 부족하면 YouTube가 인덱스를 클램프할 수 있어 최소 0으로 보정)
            e.target.cuePlaylist({
              listType: "playlist",
              list: playlistId,
              index: Math.max(0, day - 1),
            });
          },
          onStateChange: (e) => {
            const YTState = window.YT.PlayerState;
            if (finishedRef.current) return;
            if (e.data === YTState.PLAYING) {
              const idx = e.target.getPlaylistIndex();
              if (startIndexRef.current === null) {
                // 첫 재생: 실제 시작 인덱스를 기준으로 저장 (요청 인덱스 클램프 대비)
                startIndexRef.current = idx;
                startedRef.current = true;
                // 회원: 서버에 시청 시작 기록 (완료 시 서버가 경과 시간으로 검증)
                if (session) sessionRef.current = startWorkoutSession(e.target.getDuration());
              } else if (startedRef.current && idx !== startIndexRef.current) {
                // 다음 영상으로 자동 전환됨 = 오늘 영상 끝
                e.target.pauseVideo();
                finish();
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

  function closeAndReturn() {
    setSaving(false);
    setShowModal(false);
    onDone();
  }

  async function handleSave(photo) {
    const record = (dateKey, extra = {}) =>
      saveRecord(dateKey, {
        completed: true,
        completedAt: new Date().toISOString(),
        day,
        ...(photo ? { photo } : {}),
        ...extra,
      });

    // 비회원: 기기에만 저장
    if (!session) {
      record(todayKey());
      return closeAndReturn();
    }

    setSaving(true);
    const sessionId = await sessionRef.current?.catch(() => null);
    if (!sessionId) {
      record(todayKey());
      toast("시청 기록을 서버에 남기지 못해 이 기기에만 저장했어요.");
      return closeAndReturn();
    }
    try {
      const dateKey = await completeWorkout(sessionId);
      record(dateKey);
      if (photo) {
        uploadPhoto(dateKey, photo).then((url) => {
          if (!url) toast("인증샷 서버 업로드에 실패했어요. 사진은 이 기기에만 저장돼요.");
        });
      }
      closeAndReturn();
    } catch (e) {
      if (e.retryable) {
        // 연결 문제: 기기에 먼저 저장하고 다음 접속 때 다시 기록 (App → retryPendingCompletions)
        record(todayKey(), { pendingSession: sessionId });
        toast("서버 연결이 불안정해 이 기기에 먼저 저장했어요. 다음 접속 때 다시 기록할게요.");
        return closeAndReturn();
      }
      // 서버가 거절(시청 시간 부족 등): 기록하지 않고 계속 시청할 수 있게 되돌림
      toast(e.message);
      finishedRef.current = false;
      setSaving(false);
      setShowModal(false);
    }
  }

  return (
    <Page>
      <PageTitle>Day {day} 복근 운동</PageTitle>
      <Sub>영상이 끝나면 자동으로 운동 완료 처리돼요.</Sub>

      <div className="relative -mx-5 mt-4 bg-black">
        <span className="pointer-events-none absolute top-3 left-3 z-2 rounded-full bg-brand px-3 py-1 text-sm font-extrabold text-white">
          DAY {day}
        </span>
        {/* YouTube API가 holder div를 iframe으로 교체하므로 자식 iframe에도 같은 배치 적용 */}
        <div className="relative aspect-video w-full [&>*]:absolute [&>*]:inset-0 [&>*]:size-full">
          <div ref={holderRef} />
        </div>
      </div>

      <Card>
        <CardTitle>오늘의 루틴</CardTitle>
        <Sub className="mt-1.5">
          중간에 나가면 완료로 기록되지 않아요. 끝까지 함께해요! 💪
        </Sub>
      </Card>

      {canFinish && (
        <Button className="mt-5" onClick={finish}>
          운동 완료
        </Button>
      )}

      {import.meta.env.DEV && (
        <button className="mx-auto mt-5 block text-xs text-dim underline" onClick={finish}>
          (개발용) 영상 끝까지 본 것으로 처리하기
        </button>
      )}

      <p className="mt-6 text-center text-2xs text-dim opacity-80"> © XYZ Fitness - 30 days six pack abs</p>

      {showModal && (
        <CompleteModal
          day={day}
          busy={saving}
          onSave={handleSave}
          onSkip={() => handleSave(null)}
        />
      )}
    </Page>
  );
}
