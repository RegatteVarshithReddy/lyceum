import React, { useEffect, useRef, useState } from "react";

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export default function PomodoroTimer() {
  const [phase, setPhase] = useState("work"); // "work" | "break"
  const [secondsLeft, setSecondsLeft] = useState(WORK_SECONDS);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        // phase flip
        setPhase((p) => {
          const next = p === "work" ? "break" : "work";
          return next;
        });
        return 0; // reset below on next tick via phase effect
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  useEffect(() => {
    // whenever phase changes, load the fresh duration for it
    setSecondsLeft(phase === "work" ? WORK_SECONDS : BREAK_SECONDS);
  }, [phase]);

  function reset() {
    setRunning(false);
    setPhase("work");
    setSecondsLeft(WORK_SECONDS);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="pomodoro">
      <span>{phase === "work" ? "Focus" : "Break"}</span>
      <span className="timer">
        {mm}:{ss}
      </span>
      <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setRunning((r) => !r)}>
        {running ? "Pause" : "Start"}
      </button>
      <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={reset}>
        Reset
      </button>
    </div>
  );
}
