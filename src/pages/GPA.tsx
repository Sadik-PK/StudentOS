import { useState } from 'react';
import { AppState, GPAGrade } from '../types';
import { COURSES, GRADE_POINTS } from '../data';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

const GRADES = Object.keys(GRADE_POINTS);

function calcGPA(grades: GPAGrade[]): { gpa: number; totalCredits: number; earnedCredits: number } {
  let totalPoints = 0;
  let totalCredits = 0;
  let earnedCredits = 0;

  for (const g of grades) {
    const course = COURSES.find(c => c.code === g.courseCode);
    if (!course || !g.grade || !(g.grade in GRADE_POINTS)) continue;
    const pts = GRADE_POINTS[g.grade];
    totalPoints += pts * course.credits;
    totalCredits += course.credits;
    if (pts >= 4) earnedCredits += course.credits;
  }

  return {
    gpa: totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : 0,
    totalCredits,
    earnedCredits,
  };
}

function gpaColor(gpa: number): string {
  if (gpa >= 8) return 'text-green-400';
  if (gpa >= 6) return 'text-amber-400';
  if (gpa >= 4) return 'text-yellow-400';
  return 'text-red-400';
}

export default function GPA({ state, update }: Props) {
  const [targetGPA, setTargetGPA] = useState('');
  const { gpa, totalCredits, earnedCredits } = calcGPA(state.gpaGrades);
  const totalCourseCredits = COURSES.reduce((s, c) => s + c.credits, 0);

  function setGrade(courseCode: string, grade: string) {
    const existing = state.gpaGrades.some(g => g.courseCode === courseCode);
    if (!existing && !grade) return;
    update({
      gpaGrades: existing
        ? state.gpaGrades.map(g =>
            g.courseCode === courseCode ? { ...g, grade } : g,
          )
        : [...state.gpaGrades, { courseCode, grade }],
    });
  }

  function clearAll() {
    update({ gpaGrades: [] });
  }

  const target = parseFloat(targetGPA);
  const filledGrades = state.gpaGrades.filter(g => g.grade && g.grade in GRADE_POINTS);
  const filledCredits = filledGrades.reduce((s, g) => {
    const c = COURSES.find(c => c.code === g.courseCode);
    return s + (c?.credits || 0);
  }, 0);
  const filledPoints = filledGrades.reduce((s, g) => {
    const c = COURSES.find(c => c.code === g.courseCode);
    return s + (c?.credits || 0) * (GRADE_POINTS[g.grade] || 0);
  }, 0);

  const remainingCredits = totalCourseCredits - filledCredits;
  const neededPoints = !isNaN(target) && target > 0 && remainingCredits > 0
    ? (target * totalCourseCredits - filledPoints) / remainingCredits
    : null;

  const gradeDistribution = GRADES.map(g => ({
    grade: g,
    count: state.gpaGrades.filter(x => x.grade === g).length,
  })).filter(x => x.count > 0);

  return (
    <div className="p-6 space-y-6">
      {/* GPA display */}
      <div className="border border-[#19222e] bg-[#0d1219] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-[#4e5e72] mb-1">── SEMESTER GPA</p>
            <p className={`font-mono text-6xl font-bold ${gpaColor(gpa)}`}>{gpa.toFixed(2)}</p>
            <p className="font-mono text-xs text-[#4e5e72] mt-2">
              {totalCredits}/{totalCourseCredits} credits graded · {earnedCredits} earned
            </p>
          </div>
          <div className="text-right space-y-2">
            {gradeDistribution.map(d => (
              <div key={d.grade} className="flex items-center justify-end gap-2">
                <span className="font-mono text-[10px] text-[#4e5e72]">{d.count}× </span>
                <span className="font-mono text-xs text-[#cdd5df]">{d.grade}</span>
                <div className="h-2 bg-amber-400" style={{ width: `${d.count * 12}px` }} />
              </div>
            ))}
            {gradeDistribution.length === 0 && (
              <p className="font-mono text-[10px] text-[#4e5e72]">No grades set</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Grade table */}
        <div className="xl:col-span-2 border border-[#19222e] bg-[#0d1219]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
            <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── COURSE GRADES</span>
            <button onClick={clearAll} className="font-mono text-[10px] text-[#4e5e72] hover:text-red-400 transition-colors">CLEAR ALL</button>
          </div>
          <div className="divide-y divide-[#19222e]">
            {COURSES.map(course => {
              const gradeEntry = state.gpaGrades.find(g => g.courseCode === course.code);
              const grade = gradeEntry?.grade || '';
              const pts = grade in GRADE_POINTS ? GRADE_POINTS[grade] : null;
              const contribution = pts !== null ? (pts * course.credits) / totalCourseCredits : null;

              return (
                <div key={course.code} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-amber-400">{course.code}</p>
                    <p className="text-sm text-[#cdd5df] truncate">{course.name}</p>
                    <p className="font-mono text-[10px] text-[#4e5e72]">{course.credits} credits</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {contribution !== null && (
                      <span className="font-mono text-[10px] text-[#4e5e72]">+{contribution.toFixed(2)}</span>
                    )}
                    {pts !== null && (
                      <span className="font-mono text-xs text-[#4e5e72]">{pts} pts</span>
                    )}
                    <select
                      value={grade}
                      onChange={e => setGrade(course.code, e.target.value)}
                      className="px-2 py-1.5 font-mono text-sm w-24">
                      <option value="">─</option>
                      {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Calculator + info */}
        <div className="space-y-4">
          {/* Grade scale */}
          <div className="border border-[#19222e] bg-[#0d1219]">
            <div className="px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── GRADE SCALE</span>
            </div>
            <div className="divide-y divide-[#19222e]">
              {GRADES.map(g => (
                <div key={g} className="flex items-center justify-between px-4 py-1.5">
                  <span className="font-mono text-xs text-[#cdd5df]">{g}</span>
                  <span className="font-mono text-xs text-[#4e5e72]">{GRADE_POINTS[g]} pts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Target GPA calculator */}
          <div className="border border-[#19222e] bg-[#0d1219] p-4 space-y-3">
            <p className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── WHAT GPA DO I NEED?</p>
            <div>
              <label className="font-mono text-[10px] text-[#4e5e72] block mb-1">TARGET GPA</label>
              <input
                type="number" min="0" max="10" step="0.1"
                value={targetGPA}
                onChange={e => setTargetGPA(e.target.value)}
                className="w-full px-2 py-1.5 text-sm font-mono"
                placeholder="e.g. 8.0"
              />
            </div>
            {neededPoints !== null && (
              <div className="space-y-2 pt-2 border-t border-[#19222e]">
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-[#4e5e72]">REMAINING CREDITS</span>
                  <span className="font-mono text-xs text-[#cdd5df]">{remainingCredits}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-[#4e5e72]">NEEDED AVG PTS</span>
                  <span className={`font-mono text-xs ${neededPoints > 10 ? 'text-red-400' : neededPoints <= 0 ? 'text-green-400' : 'text-amber-400'}`}>
                    {neededPoints > 10 ? 'NOT ACHIEVABLE' : neededPoints <= 0 ? 'ALREADY REACHED' : neededPoints.toFixed(2)}
                  </span>
                </div>
                {neededPoints > 0 && neededPoints <= 10 && (
                  <p className="font-mono text-[10px] text-[#4e5e72]">
                    Needs avg of {neededPoints.toFixed(2)} pts ({GRADES.find(g => GRADE_POINTS[g] >= neededPoints) || 'O'} or better) across remaining courses.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
