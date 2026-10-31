import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"

import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"

import { CSS } from "@dnd-kit/utilities"

import { useCallback, useEffect, useMemo, useState } from "react"

import { ApiError, apiRequest } from "../api"

import type { AppState } from "../types"

import { DASHBOARD_PRESETS, createDashboardLayout } from "../dashboard/presets"

import { moveDashboardWidget } from "../dashboard/layout"

import {
  DASHBOARD_WIDGET_REGISTRY,
  DASHBOARD_WIDGETS,
  isDashboardWidgetId,
} from "../dashboard/registry"

import type {
  DashboardLayout,
  DashboardPreset,
  DashboardSection,
  DashboardWidgetConfig,
  DashboardWidgetId,
  DashboardWidgetSize,
  DashboardWorkspace,
  WorkspaceListResponse,
} from "../dashboard/types"

interface Props {
  state: AppState

  onNavigate: (page: string) => void

  update: (patch: Partial<AppState>) => void
}

const sizes: DashboardWidgetSize[] = ["small", "medium", "large", "full"]

const sizeRank: Record<DashboardWidgetSize, number> = {
  small: 0,

  medium: 1,

  large: 2,

  full: 3,
}

function orderedSections(layout: DashboardLayout) {
  return layout.sections.map((section) => ({
    section,

    widgets: layout.widgets.filter((widget) => widget.sectionId === section.id),
  }))
}

function sizeOptions(widget: DashboardWidgetConfig) {
  const definition = DASHBOARD_WIDGETS[widget.id]

  return sizes.filter(
    (size) =>
      sizeRank[size] >= sizeRank[definition.minSize] &&
      sizeRank[size] <= sizeRank[definition.maxSize],
  )
}

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 10_000)

    return () => window.clearInterval(interval)
  }, [])

  return now
}

