import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, apiRequest } from "./api"

import {
  DEFAULT_ATTENDANCE,
  DEFAULT_GPA_GRADES,
  DEFAULT_SETTINGS,
  DEFAULT_TIMETABLE,
} from "./data"

import type { AppState } from "./types"

const LEGACY_STORAGE_KEY = "tenseos_v1"
const LEGACY_UPDATED_KEY = "tenseos_v1_updated_at"

export type StorageStatus =
  | "loading"
  | "saved"
  | "saving"
  | "offline"
  | "conflict"
  | "error"

interface CloudStateResponse {
  state: AppState | null
  revision: number
  lastSyncedAt: string | null
  legacyMigrated: boolean
}

const emptyState: AppState = {
  timetable: DEFAULT_TIMETABLE,
  attendance: DEFAULT_ATTENDANCE,
  attendanceMarks: {},
  assignments: [],
  exams: [],
  notes: [],
  gpaGrades: DEFAULT_GPA_GRADES,
  settings: DEFAULT_SETTINGS,
  todos: [],
  expenses: [],
  customExpenseCategories: [],
  pomodoro: {
    mode: "focus",
    remainingSeconds: 25 * 60,
    focusDurationSeconds: 25 * 60,
    breakDurationSeconds: 5 * 60,
    isRunning: false,
    endTime: null,
    completedSessions: 0,
  },
}

function createDefaultState(profileName = ""): AppState {
  return {
    ...emptyState,
    settings: { ...emptyState.settings, profileName },
    pomodoro: { ...emptyState.pomodoro },
  }
}

function normalizeState(saved: Partial<AppState>, profileName = ""): AppState {
  const defaults = createDefaultState(profileName)

  return {
    ...defaults,
    ...saved,
    timetable: saved.timetable ?? defaults.timetable,
    attendance: (saved.attendance ?? defaults.attendance).map((record) => ({
      ...record,
      dutyLeave: record.dutyLeave ?? 0,
    })),
    attendanceMarks: saved.attendanceMarks ?? defaults.attendanceMarks,
    assignments: saved.assignments ?? defaults.assignments,
    exams: saved.exams ?? defaults.exams,
    notes: saved.notes ?? defaults.notes,
    gpaGrades: saved.gpaGrades ?? defaults.gpaGrades,
    settings: { ...defaults.settings, ...(saved.settings || {}) },
    todos: saved.todos ?? defaults.todos,
    expenses: saved.expenses ?? defaults.expenses,
    customExpenseCategories:
      saved.customExpenseCategories ?? defaults.customExpenseCategories,
    pomodoro: {
      ...defaults.pomodoro,
      ...(saved.pomodoro || {}),
      focusDurationSeconds:
        saved.pomodoro?.focusDurationSeconds ?? defaults.pomodoro.focusDurationSeconds,
      breakDurationSeconds:
        saved.pomodoro?.breakDurationSeconds ?? defaults.pomodoro.breakDurationSeconds,
    },
  }
}

function readLegacyState(): AppState | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return null

  const parsed: unknown = JSON.parse(raw)
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("timetable" in parsed) ||
    !Array.isArray(parsed.timetable) ||
    !("attendance" in parsed) ||
    !Array.isArray(parsed.attendance)
  ) {
    throw new Error(
      "Existing local data is not a valid StudentOS backup. It has been left untouched.",
    )
  }

  return normalizeState(parsed as Partial<AppState>)
}

function isNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError &&
      [502, 503, 504].includes(error.status))
  )
}

