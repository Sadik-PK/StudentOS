import { describe, expect, it } from "vitest"

import { DASHBOARD_WIDGETS } from "./registry"

import { moveDashboardWidget } from "./layout"

import { createDashboardLayout, DASHBOARD_PRESETS } from "./presets"

describe("dashboard layouts", () => {
  it("creates presets with unique, registered widgets in existing sections", () => {
    for (const preset of DASHBOARD_PRESETS) {
      const layout = createDashboardLayout(preset.id)

      const sectionIds = new Set(layout.sections.map((section) => section.id))

      const widgetIds = layout.widgets.map((widget) => widget.id)

      expect(new Set(widgetIds).size).toBe(widgetIds.length)

      for (const widget of layout.widgets) {
        expect(DASHBOARD_WIDGETS[widget.id]).toBeDefined()

        expect(sectionIds.has(widget.sectionId)).toBe(true)
      }
    }
  })

  it("moves widgets to another section and appends when its drop zone is empty", () => {
    const layout = createDashboardLayout("student")

    const result = moveDashboardWidget(layout, "calendar", "section:finance")

    const moved = result.widgets.find((widget) => widget.id === "calendar")

    expect(moved?.sectionId).toBe("finance")

    expect(result.preset).toBe("custom")

    expect(
      layout.widgets.find((widget) => widget.id === "calendar")?.sectionId,
    ).toBe("overview")
  })

  it("places a cross-section drop before the target widget", () => {
    const layout = createDashboardLayout("student")

    const result = moveDashboardWidget(layout, "nextClass", "todos")

    const productivityWidgets = result.widgets.filter(
      (widget) => widget.sectionId === "productivity",
    )

    expect(productivityWidgets.map((widget) => widget.id)).toEqual([
      "nextClass",
      "todos",
    ])
  })

  it("leaves a layout unchanged for invalid drop targets", () => {
    const layout = createDashboardLayout("student")

    expect(moveDashboardWidget(layout, "nextClass", "section:missing")).toBe(
      layout,
    )

    expect(moveDashboardWidget(layout, "missing", "todos")).toBe(layout)
  })
})
