import { describe, expect, it } from "vitest"
import {
  DEFAULT_ATTENDANCE,
  DEFAULT_DASHBOARD_ORDER,
  DEFAULT_GPA_GRADES,
  DEFAULT_SETTINGS,
  DEFAULT_TIMETABLE,
} from "../data"

describe("new account defaults", () => {
  it("starts without seeded academic records", () => {
    expect(DEFAULT_TIMETABLE).toEqual([])
    expect(DEFAULT_ATTENDANCE).toEqual([])
    expect(DEFAULT_GPA_GRADES).toEqual([])
  })

  it("starts without preset semester dates or a placeholder profile", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      profileName: "",
      semesterStartDate: "",
      semesterEndDate: "",
      dashboardOrder: DEFAULT_DASHBOARD_ORDER,
    })
  })

  it("defines every rearrangeable dashboard section exactly once", () => {
    expect(DEFAULT_DASHBOARD_ORDER).toHaveLength(9)
    expect(new Set(DEFAULT_DASHBOARD_ORDER).size).toBe(
      DEFAULT_DASHBOARD_ORDER.length,
    )
  })
})
