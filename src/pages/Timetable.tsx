import { useState } from 'react';
import { AppState, TimetableEntry, DayOfWeek, ClassType } from '../types';
import { DAYS_OF_WEEK, COURSES, formatTime12, getDayName, timeToMinutes } from '../data';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as DayOfWeek[];

const typeColor: Record<ClassType, string> = {
  Lecture: 'border-l-blue-400 text-blue-400',
  Tutorial: 'border-l-amber-400 text-amber-400',
  Practical: 'border-l-purple-400 text-purple-400',
};

const typeBg: Record<ClassType, string> = {
  Lecture: 'bg-[#0e1520]',
  Tutorial: 'bg-[#140f05]',
  Practical: 'bg-[#130b1c]',
};

type ModalState = { open: false } | { open: true; entry: Partial<TimetableEntry> & { id?: string } };

function EntryModal({ modal, onSave, onDelete, onClose }: {
  modal: { entry: Partial<TimetableEntry> & { id?: string } };
  onSave: (e: TimetableEntry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<TimetableEntry>>({
    day: 'Monday', startTime: '09:00', endTime: '09:50', courseCode: 'CSE111',
    courseName: '', type: 'Lecture', room: '', ...modal.entry,
  });
  const isEdit = !!modal.entry.id;

  function save() {
    if (!form.day || !form.startTime || !form.endTime || !form.courseCode || !form.room) return;
    const course = COURSES.find(c => c.code === form.courseCode);
    onSave({
      id: modal.entry.id || crypto.randomUUID(),
      day: form.day!,
      startTime: form.startTime!,
      endTime: form.endTime!,
      courseCode: form.courseCode!,
      courseName: course ? course.name : (form.courseName || ''),
      type: form.type as ClassType || 'Lecture',
      room: form.room!,
      group: form.group,
      note: form.note,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1219] border border-[#19222e] w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#19222e]">
          <span className="font-mono text-xs tracking-widest text-[#4e5e72]">{isEdit ? '── EDIT ENTRY' : '── ADD ENTRY'}</span>
          <button onClick={onClose} className="font-mono text-xs text-[#4e5e72] hover:text-red-400 transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">DAY</p>
              <select value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value as DayOfWeek }))} className="w-full px-2 py-1.5 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">TYPE</p>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ClassType }))} className="w-full px-2 py-1.5 text-sm">
                {(['Lecture', 'Tutorial', 'Practical'] as ClassType[]).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">START TIME</p>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">END TIME</p>
              <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">COURSE</p>
            <select value={form.courseCode} onChange={e => setForm(f => ({ ...f, courseCode: e.target.value, courseName: COURSES.find(c => c.code === e.target.value)?.name || f.courseName }))} className="w-full px-2 py-1.5 text-sm">
              {COURSES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              <option value="OTHER">Other</option>
            </select>
          </label>
          {form.courseCode === 'OTHER' && (
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">COURSE NAME</p>
              <input value={form.courseName || ''} onChange={e => setForm(f => ({ ...f, courseName: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">ROOM</p>
              <input value={form.room || ''} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="e.g. 27-307" />
            </label>
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">GROUP (optional)</p>
              <input value={form.group || ''} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="e.g. Group 2" />
            </label>
          </div>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">NOTE (optional)</p>
            <input value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="e.g. Makeup Class" />
          </label>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-[#19222e]">
          {isEdit && (
            <button
              onClick={() => onDelete(modal.entry.id!)}
              className="px-3 py-1.5 text-sm font-mono border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-colors">
              REMOVE
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-1.5 text-sm font-mono border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] transition-colors">CANCEL</button>
          <button onClick={save} className="flex-1 py-1.5 text-sm font-mono bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">
            {isEdit ? 'UPDATE' : 'ADD'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Timetable({ state, update }: Props) {
  const [view, setView] = useState<'today' | 'week'>('week');
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [importFile, setImportFile] = useState<string | null>(null);
  const today = getDayName(new Date()) as DayOfWeek;

  function saveEntry(entry: TimetableEntry) {
    const existing = state.timetable.find(e => e.id === entry.id);
    if (existing) {
      update({ timetable: state.timetable.map(e => e.id === entry.id ? entry : e) });
    } else {
      update({ timetable: [...state.timetable, entry] });
    }
    setModal({ open: false });
  }

  function deleteEntry(id: string) {
    update({ timetable: state.timetable.filter(e => e.id !== id) });
  }

  const dayClasses = (day: DayOfWeek) =>
    state.timetable.filter(e => e.day === day).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0">
          {(['today', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 font-mono text-xs border transition-colors ${view === v ? 'bg-amber-400 text-[#090b0e] border-amber-400' : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df]'}`}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="font-mono text-xs px-3 py-1.5 border border-[#19222e] text-[#4e5e72] hover:text-amber-400 hover:border-amber-400 transition-colors">
            ↑ IMPORT
          </button>
          <button onClick={() => setModal({ open: true, entry: {} })} className="font-mono text-xs px-3 py-1.5 bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">
            + ADD CLASS
          </button>
        </div>
      </div>

      {view === 'today' && (
        <div className="border border-[#19222e] bg-[#0d1219]">
          <div className="px-4 py-2 border-b border-[#19222e]">
            <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── {today.toUpperCase()}</span>
          </div>
          {dayClasses(today).length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-xs text-[#4e5e72]">NO CLASSES TODAY</div>
          ) : (
            <div className="divide-y divide-[#19222e]">
              {dayClasses(today).map(cls => (
                <ClassRow key={cls.id} cls={cls} onEdit={() => setModal({ open: true, entry: cls })} onDelete={() => deleteEntry(cls.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'week' && (
        <div className="overflow-x-auto">
          <div className="min-w-[900px] grid grid-cols-7 border-l border-t border-[#19222e]">
            {DAYS.map(day => (
              <div key={day} className={`border-r border-b border-[#19222e] ${day === today ? 'bg-[#0f1a10]' : ''}`}>
                <div className={`px-2 py-2 border-b border-[#19222e] ${day === today ? 'bg-[#0f1a10]' : 'bg-[#0d1219]'}`}>
                  <p className={`font-mono text-[10px] ${day === today ? 'text-amber-400' : 'text-[#4e5e72]'}`}>{day.toUpperCase().slice(0, 3)}</p>
                  {day === today && <p className="font-mono text-[8px] text-green-400">TODAY</p>}
                </div>
                <div className="p-1 space-y-1 min-h-[200px]">
                  {dayClasses(day as DayOfWeek).map(cls => (
                    <div key={cls.id} className={`relative border-l-2 px-2 py-1.5 cursor-pointer group ${typeBg[cls.type]} ${typeColor[cls.type]}`}
                      onClick={() => setModal({ open: true, entry: cls })}>
                      <button
                        onClick={event => { event.stopPropagation(); deleteEntry(cls.id); }}
                        className="absolute right-1 top-1 font-mono text-[8px] text-[#4e5e72] hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                        DEL
                      </button>
                      <p className="font-mono text-[10px]">{cls.startTime}–{cls.endTime}</p>
                      <p className="font-mono text-[10px] font-semibold mt-0.5">{cls.courseCode}</p>
                      <p className="text-[10px] text-[#7a8494] leading-tight">{cls.type}</p>
                      <p className="font-mono text-[9px] text-[#4e5e72]">{cls.room}</p>
                      {cls.group && <p className="font-mono text-[9px] text-[#4e5e72]">{cls.group}</p>}
                      {cls.note && <p className="font-mono text-[9px] text-red-400">[{cls.note}]</p>}
                    </div>
                  ))}
                  {day === 'Saturday' && dayClasses(day).length === 0 && (
                    <p className="font-mono text-[9px] text-[#2a3548] p-1">Project Work</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal.open && (
        <EntryModal
          modal={modal}
          onSave={saveEntry}
          onDelete={id => { deleteEntry(id); setModal({ open: false }); }}
          onClose={() => setModal({ open: false })}
        />
      )}

      {showImport && (
        <ImportModal step={importStep} setStep={setImportStep} importFile={importFile} setImportFile={setImportFile} onClose={() => { setShowImport(false); setImportStep('upload'); setImportFile(null); }} />
      )}
    </div>
  );
}

function ClassRow({ cls, onEdit, onDelete }: { cls: TimetableEntry; onEdit: () => void; onDelete: () => void }) {
  const typeColor: Record<ClassType, string> = {
    Lecture: 'text-blue-400',
    Tutorial: 'text-amber-400',
    Practical: 'text-purple-400',
  };
  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-[#111720] transition-colors group">
      <div className="font-mono text-xs text-[#4e5e72] w-36 shrink-0">
        {formatTime12(cls.startTime)} – {formatTime12(cls.endTime)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs text-amber-400">{cls.courseCode}</span>
        <span className="mx-2 text-[#19222e]">|</span>
        <span className="text-sm text-[#cdd5df]">{cls.courseName}</span>
        {cls.note && <span className="ml-2 font-mono text-[10px] text-red-400">[{cls.note}]</span>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className={`font-mono text-[10px] ${typeColor[cls.type]}`}>{cls.type.toUpperCase()}</span>
        <span className="font-mono text-[10px] text-[#4e5e72]">RM {cls.room}</span>
        {cls.group && <span className="font-mono text-[10px] text-[#4e5e72]">{cls.group}</span>}
        <button onClick={onEdit} className="font-mono text-[10px] text-[#4e5e72] hover:text-amber-400 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100">EDIT</button>
        <button onClick={onDelete} className="font-mono text-[10px] text-[#4e5e72] hover:text-red-400 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100">DEL</button>
      </div>
    </div>
  );
}

function ImportModal({ step, setStep, importFile, setImportFile, onClose }: {
  step: 'upload' | 'preview'; setStep: (s: 'upload' | 'preview') => void;
  importFile: string | null; setImportFile: (f: string | null) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1219] border border-[#19222e] w-full max-w-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#19222e]">
          <span className="font-mono text-xs tracking-widest text-[#4e5e72]">── IMPORT TIMETABLE</span>
          <button onClick={onClose} className="font-mono text-xs text-[#4e5e72] hover:text-red-400 transition-colors">✕</button>
        </div>
        <div className="p-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="border border-dashed border-[#19222e] p-8 text-center cursor-pointer hover:border-amber-400 transition-colors"
                onClick={() => { setImportFile('timetable_sem1.pdf'); }}>
                <p className="font-mono text-xs text-[#4e5e72]">↑ UPLOAD FILE</p>
                <p className="font-mono text-[10px] text-[#2a3548] mt-2">PDF · IMAGE · CSV</p>
                {importFile && <p className="font-mono text-xs text-green-400 mt-3">{importFile} selected</p>}
              </div>
              <p className="font-mono text-[10px] text-[#4e5e72] text-center">
                Upload your college timetable — extracted classes will appear in a preview for you to confirm before saving.
              </p>
            </div>
          )}
          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400">
                <span className="font-mono text-xs">■ PROCESSING COMPLETE</span>
              </div>
              <p className="font-mono text-[10px] text-[#4e5e72]">
                Extraction is a UI demo — in a live version, parsed classes would appear here for review before import.
              </p>
              <div className="border border-[#19222e] divide-y divide-[#19222e]">
                {['CSE111 — Monday 16:00–16:50 — Lecture — 26-404X', 'MEC136 — Monday 14:20–16:00 — Tutorial — 26-404X'].map((row, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-[#cdd5df]">{row}</span>
                    <input type="checkbox" defaultChecked className="ml-2" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-[#19222e]">
          <button onClick={onClose} className="flex-1 py-1.5 text-sm font-mono border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] transition-colors">CANCEL</button>
          {step === 'upload' && (
            <button onClick={() => importFile && setStep('preview')} disabled={!importFile} className="flex-1 py-1.5 text-sm font-mono bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors disabled:opacity-30">
              PROCESS →
            </button>
          )}
          {step === 'preview' && (
            <button onClick={onClose} className="flex-1 py-1.5 text-sm font-mono bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">
              CONFIRM & SAVE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
