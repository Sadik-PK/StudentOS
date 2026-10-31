import { describe, expect, it } from "vitest";
import { appStateSchema } from "../src/schemas/state.js";

const validState = {
  timetable: [],
  attendance: [],
  attendanceMarks: {},
  assignments: [],
  exams: [],
  notes: [],
  gpaGrades: [],
  settings: {
    profileName: "Student",
    semesterStartDate: "2026-08-01",
    semesterEndDate: "2026-11-30",
  },
  todos: [],
  expenses: [],
  customExpenseCategories: [],
  pomodoro: {
    mode: "focus",
    remainingSeconds: 1500,
    focusDurationSeconds: 1500,
    breakDurationSeconds: 300,
    isRunning: false,
    endTime: null,
    completedSessions: 0,
  },
};

describe("StudentOS state validation", () => {
  it("accepts a complete state payload", () => {
    expect(appStateSchema.safeParse(validState).success).toBe(true);
  });

  it("accepts expenses without a description", () => {
    const state = {
      ...validState,
      expenses: [
        {
          id: "expense-1",
          description: "",
          amount: 25,
          category: "food",
          date: "2026-10-31",
          createdAt: "2026-10-31T00:00:00.000Z",
        },
      ],
    };

    expect(appStateSchema.safeParse(state).success).toBe(true);
  });

  it("preserves assignment notes and note attachment names", () => {
    const state = {
      ...validState,
      assignments: [
        {
          id: "assignment-1",
          courseCode: "CSE111",
          title: "Read chapter",
          dueDate: "2026-11-01",
          priority: "medium",
          completed: false,
          notes: "Review sections 1 and 2.",
          reminderMinutes: 15,
          fileName: "reading.pdf",
          createdAt: "2026-10-30T00:00:00.000Z",
        },
      ],
      notes: [
        {
          id: "note-1",
          courseCode: "CSE111",
          title: "Lecture",
          description: "",
          fileName: "slides.pdf",
          date: "2026-10-30",
          pinned: false,
        },
      ],
    };

    const parsed = appStateSchema.parse(state);

    expect(parsed.assignments[0].notes).toBe("Review sections 1 and 2.");
    expect(parsed.assignments[0].fileName).toBe("reading.pdf");
    expect(parsed.assignments[0].reminderMinutes).toBe(15);
    expect(parsed.notes[0].fileName).toBe("slides.pdf");
  });

  it("normalizes null optional values from existing client state", () => {
    const state = {
      ...validState,
      timetable: [
        {
          id: "class-1",
          day: "Monday",
          startTime: "09:00",
          endTime: "10:00",
          courseCode: "CSE111",
          courseName: "Computing",
          type: "Lecture",
          room: "A101",
          group: null,
          note: null,
        },
      ],
      assignments: [
        {
          id: "assignment-1",
          courseCode: "CSE111",
          title: "Read chapter",
          dueDate: "2026-11-01",
          priority: "medium",
          completed: false,
          notes: "",
          fileId: null,
          fileName: null,
          createdAt: "2026-10-30T00:00:00.000Z",
        },
      ],
      settings: {
        ...validState.settings,
        profilePictureId: null,
        dashboardOrder: null,
      },
    };

    const parsed = appStateSchema.parse(state);

    expect(parsed.timetable[0].group).toBeUndefined();
    expect(parsed.timetable[0].note).toBeUndefined();
    expect(parsed.assignments[0].fileId).toBeUndefined();
    expect(parsed.assignments[0].fileName).toBeUndefined();
    expect(parsed.settings.profilePictureId).toBeUndefined();
    expect(parsed.settings.dashboardOrder).toBeUndefined();
  });

  it("rejects duplicate record identifiers before database writes", () => {
    const state = {
      ...validState,
      assignments: [
        {
          id: "same-id",
          courseCode: "CSE111",
          title: "First",
          dueDate: "2026-11-01",
          priority: "medium",
          completed: false,
          notes: "",
          createdAt: "2026-10-30T00:00:00.000Z",
        },
        {
          id: "same-id",
          courseCode: "CSE111",
          title: "Second",
          dueDate: "2026-11-02",
          priority: "high",
          completed: false,
          notes: "",
          createdAt: "2026-10-30T00:00:00.000Z",
        },
      ],
    };

    expect(appStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects invalid attachment identifiers", () => {
    const state = {
      ...validState,
      notes: [
        {
          id: "note-1",
          courseCode: "CSE111",
          title: "Lecture",
          description: "",
          date: "2026-10-30",
          pinned: false,
          fileId: "not-a-uuid",
        },
      ],
    };

    expect(appStateSchema.safeParse(state).success).toBe(false);
  });

  it("rejects duplicate dashboard sections", () => {
    const state = {
      ...validState,
      settings: {
        ...validState.settings,
        dashboardOrder: ["todos", "todos"],
      },
    };

    expect(appStateSchema.safeParse(state).success).toBe(false);
  });
});