export function useAppStore(userId: string | null, profileName = "") {
  const [state, setState] = useState<AppState>(() =>
    createDefaultState(profileName),
  )
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("loading")
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [readyUserId, setReadyUserId] = useState<string | null>(null)
  const [hasPendingSync, setHasPendingSync] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  const revisionRef = useRef(0)
  const stateRef = useRef(state)
  const persistedStateRef = useRef<AppState | null>(null)
  const readyRef = useRef(false)
  const hasPendingSyncRef = useRef(hasPendingSync)
  const conflictRef = useRef(false)
  const syncInFlightRef = useRef(false)

  const isReady = ready && readyUserId === userId
  stateRef.current = state
  readyRef.current = isReady
  hasPendingSyncRef.current = hasPendingSync

  const syncSnapshot = useCallback(
    async (snapshot: AppState, revision = revisionRef.current) => {
      if (
        !userId ||
        !readyRef.current ||
        conflictRef.current ||
        syncInFlightRef.current
      ) {
        return
      }

      syncInFlightRef.current = true
      setStorageStatus(navigator.onLine ? "saving" : "offline")
      setHasPendingSync(true)

      try {
        if (!navigator.onLine) {
          setStorageStatus("offline")
          setSyncError(
            "No connection. Changes are not saved on this device.",
          )
          return
        }

        const result = await apiRequest<{
          revision: number
          lastSyncedAt: string
        }>("/api/state", {
          method: "PUT",
          body: JSON.stringify({ state: snapshot, revision }),
        })

        revisionRef.current = result.revision
        persistedStateRef.current = snapshot
        if (stateRef.current === snapshot) setHasPendingSync(false)
        setLastSaved(Date.parse(result.lastSyncedAt))
        setSyncError(null)
        setStorageStatus("saved")
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          conflictRef.current = true
          setStorageStatus("conflict")
          setSyncError(error.message)
        } else if (isNetworkError(error)) {
          setStorageStatus("offline")
          setSyncError(
            "Cloud connection unavailable. Changes are only in memory and will be lost if you leave before they save.",
          )
        } else {
          console.error("Failed to sync StudentOS data:", error)
          setStorageStatus("error")
          setSyncError(
            error instanceof Error
              ? error.message
              : "Cloud synchronization failed.",
          )
        }
      } finally {
        syncInFlightRef.current = false
        if (
          !conflictRef.current &&
          stateRef.current !== snapshot &&
          readyRef.current
        ) {
          void syncSnapshot(stateRef.current, revisionRef.current)
        }
      }
    },
    [userId],
  )

  const refreshFromCloud = useCallback(async () => {
    if (!userId) return

    setStorageStatus("loading")
    try {
      const remote = await apiRequest<CloudStateResponse>("/api/state")
      revisionRef.current = remote.revision
      conflictRef.current = false

      const loaded = remote.state
        ? normalizeState(remote.state, profileName)
        : createDefaultState(profileName)

      persistedStateRef.current = remote.state ? loaded : null
      setState(loaded)
      setHasPendingSync(false)
      setLastSaved(remote.lastSyncedAt ? Date.parse(remote.lastSyncedAt) : null)
      setSyncError(null)
      setStorageStatus("saved")
    } catch (error) {
      console.error("Failed to reload cloud data:", error)
      setStorageStatus("error")
      setSyncError(
        error instanceof Error ? error.message : "Could not reload cloud data.",
      )
    }
  }, [profileName, userId])

  const retryLoad = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1)
  }, [])

  const retrySave = useCallback(() => {
    void syncSnapshot(stateRef.current, revisionRef.current)
  }, [syncSnapshot])

  useEffect(() => {
    if (!userId) {
      setReady(false)
      setReadyUserId(null)
      setHasPendingSync(false)
      setSyncError(null)
      setStorageStatus("loading")
      setState(createDefaultState())
      persistedStateRef.current = null
      return
    }

    let active = true
    setReady(false)
    setReadyUserId(null)
    revisionRef.current = 0
    persistedStateRef.current = null
    conflictRef.current = false
    setStorageStatus("loading")
    setSyncError(null)

    const markReady = () => {
      setReadyUserId(userId)
      setReady(true)
    }

    const initialize = async () => {
      try {
        const remote = await apiRequest<CloudStateResponse>("/api/state")
        if (!active) return

        if (remote.state) {
          if (remote.legacyMigrated) {
            localStorage.removeItem(LEGACY_STORAGE_KEY)
            localStorage.removeItem(LEGACY_UPDATED_KEY)
          } else {
            const legacyState = readLegacyState()
            if (legacyState) {
              conflictRef.current = true
              revisionRef.current = remote.revision
              setState(legacyState)
              setHasPendingSync(true)
              setSyncError(
                "Local legacy data was preserved because cloud data already exists. Export this copy, reload cloud data, then import the backup to avoid overwriting newer changes.",
              )
              setStorageStatus("conflict")
              markReady()
              return
            }
          }

          const loaded = normalizeState(remote.state, profileName)
          revisionRef.current = remote.revision
          persistedStateRef.current = loaded
          setState(loaded)
          setHasPendingSync(false)
          setLastSaved(
            remote.lastSyncedAt ? Date.parse(remote.lastSyncedAt) : null,
          )
          setStorageStatus("saved")
          markReady()
          return
        }

        const legacyState = readLegacyState()
        if (legacyState) {
          const migration = await apiRequest<{ revision: number }>(
            "/api/state/migrate",
            {
              method: "POST",
              body: JSON.stringify({ state: legacyState }),
            },
          )
          if (!active) return

          const verified = await apiRequest<CloudStateResponse>("/api/state")
          if (
            !verified.state ||
            !verified.legacyMigrated ||
            verified.revision !== migration.revision
          ) {
            throw new Error(
              "The legacy data upload could not be verified. Your original browser data remains intact.",
            )
          }

          localStorage.removeItem(LEGACY_STORAGE_KEY)
          localStorage.removeItem(LEGACY_UPDATED_KEY)
          const loaded = normalizeState(verified.state, profileName)
          revisionRef.current = verified.revision
          persistedStateRef.current = loaded
          setState(loaded)
          setHasPendingSync(false)
          setLastSaved(
            verified.lastSyncedAt
              ? Date.parse(verified.lastSyncedAt)
              : Date.now(),
          )
          setStorageStatus("saved")
          markReady()
          return
        }

        revisionRef.current = 0
        const freshState = createDefaultState(profileName)
        setState(freshState)
        setHasPendingSync(false)
        setLastSaved(null)
        setStorageStatus("saved")
        markReady()
      } catch (error) {
        if (!active) return

        console.error("Failed to load cloud data:", error)
        setStorageStatus(isNetworkError(error) ? "offline" : "error")
        setSyncError(
          error instanceof Error ? error.message : "Could not load cloud data.",
        )
      }
    }

    const onOnline = () => {
      if (!active) return
      if (readyRef.current) {
        if (hasPendingSyncRef.current) {
          void syncSnapshot(stateRef.current, revisionRef.current)
        }
      } else {
        retryLoad()
      }
    }

    window.addEventListener("online", onOnline)
    void initialize()

    return () => {
      active = false
      window.removeEventListener("online", onOnline)
    }
  }, [loadAttempt, profileName, retryLoad, syncSnapshot, userId])

  useEffect(() => {
    if (!userId || !isReady || state === persistedStateRef.current) return

    setHasPendingSync(true)
    if (conflictRef.current) return

    const timeout = window.setTimeout(() => {
      void syncSnapshot(state, revisionRef.current)
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [state, isReady, userId, syncSnapshot])

  const update = useCallback((partial: Partial<AppState>) => {
    setState((current) => ({ ...current, ...partial }))
  }, [])

  const reset = useCallback(() => {
    setState(createDefaultState(profileName))
  }, [profileName])

  return {
    state,
    ready: isReady,
    update,
    reset,
    storageStatus,
    lastSaved,
    hasPendingSync,
    syncError,
    refreshFromCloud,
    retryLoad,
    retrySave,
    syncStatus: storageStatus,
  }
}
