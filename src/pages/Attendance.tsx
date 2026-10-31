import { useState } from 'react';
import { AppState, AttendanceMarkStatus, AttendanceRecord } from '../types';
import { COURSES, getDayName, formatTime12, timeToMinutes } from '../data';
import AttendancePredictor from '../components/AttendancePredictor';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

function getPct(rec: AttendanceRecord) {
  const dl = rec.dutyLeave || 0;
  return rec.total === 0 ? 0 : Math.round(((rec.attended + dl) / rec.total) * 100);
}

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 80) return <span className="font-mono text-[10px] text-green-500 border border-green-500 px-1">[OK]</span>;
  if (pct >= 75) return <span className="font-mono text-[10px] text-yellow-400 border border-yellow-400 px-1">[LOW]</span>;
  return <span className="font-mono text-[10px] text-red-500 border border-red-500 px-1">[CRIT]</span>;
}

function classesNeeded(rec: AttendanceRecord): number | null {
  const pct = getPct(rec);
  if (pct >= 75) return null;
  let effective = rec.attended + (rec.dutyLeave || 0);
  let total = rec.total;
  let needed = 0;
  while (total > 0 && Math.round((effective / total) * 100) < 75) {
    effective++;
    total++;
    needed++;
    if (needed > 200) break;
  }
  return needed;
}

