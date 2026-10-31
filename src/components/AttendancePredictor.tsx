import { useState, useMemo } from 'react';
import { AppState } from '../types';
import { COURSES } from '../data';
import {
  predictAttendance,
  AttendancePredictionResult,
  PredictorContext,
} from '../utils/attendancePredictor';

interface Props {
  state: AppState;
}

const QUICK_ACTIONS = [
  { label: 'Miss 1 class', query: 'What if I miss 1 class?' },
  { label: 'Miss 2 classes', query: 'What if I miss 2 classes?' },
  { label: 'Attend 2 classes', query: 'What if I attend 2 classes?' },
  { label: 'Attend 5 classes', query: 'What if I attend 5 classes?' },
  { label: 'Calculate bunk limit', query: 'How many classes can I bunk while maintaining 75%?' },
  { label: 'Reach 85%', query: 'How many classes do I need to attend to reach 85%?' },
  { label: 'Reach 90%', query: 'How many classes do I need to attend to reach 90%?' },
  { label: 'Skip tomorrow', query: 'Can I skip classes tomorrow?' },
];

export default function AttendancePredictor({ state }: Props) {
  const [query, setQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<'overall' | string>('overall');
  const [requiredThreshold, setRequiredThreshold] = useState<number>(75);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState<string>('What if I miss 2 classes?');

  // Build predictor context from real application state
  const context: PredictorContext = useMemo(() => ({
    attendance: state.attendance,
    timetable: state.timetable,
    requiredPct: requiredThreshold,
    selectedCourseCode: selectedSubject,
  }), [state.attendance, state.timetable, requiredThreshold, selectedSubject]);

  // Execute prediction reactively
  const result: AttendancePredictionResult = useMemo(() => {
    return predictAttendance(context, lastSubmittedQuery);
  }, [context, lastSubmittedQuery]);

  function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    setLastSubmittedQuery(query.trim());
  }

  function handleQuickAction(actionQuery: string) {
    setQuery(actionQuery);
    setLastSubmittedQuery(actionQuery);
  }

  // Determine badge styling based on result status
  const statusStyles = {
    safe: {
      badge: 'border-green-500 text-green-400 bg-green-500/10',
      label: '[SAFE: ATTENDANCE SECURE]',
      bar: 'bg-green-500',
    },
    warning: {
      badge: 'border-amber-400 text-amber-400 bg-amber-400/10',
      label: '[WARNING: NEAR THRESHOLD]',
      bar: 'bg-amber-400',
    },
    critical: {
      badge: 'border-red-500 text-red-400 bg-red-500/10',
      label: '[CRITICAL: BELOW THRESHOLD]',
      bar: 'bg-red-500',
    },
  }[result.status];

  return (
    <div className="border border-[#19222e] bg-[#0d1219]">
      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-[#19222e] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-400">◈</span>
          <span className="font-mono text-xs font-semibold tracking-wider text-[#cdd5df]">
            ATTENDANCE PREDICTOR
          </span>
          <span className="font-mono text-[9px] bg-[#19222e] text-[#4e5e72] px-1.5 py-0.5 rounded">
            SIMULATION ENGINE
          </span>
        </div>

        {/* Required Threshold Pill */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#4e5e72]">TARGET REQ:</span>
          <div className="flex items-center border border-[#19222e] bg-[#080b0f]">
            {[75, 80, 85].map((thresh) => (
              <button
                key={thresh}
                onClick={() => setRequiredThreshold(thresh)}
                className={`font-mono text-[10px] px-2 py-0.5 transition-colors ${
                  requiredThreshold === thresh
                    ? 'bg-amber-400 text-[#090b0e] font-bold'
                    : 'text-[#4e5e72] hover:text-[#cdd5df]'
                }`}
              >
                {thresh}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Subject Filter Tabs */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] text-[#4e5e72] tracking-wider">
              TARGET SUBJECT SCOPE
            </span>
            <span className="font-mono text-[10px] text-[#4e5e72]">
              {selectedSubject === 'overall' ? 'WEIGHTED OVERALL' : selectedSubject}
            </span>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setSelectedSubject('overall')}
              className={`shrink-0 font-mono text-[11px] px-2.5 py-1 border transition-colors ${
                selectedSubject === 'overall'
                  ? 'border-amber-400 bg-amber-400/10 text-amber-400 font-semibold'
                  : 'border-[#19222e] text-[#4e5e72] hover:border-[#2a3548] hover:text-[#cdd5df]'
              }`}
            >
              OVERALL (ALL)
            </button>
            {state.attendance.map((rec) => {
              const course = COURSES.find((c) => c.code === rec.courseCode);
              const isSelected = selectedSubject === rec.courseCode;
              return (
                <button
                  key={rec.courseCode}
                  onClick={() => setSelectedSubject(rec.courseCode)}
                  className={`shrink-0 font-mono text-[11px] px-2.5 py-1 border transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? 'border-amber-400 bg-amber-400/10 text-amber-400 font-semibold'
                      : 'border-[#19222e] text-[#4e5e72] hover:border-[#2a3548] hover:text-[#cdd5df]'
                  }`}
                  title={course?.name}
                >
                  <span>{rec.courseCode}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Natural Language Query Input */}
        <div>
          <form onSubmit={handleSearch} className="relative flex items-center">
            <div className="absolute left-3 font-mono text-amber-400 text-xs pointer-events-none">
              &gt;
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about your attendance... (e.g. What if I miss the next 2 classes?)"
              className="w-full pl-8 pr-24 py-2.5 bg-[#080b0f] border border-[#19222e] focus:border-amber-400 focus:outline-none font-mono text-xs text-[#cdd5df] placeholder:text-[#384656] transition-colors"
            />
            <div className="absolute right-1 flex items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="font-mono text-[10px] text-[#4e5e72] hover:text-[#cdd5df] px-1.5 py-1"
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                className="font-mono text-[11px] bg-amber-400 text-[#090b0e] hover:bg-amber-300 font-semibold px-3 py-1 transition-colors"
              >
                SIMULATE
              </button>
            </div>
          </form>
          <p className="font-mono text-[10px] text-[#4e5e72] mt-1.5">
            Predict your attendance before you decide to miss a class. Deterministic calculations powered by your real records.
          </p>
        </div>

        {/* Quick Action Chips */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="font-mono text-[9px] text-[#4e5e72] tracking-wider">
              QUICK SCENARIOS:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.query)}
                className="font-mono text-[10px] px-2 py-1 bg-[#080b0f] border border-[#19222e] text-[#8696a7] hover:text-amber-400 hover:border-amber-400/60 transition-colors"
              >
                + {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule Context Banner (if query involved tomorrow or scheduled day) */}
        {result.scheduleDetails && (
          <div className="p-3 bg-[#080b0f] border border-[#19222e] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-amber-400">📅</span>
              <span className="font-mono text-xs text-[#cdd5df]">
                {result.scheduleDetails.isTomorrow ? 'Tomorrow' : result.scheduleDetails.day}:{' '}
                <strong className="text-amber-400">{result.scheduleDetails.classCount}</strong>{' '}
                classes scheduled
              </span>
            </div>
            {result.scheduleDetails.classes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.scheduleDetails.classes.map((cls, idx) => (
                  <span
                    key={idx}
                    className="font-mono text-[9px] bg-[#19222e] text-[#8696a7] px-1.5 py-0.5"
                  >
                    {cls.courseCode} ({cls.startTime})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PREDICTION RESULTS PANEL */}
        <div className="border border-[#19222e] bg-[#080b0f] p-4 space-y-4">
          {/* Result Header & Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#19222e] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#4e5e72]">TARGET:</span>
                <span className="font-mono text-xs font-semibold text-amber-400">
                  {result.scopeName}
                </span>
              </div>
              <p className="font-mono text-[11px] text-[#cdd5df] mt-1 font-medium">
                {result.summary}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-[11px] px-2.5 py-0.5 border font-semibold ${statusStyles.badge}`}
              >
                {statusStyles.label}
              </span>
            </div>
          </div>

          {/* Dual Visual Comparison: Current vs Projected */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Current attendance card */}
            <div className="p-3 border border-[#19222e] bg-[#0d1219]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#4e5e72]">CURRENT ATTENDANCE</span>
                <span className="font-mono text-xs font-semibold text-[#8696a7]">BASELINE</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-mono text-3xl font-bold text-[#cdd5df]">
                  {result.currentPct.toFixed(2)}%
                </span>
                <span className="font-mono text-xs text-[#4e5e72]">
                  ({result.currentAttended + result.currentDutyLeave}/{result.currentTotal} sessions)
                </span>
              </div>
              {/* Progress bar with 75% threshold marker */}
              <div className="relative h-2 bg-[#19222e] mt-2.5 rounded-none overflow-hidden">
                <div
                  className="h-full bg-blue-500/80 transition-all duration-300"
                  style={{ width: `${Math.min(100, result.currentPct)}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-400/80 z-10"
                  style={{ left: `${requiredThreshold}%` }}
                  title={`Required: ${requiredThreshold}%`}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-[#4e5e72] mt-1">
                <span>0%</span>
                <span className="text-red-400">Threshold: {requiredThreshold}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Projected attendance card */}
            <div
              className={`p-3 border ${
                result.isSafe ? 'border-[#19222e]' : 'border-red-500/50'
              } bg-[#0d1219]`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#4e5e72]">PROJECTED ATTENDANCE</span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    result.pctDelta > 0
                      ? 'text-green-400'
                      : result.pctDelta < 0
                      ? 'text-red-400'
                      : 'text-[#8696a7]'
                  }`}
                >
                  {result.pctDelta > 0 ? `+${result.pctDelta.toFixed(2)}%` : `${result.pctDelta.toFixed(2)}%`}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`font-mono text-3xl font-bold ${
                    result.projectedPct >= 80
                      ? 'text-green-400'
                      : result.projectedPct >= requiredThreshold
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  }`}
                >
                  {result.projectedPct.toFixed(2)}%
                </span>
                <span className="font-mono text-xs text-[#4e5e72]">
                  ({result.projectedAttended + result.projectedDutyLeave}/{result.projectedTotal} sessions)
                </span>
              </div>
              {/* Progress bar with 75% threshold marker */}
              <div className="relative h-2 bg-[#19222e] mt-2.5 rounded-none overflow-hidden">
                <div
                  className={`h-full ${statusStyles.bar} transition-all duration-300`}
                  style={{ width: `${Math.min(100, result.projectedPct)}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-400/80 z-10"
                  style={{ left: `${requiredThreshold}%` }}
                  title={`Required: ${requiredThreshold}%`}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-[#4e5e72] mt-1">
                <span>0%</span>
                <span className="text-red-400">Req: {requiredThreshold}%</span>
                <span>
                  Margin:{' '}
                  <strong
                    className={
                      result.projectedPct >= requiredThreshold ? 'text-green-400' : 'text-red-400'
                    }
                  >
                    {(result.projectedPct - requiredThreshold).toFixed(2)}%
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Key Simulation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#19222e]">
            <div className="p-2.5 bg-[#0d1219] border border-[#19222e]">
              <p className="font-mono text-[9px] text-[#4e5e72]">SESSIONS ATTENDED</p>
              <p className="font-mono text-sm font-semibold text-[#cdd5df] mt-0.5">
                {result.currentAttended + result.currentDutyLeave} →{' '}
                <span className="text-amber-400">
                  {result.projectedAttended + result.projectedDutyLeave}
                </span>
              </p>
            </div>
            <div className="p-2.5 bg-[#0d1219] border border-[#19222e]">
              <p className="font-mono text-[9px] text-[#4e5e72]">SESSIONS MISSED</p>
              <p className="font-mono text-sm font-semibold text-[#cdd5df] mt-0.5">
                {result.currentMissed} →{' '}
                <span className="text-red-400">{result.projectedMissed}</span>
              </p>
            </div>
            <div className="p-2.5 bg-[#0d1219] border border-[#19222e]">
              <p className="font-mono text-[9px] text-[#4e5e72]">PROJECTED TOTAL</p>
              <p className="font-mono text-sm font-semibold text-[#cdd5df] mt-0.5">
                {result.currentTotal} →{' '}
                <span className="text-blue-400">{result.projectedTotal}</span>
              </p>
            </div>
            <div className="p-2.5 bg-[#0d1219] border border-[#19222e]">
              <p className="font-mono text-[9px] text-[#4e5e72]">BUNK HEADROOM</p>
              <p className="font-mono text-sm font-semibold text-[#cdd5df] mt-0.5">
                {result.bunkLimit !== undefined ? (
                  <span className={result.bunkLimit > 0 ? 'text-green-400' : 'text-red-400'}>
                    {result.bunkLimit} {result.bunkLimit === 1 ? 'class' : 'classes'}
                  </span>
                ) : result.classesNeeded !== undefined ? (
                  <span className="text-amber-400">
                    +{result.classesNeeded} needed
                  </span>
                ) : (
                  <span className="text-[#8696a7]">N/A</span>
                )}
              </p>
            </div>
          </div>

          {/* Mathematical Explanation & Calculation Breakdown */}
          <div className="p-3 bg-[#0d1219] border border-[#19222e] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-[#4e5e72] tracking-wider">
                ── DETERMINISTIC CALCULATION EXPLANATION
              </span>
              <span className="font-mono text-[9px] text-green-400">✓ VERIFIED FORMULA</span>
            </div>
            <p className="font-mono text-xs text-[#cdd5df] leading-relaxed">
              {result.explanation}
            </p>
            <div className="pt-1.5 border-t border-[#19222e]/60 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9px] text-[#4e5e72]">MATH PROJECTION:</span>
              <code className="font-mono text-[10px] bg-[#080b0f] px-2 py-0.5 border border-[#19222e] text-amber-400">
                {result.formula}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

