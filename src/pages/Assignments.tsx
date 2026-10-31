import { useState } from 'react';
import { AppState, Assignment, Priority } from '../types';
import { COURSES } from '../data';
import { openStudentFile, uploadStudentFile } from '../files';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

type Tab = 'upcoming' | 'overdue' | 'completed';

const priorityColor: Record<Priority, string> = {
  high: 'text-red-400 border-red-400',
  medium: 'text-amber-400 border-amber-400',
  low: 'text-green-500 border-green-500',
};

function daysUntil(dateStr: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function DueBadge({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate);
  if (days < 0) return <span className="font-mono text-[10px] text-red-400">OVERDUE BY {Math.abs(days)}D</span>;
  if (days === 0) return <span className="font-mono text-[10px] text-red-400">DUE TODAY</span>;
  if (days === 1) return <span className="font-mono text-[10px] text-amber-400">DUE TOMORROW</span>;
  if (days <= 7) return <span className="font-mono text-[10px] text-amber-400">DUE IN {days}D</span>;
  return <span className="font-mono text-[10px] text-[#4e5e72]">DUE IN {days}D</span>;
}

type ModalState = { open: false } | { open: true; assignment: Partial<Assignment> };

function AssignmentModal({ modal, onSave, onClose }: {
  modal: { assignment: Partial<Assignment> };
  onSave: (a: Assignment) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Assignment>>({
    courseCode: 'CSE111', title: '', dueDate: new Date().toISOString().split('T')[0],
    priority: 'medium', completed: false, notes: '', ...modal.assignment,
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.title || !form.dueDate || !form.courseCode) return;
    setSaving(true);
    setError(null);
    try {
      const attachment = file ? await uploadStudentFile(file, 'assignment') : null;
      onSave({
        id: (modal.assignment as Assignment).id || crypto.randomUUID(),
        courseCode: form.courseCode!,
        title: form.title!,
        dueDate: form.dueDate!,
        priority: form.priority as Priority || 'medium',
        completed: form.completed || false,
        notes: form.notes || '',
        fileId: attachment?.id ?? form.fileId,
        fileName: attachment?.fileName ?? form.fileName,
        createdAt: (modal.assignment as Assignment).createdAt || new Date().toISOString(),
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'File upload failed.');
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!(modal.assignment as Assignment).id;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1219] border border-[#19222e] w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#19222e]">
          <span className="font-mono text-xs tracking-widest text-[#4e5e72]">{isEdit ? '── EDIT ASSIGNMENT' : '── ADD ASSIGNMENT'}</span>
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
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">TITLE</p>
            <input value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="Assignment title" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">DUE DATE</p>
              <input type="date" value={form.dueDate || ''} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">PRIORITY</p>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))} className="w-full px-2 py-1.5 text-sm">
                {(['high', 'medium', 'low'] as Priority[]).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">NOTES (optional)</p>
            <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full px-2 py-1.5 text-sm resize-none" />
          </label>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">ATTACHMENT (20 MiB MAX)</p>
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt" onChange={e => setFile(e.target.files?.[0] ?? null)} className="w-full text-xs text-[#4e5e72]" />
            {form.fileId && <button type="button" onClick={() => void openStudentFile(form.fileId!).catch(error => setError(error instanceof Error ? error.message : 'Could not open file.'))} className="font-mono text-[10px] text-blue-400 hover:text-blue-300">{form.fileName || 'OPEN ATTACHMENT'}</button>}
            {file && <p className="font-mono text-[10px] text-amber-400">READY TO UPLOAD: {file.name}</p>}
          </label>
          {error && <p role="alert" className="font-mono text-[10px] text-red-400">{error}</p>}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-[#19222e]">
          <button onClick={onClose} className="flex-1 py-1.5 text-sm font-mono border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] transition-colors">CANCEL</button>
          <button onClick={() => void save()} disabled={saving} className="flex-1 py-1.5 text-sm font-mono bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 disabled:opacity-50 transition-colors">
            {saving ? 'UPLOADING...' : isEdit ? 'UPDATE' : 'ADD'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Assignments({ state, update }: Props) {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [modal, setModal] = useState<ModalState>({ open: false });

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcoming = state.assignments.filter(a => !a.completed && new Date(a.dueDate) >= now)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const overdue = state.assignments.filter(a => !a.completed && new Date(a.dueDate) < now)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const completed = state.assignments.filter(a => a.completed)
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'upcoming', label: 'UPCOMING', count: upcoming.length },
    { key: 'overdue', label: 'OVERDUE', count: overdue.length },
    { key: 'completed', label: 'COMPLETED', count: completed.length },
  ];

  function saveAssignment(a: Assignment) {
    const exists = state.assignments.find(x => x.id === a.id);
    if (exists) update({ assignments: state.assignments.map(x => x.id === a.id ? a : x) });
    else update({ assignments: [...state.assignments, a] });
    setModal({ open: false });
  }

  function deleteAssignment(id: string) {
    update({ assignments: state.assignments.filter(a => a.id !== id) });
  }

  function toggle(id: string) {
    update({ assignments: state.assignments.map(a => a.id === id ? { ...a, completed: !a.completed } : a) });
  }

  const list = tab === 'upcoming' ? upcoming : tab === 'overdue' ? overdue : completed;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 font-mono text-xs border-r border-[#19222e] last:border-r-0 transition-colors ${tab === t.key ? 'bg-amber-400 text-[#090b0e] border-amber-400' : 'border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df]'} ${t.count > 0 && t.key === 'overdue' ? 'text-red-400' : ''}`}>
              {t.label} {t.count > 0 && <span className="ml-1">({t.count})</span>}
            </button>
          ))}
        </div>
        <button onClick={() => setModal({ open: true, assignment: {} })} className="font-mono text-xs px-3 py-1.5 bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">
          + ADD
        </button>
      </div>

      {list.length === 0 ? (
        <div className="border border-[#19222e] bg-[#0d1219] px-4 py-12 text-center">
          <p className="font-mono text-xs text-[#4e5e72]">NO {tab.toUpperCase()} ASSIGNMENTS</p>
        </div>
      ) : (
        <div className="border border-[#19222e] divide-y divide-[#19222e]">
          {list.map(a => {
            const course = COURSES.find(c => c.code === a.courseCode);
            return (
              <div key={a.id} className={`flex items-start gap-4 px-4 py-4 bg-[#0d1219] hover:bg-[#111720] transition-colors group ${a.completed ? 'opacity-60' : ''}`}>
                <button onClick={() => toggle(a.id)} className={`mt-0.5 w-4 h-4 border shrink-0 flex items-center justify-center transition-colors ${a.completed ? 'bg-green-500 border-green-500' : 'border-[#19222e] hover:border-amber-400'}`}>
                  {a.completed && <span className="text-[#090b0e] text-[10px]">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-amber-400">{a.courseCode}</span>
                    <span className={`font-mono text-[10px] border px-1 ${priorityColor[a.priority]}`}>{a.priority.toUpperCase()}</span>
                  </div>
                  <p className={`text-sm text-[#cdd5df] mt-0.5 ${a.completed ? 'line-through' : ''}`}>{a.title}</p>
                  {course && <p className="font-mono text-[10px] text-[#4e5e72]">{course.name}</p>}
                  {a.notes && <p className="font-mono text-[10px] text-[#4e5e72] mt-1 italic">{a.notes}</p>}
                  {a.fileId && <button onClick={() => void openStudentFile(a.fileId!).catch(error => window.alert(error instanceof Error ? error.message : 'Could not open file.'))} className="font-mono text-[10px] text-blue-400 mt-1 hover:text-blue-300">↓ {a.fileName || 'OPEN ATTACHMENT'}</button>}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="font-mono text-[10px] text-[#4e5e72]">{new Date(a.dueDate).toLocaleDateString('en-GB')}</p>
                  {!a.completed && <DueBadge dueDate={a.dueDate} />}
                  <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setModal({ open: true, assignment: a })} className="font-mono text-[10px] text-[#4e5e72] hover:text-amber-400 transition-colors">EDIT</button>
                    <button onClick={() => deleteAssignment(a.id)} className="font-mono text-[10px] text-[#4e5e72] hover:text-red-400 transition-colors">DEL</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && (
        <AssignmentModal modal={modal} onSave={saveAssignment} onClose={() => setModal({ open: false })} />
      )}
    </div>
  );
}
