import {
  calculateAttendancePct,
  calculateBunkLimit,
  calculateClassesNeeded,
  getAggregateRecord,
  parseAttendanceQuery,
  predictAttendance,
  round2,
} from './attendancePredictor';
import { AttendanceRecord, TimetableEntry } from '../types';

describe('Attendance Predictor Engine', () => {
  // Test 1: Baseline formulas (user example from requirements)
  test('accurately calculates percentage and simulation for missed/attended classes', () => {
    // Current: 40 conducted, 32 attended (80%)
    expect(calculateAttendancePct(32, 40)).toBe(80.0);

    // If student misses 2: 42 conducted, 32 attended => 76.19%
    expect(calculateAttendancePct(32, 42)).toBe(76.19);

    // If student attends 2: 42 conducted, 34 attended => 80.95%
    expect(calculateAttendancePct(34, 42)).toBe(80.95);
  });

  // Test 2: Bunk limit
  test('calculates maximum classes that can be bunked while keeping >= 75%', () => {
    // 32/40 (80%) -> Can bunk 2 classes (32/42 = 76.19%, 32/43 = 74.42%)
    expect(calculateBunkLimit(32, 40, 0, 75)).toBe(2);

    // When already below threshold
    expect(calculateBunkLimit(10, 20, 0, 75)).toBe(0);

    // When exactly at threshold: 30/40 = 75%
    expect(calculateBunkLimit(30, 40, 0, 75)).toBe(0);
  });

  // Test 3: Reverse calculation - Classes to attend to reach target
  test('calculates consecutive classes needed to reach target percentage', () => {
    // 32/40 (80%), target 90% => 40 classes needed
    expect(calculateClassesNeeded(32, 40, 0, 90)).toBe(40);
    expect(calculateAttendancePct(32 + 40, 40 + 40)).toBe(90.0);

    // 6/10 (60%), target 75% => 6 classes needed
    expect(calculateClassesNeeded(6, 10, 0, 75)).toBe(6);
    expect(calculateAttendancePct(6 + 6, 10 + 6)).toBe(75.0);

    // Target 100% when classes were missed is impossible
    expect(calculateClassesNeeded(32, 40, 0, 100)).toBeNull();

    // Already above target
    expect(calculateClassesNeeded(32, 40, 0, 75)).toBe(0);
  });

  // Test 4: Weighted overall attendance aggregation
  test('aggregates overall attendance as sum(attended) / sum(total)', () => {
    const records: AttendanceRecord[] = [
      { courseCode: 'CSE111', attended: 8, total: 10, dutyLeave: 0 },
      { courseCode: 'MTH165', attended: 9, total: 12, dutyLeave: 0 },
    ];
    const agg = getAggregateRecord(records);
    expect(agg.attended).toBe(17);
    expect(agg.total).toBe(22);
    expect(agg.pct).toBe(round2((17 / 22) * 100));
  });

  // Test 5: Natural language intent parsing
  test('parses common student questions correctly', () => {
    const mockContext = {
      attendance: [
        { courseCode: 'INT108', attended: 14, total: 18, dutyLeave: 0 },
      ],
      timetable: [] as TimetableEntry[],
      requiredPct: 75,
    };

    expect(
      parseAttendanceQuery('What will my attendance be if I miss the next 2 classes?', mockContext)
    ).toMatchObject({ scenarioType: 'miss', missCount: 2 });

    expect(
      parseAttendanceQuery('What if I attend the next 5 classes?', mockContext)
    ).toMatchObject({ scenarioType: 'attend', attendCount: 5 });

    expect(
      parseAttendanceQuery('How many classes can I bunk while maintaining 75%?', mockContext)
    ).toMatchObject({ scenarioType: 'bunk_limit', requiredPct: 75 });

    expect(
      parseAttendanceQuery('How many classes do I need to attend to reach 90%?', mockContext)
    ).toMatchObject({ scenarioType: 'reach_target', targetPct: 90 });

    expect(
      parseAttendanceQuery('What if I bunk 3 python classes?', mockContext)
    ).toMatchObject({ scenarioType: 'miss', missCount: 3, courseCode: 'INT108' });
  });
});

