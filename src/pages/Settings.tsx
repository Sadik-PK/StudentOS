import { useState, useRef } from "react"
import { AppState } from "../types"
import { StorageStatus } from "../store"
import { openStudentFile, uploadStudentFile } from "../files"

interface Props {
  state: AppState
  update: (p: Partial<AppState>) => void
  reset: () => void
  storageStatus?: StorageStatus
  lastSaved?: number | null
  email: string
  hasPendingSync: boolean
  syncError: string | null
  logoutError: string | null
  onReloadCloud: () => void
  onRetrySave: () => void
  onLogout: () => Promise<void>
}

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1219] border border-red-500 w-full max-w-sm">
        <div className="px-4 py-3 border-b border-[#19222e]">
          <span className="font-mono text-xs text-red-400">
            ▲ CONFIRM DESTRUCTIVE ACTION
          </span>
        </div>
        <div className="p-4">
          <p className="text-sm text-[#cdd5df]">{message}</p>
          <p className="font-mono text-[10px] text-[#4e5e72] mt-1">
            This cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-[#19222e]">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 font-mono text-sm border border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df] transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 font-mono text-sm bg-red-500 text-white hover:bg-red-400 transition-colors"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  )
}

const STORAGE_LABELS: Record<StorageStatus, { label: string; color: string }> = {
  loading: { label: "[CONNECTING...]", color: "text-amber-400" },
  saved: { label: "[CONNECTED]", color: "text-green-400" },
  saving: { label: "[SYNCING...]", color: "text-amber-400" },
  offline: { label: "[CLOUD UNAVAILABLE]", color: "text-amber-400" },
  conflict: { label: "[SYNC CONFLICT]", color: "text-red-400" },
  error: { label: "[SYNC ERROR]", color: "text-red-400" },
}

function isAppStateBackup(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false
  const backup = value as Partial<AppState>
  return (
    Array.isArray(backup.timetable) &&
    Array.isArray(backup.attendance) &&
    Array.isArray(backup.assignments) &&
    Array.isArray(backup.exams) &&
    Array.isArray(backup.notes) &&
    Array.isArray(backup.gpaGrades) &&
    Array.isArray(backup.todos) &&
    Array.isArray(backup.expenses) &&
    Array.isArray(backup.customExpenseCategories) &&
    typeof backup.settings === "object" &&
    backup.settings !== null &&
    typeof backup.pomodoro === "object" &&
    backup.pomodoro !== null
  )
}

