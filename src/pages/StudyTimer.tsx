import { useEffect, useState } from 'react';
import { AppState } from '../types';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

const DURATION_PRESETS = [5, 10, 25, 30];

export default function StudyTimer({ state, update }: Props) {
  const timer = state.pomodoro;
  const [, setTick] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');

  const remaining = timer.isRunning && timer.endTime
    ? Math.max(0, Math.ceil((new Date(timer.endTime).getTime() - Date.now()) / 1000))
    : timer.remainingSeconds;
  const duration = timer.mode === 'focus' ? timer.focusDurationSeconds : timer.breakDurationSeconds;
  const progress = Math.max(0, Math.min(100, ((duration - remaining) / duration) * 100));
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');
  const blockProgress = timer.completedSessions % 4;

  useEffect(() => {
    if (!timer.isRunning) return;
    const interval = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timer.isRunning]);

  useEffect(() => {
    if (!timer.isRunning || remaining > 0) return;
    const nextMode = timer.mode === 'focus' ? 'break' : 'focus';
    const nextDuration = nextMode === 'focus' ? timer.focusDurationSeconds : timer.breakDurationSeconds;
    update({
      pomodoro: {
        ...timer,
        mode: nextMode,
        remainingSeconds: nextDuration,
        isRunning: false,
        endTime: null,
        completedSessions: timer.completedSessions + (timer.mode === 'focus' ? 1 : 0),
      },
    });
  }, [remaining, timer.isRunning]);

  function start() {
    update({
      pomodoro: {
        ...timer,
        isRunning: true,
        endTime: new Date(Date.now() + remaining * 1000).toISOString(),
      },
    });
  }

  function pause() {
    update({
      pomodoro: {
        ...timer,
        remainingSeconds: remaining,
        isRunning: false,
        endTime: null,
      },
    });
  }

  function reset() {
    update({
      pomodoro: {
        ...timer,
        remainingSeconds: duration,
        isRunning: false,
        endTime: null,
      },
    });
  }

  function switchMode(mode: 'focus' | 'break') {
    const modeDuration = mode === 'focus' ? timer.focusDurationSeconds : timer.breakDurationSeconds;
    update({
      pomodoro: {
        ...timer,
        mode,
        remainingSeconds: modeDuration,
        isRunning: false,
        endTime: null,
      },
    });
  }

  function selectDuration(minutes: number) {
    const seconds = minutes * 60;
    update({
      pomodoro: {
        ...timer,
        remainingSeconds: seconds,
        focusDurationSeconds: timer.mode === 'focus' ? seconds : timer.focusDurationSeconds,
        breakDurationSeconds: timer.mode === 'break' ? seconds : timer.breakDurationSeconds,
        isRunning: false,
        endTime: null,
      },
    });
    setCustomOpen(false);
    setCustomMinutes('');
  }

  function applyCustomDuration() {
    const minutes = Number(customMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return;
    selectDuration(minutes);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="border border-[#19222e] bg-[#0d1219]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#19222e]">
            <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── POMODORO CONTROL</span>
            <span className={`font-mono text-[10px] ${timer.isRunning ? 'text-green-500' : 'text-[#4e5e72]'}`}>
              {timer.isRunning ? '[ACTIVE]' : '[STANDBY]'}
            </span>
          </div>

          <div className="grid grid-cols-2 border-b border-[#19222e]">
            <button
              onClick={() => switchMode('focus')}
              className={`py-3 font-mono text-xs border-r border-[#19222e] transition-colors ${
                timer.mode === 'focus' ? 'bg-amber-400 text-[#090b0e]' : 'text-[#4e5e72] hover:text-[#cdd5df]'
              }`}>
              FOCUS / {Math.round(timer.focusDurationSeconds / 60)} MIN
            </button>
            <button
              onClick={() => switchMode('break')}
              className={`py-3 font-mono text-xs transition-colors ${
                timer.mode === 'break' ? 'bg-green-500 text-[#090b0e]' : 'text-[#4e5e72] hover:text-[#cdd5df]'
              }`}>
              BREAK / {Math.round(timer.breakDurationSeconds / 60)} MIN
            </button>
          </div>

          <div className="px-4 py-3 border-b border-[#19222e]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] tracking-widest text-[#4e5e72]">SELECT DURATION</span>
              <span className="font-mono text-[9px] text-[#4e5e72]">CURRENT: {Math.round(duration / 60)}M</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {DURATION_PRESETS.map(minutesValue => (
                <button
                  key={minutesValue}
                  onClick={() => selectDuration(minutesValue)}
                  className={`py-2 font-mono text-[10px] border transition-colors ${
                    duration === minutesValue * 60
                      ? 'border-amber-400 bg-[#1c1609] text-amber-400'
                      : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] hover:border-[#222e40]'
                  }`}>
                  {minutesValue}M
                </button>
              ))}
              <button
                onClick={() => setCustomOpen(value => !value)}
                className={`py-2 font-mono text-[10px] border transition-colors ${
                  !DURATION_PRESETS.includes(duration / 60)
                    ? 'border-amber-400 bg-[#1c1609] text-amber-400'
                    : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] hover:border-[#222e40]'
                }`}>
                CUSTOM
              </button>
            </div>
            {customOpen && (
              <div className="flex mt-2">
                <input
                  autoFocus
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  value={customMinutes}
                  onChange={event => setCustomMinutes(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') applyCustomDuration();
                    if (event.key === 'Escape') {
                      setCustomOpen(false);
                      setCustomMinutes('');
                    }
                  }}
                  placeholder="1–180 minutes"
                  className="flex-1 min-w-0 px-3 py-2 font-mono text-xs"
                />
                <button
                  onClick={applyCustomDuration}
                  disabled={!Number.isInteger(Number(customMinutes)) || Number(customMinutes) < 1 || Number(customMinutes) > 180}
                  className="px-5 font-mono text-[10px] border-y border-r border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e] disabled:border-[#19222e] disabled:text-[#2a3548] transition-colors">
                  APPLY
                </button>
              </div>
            )}
          </div>

          <div className="px-6 py-14 sm:py-20 text-center">
            <p className={`font-mono text-7xl sm:text-9xl font-semibold tracking-tighter ${
              timer.mode === 'focus' ? 'text-amber-400' : 'text-green-500'
            }`}>
              {minutes}:{seconds}
            </p>
            <p className="font-mono text-[10px] sm:text-xs tracking-[0.3em] text-[#4e5e72] mt-5">
              {timer.mode === 'focus' ? 'DEEP WORK CYCLE' : 'RECOVERY WINDOW'}
            </p>
            <div className="h-1 bg-[#19222e] mt-8 max-w-xl mx-auto">
              <div
                className={`h-1 transition-all duration-1000 ${timer.mode === 'focus' ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between max-w-xl mx-auto mt-2">
              <span className="font-mono text-[9px] text-[#4e5e72]">{Math.round(progress)}% ELAPSED</span>
              <span className="font-mono text-[9px] text-[#4e5e72]">{Math.ceil(remaining / 60)}M REMAINING</span>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-[#19222e]">
            <button
              onClick={timer.isRunning ? pause : start}
              className={`py-4 font-mono text-sm font-semibold border-r border-[#19222e] transition-colors ${
                timer.isRunning
                  ? 'text-amber-400 hover:bg-amber-400 hover:text-[#090b0e]'
                  : 'bg-amber-400 text-[#090b0e] hover:bg-amber-300'
              }`}>
              {timer.isRunning ? 'PAUSE CYCLE' : remaining < duration ? 'RESUME CYCLE' : 'START CYCLE'}
            </button>
            <button
              onClick={reset}
              className="py-4 font-mono text-sm text-[#4e5e72] hover:text-[#cdd5df] transition-colors">
              RESET PHASE
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-[#19222e] bg-[#0d1219]">
            <div className="px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── SESSION LOG</span>
            </div>
            <div className="p-5">
              <p className="font-mono text-5xl text-[#cdd5df]">{timer.completedSessions.toString().padStart(2, '0')}</p>
              <p className="font-mono text-[10px] text-[#4e5e72] mt-2">FOCUS CYCLES COMPLETED</p>
            </div>
            <div className="grid grid-cols-4 border-t border-[#19222e]">
              {[0, 1, 2, 3].map(index => (
                <div key={index} className={`h-2 border-r border-[#080b0f] last:border-r-0 ${
                  index < blockProgress ? 'bg-amber-400' : 'bg-[#19222e]'
                }`} />
              ))}
            </div>
          </div>

          <div className="border border-[#19222e] bg-[#0d1219]">
            <div className="px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── PROTOCOL</span>
            </div>
            <div className="divide-y divide-[#19222e]">
              {[
                ['01', 'SELECT ONE TASK'],
                ['02', 'FOCUS FOR 25 MIN'],
                ['03', 'BREAK FOR 5 MIN'],
                ['04', 'REPEAT THE CYCLE'],
              ].map(([step, label]) => (
                <div key={step} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-mono text-[10px] text-amber-400">{step}</span>
                  <span className="font-mono text-[10px] text-[#4e5e72]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