export default function Attendance({ state, update }: Props) {
  const now = new Date();
  const today = getDayName(now);
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const todayClasses = state.timetable
    .filter(e => e.day === today)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const totalAttended = state.attendance.reduce((s, r) => s + r.attended, 0);
  const totalClasses = state.attendance.reduce((s, r) => s + r.total, 0);
  const overallPct = totalClasses === 0 ? 0 : Math.round((totalAttended / totalClasses) * 100);
  const belowThreshold = state.attendance.filter(r => getPct(r) < 75).length;

  function adjust(code: string, delta: number, field: 'attended' | 'total' | 'dutyLeave') {
    update({
      attendance: state.attendance.map(r =>
        r.courseCode === code ? { ...r, [field]: Math.max(0, r[field] + delta) } : r
      ),
    });
  }

  function markToday(classId: string, courseCode: string, status: AttendanceMarkStatus | null) {
    const key = `${dateKey}:${classId}`;
    const previous = state.attendanceMarks?.[key] ?? null;
    if (previous === status) return;

    const existing = state.attendance.find(record => record.courseCode === courseCode);
    const base = existing || { courseCode, attended: 0, total: 0, dutyLeave: 0 };
    let attended = base.attended;
    let total = base.total;

    if (previous === 'present') {
      attended--;
      total--;
    } else if (previous === 'absent') {
      total--;
    }

    if (status === 'present') {
      attended++;
      total++;
    } else if (status === 'absent') {
      total++;
    }

    const nextMarks = { ...(state.attendanceMarks || {}) };
    if (status) nextMarks[key] = status;
    else delete nextMarks[key];

    const nextRecord = {
      ...base,
      attended: Math.max(0, attended),
      total: Math.max(0, total),
    };
    update({
      attendance: existing
        ? state.attendance.map(record => record.courseCode === courseCode ? nextRecord : record)
        : [...state.attendance, nextRecord],
      attendanceMarks: nextMarks,
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border border-[#19222e]">
        {[
          { label: 'OVERALL', value: `${overallPct}%`, sub: `${totalAttended}/${totalClasses} classes` },
          { label: 'ATTENDED', value: totalAttended.toString(), sub: 'total sessions' },
          { label: 'TOTAL', value: totalClasses.toString(), sub: 'scheduled' },
          { label: 'BELOW 75%', value: belowThreshold.toString(), sub: 'subjects at risk', alert: belowThreshold > 0 },
        ].map((item, i) => (
          <div key={i} className={`px-4 py-4 border-r border-[#19222e] last:border-r-0 ${item.alert ? 'bg-[#1a0a0a]' : 'bg-[#0d1219]'}`}>
            <p className="font-mono text-[10px] tracking-widest text-[#4e5e72]">{item.label}</p>
            <p className={`font-mono text-2xl font-semibold mt-1 ${item.alert ? 'text-red-400' : 'text-[#cdd5df]'}`}>{item.value}</p>
            <p className="font-mono text-[10px] text-[#4e5e72] mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Attendance Predictor (AI & Simulation Engine) */}
      <AttendancePredictor state={state} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Subject table */}
        <div className="xl:col-span-2 border border-[#19222e] bg-[#0d1219]">
          <div className="px-4 py-2 border-b border-[#19222e]">
            <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── SUBJECT BREAKDOWN</span>
          </div>
          <div className="divide-y divide-[#19222e]">
            {state.attendance.map(rec => {
              const course = COURSES.find(c => c.code === rec.courseCode);
              const pct = getPct(rec);
              const needed = classesNeeded(rec);
              const barColor = pct >= 80 ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-400' : 'bg-red-500';

              return (
                <div key={rec.courseCode} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-amber-400">{rec.courseCode}</span>
                        <StatusBadge pct={pct} />
                      </div>
                      <p className="text-sm text-[#cdd5df] mt-0.5 truncate">{course?.name}</p>
                      {needed !== null && (
                        <p className="font-mono text-[10px] text-red-400 mt-0.5">
                          Attend {needed} more to reach 75%
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-lg font-semibold text-[#cdd5df]">{pct}%</p>
                      <p className="font-mono text-[10px] text-[#4e5e72]">
                        {rec.attended}/{rec.total}
                        {(rec.dutyLeave || 0) > 0 && <span className="text-blue-400"> +{rec.dutyLeave}DL</span>}
                      </p>
                    </div>
                  </div>
                  <div className="h-1 bg-[#19222e] mb-3">
                    <div className={`h-1 ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-[10px] text-[#4e5e72]">ATTENDED</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => adjust(rec.courseCode, -1, 'attended')} className="w-6 h-6 font-mono text-xs border border-[#19222e] text-[#4e5e72] hover:text-red-400 hover:border-red-400 transition-colors">−</button>
                      <span className="font-mono text-xs text-[#cdd5df] w-8 text-center">{rec.attended}</span>
                      <button onClick={() => adjust(rec.courseCode, 1, 'attended')} className="w-6 h-6 font-mono text-xs border border-[#19222e] text-[#4e5e72] hover:text-green-400 hover:border-green-400 transition-colors">+</button>
                    </div>
                    <span className="font-mono text-[10px] text-[#4e5e72] ml-2">TOTAL</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => adjust(rec.courseCode, -1, 'total')} className="w-6 h-6 font-mono text-xs border border-[#19222e] text-[#4e5e72] hover:text-red-400 hover:border-red-400 transition-colors">−</button>
                      <span className="font-mono text-xs text-[#cdd5df] w-8 text-center">{rec.total}</span>
                      <button onClick={() => adjust(rec.courseCode, 1, 'total')} className="w-6 h-6 font-mono text-xs border border-[#19222e] text-[#4e5e72] hover:text-green-400 hover:border-green-400 transition-colors">+</button>
                    </div>
                    <span className="font-mono text-[10px] text-blue-400 ml-2">DUTY LEAVE</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => adjust(rec.courseCode, -1, 'dutyLeave')} className="w-6 h-6 font-mono text-xs border border-[#19222e] text-[#4e5e72] hover:text-red-400 hover:border-red-400 transition-colors">−</button>
                      <span className="font-mono text-xs text-blue-400 w-8 text-center">{rec.dutyLeave || 0}</span>
                      <button onClick={() => adjust(rec.courseCode, 1, 'dutyLeave')} className="w-6 h-6 font-mono text-xs border border-[#19222e] text-[#4e5e72] hover:text-blue-400 hover:border-blue-400 transition-colors">+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: mark today + calculator */}
        <div className="space-y-4">
          {/* Mark today */}
          <div className="border border-[#19222e] bg-[#0d1219]">
            <div className="px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── MARK TODAY</span>
            </div>
            {todayClasses.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="font-mono text-[10px] text-[#4e5e72]">NO CLASSES TODAY</p>
              </div>
            ) : (
              <div className="divide-y divide-[#19222e]">
                {todayClasses.map(cls => {
                  const marked = state.attendanceMarks?.[`${dateKey}:${cls.id}`] ?? null;
                  return (
                    <div key={cls.id} className="px-4 py-3">
                      <p className="font-mono text-xs text-amber-400">{cls.courseCode}</p>
                      <p className="text-sm text-[#cdd5df]">{formatTime12(cls.startTime)} – {formatTime12(cls.endTime)}</p>
                      <p className="font-mono text-[10px] text-[#4e5e72]">{cls.type} · RM {cls.room}</p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => markToday(cls.id, cls.courseCode, 'present')}
                          className={`flex-1 py-1 font-mono text-[10px] border transition-colors ${marked === 'present' ? 'bg-green-500 border-green-500 text-[#090b0e]' : 'border-[#19222e] text-[#4e5e72] hover:text-green-400 hover:border-green-400'}`}>
                          PRESENT
                        </button>
                        <button
                          onClick={() => markToday(cls.id, cls.courseCode, 'absent')}
                          className={`flex-1 py-1 font-mono text-[10px] border transition-colors ${marked === 'absent' ? 'bg-red-500 border-red-500 text-white' : 'border-[#19222e] text-[#4e5e72] hover:text-red-400 hover:border-red-400'}`}>
                          ABSENT
                        </button>
                        <button
                          onClick={() => markToday(cls.id, cls.courseCode, null)}
                          className={`flex-1 py-1 font-mono text-[10px] border transition-colors ${marked === null ? 'bg-[#19222e] border-[#2a3548] text-[#cdd5df]' : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] hover:border-[#4e5e72]'}`}>
                          NOT MARKED
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Calculator */}
          <AttendanceCalc attendance={state.attendance} />
        </div>
      </div>
    </div>
  );
}

function AttendanceCalc({ attendance }: { attendance: AttendanceRecord[] }) {
  const [selected, setSelected] = useState(attendance[0]?.courseCode || '');
  const rec = attendance.find(r => r.courseCode === selected);

  if (!rec) return null;

  const current = getPct(rec);
  const dl = rec.dutyLeave || 0;
  const effective = rec.attended + dl;
  const ifAbsent = rec.total + 1 === 0 ? 0 : Math.round((effective / (rec.total + 1)) * 100);
  const ifPresent = rec.total + 1 === 0 ? 0 : Math.round(((effective + 1) / (rec.total + 1)) * 100);

  let toReach75 = 0;
  if (current < 75) {
    let a = effective, t = rec.total;
    while (t > 0 && Math.round((a / t) * 100) < 75) { a++; t++; toReach75++; if (toReach75 > 200) break; }
  }

  return (
    <div className="border border-[#19222e] bg-[#0d1219]">
      <div className="px-4 py-2 border-b border-[#19222e]">
        <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── CALCULATOR</span>
      </div>
      <div className="p-4 space-y-3">
        <select value={selected} onChange={e => setSelected(e.target.value)} className="w-full px-2 py-1.5 text-sm font-mono">
          {attendance.map(r => <option key={r.courseCode} value={r.courseCode}>{r.courseCode}</option>)}
        </select>
        <div className="space-y-2">
          <Row label="CURRENT" value={`${current}%`} color={current >= 75 ? 'text-green-400' : 'text-red-400'} />
          <Row label="IF ABSENT NEXT" value={`${ifAbsent}%`} color={ifAbsent >= 75 ? 'text-green-400' : 'text-red-400'} />
          <Row label="IF PRESENT NEXT" value={`${ifPresent}%`} color={ifPresent >= 75 ? 'text-green-400' : 'text-yellow-400'} />
          {toReach75 > 0 && <Row label="CLASSES TO REACH 75%" value={toReach75.toString()} color="text-amber-400" />}
          {current >= 75 && <p className="font-mono text-[10px] text-green-500">■ ATTENDANCE OK</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-[#4e5e72]">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