export default function Settings({
  state,
  update,
  reset,
  storageStatus = "loading",
  lastSaved,
  email,
  hasPendingSync,
  syncError,
  logoutError,
  onReloadCloud,
  onRetrySave,
  onLogout,
}: Props) {
  const [confirm, setConfirm] = useState<null | {
    message: string
    action: () => void
  }>(null)
  const [name, setName] = useState(state.settings.profileName)
  const [semStart, setSemStart] = useState(state.settings.semesterStartDate)
  const [semEnd, setSemEnd] = useState(state.settings.semesterEndDate)
  const [saved, setSaved] = useState(false)
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<"idle" | "ok" | "error">(
    "idle",
  )
  const fileRef = useRef<HTMLInputElement>(null)


  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `studentos-backup-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result
        if (typeof content !== "string") throw new Error("Invalid backup file")
        const parsed: unknown = JSON.parse(content)
        if (!isAppStateBackup(parsed)) throw new Error("Invalid backup file")
        update(parsed)
        setImportStatus("ok")
        setTimeout(() => setImportStatus("idle"), 3000)
      } catch {
        setImportStatus("error")
        setTimeout(() => setImportStatus("idle"), 3000)
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  async function saveProfile() {
    setSavingProfile(true)
    setProfileError(null)
    try {
      const picture = profileFile
        ? await uploadStudentFile(profileFile, "profile")
        : null
      update({
        settings: {
          ...state.settings,
          profileName: name,
          semesterStartDate: semStart,
          semesterEndDate: semEnd,
          ...(picture ? { profilePictureId: picture.id } : {}),
        },
      })
      setProfileFile(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Profile update failed.",
      )
    } finally {
      setSavingProfile(false)
    }
  }

  function confirmAction(message: string, action: () => void) {
    setConfirm({ message, action })
  }

  return (
    <div className="p-6 space-y-4 max-w-xl">
      {/* Profile */}
      <div className="border border-[#19222e] bg-[#0d1219]">
        <div className="px-4 py-2 border-b border-[#19222e]">
          <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">
            ── PROFILE
          </span>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">
              DISPLAY NAME
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm"
              placeholder="Your name"
            />
          </label>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">
              PROFILE PICTURE
            </p>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => setProfileFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-[#4e5e72]"
            />
            {profileFile && (
              <p className="font-mono text-[10px] text-amber-400 mt-1">
                READY TO UPLOAD: {profileFile.name}
              </p>
            )}
            {state.settings.profilePictureId && (
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={() =>
                    void openStudentFile(state.settings.profilePictureId!).catch(
                      (error) =>
                        setProfileError(
                          error instanceof Error
                            ? error.message
                            : "Could not open profile picture.",
                        ),
                    )
                  }
                  className="font-mono text-[10px] text-blue-400 hover:text-blue-300"
                >
                  OPEN SAVED PICTURE
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      settings: {
                        ...state.settings,
                        profilePictureId: undefined,
                      },
                    })
                  }
                  className="font-mono text-[10px] text-red-400 hover:text-red-300"
                >
                  REMOVE
                </button>
              </div>
            )}
          </label>
          {profileError && (
            <p role="alert" className="font-mono text-[10px] text-red-400">
              {profileError}
            </p>
          )}
        </div>
      </div>

      {/* Semester */}
      <div className="border border-[#19222e] bg-[#0d1219]">
        <div className="px-4 py-2 border-b border-[#19222e]">
          <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">
            ── SEMESTER DATES
          </span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">
              START DATE
            </p>
            <input
              type="date"
              value={semStart}
              onChange={(e) => setSemStart(e.target.value)}
              className="w-full px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <p className="font-mono text-[10px] text-[#4e5e72] mb-1">
              END DATE
            </p>
            <input
              type="date"
              value={semEnd}
              onChange={(e) => setSemEnd(e.target.value)}
              className="w-full px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={() => void saveProfile()}
            disabled={savingProfile}
            className={`font-mono text-xs px-4 py-1.5 transition-colors disabled:opacity-50 ${
              saved
                ? "bg-green-500 text-[#090b0e]"
                : "bg-amber-400 text-[#090b0e] hover:bg-amber-300"
            }`}
          >
            {savingProfile
              ? "UPLOADING..."
              : saved
                ? "✓ SAVED"
                : "SAVE CHANGES"}
          </button>
        </div>
      </div>

      {/* Data management */}
      <div className="border border-[#19222e] bg-[#0d1219]">
        <div className="px-4 py-2 border-b border-[#19222e]">
          <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">
            ── DATA MANAGEMENT
          </span>
        </div>
        <div className="p-4 space-y-2">
          {[
            {
              label: "CLEAR ATTENDANCE",
              sub: "Delete all attendance records",
              action: () =>
                update({ attendance: [], attendanceMarks: {} }),
            },
            {
              label: "CLEAR ASSIGNMENTS",
              sub: "Delete all assignments",
              action: () => update({ assignments: [] }),
            },
            {
              label: "CLEAR EXAMS",
              sub: "Delete all exam entries",
              action: () => update({ exams: [] }),
            },
            {
              label: "CLEAR NOTES",
              sub: "Delete all notes",
              action: () => update({ notes: [] }),
            },
            {
              label: "CLEAR GPA GRADES",
              sub: "Remove all grade entries",
              action: () => update({ gpaGrades: [] }),
            },
            {
              label: "CLEAR EXPENSES",
              sub: "Delete all expense transactions",
              action: () => update({ expenses: [] }),
            },
            {
              label: "CLEAR TIMETABLE",
              sub: "Delete all timetable entries",
              action: () => update({ timetable: [] }),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-2 border-b border-[#19222e] last:border-b-0"
            >
              <div>
                <p className="font-mono text-xs text-[#cdd5df]">{item.label}</p>
                <p className="font-mono text-[10px] text-[#4e5e72]">
                  {item.sub}
                </p>
              </div>
              <button
                onClick={() =>
                  confirmAction(
                    `Are you sure you want to ${item.label.toLowerCase()}?`,
                    item.action,
                  )
                }
                className="font-mono text-[10px] px-3 py-1 border border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
              >
                RESET
              </button>
            </div>
          ))}

          <div className="pt-2">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-mono text-xs text-red-400">RESET ALL DATA</p>
                <p className="font-mono text-[10px] text-[#4e5e72]">
                  Replace this account's StudentOS data with defaults
                </p>
              </div>
              <button
                onClick={() =>
                  confirmAction(
                    "Reset ALL application data? This will delete everything.",
                    reset,
                  )
                }
                className="font-mono text-[10px] px-3 py-1 bg-red-500 text-white hover:bg-red-400 transition-colors"
              >
                RESET ALL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export / Import */}
      <div className="border border-[#19222e] bg-[#0d1219]">
        <div className="px-4 py-2 border-b border-[#19222e]">
          <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">
            ── DATA BACKUP
          </span>
        </div>
        <div className="p-4 space-y-3">
          <p className="font-mono text-[10px] text-[#4e5e72]">
            Export saves all your attendance, assignments, exams, notes, GPA
            grades, expenses, and timetable to a JSON file. Import restores from
            a previous export.
          </p>
          <div className="flex gap-2">
            <button
              onClick={exportData}
              className="flex-1 py-2 font-mono text-xs border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e] transition-colors"
            >
              ↓ EXPORT DATA
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className={`flex-1 py-2 font-mono text-xs border transition-colors ${
                importStatus === "ok"
                  ? "border-green-500 text-green-400"
                  : importStatus === "error"
                    ? "border-red-500 text-red-400"
                    : "border-[#19222e] text-[#4e5e72] hover:border-amber-400 hover:text-amber-400"
              }`}
            >
              {importStatus === "ok"
                ? "✓ IMPORTED"
                : importStatus === "error"
                  ? "✕ INVALID FILE"
                  : "↑ IMPORT DATA"}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={importData}
            className="hidden"
          />
        </div>
      </div>

      {/* Cloud synchronization */}
      <div className="border border-[#19222e] bg-[#0d1219]">
        <div className="px-4 py-2 border-b border-[#19222e] flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">
            ── CLOUD SYNCHRONIZATION
          </span>
          <span
            className={`font-mono text-[10px] ${STORAGE_LABELS[storageStatus].color}`}
          >
            {STORAGE_LABELS[storageStatus].label}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="font-mono text-xs text-[#cdd5df]">
              CLOUD-FIRST ACCOUNT STORAGE
            </p>
            <p className="font-mono text-[10px] text-[#4e5e72] mt-1 leading-relaxed">
              Your records are stored in your account's cloud database. StudentOS
              does not keep a local data cache. Changes require an active
              connection and are saved automatically.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#19222e]">
            <div className="min-w-0">
              <p className="font-mono text-[9px] text-[#4e5e72]">
                SIGNED-IN ACCOUNT
              </p>
              <p className="font-mono text-xs text-[#cdd5df] truncate">
                {email}
              </p>
            </div>
            <button
              onClick={() => void onLogout()}
              className="font-mono text-[10px] px-3 py-1 border border-[#19222e] text-[#cdd5df] hover:border-amber-400 hover:text-amber-400 transition-colors"
            >
              LOG OUT
            </button>
          </div>
          {logoutError && (
            <p role="alert" className="font-mono text-[10px] text-red-400">
              {logoutError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#19222e]">
            <div>
              <p className="font-mono text-[9px] text-[#4e5e72]">
                DATABASE SAVE
              </p>
              <p
                className={`font-mono text-xs ${
                  storageStatus === "saved"
                    ? "text-green-400"
                    : storageStatus === "error" || storageStatus === "conflict"
                      ? "text-red-400"
                      : "text-amber-400"
                }`}
              >
                {storageStatus === "saved"
                  ? "Cloud connected"
                  : storageStatus === "saving"
                    ? "Saving to cloud..."
                    : storageStatus === "offline"
                      ? "Cloud unavailable"
                      : storageStatus === "conflict"
                        ? "Conflict detected"
                        : storageStatus === "error"
                          ? "Save failed"
                          : "Connecting..."}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-[#4e5e72]">
                UNSAVED CHANGES
              </p>
              <p
                className={`font-mono text-xs ${
                  hasPendingSync ? "text-amber-400" : "text-green-400"
                }`}
              >
                {hasPendingSync ? "Unsaved in memory" : "0 changes"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-[#4e5e72]">
                LAST CLOUD SYNC
              </p>
              <p className="font-mono text-xs text-[#cdd5df]">
                {lastSaved
                  ? new Date(lastSaved).toLocaleString()
                  : "Not synchronized yet"}
              </p>
            </div>
            {storageStatus === "conflict" && (
              <button
                onClick={onReloadCloud}
                className="self-end font-mono text-[10px] px-2 py-1 border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e] transition-colors"
              >
                RELOAD CLOUD DATA
              </button>
            )}
            {hasPendingSync &&
              (storageStatus === "offline" || storageStatus === "error") && (
                <button
                  onClick={onRetrySave}
                  className="self-end font-mono text-[10px] px-2 py-1 border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e] transition-colors"
                >
                  RETRY CLOUD SAVE
                </button>
              )}
          </div>
          {syncError && (
            <p role="status" className="font-mono text-[10px] text-red-400">
              {syncError}
            </p>
          )}
        </div>
      </div>

      {/* App info */}
      <div className="border border-[#19222e] bg-[#0d1219] p-4">
        <p className="font-mono text-[10px] tracking-widest text-[#4e5e72] mb-2">
          ── SYSTEM
        </p>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="font-mono text-[10px] text-[#4e5e72]">
              APPLICATION
            </span>
            <span className="font-mono text-[10px] text-[#cdd5df]">
              STUDENT/OS
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[10px] text-[#4e5e72]">
              VERSION
            </span>
            <span className="font-mono text-[10px] text-[#cdd5df]">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[10px] text-[#4e5e72]">
              STORAGE
            </span>
            <span className="font-mono text-[10px] text-green-400">
              NEON POSTGRESQL
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[10px] text-[#4e5e72]">
              SEMESTER
            </span>
            <span className="font-mono text-[10px] text-[#cdd5df]">
              {state.settings.semesterStartDate} →{" "}
              {state.settings.semesterEndDate}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-[#19222e]">
            <span className="font-mono text-[10px] text-[#4e5e72]">
              DEVELOPER
            </span>
            <span className="font-mono text-[10px] text-amber-400">TENSE</span>
          </div>
        </div>
      </div>

      {/* Footer credit */}
      <div className="text-center pt-3 pb-6">
        <p className="font-mono text-xs text-[#627387]">
          made with <span className="text-red-400">💖</span> By{" "}
          <span className="text-amber-400 font-semibold tracking-wider">
            Tense
          </span>
        </p>
      </div>

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={() => {
            confirm.action()
            setConfirm(null)
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
