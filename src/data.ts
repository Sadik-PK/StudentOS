import { TimetableEntry, Course, AttendanceRecord, AppSettings, GPAGrade, DashboardSection } from './types';

export const COURSES: Course[] = [
  { code: 'CSE111', name: 'Orientation to Computing', credits: 3 },
  { code: 'CSE326', name: 'Internet Programming', credits: 2 },
  { code: 'INT108', name: 'Python Programming', credits: 4 },
  { code: 'INT335', name: 'Design Thinking', credits: 2 },
  { code: 'MEC136', name: 'Engineering Drawing with AutoCAD', credits: 4 },
  { code: 'MTH165', name: 'Mathematics for Engineers', credits: 4 },
];

export const GRADE_POINTS: Record<string, number> = {
  'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 4, 'F': 0,
};

export const DEFAULT_TIMETABLE: TimetableEntry[] = [
];

export const DEFAULT_ATTENDANCE: AttendanceRecord[] = [
];

export const DEFAULT_GPA_GRADES: GPAGrade[] = [];

export const DEFAULT_DASHBOARD_ORDER: DashboardSection[] = [
  'nextClass',
  'todaySchedule',
  'semesterProgress',
  'calendar',
  'expenses',
  'attendance',
  'assignments',
  'exams',
  'todos',
];

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: '',
  semesterStartDate: '',
  semesterEndDate: '',
  dashboardOrder: DEFAULT_DASHBOARD_ORDER,
};

export const DAYS_OF_WEEK: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function getDayName(date: Date): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
}