export default function Dashboard({ state, onNavigate, update }: Props) {
  const [workspaces, setWorkspaces] = useState<DashboardWorkspace[]>([])

  const [activeWorkspaceId, setActiveWorkspaceId] = useState("")

  const [maxWorkspaces, setMaxWorkspaces] = useState(10)

  const [draftLayout, setDraftLayout] = useState<DashboardLayout | null>(null)

  const [draftName, setDraftName] = useState("")

  const [editing, setEditing] = useState(false)

  const [libraryOpen, setLibraryOpen] = useState(false)

  const [settingsWidget, setSettingsWidget] =
    useState<DashboardWidgetId | null>(null)

  const [createOpen, setCreateOpen] = useState(false)

  const [createName, setCreateName] = useState("")

  const [createPreset, setCreatePreset] =
    useState<Exclude<DashboardPreset, "custom">>("student")

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")
  const [workspaceConflict, setWorkspaceConflict] = useState(false)

  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const now = useCurrentTime()

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  )

  const layout = editing ? draftLayout : (activeWorkspace?.layout ?? null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),

    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),

    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)

    setError("")

    try {
      const response = await apiRequest<WorkspaceListResponse>(
        "/api/dashboard/workspaces",
      )

      setWorkspaces(response.workspaces)

      setActiveWorkspaceId(response.activeWorkspaceId)

      setMaxWorkspaces(response.maxWorkspaces)
      return true
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load dashboard workspaces.",
      )
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    if (!activeWorkspace || editing) return

    setDraftLayout(activeWorkspace.layout)

    setDraftName(activeWorkspace.name)
  }, [activeWorkspace, editing])

  function beginEditing() {
    if (!activeWorkspace) return

    setDraftLayout(structuredClone(activeWorkspace.layout))

    setDraftName(activeWorkspace.name)

    setEditing(true)

    setNotice("")
  }

  function cancelEditing() {
    if (!activeWorkspace) return

    setDraftLayout(activeWorkspace.layout)

    setDraftName(activeWorkspace.name)

    setEditing(false)

    setSettingsWidget(null)

    setLibraryOpen(false)

    setNotice("")
    setWorkspaceConflict(false)
  }

  async function saveEditing() {
    if (!activeWorkspace || !draftLayout) return

    setSaving(true)

    setWorkspaceConflict(false)

    try {
      const saved = await apiRequest<DashboardWorkspace>(
        `/api/dashboard/workspaces/${activeWorkspace.id}`,
        {
          method: "PATCH",

          body: JSON.stringify({
            name: draftName,

            layout: draftLayout,

            revision: activeWorkspace.revision,
          }),
        },
      )

      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === saved.id ? saved : workspace,
        ),
      )

      setDraftLayout(saved.layout)

      setDraftName(saved.name)

      setEditing(false)

      setSettingsWidget(null)

      setNotice("Workspace saved to your account.")
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setWorkspaceConflict(true)
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save dashboard workspace.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function reloadConflictedWorkspace() {
    if (
      !window.confirm(
        "Reload the latest saved workspace and discard your unsaved edits?",
      )
    ) {
      return
    }
    if (await loadWorkspaces()) {
      setWorkspaceConflict(false)
      setEditing(false)
      setDraftLayout(null)
    }
  }

  function updateDraft(change: (current: DashboardLayout) => DashboardLayout) {
    setDraftLayout((current) => (current ? change(current) : current))
  }

  async function activateWorkspace(id: string) {
    if (
      editing &&
      !window.confirm(
        "Discard your unsaved dashboard changes and switch workspaces?",
      )
    )
      return

    setError("")

    try {
      const result = await apiRequest<{ activeWorkspaceId: string }>(
        `/api/dashboard/workspaces/${id}/activate`,
        { method: "PATCH" },
      )

      setActiveWorkspaceId(result.activeWorkspaceId)

      setEditing(false)

      setSettingsWidget(null)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not switch workspaces.",
      )
    }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault()

    const name = createName.trim()

    if (!name) return

    setError("")

    try {
      const created = await apiRequest<DashboardWorkspace>(
        "/api/dashboard/workspaces",
        {
          method: "POST",

          body: JSON.stringify({ name, preset: createPreset }),
        },
      )

      await apiRequest(`/api/dashboard/workspaces/${created.id}/activate`, {
        method: "PATCH",
      })

      setCreateOpen(false)

      setCreateName("")

      setEditing(false)

      await loadWorkspaces()

      setNotice("Workspace created.")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create workspace.",
      )
    }
  }

  async function duplicateWorkspace() {
    if (!activeWorkspace) return

    const name = window.prompt(
      "Name for the duplicated workspace:",
      `${activeWorkspace.name} copy`,
    )

    if (name === null) return

    setError("")

    try {
      const duplicate = await apiRequest<DashboardWorkspace>(
        `/api/dashboard/workspaces/${activeWorkspace.id}/duplicate`,
        {
          method: "POST",

          body: JSON.stringify({ name }),
        },
      )

      await apiRequest(`/api/dashboard/workspaces/${duplicate.id}/activate`, {
        method: "PATCH",
      })

      await loadWorkspaces()

      setNotice("Workspace duplicated.")
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not duplicate workspace.",
      )
    }
  }

  async function deleteWorkspace() {
    if (!activeWorkspace || workspaces.length <= 1) return

    if (
      !window.confirm(
        `Delete the “${activeWorkspace.name}” workspace? This cannot be undone.`,
      )
    )
      return

    setError("")

    try {
      const result = await apiRequest<{
        deleted: boolean
        fallbackWorkspaceId: string
      }>(`/api/dashboard/workspaces/${activeWorkspace.id}`, {
        method: "DELETE",
      })

      setActiveWorkspaceId(result.fallbackWorkspaceId)

      setEditing(false)

      await loadWorkspaces()

      setNotice("Workspace deleted.")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete workspace.",
      )
    }
  }

  function addWidget(id: DashboardWidgetId) {
    if (!draftLayout || draftLayout.widgets.some((widget) => widget.id === id))
      return

    const defaultConfig = createDashboardLayout("student").widgets.find(
      (widget) => widget.id === id,
    ) ??
      createDashboardLayout("academic").widgets.find(
        (widget) => widget.id === id,
      ) ??
      createDashboardLayout("productivity").widgets.find(
        (widget) => widget.id === id,
      ) ??
      createDashboardLayout("finance").widgets.find(
        (widget) => widget.id === id,
      ) ?? {
        id,

        size: DASHBOARD_WIDGETS[id].defaultSize,

        sectionId: draftLayout.sections[0].id,

        settings: {},
      }

    const sectionId =
      draftLayout.sections.find(
        (section) => section.id === defaultConfig.sectionId,
      )?.id ?? draftLayout.sections[0].id

    updateDraft((current) => ({
      ...current,

      preset: "custom",

      widgets: [...current.widgets, { ...defaultConfig, sectionId }],
    }))

    setLibraryOpen(false)
  }

  function removeWidget(id: DashboardWidgetId) {
    updateDraft((current) => ({
      ...current,

      preset: "custom",

      widgets: current.widgets.filter((widget) => widget.id !== id),
    }))

    setSettingsWidget(null)
  }

  function updateWidget(
    id: DashboardWidgetId,
    change: (widget: DashboardWidgetConfig) => DashboardWidgetConfig,
  ) {
    updateDraft((current) => ({
      ...current,

      preset: "custom",

      widgets: current.widgets.map((widget) =>
        widget.id === id ? change(widget) : widget,
      ),
    }))
  }

  function applyPreset(preset: Exclude<DashboardPreset, "custom">) {
    const next = createDashboardLayout(preset)

    updateDraft((current) => {
      if (!current) return next

      return {
        ...next,

        columns: current.columns,

        density: current.density,

        showGreeting: current.showGreeting,

        showWidgetHeaders: current.showWidgetHeaders,

        sections: current.sections,

        widgets: next.widgets.map((widget) => {
          const existing = current.widgets.find(
            (candidate) => candidate.id === widget.id,
          )

          return existing
            ? { ...widget, settings: existing.settings, size: existing.size }
            : widget
        }),
      }
    })
  }

  function createSection() {
    const name = window.prompt("Name for this dashboard section:")

    if (!name?.trim()) return

    const id = `section-${crypto.randomUUID().slice(0, 8)}`

    updateDraft((current) => ({
      ...current,

      preset: "custom",

      sections: [...current.sections, { id, name: name.trim() }],
    }))
  }

  function updateSection(id: string, name: string) {
    updateDraft((current) => ({
      ...current,

      preset: "custom",

      sections: current.sections.map((section) =>
        section.id === id ? { ...section, name } : section,
      ),
    }))
  }

  function removeSection(section: DashboardSection) {
    if (!draftLayout || draftLayout.sections.length <= 1) return

    if (draftLayout.widgets.some((widget) => widget.sectionId === section.id)) {
      setError("Move or remove this section’s widgets before deleting it.")

      return
    }

    updateDraft((current) => ({
      ...current,

      sections: current.sections.filter((item) => item.id !== section.id),
    }))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDragId(null)

    if (!event.over || !draftLayout || event.active.id === event.over.id) return

    const activeId = String(event.active.id)

    const overId = String(event.over.id)

    if (
      overId.startsWith("section:") ||
      draftLayout.widgets.some(
        (widget) =>
          widget.id === overId &&
          widget.sectionId !==
            draftLayout.widgets.find((item) => item.id === activeId)?.sectionId,
      )
    ) {
      updateDraft((current) => moveDashboardWidget(current, activeId, overId))

      return
    }

    updateDraft((current) => {
      const from = current.widgets.findIndex((widget) => widget.id === activeId)

      const to = current.widgets.findIndex((widget) => widget.id === overId)

      return from < 0 || to < 0
        ? current
        : {
            ...current,
            preset: "custom",
            widgets: arrayMove(current.widgets, from, to),
          }
    })
  }

  const sectionWidgetIds = useMemo(
    () => orderedSections(layout ?? createDashboardLayout("minimal")),
    [layout],
  )

  const verticalGap =
    layout?.density === "compact"
      ? "space-y-3"
      : layout?.density === "spacious"
        ? "space-y-7"
        : "space-y-5"

  const cardGap =
    layout?.density === "compact"
      ? "gap-3"
      : layout?.density === "spacious"
        ? "gap-6"
        : "gap-4"

  if (loading) {
    return (
      <div className="p-6 font-mono text-xs text-[#718096]">
        LOADING YOUR DASHBOARD WORKSPACES…
      </div>
    )
  }

  if (!layout || !activeWorkspace) {
    return (
      <div className="space-y-3 p-6">
        <p role="alert" className="font-mono text-xs text-red-300">
          {error || "No dashboard workspace is available."}
        </p>
        <button
          onClick={() => void loadWorkspaces()}
          className="border border-amber-400 px-3 py-2 font-mono text-[10px] text-amber-400"
        >
          RETRY
        </button>
      </div>
    )
  }

  return (
    <div className={`${verticalGap} p-3 sm:p-5 lg:p-6`}>
      {layout.showGreeting && (
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#19222e] pb-4">
          <div>
            <p className="mb-1 font-mono text-xs tracking-widest text-[#718096]">
              {now.getHours() < 12
                ? "GOOD MORNING"
                : now.getHours() < 17
                  ? "GOOD AFTERNOON"
                  : "GOOD EVENING"}
            </p>
            <h1 className="text-2xl font-semibold text-[#cdd5df]">
              {state.settings.profileName || "Student"}
            </h1>
            <p className="mt-1 font-mono text-xs text-[#718096]">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {" · "}
              {now.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="dashboard-workspace">
              Choose dashboard workspace
            </label>
            <select
              id="dashboard-workspace"
              value={activeWorkspaceId}
              onChange={(event) => void activateWorkspace(event.target.value)}
              className="border border-[#19222e] bg-[#0d1219] px-3 py-2 font-mono text-[10px] text-[#cdd5df]"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            {!editing ? (
              <>
                <button
                  onClick={() => setCreateOpen(true)}
                  disabled={workspaces.length >= maxWorkspaces}
                  className="border border-[#29374a] px-3 py-2 font-mono text-[9px] text-[#cdd5df] hover:border-amber-400 disabled:opacity-40"
                >
                  + WORKSPACE
                </button>
                <button
                  onClick={beginEditing}
                  className="border border-amber-400 px-3 py-2 font-mono text-[9px] text-amber-400 hover:bg-amber-400 hover:text-[#090b0e]"
                >
                  CUSTOMIZE DASHBOARD
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={duplicateWorkspace}
                  disabled={workspaces.length >= maxWorkspaces}
                  className="border border-[#29374a] px-3 py-2 font-mono text-[9px] text-[#cdd5df] disabled:opacity-40"
                >
                  DUPLICATE
                </button>
                <button
                  onClick={deleteWorkspace}
                  disabled={workspaces.length <= 1}
                  className="border border-red-500/60 px-3 py-2 font-mono text-[9px] text-red-300 disabled:opacity-40"
                >
                  DELETE
                </button>
              </>
            )}
          </div>
        </header>
      )}

      {error && (
        <p
          role="alert"
          className="border border-red-500/40 bg-red-500/10 px-4 py-2 font-mono text-[10px] text-red-300"
        >
          {error}
        </p>
      )}
      {workspaceConflict && (
        <button
          type="button"
          onClick={() => void reloadConflictedWorkspace()}
          className="border border-amber-400 px-3 py-2 font-mono text-[9px] text-amber-300"
        >
          RELOAD LATEST WORKSPACE
        </button>
      )}
      {notice && (
        <p
          role="status"
          className="border border-green-500/30 bg-green-500/5 px-4 py-2 font-mono text-[10px] text-green-300"
        >
          {notice}
        </p>
      )}
      {activeWorkspace.recovered && (
        <p
          role="status"
          className="border border-amber-400/40 bg-amber-400/5 px-4 py-2 font-mono text-[10px] text-amber-200"
        >
          An unsupported saved layout was recovered. Customize and save to keep
          this layout.
        </p>
      )}

      {editing && draftLayout && (
        <section className="space-y-3 border border-amber-400/50 bg-[#0d1219] p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1">
              <span className="mb-1 block font-mono text-[9px] text-[#718096]">
                WORKSPACE NAME
              </span>
              <input
                value={draftName}
                maxLength={60}
                onChange={(event) => setDraftName(event.target.value)}
                className="w-full border border-[#29374a] bg-transparent px-3 py-2 text-sm text-[#cdd5df]"
              />
            </label>
            <label>
              <span className="mb-1 block font-mono text-[9px] text-[#718096]">
                PRESET
              </span>
              <select
                value={
                  draftLayout.preset === "custom"
                    ? "custom"
                    : draftLayout.preset
                }
                onChange={(event) =>
                  event.target.value !== "custom" &&
                  applyPreset(
                    event.target.value as Exclude<DashboardPreset, "custom">,
                  )
                }
                className="border border-[#29374a] bg-[#0d1219] px-3 py-2 font-mono text-[10px] text-[#cdd5df]"
              >
                {DASHBOARD_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block font-mono text-[9px] text-[#718096]">
                COLUMNS
              </span>
              <select
                value={draftLayout.columns}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    columns: Number(
                      event.target.value,
                    ) as DashboardLayout["columns"],
                  }))
                }
                className="border border-[#29374a] bg-[#0d1219] px-3 py-2 font-mono text-[10px] text-[#cdd5df]"
              >
                {[1, 2, 3].map((columns) => (
                  <option key={columns} value={columns}>
                    {columns}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block font-mono text-[9px] text-[#718096]">
                DENSITY
              </span>
              <select
                value={draftLayout.density}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    density: event.target.value as DashboardLayout["density"],
                  }))
                }
                className="border border-[#29374a] bg-[#0d1219] px-3 py-2 font-mono text-[10px] text-[#cdd5df]"
              >
                {["compact", "comfortable", "spacious"].map((density) => (
                  <option key={density}>{density}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-mono text-[9px] text-[#cdd5df]">
              <input
                type="checkbox"
                checked={draftLayout.showGreeting}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    showGreeting: event.target.checked,
                  }))
                }
              />
              SHOW GREETING
            </label>
            <label className="flex items-center gap-2 font-mono text-[9px] text-[#cdd5df]">
              <input
                type="checkbox"
                checked={draftLayout.showWidgetHeaders}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    showWidgetHeaders: event.target.checked,
                  }))
                }
              />
              SHOW WIDGET HEADERS
            </label>
            <button
              onClick={() => setLibraryOpen(true)}
              className="ml-auto border border-amber-400 px-3 py-2 font-mono text-[9px] text-amber-400 hover:bg-amber-400 hover:text-[#090b0e]"
            >
              ＋ ADD WIDGET
            </button>
            <button
              onClick={() =>
                updateDraft(() => createDashboardLayout("student"))
              }
              className="border border-[#29374a] px-3 py-2 font-mono text-[9px] text-[#cdd5df] hover:border-amber-400"
            >
              RESET TO DEFAULT
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[#19222e] pt-3">
            <button
              onClick={saveEditing}
              disabled={saving || !draftName.trim()}
              className="bg-amber-400 px-4 py-2 font-mono text-[10px] font-bold text-[#090b0e] disabled:opacity-50"
            >
              {saving ? "SAVING…" : "SAVE CHANGES"}
            </button>
            <button
              onClick={cancelEditing}
              disabled={saving}
              className="border border-[#29374a] px-4 py-2 font-mono text-[10px] text-[#cdd5df]"
            >
              CANCEL
            </button>
            <span className="self-center font-mono text-[9px] text-[#718096]">
              Changes stay in this draft until Save.
            </span>
          </div>
        </section>
      )}

      {editing && draftLayout && (
        <div className="flex flex-wrap items-center gap-2 border border-[#19222e] bg-[#0d1219] p-3">
          <span className="font-mono text-[9px] text-[#718096]">SECTIONS</span>
          {draftLayout.sections.map((section) => (
            <label key={section.id} className="flex items-center gap-1">
              <input
                aria-label={`Rename ${section.name} section`}
                value={section.name}
                maxLength={60}
                onChange={(event) =>
                  updateSection(section.id, event.target.value)
                }
                className="w-28 border border-[#29374a] bg-transparent px-2 py-1 font-mono text-[9px] text-[#cdd5df]"
              />
              <button
                type="button"
                aria-label={`Remove ${section.name} section`}
                onClick={() => removeSection(section)}
                disabled={draftLayout.sections.length <= 1}
                className="text-xs text-[#718096] hover:text-red-300 disabled:opacity-30"
              >
                ×
              </button>
            </label>
          ))}
          <button
            onClick={createSection}
            className="border border-[#29374a] px-2 py-1 font-mono text-[9px] text-amber-400"
          >
            + SECTION
          </button>
        </div>
      )}

      {draftLayout && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event) => setActiveDragId(String(event.active.id))}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={onDragEnd}
        >
          <div
            className={`grid grid-cols-1 items-start ${cardGap} ${
              draftLayout.columns === 1
                ? ""
                : draftLayout.columns === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-2 xl:grid-cols-3"
            }`}
          >
            {sectionWidgetIds.map(({ section, widgets }) => (
              <DashboardSectionColumn
                key={section.id}
                section={section}
                widgets={widgets}
                state={state}
                now={now}
                onNavigate={onNavigate}
                update={update}
                editing={editing}
                onWidgetChange={updateWidget}
                onRemove={removeWidget}
                onSettings={setSettingsWidget}
                settingsWidget={settingsWidget}
                showHeaders={draftLayout.showWidgetHeaders}
                density={draftLayout.density}
                columns={draftLayout.columns}
                sections={draftLayout.sections}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDragId && isDashboardWidgetId(activeDragId) && (
              <div className="border border-amber-400 bg-[#0d1219] px-4 py-3 font-mono text-[10px] text-amber-300 shadow-xl">
                {DASHBOARD_WIDGETS[activeDragId].name}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {libraryOpen && draftLayout && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLibraryOpen(false)
          }}
        >
          <section
            aria-label="Widget library"
            className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto border border-[#29374a] bg-[#0d1219] p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-sm text-[#e2e8f0]">
                  WIDGET LIBRARY
                </h2>
                <p className="mt-1 font-mono text-[9px] text-[#718096]">
                  Each widget uses your saved StudentOS records.
                </p>
              </div>
              <button
                aria-label="Close widget library"
                onClick={() => setLibraryOpen(false)}
                className="px-2 text-xl text-[#718096]"
              >
                ×
              </button>
            </div>
            {["Academic", "Productivity", "Financial", "General"].map(
              (category) => {
                const definitions = DASHBOARD_WIDGET_REGISTRY.filter(
                  (widget) => widget.category === category,
                )

                return (
                  <div key={category} className="mb-4">
                    <h3 className="mb-2 font-mono text-[10px] tracking-wider text-amber-400">
                      {category.toUpperCase()}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {definitions.map((widget) => {
                        const added = draftLayout.widgets.some(
                          (item) => item.id === widget.id,
                        )

                        return (
                          <article
                            key={widget.id}
                            className="flex items-center gap-3 border border-[#19222e] p-3"
                          >
                            <span className="text-lg text-amber-400">
                              {widget.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-[#cdd5df]">
                                {widget.name}
                              </p>
                              <p className="mt-1 font-mono text-[9px] text-[#718096]">
                                {widget.description}
                              </p>
                            </div>
                            <button
                              disabled={added}
                              onClick={() => addWidget(widget.id)}
                              className="border border-[#29374a] px-2 py-1 font-mono text-[9px] text-amber-400 disabled:opacity-40"
                            >
                              {added ? "ADDED" : "ADD"}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                )
              },
            )}
          </section>
        </div>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false)
          }}
        >
          <form
            onSubmit={(event) => void createWorkspace(event)}
            className="w-full max-w-md space-y-4 border border-[#29374a] bg-[#0d1219] p-4"
          >
            <h2 className="font-mono text-sm text-[#e2e8f0]">
              CREATE WORKSPACE
            </h2>
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] text-[#718096]">
                NAME
              </span>
              <input
                required
                maxLength={60}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                className="w-full border border-[#29374a] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] text-[#718096]">
                START FROM
              </span>
              <select
                value={createPreset}
                onChange={(event) =>
                  setCreatePreset(
                    event.target.value as Exclude<DashboardPreset, "custom">,
                  )
                }
                className="w-full border border-[#29374a] bg-[#0d1219] px-3 py-2 font-mono text-[10px]"
              >
                {DASHBOARD_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} — {preset.description}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-amber-400 py-2 font-mono text-[10px] font-bold text-[#090b0e]"
              >
                CREATE
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 border border-[#29374a] py-2 font-mono text-[10px] text-[#cdd5df]"
              >
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function DashboardSectionColumn({
  section,

  widgets,

  state,

  now,

  onNavigate,

  update,

  editing,

  onWidgetChange,

  onRemove,

  onSettings,

  settingsWidget,

  showHeaders,

  density,

  columns,

  sections,
}: {
  section: DashboardSection

  widgets: DashboardWidgetConfig[]

  state: AppState

  now: Date

  onNavigate: (page: string) => void

  update: (patch: Partial<AppState>) => void

  editing: boolean

  onWidgetChange: (
    id: DashboardWidgetId,
    change: (widget: DashboardWidgetConfig) => DashboardWidgetConfig,
  ) => void

  onRemove: (id: DashboardWidgetId) => void

  onSettings: (id: DashboardWidgetId | null) => void

  settingsWidget: DashboardWidgetId | null

  showHeaders: boolean

  density: DashboardLayout["density"]

  columns: DashboardLayout["columns"]

  sections: DashboardSection[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${section.id}` })

  const gridColumns =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"

  const cardGap =
    density === "compact" ? "gap-3" : density === "spacious" ? "gap-6" : "gap-4"

  return (
    <section
      ref={setNodeRef}
      className={`min-w-0 ${
        isOver && editing
          ? "rounded border border-dashed border-amber-400/70 bg-amber-400/5"
          : ""
      }`}
    >
      {(editing || widgets.length > 0) && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-[10px] tracking-widest text-[#718096]">
            {section.name.toUpperCase()}
          </h2>
          {editing && (
            <span className="font-mono text-[8px] text-[#4e5e72]">
              {widgets.length} WIDGET{widgets.length === 1 ? "" : "S"}
            </span>
          )}
        </div>
      )}
      <SortableContext
        items={widgets.map((widget) => widget.id)}
        strategy={rectSortingStrategy}
      >
        <div className={`grid ${gridColumns} ${cardGap}`}>
          {widgets.map((widget) => {
            const definition = DASHBOARD_WIDGETS[widget.id]

            const Renderer = definition.renderer

            return (
              <SortableWidget
                key={widget.id}
                widget={widget}
                editing={editing}
                showHeader={showHeaders}
                columns={columns}
                settingsOpen={settingsWidget === widget.id}
                sections={sections}
                state={state}
                onChange={(change) => onWidgetChange(widget.id, change)}
                onRemove={() => onRemove(widget.id)}
                onSettings={() =>
                  onSettings(settingsWidget === widget.id ? null : widget.id)
                }
              >
                <Renderer
                  state={state}
                  now={now}
                  onNavigate={onNavigate}
                  update={update}
                  settings={widget.settings}
                />
              </SortableWidget>
            )
          })}
          {editing && !widgets.length && (
            <p className="col-span-full border border-dashed border-[#29374a] p-5 text-center font-mono text-[9px] text-[#718096]">
              DROP A WIDGET HERE
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

function SortableWidget({
  widget,

  editing,

  showHeader,

  columns,

  sections,

  state,

  settingsOpen,

  onChange,

  onRemove,

  onSettings,

  children,
}: {
  widget: DashboardWidgetConfig

  editing: boolean

  showHeader: boolean

  columns: DashboardLayout["columns"]

  sections: DashboardSection[]

  state: AppState

  settingsOpen: boolean

  onChange: (
    change: (widget: DashboardWidgetConfig) => DashboardWidgetConfig,
  ) => void

  onRemove: () => void

  onSettings: () => void

  children: import("react").ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !editing })

  const definition = DASHBOARD_WIDGETS[widget.id]

  const span =
    widget.size === "full"
      ? columns === 3
        ? "md:col-span-2 xl:col-span-3"
        : "md:col-span-2"
      : widget.size === "large" && columns > 1
        ? "md:col-span-2 xl:col-span-2"
        : ""

  const spacing =
    widget.size === "small"
      ? "min-h-24"
      : widget.size === "large" || widget.size === "full"
        ? "min-h-40"
        : "min-h-32"

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: editing ? "manipulation" : undefined,
      }}
      className={`${span} ${spacing} min-w-0 border bg-[#0d1219] ${
        editing
          ? "border-amber-400/50 shadow-[0_0_0_1px_rgba(232,160,32,0.12)]"
          : "border-[#19222e]"
      } ${isDragging ? "z-10 opacity-40" : ""}`}
    >
      {(showHeader || editing) && (
        <header
          className={`flex flex-wrap items-center gap-2 border-b border-[#19222e] px-3 py-2 ${
            editing ? "bg-[#111720]" : ""
          }`}
        >
          {editing && (
            <button
              type="button"
              aria-label={`Drag ${definition.name}`}
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none px-1 text-[#718096] active:cursor-grabbing"
            >
              ⠿
            </button>
          )}
          <h3 className="min-w-0 flex-1 truncate font-mono text-[9px] tracking-widest text-[#aeb9c8]">
            {definition.icon} {definition.name.toUpperCase()}
          </h3>
          {editing && (
            <>
              <select
                aria-label={`Size of ${definition.name}`}
                value={widget.size}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    size: event.target.value as DashboardWidgetSize,
                  }))
                }
                className="border border-[#29374a] bg-[#0d1219] px-1.5 py-1 font-mono text-[8px] text-[#cdd5df]"
              >
                {sizeOptions(widget).map((size) => (
                  <option key={size} value={size}>
                    {size.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Section for ${definition.name}`}
                value={widget.sectionId}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    sectionId: event.target.value,
                  }))
                }
                className="max-w-24 border border-[#29374a] bg-[#0d1219] px-1 py-1 font-mono text-[8px] text-[#cdd5df]"
              >
                {sections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onSettings}
                aria-label={`Configure ${definition.name}`}
                aria-expanded={settingsOpen}
                className="px-1 font-mono text-[10px] text-[#aeb9c8] hover:text-amber-400"
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${definition.name}`}
                className="px-1 font-mono text-sm text-red-300 hover:text-red-200"
              >
                ×
              </button>
            </>
          )}
        </header>
      )}
      {settingsOpen && editing && (
        <WidgetSettings widget={widget} state={state} onChange={onChange} />
      )}
      <div>{children}</div>
    </article>
  )
}

function WidgetSettings({
  widget,

  state,

  onChange,
}: {
  widget: DashboardWidgetConfig

  state: AppState

  onChange: (
    change: (widget: DashboardWidgetConfig) => DashboardWidgetConfig,
  ) => void
}) {
  const definition = DASHBOARD_WIDGETS[widget.id]

  if (!definition.settings.length)
    return (
      <p className="border-b border-[#19222e] px-3 py-2 font-mono text-[9px] text-[#718096]">
        This widget has no additional settings.
      </p>
    )

  function changeSetting(key: string, value: unknown) {
    onChange((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }))
  }

  return (
    <div className="grid gap-3 border-b border-[#19222e] bg-[#0a0f15] p-3 sm:grid-cols-2">
      {definition.settings.map((setting) => {
        const value = widget.settings[setting.key]

        if (setting.kind === "boolean") {
          return (
            <label
              key={setting.key}
              className="flex items-center gap-2 font-mono text-[9px] text-[#cdd5df]"
            >
              <input
                type="checkbox"
                checked={value !== false}
                onChange={(event) =>
                  changeSetting(setting.key, event.target.checked)
                }
              />
              {setting.label}
            </label>
          )
        }

        if (setting.kind === "number") {
          const minimum = setting.key === "warningThreshold" ? 0 : 1

          const maximum = setting.key === "warningThreshold" ? 100 : 10

          return (
            <label
              key={setting.key}
              className="font-mono text-[9px] text-[#718096]"
            >
              {setting.label}
              <input
                type="number"
                min={minimum}
                max={maximum}
                value={
                  typeof value === "number"
                    ? value
                    : setting.key === "warningThreshold"
                      ? 75
                      : 3
                }
                onChange={(event) =>
                  changeSetting(
                    setting.key,
                    Math.max(
                      minimum,
                      Math.min(maximum, Number(event.target.value)),
                    ),
                  )
                }
                className="mt-1 w-full border border-[#29374a] bg-transparent px-2 py-1.5 text-[#cdd5df]"
              />
            </label>
          )
        }

        if (setting.kind === "select") {
          return (
            <label
              key={setting.key}
              className="font-mono text-[9px] text-[#718096]"
            >
              {setting.label}
              <select
                value={typeof value === "string" ? value : setting.options?.[0]}
                onChange={(event) =>
                  changeSetting(setting.key, event.target.value)
                }
                className="mt-1 w-full border border-[#29374a] bg-[#0d1219] px-2 py-1.5 text-[#cdd5df]"
              >
                {setting.options?.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          )
        }

        const selected = Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : []

        return (
          <fieldset key={setting.key} className="sm:col-span-2">
            <legend className="mb-2 font-mono text-[9px] text-[#718096]">
              {setting.label} (none selected means all)
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {state.attendance.map((record) => (
                <label
                  key={record.courseCode}
                  className="flex items-center gap-1 font-mono text-[9px] text-[#cdd5df]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(record.courseCode)}
                    onChange={(event) =>
                      changeSetting(
                        setting.key,

                        event.target.checked
                          ? [...selected, record.courseCode]
                          : selected.filter(
                              (code) => code !== record.courseCode,
                            ),
                      )
                    }
                  />
                  {record.courseCode}
                </label>
              ))}
              {!state.attendance.length && (
                <span className="font-mono text-[9px] text-[#718096]">
                  No courses with attendance records yet.
                </span>
              )}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
