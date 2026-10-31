export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type ClassType = 'Lecture' | 'Tutorial' | 'Practical';
export type Priority = 'high' | 'medium' | 'low';
export type AttendanceMarkStatus = 'present' | 'absent';
export type ExpenseCategory = 'food' | 'transport' | 'study' | 'housing' | 'health' | 'entertainment' | 'other' | `custom:${string}`;
export type Page = 'dashboard' | 'timetable' | 'attendance' | 'assignments' | 'exams' | 'notes' | 'gpa' | 'expenses' | 'study-timer' | 'settings';

export interface TimetableEntry {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  type: ClassType;
  room: string;
  group?: string;
  note?: string;
}

export interface Course {
  code: string;
  name: string;
  credits: number;
}

export interface AttendanceRecord {
  courseCode: string;
  attended: number;
  total: number;
  dutyLeave: number;
}

export interface Assignment {
  id: string;
  courseCode: string;
  title: string;
  dueDate: string;
  priority: Priority;
  completed: boolean;
  notes: string;
  createdAt: string;
  fileId?: string;
  fileName?: string;
}

export interface Exam {
  id: string;
  courseCode: string;
  type: string;
  date: string;
  startTime: string;
  room: string;
}

export interface Note {
  id: string;
  courseCode: string;
  title: string;
  description: string;
  fileName?: string;
  fileId?: string;
  date: string;
  pinned: boolean;
}

export interface GPAGrade {
  courseCode: string;
  grade: string;
}

export interface AppSettings {
  profileName: string;
  semesterStartDate: string;
  semesterEndDate: string;
  profilePictureId?: string;
  dashboardOrder?: DashboardSection[];
}

export type DashboardSection =
  | 'nextClass'
  | 'todaySchedule'
  | 'semesterProgress'
  | 'expenses'
  | 'attendance'
  | 'assignments'
  | 'exams'
  | 'todos';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  createdAt: string;
}

export interface CustomExpenseCategory {
  id: ExpenseCategory;
  label: string;
}

export interface PomodoroState {
  mode: 'focus' | 'break';
  remainingSeconds: number;
  focusDurationSeconds: number;
  breakDurationSeconds: number;
  isRunning: boolean;
  endTime: string | null;
  completedSessions: number;
}

export interface AppState {
  timetable: TimetableEntry[];
  attendance: AttendanceRecord[];
  attendanceMarks: Record<string, AttendanceMarkStatus>;
  assignments: Assignment[];
  exams: Exam[];
  notes: Note[];
  gpaGrades: GPAGrade[];
  settings: AppSettings;
  todos: TodoItem[];
  expenses: Expense[];
  customExpenseCategories: CustomExpenseCategory[];
  pomodoro: PomodoroState;
}
