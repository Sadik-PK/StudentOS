import { useState, useEffect, useRef } from 'react';
import { AppState, DashboardSection, TodoItem } from '../types';
import { COURSES, DEFAULT_DASHBOARD_ORDER, formatTime12, getDayName, timeToMinutes } from '../data';

interface Props { state: AppState; onNavigate: (page: string) => void; update: (p: Partial<AppState>) => void; }

const DASHBOARD_SECTION_LABELS: Record<DashboardSection, string> = {
  nextClass: "Next class",
  todaySchedule: "Today's schedule",
  semesterProgress: "Semester progress",
  expenses: "Expenses",
  attendance: "Attendance",
  assignments: "Assignments",
  exams: "Exams",
  todos: "To-do",
}

function getDashboardOrder(order?: DashboardSection[]) {
  const valid = new Set(DEFAULT_DASHBOARD_ORDER)
  const saved = (order ?? []).filter(
    (section) => valid.has(section) && order?.indexOf(section) === order?.lastIndexOf(section),
  )
  return [
    ...saved,
    ...DEFAULT_DASHBOARD_ORDER.filter((section) => !saved.includes(section)),
  ]
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function getAttendancePct(attended: number, total: number, dutyLeave = 0) {
  return total === 0 ? 0 : Math.round(((attended + dutyLeave) / total) * 100);
}

function AttendanceStatus({ pct }: { pct: number }) {
  if (pct >= 80) return <span className="font-mono text-xs text-green-500">[OK]</span>;
  if (pct >= 75) return <span className="font-mono text-xs text-yellow-400">[LOW]</span>;
  return <span className="font-mono text-xs text-red-500">[CRIT]</span>;
}

export default function Dashboard({ state, onNavigate, update }: Props) {
  const [arranging, setArranging] = useState(false)
  const dashboardOrder = getDashboardOrder(state.settings.dashboardOrder)
  const now = useNow();
  const todayName = getDayName(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayClasses = state.timetable
    .filter(e => e.day === todayName)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const greeting = now.getHours() < 12 ? 'GOOD MORNING' : now.getHours() < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';

  const nextClass = todayClasses.find(e => timeToMinutes(e.endTime) > nowMinutes);

  function classStatus(e: typeof todayClasses[0]) {
    const start = timeToMinutes(e.startTime);
    const end = timeToMinutes(e.endTime);
    if (nowMinutes > end) return 'done';
    if (nowMinutes >= start) return 'active';
    return 'upcoming';
  }

  function countdown(endTime: string) {
    const endMin = timeToMinutes(endTime);
    const diff = endMin - nowMinutes;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const upcomingAssignments = state.assignments
    .filter(a => !a.completed && new Date(a.dueDate) >= new Date(now.toDateString()))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3);

  const upcomingExams = state.exams
    .filter(e => new Date(e.date) >= new Date(now.toDateString()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  const semStart = new Date(state.settings.semesterStartDate);
  const semEnd = new Date(state.settings.semesterEndDate);
  const semTotal = semEnd.getTime() - semStart.getTime();
  const semElapsed = now.getTime() - semStart.getTime();
  const semPct = Number.isFinite(semTotal) && semTotal > 0
    ? Math.max(0, Math.min(100, Math.round((semElapsed / semTotal) * 100)))
    : 0;

  const lowAttendance = state.attendance.filter(a => getAttendancePct(a.attended, a.total, a.dutyLeave) < 75).length;

  const expenses = state.expenses || [];
  const currentMonth = now.toISOString().slice(0, 7);
  const monthlyExpenses = expenses.filter(expense => expense.date.startsWith(currentMonth));
  const monthlySpend = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const recentExpenses = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const expenseCategoryColors: Record<string, string> = {
    food: '#e8a020',
    transport: '#3b82f6',
    study: '#a78bfa',
    housing: '#1ea854',
    health: '#ef4444',
    entertainment: '#ec4899',
    other: '#4e5e72',
  };
  const customExpenseColors = ['#22d3ee', '#f97316', '#84cc16', '#facc15', '#c084fc', '#14b8a6'];
  const monthlyByCategory = Array.from(new Set(monthlyExpenses.map(expense => expense.category)))
    .map(category => ({
      category,
      total: monthlyExpenses
        .filter(expense => expense.category === category)
        .reduce((sum, expense) => sum + expense.amount, 0),
    }))
    .sort((a, b) => b.total - a.total);
  let expenseAngle = 0;
  const expensePieSegments = monthlyByCategory.map(item => {
    const start = expenseAngle;
    expenseAngle += monthlySpend > 0 ? (item.total / monthlySpend) * 360 : 0;
    const customIndex = state.customExpenseCategories?.findIndex(category => category.id === item.category) ?? -1;
    const color = expenseCategoryColors[item.category]
      || customExpenseColors[Math.max(0, customIndex) % customExpenseColors.length];
    return `${color} ${start}deg ${expenseAngle}deg`;
  });
  const expensePieBackground = monthlySpend > 0
    ? `conic-gradient(${expensePieSegments.join(', ')})`
    : '#19222e';

  function expenseCategoryLabel(categoryId: string) {
    const builtIn: Record<string, string> = {
      food: 'FOOD',
      transport: 'TRANSPORT',
      study: 'STUDY',
      housing: 'HOUSING',
      health: 'HEALTH',
      entertainment: 'ENTERTAINMENT',
      other: 'OTHER',
    };
    return builtIn[categoryId]
      || state.customExpenseCategories?.find(category => category.id === categoryId)?.label
      || 'OTHER';
  }

  function formatExpense(value: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  }

  function daysUntil(dateStr: string) {
    const d = new Date(dateStr);
    const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    return diff;
  }

  const typeColor: Record<string, string> = {
    Lecture: 'text-blue-400',
    Tutorial: 'text-amber-400',
    Practical: 'text-purple-400',
  };

  const priorityColor: Record<string, string> = {
    high: 'text-red-400',
    medium: 'text-amber-400',
    low: 'text-green-500',
  };

  function moveDashboardSection(section: DashboardSection, direction: -1 | 1) {
    const current = [...dashboardOrder]
    const index = current.indexOf(section)
    const destination = index + direction
    if (destination < 0 || destination >= current.length) return
    ;[current[index], current[destination]] = [
      current[destination],
      current[index],
    ]
    update({
      settings: {
        ...state.settings,
        dashboardOrder: current,
      },
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Greeting */}
      <div className="border-b border-[#19222e] pb-4">
        <p className="font-mono text-xs text-[#4e5e72] tracking-widest mb-1">{greeting}</p>
        <h1 className="text-2xl font-semibold text-[#cdd5df]">{state.settings.profileName}</h1>
        <p className="font-mono text-xs text-[#4e5e72] mt-1">
          {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          {' · '}
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Alert row */}
      {lowAttendance > 0 && (
        <div className="flex items-center gap-3 bg-[#1a0a0a] border border-[#5c1a1a] px-4 py-2">
          <span className="font-mono text-xs text-red-500">▲ ALERT</span>
          <span className="text-sm text-[#cdd5df]">{lowAttendance} subject{lowAttendance > 1 ? 's' : ''} below 75% attendance threshold</span>
          <button onClick={() => onNavigate('attendance')} className="ml-auto font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">→ REVIEW</button>
        </div>
      )}

      <div className="flex items-center justify-between border border-[#19222e] bg-[#0d1219] px-4 py-2">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-[#cdd5df]">
            DASHBOARD LAYOUT
          </p>
          <p className="font-mono text-[9px] text-[#4e5e72] mt-1">
            Arrange sections in your preferred order.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setArranging((value) => !value)}
          aria-expanded={arranging}
          className="font-mono text-[10px] border border-amber-400 px-3 py-1.5 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e] transition-colors"
        >
          {arranging ? "DONE" : "ARRANGE"}
        </button>
      </div>

      {arranging && (
        <div className="border border-[#19222e] bg-[#0d1219] p-3 space-y-1">
          {dashboardOrder.map((section, index) => (
            <div
              key={section}
              className="flex items-center justify-between gap-3 border-b border-[#19222e] last:border-0 py-2"
            >
              <span className="font-mono text-xs text-[#cdd5df]">
                <span className="text-[#4e5e72] mr-2">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {DASHBOARD_SECTION_LABELS[section]}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={`Move ${DASHBOARD_SECTION_LABELS[section]} up`}
                  disabled={index === 0}
                  onClick={() => moveDashboardSection(section, -1)}
                  className="border border-[#2a3548] px-2 py-1 font-mono text-xs text-[#cdd5df] hover:border-amber-400 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${DASHBOARD_SECTION_LABELS[section]} down`}
                  disabled={index === dashboardOrder.length - 1}
                  onClick={() => moveDashboardSection(section, 1)}
                  className="border border-[#2a3548] px-2 py-1 font-mono text-xs text-[#cdd5df] hover:border-amber-400 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
          <p className="font-mono text-[9px] text-[#4e5e72] pt-2">
            Layout changes are saved automatically to your account.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="contents">
          {/* Next class */}
          <div
            style={{ order: dashboardOrder.indexOf("nextClass") }}
            className="border border-[#19222e] bg-[#0d1219]"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── NEXT CLASS</span>
              <span className="font-mono text-[10px] text-[#4e5e72]">{todayName.toUpperCase()}</span>
            </div>
            {nextClass ? (
              <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="font-mono text-amber-400 text-sm font-semibold">{nextClass.courseCode}</p>
                  <p className="text-[#cdd5df] font-medium mt-0.5">{nextClass.courseName}</p>
                  <p className={`font-mono text-xs mt-1 ${typeColor[nextClass.type]}`}>{nextClass.type.toUpperCase()}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="font-mono text-sm text-[#cdd5df]">{formatTime12(nextClass.startTime)} – {formatTime12(nextClass.endTime)}</p>
                  <p className="font-mono text-xs text-[#4e5e72]">RM {nextClass.room}</p>
                  {nextClass.group && <p className="font-mono text-xs text-[#4e5e72]">{nextClass.group}</p>}
                  {classStatus(nextClass) === 'active' && countdown(nextClass.endTime) && (
                    <p className="font-mono text-xs text-green-400 mt-2">IN PROGRESS · {countdown(nextClass.endTime)} left</p>
                  )}
                  {classStatus(nextClass) === 'upcoming' && (
                    <p className="font-mono text-xs text-amber-400 mt-2">IN {countdown(nextClass.endTime)}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="font-mono text-[#4e5e72] text-sm">NO MORE CLASSES TODAY</p>
              </div>
            )}
          </div>

          {/* Today's schedule */}
          <div
            style={{ order: dashboardOrder.indexOf("todaySchedule") }}
            className="border border-[#19222e] bg-[#0d1219]"
          >
            <div className="px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── TODAY'S SCHEDULE</span>
            </div>
            {todayClasses.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="font-mono text-[#4e5e72] text-sm">NO CLASSES SCHEDULED</p>
              </div>
            ) : (
              <div className="divide-y divide-[#19222e]">
                {todayClasses.map(cls => {
                  const status = classStatus(cls);
                  return (
                    <div key={cls.id} className={`flex items-center gap-4 px-4 py-3 transition-colors ${status === 'active' ? 'bg-[#0f1a10]' : status === 'done' ? 'opacity-40' : ''}`}>
                      <div className="w-1 self-stretch">
                        {status === 'active' && <div className="w-1 h-full bg-green-500" />}
                        {status === 'upcoming' && <div className="w-1 h-full bg-amber-400" />}
                        {status === 'done' && <div className="w-1 h-full bg-[#19222e]" />}
                      </div>
                      <div className="font-mono text-xs text-[#4e5e72] w-28 shrink-0">
                        {formatTime12(cls.startTime)}<br />{formatTime12(cls.endTime)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-amber-400">{cls.courseCode}</span>
                        <span className="mx-2 text-[#19222e]">|</span>
                        <span className="text-sm text-[#cdd5df]">{cls.courseName}</span>
                        {cls.note && <span className="ml-2 font-mono text-[10px] text-red-400">[{cls.note}]</span>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono text-[10px] ${typeColor[cls.type]}`}>{cls.type.toUpperCase()}</p>
                        <p className="font-mono text-[10px] text-[#4e5e72]">RM {cls.room}</p>
                      </div>
                      <div className="shrink-0 font-mono text-[10px]">
                        {status === 'done' && <span className="text-[#4e5e72]">DONE</span>}
                        {status === 'active' && <span className="text-green-400">ACTIVE</span>}
                        {status === 'upcoming' && <span className="text-amber-400">UP NEXT</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="contents">
          {/* Semester progress */}
          <div
            style={{ order: dashboardOrder.indexOf("semesterProgress") }}
            className="border border-[#19222e] bg-[#0d1219] p-4"
          >
            <p className="font-mono text-[10px] tracking-widest text-[#4e5e72] mb-3">── SEMESTER PROGRESS</p>
            <div className="flex items-end justify-between mb-2">
              <span className="font-mono text-2xl text-[#cdd5df]">{semPct}<span className="text-sm">%</span></span>
              <span className="font-mono text-xs text-[#4e5e72]">SEM 1</span>
            </div>
            <div className="h-1 bg-[#19222e] w-full">
              <div className="h-1 bg-amber-400 transition-all" style={{ width: `${semPct}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[10px] text-[#4e5e72]">{state.settings.semesterStartDate}</span>
              <span className="font-mono text-[10px] text-[#4e5e72]">{state.settings.semesterEndDate}</span>
            </div>
          </div>

          {/* Expense summary */}
          <div
            style={{ order: dashboardOrder.indexOf("expenses") }}
            className="border border-[#19222e] bg-[#0d1219]"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── EXPENSES</span>
              <button onClick={() => onNavigate('expenses')} className="font-mono text-[10px] text-amber-400 hover:text-amber-300 transition-colors">VIEW ALL →</button>
            </div>
            <div className="p-4 flex items-center gap-4 border-b border-[#19222e]">
              <div
                className="relative w-16 h-16 rounded-full shrink-0 border border-[#222e40]"
                style={{ background: expensePieBackground }}
                role="img"
                aria-label="Current month expense distribution">
                <div className="absolute inset-4 rounded-full bg-[#0d1219] border border-[#19222e]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] tracking-widest text-[#4e5e72]">THIS MONTH</p>
                <p className="font-mono text-xl text-amber-400 mt-1 truncate">{formatExpense(monthlySpend)}</p>
                <p className="font-mono text-[10px] text-[#4e5e72] mt-1">
                  {monthlyExpenses.length} TRANSACTION{monthlyExpenses.length === 1 ? '' : 'S'}
                  {monthlyByCategory[0] && ` · TOP: ${expenseCategoryLabel(monthlyByCategory[0].category)}`}
                </p>
              </div>
            </div>
            {recentExpenses.length === 0 ? (
              <div className="px-4 py-4 text-center">
                <p className="font-mono text-[10px] text-[#4e5e72]">NO EXPENSES LOGGED</p>
              </div>
            ) : (
              <div className="divide-y divide-[#19222e]">
                {recentExpenses.map(expense => (
                  <div key={expense.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[#cdd5df] truncate">{expense.description || 'No description'}</p>
                      <p className="font-mono text-[9px] text-[#4e5e72]">
                        {expenseCategoryLabel(expense.category)} · {new Date(`${expense.date}T00:00:00`).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-amber-400 shrink-0">{formatExpense(expense.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendance summary */}
          <div
            style={{ order: dashboardOrder.indexOf("attendance") }}
            className="border border-[#19222e] bg-[#0d1219]"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── ATTENDANCE</span>
              <button onClick={() => onNavigate('attendance')} className="font-mono text-[10px] text-amber-400 hover:text-amber-300 transition-colors">VIEW ALL →</button>
            </div>
            <div className="divide-y divide-[#19222e]">
              {state.attendance.map(rec => {
                const pct = getAttendancePct(rec.attended, rec.total, rec.dutyLeave);
                const barColor = pct >= 80 ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-400' : 'bg-red-500';
                return (
                  <div key={rec.courseCode} className="px-4 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-amber-400">{rec.courseCode}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#cdd5df]">{pct}%</span>
                        <AttendanceStatus pct={pct} />
                      </div>
                    </div>
                    <div className="h-0.5 bg-[#19222e]">
                      <div className={`h-0.5 ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="font-mono text-[10px] text-[#4e5e72] mt-0.5">{rec.attended}/{rec.total} classes</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upcoming assignments */}
          <div
            style={{ order: dashboardOrder.indexOf("assignments") }}
            className="border border-[#19222e] bg-[#0d1219]"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── ASSIGNMENTS</span>
              <button onClick={() => onNavigate('assignments')} className="font-mono text-[10px] text-amber-400 hover:text-amber-300 transition-colors">VIEW ALL →</button>
            </div>
            {upcomingAssignments.length === 0 ? (
              <div className="px-4 py-4 text-center">
                <p className="font-mono text-[10px] text-[#4e5e72]">NO PENDING ASSIGNMENTS</p>
              </div>
            ) : (
              <div className="divide-y divide-[#19222e]">
                {upcomingAssignments.map(a => {
                  const days = daysUntil(a.dueDate);
                  return (
                    <div key={a.id} className="px-4 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-amber-400">{a.courseCode}</p>
                          <p className="text-sm text-[#cdd5df] truncate">{a.title}</p>
                        </div>
                        <span className={`font-mono text-[10px] shrink-0 ${priorityColor[a.priority]}`}>{a.priority.toUpperCase()}</span>
                      </div>
                      <p className="font-mono text-[10px] text-[#4e5e72] mt-0.5">
                        {days === 0 ? 'DUE TODAY' : days === 1 ? 'DUE TOMORROW' : `DUE IN ${days} DAYS`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming exams */}
          <div
            style={{ order: dashboardOrder.indexOf("exams") }}
            className="border border-[#19222e] bg-[#0d1219]"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
              <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── EXAMS</span>
              <button onClick={() => onNavigate('exams')} className="font-mono text-[10px] text-amber-400 hover:text-amber-300 transition-colors">VIEW ALL →</button>
            </div>
            {upcomingExams.length === 0 ? (
              <div className="px-4 py-4 text-center">
                <p className="font-mono text-[10px] text-[#4e5e72]">NO UPCOMING EXAMS</p>
              </div>
            ) : (
              <div className="divide-y divide-[#19222e]">
                {upcomingExams.map(exam => {
                  const days = daysUntil(exam.date);
                  const course = COURSES.find(c => c.code === exam.courseCode);
                  return (
                    <div key={exam.id} className="px-4 py-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-xs text-amber-400">{exam.courseCode}</p>
                          <p className="text-sm text-[#cdd5df]">{exam.type}</p>
                          {course && <p className="font-mono text-[10px] text-[#4e5e72]">{course.name}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs text-[#cdd5df]">{new Date(exam.date).toLocaleDateString('en-GB')}</p>
                          <p className={`font-mono text-[10px] ${days <= 7 ? 'text-red-400' : 'text-[#4e5e72]'}`}>
                            {days === 0 ? 'TODAY' : `IN ${days}D`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Todo list */}
          <div style={{ order: dashboardOrder.indexOf("todos") }}>
            <TodoWidget todos={state.todos || []} update={update} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TodoWidget({ todos, update }: { todos: TodoItem[]; update: (p: Partial<AppState>) => void }) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addTodo() {
    const text = input.trim();
    if (!text) return;
    const next: TodoItem[] = [
      { id: crypto.randomUUID(), text, done: false, createdAt: new Date().toISOString() },
      ...todos,
    ];
    update({ todos: next });
    setInput('');
    inputRef.current?.focus();
  }

  function toggleTodo(id: string) {
    update({ todos: todos.map(t => t.id === id ? { ...t, done: !t.done } : t) });
  }

  function deleteTodo(id: string) {
    update({ todos: todos.filter(t => t.id !== id) });
  }

  function clearDone() {
    update({ todos: todos.filter(t => !t.done) });
  }

  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);

  return (
    <div className="border border-[#19222e] bg-[#0d1219]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
        <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── TO-DO</span>
        <div className="flex items-center gap-3">
          {done.length > 0 && (
            <button onClick={clearDone} className="font-mono text-[10px] text-[#4e5e72] hover:text-red-400 transition-colors">CLEAR DONE</button>
          )}
          <span className="font-mono text-[10px] text-[#4e5e72]">{pending.length} left</span>
        </div>
      </div>

      {/* Input */}
      <div className="flex border-b border-[#19222e]">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Add a task and press Enter"
          className="flex-1 px-4 py-2.5 text-sm bg-transparent border-none placeholder:text-[#2a3548]"
        />
        <button onClick={addTodo} className="px-4 font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors border-l border-[#19222e]">
          +
        </button>
      </div>

      {/* Items */}
      {todos.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <p className="font-mono text-[10px] text-[#2a3548]">NO TASKS</p>
        </div>
      ) : (
        <div className="divide-y divide-[#19222e] max-h-60 overflow-y-auto">
          {[...pending, ...done].map(todo => (
            <div key={todo.id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-[#111720] transition-colors">
              <button
                onClick={() => toggleTodo(todo.id)}
                className={`w-3.5 h-3.5 border shrink-0 flex items-center justify-center transition-colors ${todo.done ? 'bg-green-500 border-green-500' : 'border-[#2a3548] hover:border-amber-400'}`}>
                {todo.done && <span className="text-[#090b0e] text-[8px] leading-none">✓</span>}
              </button>
              <span className={`flex-1 text-sm min-w-0 ${todo.done ? 'line-through text-[#2a3548]' : 'text-[#cdd5df]'}`}>
                {todo.text}
              </span>
              <button onClick={() => deleteTodo(todo.id)} className="font-mono text-[10px] text-[#2a3548] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
