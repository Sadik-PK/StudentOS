import type { DashboardLayout } from "./types"

export function moveDashboardWidget(
  layout: DashboardLayout,

  activeId: string,

  overId: string,
): DashboardLayout {
  const active = layout.widgets.find((widget) => widget.id === activeId)

  if (!active) return layout

  const destinationSectionId = overId.startsWith("section:")
    ? overId.slice("section:".length)
    : layout.widgets.find((widget) => widget.id === overId)?.sectionId

  if (
    !destinationSectionId ||
    !layout.sections.some((section) => section.id === destinationSectionId)
  )
    return layout

  const withoutActive = layout.widgets.filter(
    (widget) => widget.id !== activeId,
  )

  const overIndex = withoutActive.findIndex((widget) => widget.id === overId)

  const destinationItems = withoutActive.filter(
    (widget) => widget.sectionId === destinationSectionId,
  )

  const insertAt =
    overIndex < 0
      ? layout.widgets.length
      : withoutActive.findIndex((widget) => widget.id === overId)

  const moved = { ...active, sectionId: destinationSectionId }

  const next = [...withoutActive]

  next.splice(Math.max(0, insertAt), 0, moved)

  if (overIndex < 0 && destinationItems.length) {
    const lastDestinationIndex = next.reduce(
      (last, widget, index) =>
        widget.sectionId === destinationSectionId ? index : last,

      -1,
    )

    next.splice(next.indexOf(moved), 1)

    next.splice(lastDestinationIndex + 1, 0, moved)
  }

  return { ...layout, preset: "custom", widgets: next }
}
