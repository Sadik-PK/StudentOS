import { useState } from 'react';
import { AppState, Exam } from '../types';
import { COURSES } from '../data';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

function daysUntil(dateStr: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

type ModalState = { open: false } | { open: true; exam: Partial<Exam> };

function ExamModal({ modal, onSave, onClose }: {
  modal: { exam: Partial<Exam> }; onSave: (e: Exam) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Exam>>({
    courseCode: 'CSE111', type: 'Mid Semester', date: '', startTime: '09:00', room: '', ...modal.exam,
  });
  const isEdit = !!(modal.exam as Exam).id;

  function save() {
    if (!form.date || !form.courseCode || !form.type || !form.room) return;
    onSave({ id: (modal.exam as Exam).id || crypto.randomUUID(), courseCode: form.courseCode!, type: form.type!, date: form.date!, startTime: form.startTime!, room: form.room! });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1219] border border-[#19222e] w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#19222e]">
          <span className="font-mono text-xs tracking-widest text-[#4e5e72]">{isEdit ? '── EDIT EXAM' : '── ADD EXAM'}</span>
          <button onClick={onClose} className="font-mono text-xs text-[#4e5e72] hover:text-red-400 transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">COURSE</p>
            <select value={form.courseCode} onChange={e => setForm(f => ({ ...f, courseCode: e.target.value }))} className="w-full px-2 py-1.5 text-sm">
              {COURSES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">EXAM TYPE</p>
            <input value={form.type || ''} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="e.g. Mid Semester, End Semester, Quiz" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">DATE</p>
              <input type="date" value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">START TIME</p>
              <input type="time" value={form.startTime || ''} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">ROOM</p>
            <input value={form.room || ''} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="e.g. Hall A" />
          </label>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-[#19222e]">
          <button onClick={onClose} className="flex-1 py-1.5 text-sm font-mono border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] transition-colors">CANCEL</button>
          <button onClick={save} className="flex-1 py-1.5 text-sm font-mono bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">{isEdit ? 'UPDATE' : 'ADD'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Exams({ state, update }: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming');

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const upcoming = state.exams.filter(e => new Date(e.date) >= now).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completed = state.exams.filter(e => new Date(e.date) < now).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const list = tab === 'upcoming' ? upcoming : completed;

  function saveExam(exam: Exam) {
    const exists = state.exams.find(e => e.id === exam.id);
    if (exists) update({ exams: state.exams.map(e => e.id === exam.id ? exam : e) });
    else update({ exams: [...state.exams, exam] });
    setModal({ open: false });
  }

  function deleteExam(id: string) {
    update({ exams: state.exams.filter(e => e.id !== id) });
  }

  const next = upcoming[0];
  const nextDays = next ? daysUntil(next.date) : null;

  return (
    <div className="p-6 space-y-4">
      {next && (
        <div className="border border-[#19222e] bg-[#0d1219] p-4">
          <p className="font-mono text-[10px] tracking-widest text-[#4e5e72] mb-2">── NEXT EXAM</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-sm text-amber-400">{next.courseCode} — {next.type}</p>
              <p className="text-[#cdd5df] text-sm mt-0.5">{COURSES.find(c => c.code === next.courseCode)?.name}</p>
              <p className="font-mono text-xs text-[#4e5e72] mt-1">{new Date(next.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {next.startTime} · RM {next.room}</p>
            </div>
            <div className="text-right">
              <p className={`font-mono text-3xl font-semibold ${nextDays !== null && nextDays <= 7 ? 'text-red-400' : 'text-[#cdd5df]'}`}>{nextDays}D</p>
              <p className="font-mono text-[10px] text-[#4e5e72]">REMAINING</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex">
          {(['upcoming', 'completed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 font-mono text-xs border-r border-[#19222e] last:border-r-0 transition-colors ${tab === t ? 'bg-amber-400 text-[#090b0e]' : 'border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df]'}`}>
              {t.toUpperCase()} ({(t === 'upcoming' ? upcoming : completed).length})
            </button>
          ))}
        </div>
        <button onClick={() => setModal({ open: true, exam: {} })} className="font-mono text-xs px-3 py-1.5 bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">
          + ADD EXAM
        </button>
      </div>

      {list.length === 0 ? (
        <div className="border border-[#19222e] bg-[#0d1219] px-4 py-12 text-center">
          <p className="font-mono text-xs text-[#4e5e72]">NO {tab.toUpperCase()} EXAMS</p>
        </div>
      ) : (
        <div className="border border-[#19222e] divide-y divide-[#19222e]">
          {list.map(exam => {
            const course = COURSES.find(c => c.code === exam.courseCode);
            const days = daysUntil(exam.date);
            return (
              <div key={exam.id} className="flex items-center gap-4 px-4 py-4 bg-[#0d1219] hover:bg-[#111720] transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-amber-400">{exam.courseCode}</span>
                    <span className="font-mono text-[10px] border border-[#19222e] px-1 text-[#4e5e72]">{exam.type.toUpperCase()}</span>
                  </div>
                  <p className="text-sm text-[#cdd5df] mt-0.5 truncate">{course?.name}</p>
                  <p className="font-mono text-[10px] text-[#4e5e72] mt-0.5">
                    {new Date(exam.date).toLocaleDateString('en-GB')} · {exam.startTime} · RM {exam.room}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {tab === 'upcoming' && (
                    <p className={`font-mono text-sm font-semibold ${days <= 7 ? 'text-red-400' : days <= 14 ? 'text-amber-400' : 'text-[#cdd5df]'}`}>
                      {days === 0 ? 'TODAY' : `${days}D`}
                    </p>
                  )}
                  <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    <button onClick={() => setModal({ open: true, exam })} className="font-mono text-[10px] text-[#4e5e72] hover:text-amber-400 transition-colors">EDIT</button>
                    <button onClick={() => deleteExam(exam.id)} className="font-mono text-[10px] text-[#4e5e72] hover:text-red-400 transition-colors">DEL</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && (
        <ExamModal modal={modal} onSave={saveExam} onClose={() => setModal({ open: false })} />
      )}
    </div>
  );
}
