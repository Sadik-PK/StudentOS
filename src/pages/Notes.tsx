import { useState } from 'react';
import { AppState, Note } from '../types';
import { COURSES } from '../data';
import { openStudentFile, uploadStudentFile } from '../files';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

type ModalState = { open: false } | { open: true; note: Partial<Note> };

function NoteModal({ modal, onSave, onClose }: {
  modal: { note: Partial<Note> }; onSave: (n: Note) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Note>>({
    courseCode: 'CSE111', title: '', description: '', pinned: false,
    date: new Date().toISOString().split('T')[0], ...modal.note,
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!(modal.note as Note).id;

  async function save() {
    if (!form.title || !form.courseCode) return;
    setSaving(true);
    setError(null);
    try {
      const attachment = file ? await uploadStudentFile(file, 'note') : null;
      onSave({
        id: (modal.note as Note).id || crypto.randomUUID(),
        courseCode: form.courseCode!, title: form.title!, description: form.description || '',
        fileName: attachment?.fileName ?? form.fileName,
        fileId: attachment?.id ?? form.fileId,
        date: form.date || new Date().toISOString().split('T')[0], pinned: form.pinned || false,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'File upload failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1219] border border-[#19222e] w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#19222e]">
          <span className="font-mono text-xs tracking-widest text-[#4e5e72]">{isEdit ? '── EDIT NOTE' : '── ADD NOTE'}</span>
          <button onClick={onClose} className="font-mono text-xs text-[#4e5e72] hover:text-red-400 transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">COURSE</p>
              <select value={form.courseCode} onChange={e => setForm(f => ({ ...f, courseCode: e.target.value }))} className="w-full px-2 py-1.5 text-sm">
                {COURSES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </label>
            <label className="block">
              <p className="font-mono text-[10px] text-[#4e5e72] mb-1">DATE</p>
              <input type="date" value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">TITLE</p>
            <input value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-2 py-1.5 text-sm" placeholder="Note title" />
          </label>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">DESCRIPTION</p>
            <textarea value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} className="w-full px-2 py-1.5 text-sm resize-none" />
          </label>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">NOTE FILE (PDF, DOCUMENT, OR IMAGE · 20 MiB MAX)</p>
            <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt" onChange={e => setFile(e.target.files?.[0] ?? null)} className="w-full text-xs text-[#4e5e72]" />
            {form.fileId && <button type="button" onClick={() => void openStudentFile(form.fileId!).catch(error => setError(error instanceof Error ? error.message : 'Could not open file.'))} className="font-mono text-[10px] text-blue-400 hover:text-blue-300">{form.fileName || 'OPEN ATTACHED FILE'}</button>}
            {file && <p className="font-mono text-[10px] text-amber-400">READY TO UPLOAD: {file.name}</p>}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.pinned || false} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} />
            <span className="font-mono text-xs text-[#4e5e72]">PIN NOTE</span>
          </label>
        </div>
        {error && <p role="alert" className="px-4 pb-2 font-mono text-[10px] text-red-400">{error}</p>}
        <div className="flex gap-2 px-4 py-3 border-t border-[#19222e]">
          <button onClick={onClose} className="flex-1 py-1.5 text-sm font-mono border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] transition-colors">CANCEL</button>
          <button onClick={() => void save()} disabled={saving} className="flex-1 py-1.5 text-sm font-mono bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 disabled:opacity-50 transition-colors">{saving ? 'UPLOADING...' : isEdit ? 'UPDATE' : 'SAVE'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Notes({ state, update }: Props) {
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [search, setSearch] = useState('');

  function saveNote(note: Note) {
    const exists = state.notes.find(n => n.id === note.id);
    if (exists) update({ notes: state.notes.map(n => n.id === note.id ? note : n) });
    else update({ notes: [...state.notes, note] });
    setModal({ open: false });
  }

  function deleteNote(id: string) { update({ notes: state.notes.filter(n => n.id !== id) }); }
  function togglePin(id: string) { update({ notes: state.notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n) }); }

  const filtered = state.notes.filter(n =>
    (!selectedCourse || n.courseCode === selectedCourse) &&
    (!search || n.title.toLowerCase().includes(search.toLowerCase()) || n.description.toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..." className="flex-1 min-w-[180px] px-3 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setSelectedCourse(null)}
            className={`px-3 py-1 font-mono text-[10px] border transition-colors ${!selectedCourse ? 'bg-amber-400 text-[#090b0e] border-amber-400' : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df]'}`}>
            ALL
          </button>
          {COURSES.map(c => (
            <button key={c.code} onClick={() => setSelectedCourse(selectedCourse === c.code ? null : c.code)}
              className={`px-3 py-1 font-mono text-[10px] border transition-colors ${selectedCourse === c.code ? 'bg-amber-400 text-[#090b0e] border-amber-400' : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df]'}`}>
              {c.code}
            </button>
          ))}
        </div>
        <button onClick={() => setModal({ open: true, note: { courseCode: selectedCourse || 'CSE111' } })}
          className="font-mono text-xs px-3 py-1.5 bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 transition-colors">
          + ADD NOTE
        </button>
      </div>

      {/* Folder overview */}
      {!selectedCourse && !search && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
          {COURSES.map(c => {
            const count = state.notes.filter(n => n.courseCode === c.code).length;
            const pinned = state.notes.filter(n => n.courseCode === c.code && n.pinned).length;
            return (
              <button key={c.code} onClick={() => setSelectedCourse(c.code)}
                className="border border-[#19222e] bg-[#0d1219] p-4 text-left hover:border-amber-400 hover:bg-[#111720] transition-colors group">
                <p className="font-mono text-xs text-amber-400 group-hover:text-amber-300">{c.code}</p>
                <p className="text-sm text-[#cdd5df] mt-0.5 truncate">{c.name}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="font-mono text-[10px] text-[#4e5e72]">{count} {count === 1 ? 'note' : 'notes'}</span>
                  {pinned > 0 && <span className="font-mono text-[10px] text-amber-400">★ {pinned} pinned</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-[#19222e] bg-[#0d1219] px-4 py-12 text-center">
          <p className="font-mono text-xs text-[#4e5e72]">NO NOTES FOUND</p>
          <button onClick={() => setModal({ open: true, note: { courseCode: selectedCourse || 'CSE111' } })}
            className="mt-3 font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">
            + ADD FIRST NOTE
          </button>
        </div>
      ) : (
        <div className="border border-[#19222e] divide-y divide-[#19222e]">
          {filtered.map(note => (
            <div key={note.id} className="flex items-start gap-4 px-4 py-4 bg-[#0d1219] hover:bg-[#111720] transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-amber-400">{note.courseCode}</span>
                  {note.pinned && <span className="font-mono text-[10px] text-amber-400">★ PINNED</span>}
                  {note.fileName && <span className="font-mono text-[10px] text-blue-400 border border-blue-400 px-1">[FILE]</span>}
                </div>
                <p className="text-sm text-[#cdd5df] font-medium mt-0.5">{note.title}</p>
                {note.description && <p className="font-mono text-[10px] text-[#4e5e72] mt-1 line-clamp-2">{note.description}</p>}
                {note.fileName && <p className="font-mono text-[10px] text-blue-400 mt-1">{note.fileName}</p>}
                {note.fileId && <button onClick={() => void openStudentFile(note.fileId!).catch(error => window.alert(error instanceof Error ? error.message : 'Could not open file.'))} className="font-mono text-[10px] text-blue-400 mt-1 hover:text-blue-300">↓ OPEN FILE</button>}
                <p className="font-mono text-[10px] text-[#2a3548] mt-1">{new Date(note.date).toLocaleDateString('en-GB')}</p>
              </div>
              <div className="flex gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => togglePin(note.id)} className={`font-mono text-[10px] transition-colors ${note.pinned ? 'text-amber-400' : 'text-[#4e5e72] hover:text-amber-400'}`}>
                  {note.pinned ? '★' : '☆'}
                </button>
                <button onClick={() => setModal({ open: true, note })} className="font-mono text-[10px] text-[#4e5e72] hover:text-amber-400 transition-colors">EDIT</button>
                <button onClick={() => deleteNote(note.id)} className="font-mono text-[10px] text-[#4e5e72] hover:text-red-400 transition-colors">DEL</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <NoteModal modal={modal} onSave={saveNote} onClose={() => setModal({ open: false })} />
      )}
    </div>
  );
}
