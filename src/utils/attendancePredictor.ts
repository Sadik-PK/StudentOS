import type { AttendanceRecord, TimetableEntry } from '../types';
import { COURSES, getDayName } from '../data';

export interface PredictorContext {
  attendance: AttendanceRecord[];
  timetable: TimetableEntry[];
  requiredPct?: number; // defaults to 75
  selectedCourseCode?: string; // 'overall' or specific code
}

export type ScenarioType =
  | 'miss'
  | 'attend'
  | 'bunk_limit'
  | 'reach_target'
  | 'schedule_day'
  | 'combined';

export interface ScheduleClassInfo {
  courseCode: string;
  courseName: string;
  startTime: string;
  endTime: string;
  room: string;
  type: string;
}

export interface AttendancePredictionResult {
  scope: string; // 'overall' or courseCode
  scopeName: string;
  scenarioType: ScenarioType;
  question?: string;

  // Baseline data
  currentAttended: number;
  currentDutyLeave: number;
  currentTotal: number;
  currentMissed: number;
  currentPct: number;

  // Projected data
  projectedAttended: number;
  projectedDutyLeave: number;
  projectedTotal: number;
  projectedMissed: number;
  projectedPct: number;
  pctDelta: number;

  // Requirements & status
  requiredPct: number;
  status: 'safe' | 'warning' | 'critical';
  isSafe: boolean;

  // Specific simulation parameters
  classesMissedSimulated?: number;
  classesAttendedSimulated?: number;

  // Reverse calculation results
  bunkLimit?: number;
  classesNeeded?: number | null;
  targetPct?: number;
  isTargetUnreachable?: boolean;

  // Human-readable explanations
  summary: string;
  explanation: string;
  formula: string;

  // Schedule context if relevant
  scheduleDetails?: {
    day: string;
    isTomorrow: boolean;
    classCount: number;
    classes: ScheduleClassInfo[];
  };
}

export interface ParsedIntent {
  scenarioType: ScenarioType;
  courseCode?: string; // undefined means use current context / overall
  missCount?: number;
  attendCount?: number;
  targetPct?: number;
  requiredPct?: number;
  dayName?: string;
  isTomorrow?: boolean;
  confidence: number;
  matchedRule: string;
}

/**
 * Standard rounding to 2 decimal places to avoid IEEE-754 floating point issues.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate attendance percentage with duty leave counted as attended.
 */
export function calculateAttendancePct(
  attended: number,
  total: number,
  dutyLeave: number = 0
): number {
  if (total <= 0) return 100;
  const effective = attended + dutyLeave;
  return round2((effective / total) * 100);
}

/**
 * Aggregates attendance records for overall or single-course calculation.
 */
export function getAggregateRecord(
  attendance: AttendanceRecord[],
  courseCode?: string
): { attended: number; dutyLeave: number; total: number; missed: number; pct: number } {
  if (courseCode && courseCode !== 'overall') {
    const found = attendance.find(
      (r) => r.courseCode.toUpperCase() === courseCode.toUpperCase()
    );
    const attended = found ? found.attended : 0;
    const dutyLeave = found ? found.dutyLeave || 0 : 0;
    const total = found ? found.total : 0;
    const effective = attended + dutyLeave;
    const missed = Math.max(0, total - effective);
    const pct = total === 0 ? 100 : round2((effective / total) * 100);
    return { attended, dutyLeave, total, missed, pct };
  }

  // Overall attendance is the sum of attended divided by sum of conducted (weighted)
  let attended = 0;
  let dutyLeave = 0;
  let total = 0;

  for (const r of attendance) {
    attended += r.attended;
    dutyLeave += r.dutyLeave || 0;
    total += r.total;
  }

  const effective = attended + dutyLeave;
  const missed = Math.max(0, total - effective);
  const pct = total === 0 ? 100 : round2((effective / total) * 100);

  return { attended, dutyLeave, total, missed, pct };
}

/**
 * Determine status badge level:
 * - Safe: >= 80% (or at least required + 5%)
 * - Warning: >= requiredPct and < 80%
 * - Critical: < requiredPct
 */
export function determineStatus(pct: number, requiredPct: number = 75): 'safe' | 'warning' | 'critical' {
  if (pct >= Math.max(80, requiredPct + 5)) return 'safe';
  if (pct >= requiredPct) return 'warning';
  return 'critical';
}

/**
 * Calculate maximum classes a student can bunk without falling below required percentage.
 *
 * Formula:
 * (E) / (T + x) >= R / 100
 * T + x <= (E * 100) / R
 * x <= (E * 100) / R - T
 * maxBunk = floor((E * 100) / R - T)
 */
export function calculateBunkLimit(
  attended: number,
  total: number,
  dutyLeave: number = 0,
  requiredPct: number = 75
): number {
  const effective = attended + dutyLeave;
  if (total <= 0) return 0;
  const currentPct = (effective / total) * 100;
  if (currentPct < requiredPct) return 0; // Already below threshold

  if (requiredPct <= 0) return 999;

  const maxTotalAllowed = (effective * 100) / requiredPct;
  const limit = Math.floor(maxTotalAllowed - total + 1e-9);
  return Math.max(0, limit);
}

/**
 * Calculate consecutive classes a student must attend to reach target percentage.
 *
 * Formula:
 * (E + y) / (T + y) >= Target / 100
 * 100E + 100y >= Target*T + Target*y
 * y(100 - Target) >= Target*T - 100E
 * y = ceil((Target*T - 100E) / (100 - Target))
 */
export function calculateClassesNeeded(
  attended: number,
  total: number,
  dutyLeave: number = 0,
  targetPct: number = 75
): number | null {
  const effective = attended + dutyLeave;
  if (total <= 0) {
    return targetPct <= 100 ? 1 : null;
  }

  const currentPct = (effective / total) * 100;
  if (currentPct >= targetPct) return 0; // Already at or above target

  if (targetPct >= 100) {
    const missed = total - effective;
    // If even 1 class was missed, 100% is asymptotically impossible
    if (missed > 0) return null;
    return 0;
  }

  const numerator = targetPct * total - 100 * effective;
  const denominator = 100 - targetPct;
  const raw = numerator / denominator;
  return Math.max(1, Math.ceil(raw - 1e-9));
}

/**
 * Natural language numbers and text normalizer.
 */
const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  a: 1,
  an: 1,
  next: 1,
  single: 1,
  couple: 2,
  few: 3,
};

/**
 * Detect course code from string or fuzzy subject name.
 */
export function extractCourseCode(query: string, availableCodes?: string[]): string | undefined {
  const q = query.toLowerCase();

  // Direct code match (e.g. CSE111, INT108)
  for (const c of COURSES) {
    if (q.includes(c.code.toLowerCase())) {
      return c.code;
    }
  }

  // If availableCodes passed
  if (availableCodes) {
    for (const code of availableCodes) {
      if (q.includes(code.toLowerCase())) {
        return code;
      }
    }
  }

  // Friendly name keywords
  if (q.includes('math') || q.includes('calculus') || q.includes('algebra')) return 'MTH165';
  if (q.includes('python')) return 'INT108';
  if (q.includes('internet') || q.includes('web')) return 'CSE326';
  if (q.includes('orientation') || q.includes('computing')) return 'CSE111';
  if (q.includes('design thinking') || q.includes('thinking')) return 'INT335';
  if (q.includes('autocad') || q.includes('cad') || q.includes('drawing') || q.includes('engineering drawing')) return 'MEC136';

  if (q.includes('overall') || q.includes('all subjects') || q.includes('total') || q.includes('everything')) {
    return 'overall';
  }

  return undefined;
}

/**
 * Deterministic Natural Language Query Parser.
 * Converts common questions into structured intents without external API calls.
 */
export function parseAttendanceQuery(query: string, context: PredictorContext): ParsedIntent {
  const clean = query.trim().toLowerCase();
  const explicitCourse = extractCourseCode(clean, context.attendance.map((a) => a.courseCode));
  const courseCode = explicitCourse ?? (context.selectedCourseCode || 'overall');

  // Check for target percentage in query (e.g., "reach 90%", "maintain 80%")
  const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
  const explicitPct = pctMatch ? parseFloat(pctMatch[1]) : undefined;

  // Check for day of the week or "tomorrow"
  const isTomorrow = clean.includes('tomorrow');
  let dayName: string | undefined;

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const d of days) {
    if (clean.includes(d)) {
      dayName = d.charAt(0).toUpperCase() + d.slice(1);
      break;
    }
  }

  if (isTomorrow) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dayName = getDayName(tomorrow);
  }

  // Pattern 1: Bunk limit / how many can I miss
  const isBunkLimitQuery =
    clean.includes('bunk limit') ||
    clean.includes('how many classes can i bunk') ||
    clean.includes('how many can i bunk') ||
    clean.includes('how many classes can i miss') ||
    clean.includes('how many can i miss') ||
    clean.includes('how many classes can i skip') ||
    clean.includes('how many can i skip') ||
    clean.includes('falls below') ||
    clean.includes('fall below') ||
    clean.includes('drop below') ||
    clean.includes('drops below') ||
    clean.includes('before dropping') ||
    clean.includes('safe to bunk') ||
    clean.includes('can i bunk without');

  if (isBunkLimitQuery) {
    return {
      scenarioType: 'bunk_limit',
      courseCode,
      requiredPct: explicitPct ?? context.requiredPct ?? 75,
      confidence: 0.95,
      matchedRule: 'bunk_limit_query',
    };
  }

  // Pattern 2: Reach target / classes to attend
  const isReachTargetQuery =
    clean.includes('reach') ||
    clean.includes('to get') ||
    clean.includes('to maintain') ||
    clean.includes('how many classes do i need to attend') ||
    clean.includes('how many classes must i attend') ||
    clean.includes('classes needed') ||
    clean.includes('classes required');

  if (isReachTargetQuery && explicitPct !== undefined) {
    return {
      scenarioType: 'reach_target',
      courseCode,
      targetPct: explicitPct,
      confidence: 0.95,
      matchedRule: 'reach_target_explicit_pct',
    };
  }

  if (isReachTargetQuery) {
    return {
      scenarioType: 'reach_target',
      courseCode,
      targetPct: explicitPct ?? 75,
      confidence: 0.85,
      matchedRule: 'reach_target_default_75',
    };
  }

  // Pattern 3: Missing upcoming day / tomorrow schedule
  if ((isTomorrow || dayName) && (clean.includes('skip') || clean.includes('miss') || clean.includes('bunk') || clean.includes('what if'))) {
    // If count is not explicitly specified, assume user means all classes scheduled on that day
    const numberMatch = extractNumber(clean);
    return {
      scenarioType: 'schedule_day',
      courseCode,
      dayName,
      isTomorrow,
      missCount: numberMatch ?? undefined,
      confidence: 0.9,
      matchedRule: 'schedule_day_miss',
    };
  }

  // Pattern 4: Missing classes ("What if I miss 2 classes?", "bunk the next 3")
  const isMissQuery =
    clean.includes('miss') ||
    clean.includes('skip') ||
    clean.includes('bunk') ||
    clean.includes('absent') ||
    clean.includes('ditch');

  if (isMissQuery) {
    const count = extractNumber(clean) ?? 1;
    return {
      scenarioType: 'miss',
      courseCode,
      missCount: count,
      confidence: 0.9,
      matchedRule: 'miss_classes',
    };
  }

  // Pattern 5: Attending classes ("What if I attend 5 classes?", "attend 2 classes")
  const isAttendQuery =
    clean.includes('attend') ||
    clean.includes('present') ||
    clean.includes('go to') ||
    clean.includes('join');

  if (isAttendQuery) {
    const count = extractNumber(clean) ?? 1;
    return {
      scenarioType: 'attend',
      courseCode,
      attendCount: count,
      confidence: 0.9,
      matchedRule: 'attend_classes',
    };
  }

  // Fallback: If user types just a number or simple word like "2" or "bunk"
  const rawNumber = extractNumber(clean);
  if (rawNumber) {
    return {
      scenarioType: 'miss',
      courseCode,
      missCount: rawNumber,
      confidence: 0.6,
      matchedRule: 'fallback_number_as_miss',
    };
  }

  // Default fallback: bunk limit check
  return {
    scenarioType: 'bunk_limit',
    courseCode,
    requiredPct: context.requiredPct ?? 75,
    confidence: 0.5,
    matchedRule: 'default_bunk_limit',
  };
}

/**
 * Extracts numeric count from query string (digits or spelled-out words).
 */
export function extractNumber(text: string): number | null {
  // Check for explicit digit (e.g. 2, 5, 10)
  const digitMatch = text.match(/\b\d+\b/);
  if (digitMatch) {
    return parseInt(digitMatch[0], 10);
  }

  // Check word numbers
  const words = text.toLowerCase().split(/[\s,?!.]+/);
  for (const w of words) {
    if (WORD_TO_NUMBER[w] !== undefined) {
      return WORD_TO_NUMBER[w];
    }
  }

  return null;
}

/**
 * Main prediction executor. Produces an exact, deterministic calculation and explanation.
 */
export function predictAttendance(
  context: PredictorContext,
  intentOrQuery: string | ParsedIntent
): AttendancePredictionResult {
  const intent: ParsedIntent =
    typeof intentOrQuery === 'string'
      ? parseAttendanceQuery(intentOrQuery, context)
      : intentOrQuery;

  const requiredPct = intent.requiredPct ?? context.requiredPct ?? 75;
  const courseCode = intent.courseCode ?? context.selectedCourseCode ?? 'overall';
  const isOverall = courseCode === 'overall';

  // Get baseline record
  const base = getAggregateRecord(context.attendance, isOverall ? 'overall' : courseCode);
  const courseMeta = COURSES.find((c) => c.code === courseCode);
  const scopeName = isOverall
    ? 'Overall Attendance'
    : courseMeta
    ? `${courseMeta.name} (${courseCode})`
    : courseCode;

  // Schedule lookup if relevant
  let scheduleDetails: AttendancePredictionResult['scheduleDetails'] | undefined;
  if (intent.dayName || intent.scenarioType === 'schedule_day') {
    const day = intent.dayName || getDayName(new Date());
    const dayClasses = context.timetable
      .filter((e) => e.day === day)
      .filter((e) => (isOverall ? true : e.courseCode.toUpperCase() === courseCode.toUpperCase()))
      .map((e) => ({
        courseCode: e.courseCode,
        courseName: e.courseName,
        startTime: e.startTime,
        endTime: e.endTime,
        room: e.room,
        type: e.type,
      }));

    scheduleDetails = {
      day,
      isTomorrow: Boolean(intent.isTomorrow),
      classCount: dayClasses.length,
      classes: dayClasses,
    };
  }

  // Handle Scenario: Bunk Limit
  if (intent.scenarioType === 'bunk_limit') {
    const limit = calculateBunkLimit(base.attended, base.total, base.dutyLeave, requiredPct);
    const projectedTotal = base.total + limit;
    const projectedAttended = base.attended + base.dutyLeave;
    const projectedPct = calculateAttendancePct(base.attended, projectedTotal, base.dutyLeave);
    const pctDelta = round2(projectedPct - base.pct);
    const isSafe = base.pct >= requiredPct;
    const status = determineStatus(projectedPct, requiredPct);

    let summary = '';
    let explanation = '';

    if (!isSafe) {
      summary = `Your attendance is currently ${base.pct.toFixed(2)}%, which is already below the ${requiredPct}% threshold.`;
      explanation = `You cannot safely bunk any classes. Attend upcoming classes to bring your attendance back above ${requiredPct}%.`;
    } else if (limit === 0) {
      summary = `You are right at the edge: bunking even 1 more class will drop you below ${requiredPct}%.`;
      explanation = `If you miss 1 class, your attendance drops to ${calculateAttendancePct(base.attended, base.total + 1, base.dutyLeave).toFixed(2)}% (Critical).`;
    } else {
      summary = `You can safely bunk up to ${limit} ${limit === 1 ? 'class' : 'classes'} and maintain ${projectedPct.toFixed(2)}% (≥ ${requiredPct}%).`;
      explanation = `At ${limit} missed classes: ${projectedAttended}/${projectedTotal} = ${projectedPct.toFixed(2)}% (Safe). Missing ${limit + 1} classes drops it to ${calculateAttendancePct(base.attended, base.total + limit + 1, base.dutyLeave).toFixed(2)}% (Below threshold).`;
    }

    return {
      scope: courseCode,
      scopeName,
      scenarioType: 'bunk_limit',
      currentAttended: base.attended,
      currentDutyLeave: base.dutyLeave,
      currentTotal: base.total,
      currentMissed: base.missed,
      currentPct: base.pct,
      projectedAttended: base.attended,
      projectedDutyLeave: base.dutyLeave,
      projectedTotal,
      projectedMissed: base.missed + limit,
      projectedPct,
      pctDelta,
      requiredPct,
      status,
      isSafe,
      bunkLimit: limit,
      summary,
      explanation,
      formula: `Max bunk = ⌊(${base.attended + base.dutyLeave} × 100 / ${requiredPct}) - ${base.total}⌋ = ${limit}`,
      scheduleDetails,
    };
  }

  // Handle Scenario: Reach Target Percentage
  if (intent.scenarioType === 'reach_target') {
    const target = intent.targetPct ?? 75;
    const needed = calculateClassesNeeded(base.attended, base.total, base.dutyLeave, target);
    const isTargetUnreachable = needed === null;

    if (isTargetUnreachable) {
      const summary = `Reaching ${target}% is mathematically impossible.`;
      const explanation = `You have already missed ${base.missed} ${base.missed === 1 ? 'class' : 'classes'}. Once classes are missed, attendance can never return to 100.00%.`;
      return {
        scope: courseCode,
        scopeName,
        scenarioType: 'reach_target',
        currentAttended: base.attended,
        currentDutyLeave: base.dutyLeave,
        currentTotal: base.total,
        currentMissed: base.missed,
        currentPct: base.pct,
        projectedAttended: base.attended,
        projectedDutyLeave: base.dutyLeave,
        projectedTotal: base.total,
        projectedMissed: base.missed,
        projectedPct: base.pct,
        pctDelta: 0,
        requiredPct,
        status: determineStatus(base.pct, requiredPct),
        isSafe: base.pct >= requiredPct,
        targetPct: target,
        classesNeeded: null,
        isTargetUnreachable: true,
        summary,
        explanation,
        formula: `Target ${target}% cannot be reached when missed classes > 0`,
        scheduleDetails,
      };
    }

    const classesToAttend = needed;
    const projectedAttended = base.attended + classesToAttend;
    const projectedTotal = base.total + classesToAttend;
    const projectedPct = calculateAttendancePct(projectedAttended, projectedTotal, base.dutyLeave);
    const pctDelta = round2(projectedPct - base.pct);
    const status = determineStatus(projectedPct, requiredPct);

    let summary = '';
    let explanation = '';

    if (classesToAttend === 0) {
      summary = `Your attendance (${base.pct.toFixed(2)}%) is already at or above your target of ${target}%.`;
      explanation = `You need 0 additional classes to meet this target. Maintain your current attendance rate.`;
    } else {
      summary = `Attend the next ${classesToAttend} consecutive ${classesToAttend === 1 ? 'class' : 'classes'} to reach ${projectedPct.toFixed(2)}% (≥ ${target}%).`;
      explanation = `Attending ${classesToAttend} consecutive classes yields (${base.attended + base.dutyLeave} + ${classesToAttend}) / (${base.total} + ${classesToAttend}) = ${projectedAttended + base.dutyLeave}/${projectedTotal} = ${projectedPct.toFixed(2)}%.`;
    }

    return {
      scope: courseCode,
      scopeName,
      scenarioType: 'reach_target',
      currentAttended: base.attended,
      currentDutyLeave: base.dutyLeave,
      currentTotal: base.total,
      currentMissed: base.missed,
      currentPct: base.pct,
      projectedAttended,
      projectedDutyLeave: base.dutyLeave,
      projectedTotal,
      projectedMissed: base.missed,
      projectedPct,
      pctDelta,
      requiredPct,
      status,
      isSafe: projectedPct >= requiredPct,
      targetPct: target,
      classesNeeded: classesToAttend,
      summary,
      explanation,
      formula: `Classes needed = ⌈(${target} × ${base.total} - 100 × ${base.attended + base.dutyLeave}) / (100 - ${target})⌉ = ${classesToAttend}`,
      scheduleDetails,
    };
  }

  // Handle Scenario: Schedule Day Miss
  if (intent.scenarioType === 'schedule_day' && scheduleDetails) {
    const scheduledCount = scheduleDetails.classCount;
    const dayLabel = scheduleDetails.isTomorrow ? `tomorrow (${scheduleDetails.day})` : scheduleDetails.day;

    if (scheduledCount === 0) {
      const summary = `You have no ${scopeName} classes scheduled for ${dayLabel}.`;
      const explanation = `Your timetable has 0 classes scheduled for this day, so skipping it will have zero impact on your attendance.`;
      return {
        scope: courseCode,
        scopeName,
        scenarioType: 'schedule_day',
        currentAttended: base.attended,
        currentDutyLeave: base.dutyLeave,
        currentTotal: base.total,
        currentMissed: base.missed,
        currentPct: base.pct,
        projectedAttended: base.attended,
        projectedDutyLeave: base.dutyLeave,
        projectedTotal: base.total,
        projectedMissed: base.missed,
        projectedPct: base.pct,
        pctDelta: 0,
        requiredPct,
        status: determineStatus(base.pct, requiredPct),
        isSafe: base.pct >= requiredPct,
        summary,
        explanation,
        formula: `0 classes scheduled for ${scheduleDetails.day}`,
        scheduleDetails,
      };
    }

    const missCount = intent.missCount ? Math.min(intent.missCount, scheduledCount) : scheduledCount;
    const projectedTotal = base.total + missCount;
    const projectedPct = calculateAttendancePct(base.attended, projectedTotal, base.dutyLeave);
    const pctDelta = round2(projectedPct - base.pct);
    const status = determineStatus(projectedPct, requiredPct);
    const isSafe = projectedPct >= requiredPct;

    const summary = `Missing ${missCount} ${missCount === 1 ? 'class' : 'classes'} on ${dayLabel} drops your attendance from ${base.pct.toFixed(2)}% to ${projectedPct.toFixed(2)}% (${pctDelta >= 0 ? '+' : ''}${pctDelta.toFixed(2)}%).`;
    const explanation = `${scheduleDetails.classCount} classes scheduled. Missing ${missCount}: ${base.attended + base.dutyLeave}/${projectedTotal} = ${projectedPct.toFixed(2)}%. Threshold status: ${isSafe ? 'Safe' : 'Critical'}.`;

    return {
      scope: courseCode,
      scopeName,
      scenarioType: 'schedule_day',
      currentAttended: base.attended,
      currentDutyLeave: base.dutyLeave,
      currentTotal: base.total,
      currentMissed: base.missed,
      currentPct: base.pct,
      projectedAttended: base.attended,
      projectedDutyLeave: base.dutyLeave,
      projectedTotal,
      projectedMissed: base.missed + missCount,
      projectedPct,
      pctDelta,
      requiredPct,
      status,
      isSafe,
      classesMissedSimulated: missCount,
      summary,
      explanation,
      formula: `(${base.attended + base.dutyLeave}) / (${base.total} + ${missCount}) = ${projectedPct.toFixed(2)}%`,
      scheduleDetails,
    };
  }

  // Handle Scenario: Attend X classes
  if (intent.scenarioType === 'attend') {
    const attendCount = Math.max(1, intent.attendCount ?? 1);
    const projectedAttended = base.attended + attendCount;
    const projectedTotal = base.total + attendCount;
    const projectedPct = calculateAttendancePct(projectedAttended, projectedTotal, base.dutyLeave);
    const pctDelta = round2(projectedPct - base.pct);
    const status = determineStatus(projectedPct, requiredPct);
    const isSafe = projectedPct >= requiredPct;

    const summary = `Attending the next ${attendCount} ${attendCount === 1 ? 'class' : 'classes'} raises your attendance from ${base.pct.toFixed(2)}% to ${projectedPct.toFixed(2)}% (+${pctDelta.toFixed(2)}%).`;
    const explanation = `Attended increases to ${projectedAttended + base.dutyLeave}, Conducted increases to ${projectedTotal}. (${projectedAttended + base.dutyLeave}/${projectedTotal}) × 100 = ${projectedPct.toFixed(2)}%.`;

    return {
      scope: courseCode,
      scopeName,
      scenarioType: 'attend',
      currentAttended: base.attended,
      currentDutyLeave: base.dutyLeave,
      currentTotal: base.total,
      currentMissed: base.missed,
      currentPct: base.pct,
      projectedAttended,
      projectedDutyLeave: base.dutyLeave,
      projectedTotal,
      projectedMissed: base.missed,
      projectedPct,
      pctDelta,
      requiredPct,
      status,
      isSafe,
      classesAttendedSimulated: attendCount,
      summary,
      explanation,
      formula: `(${base.attended + base.dutyLeave} + ${attendCount}) / (${base.total} + ${attendCount}) = ${projectedPct.toFixed(2)}%`,
      scheduleDetails,
    };
  }

  // Handle Scenario: Miss X classes (default)
  const missCount = Math.max(1, intent.missCount ?? 1);
  const projectedTotal = base.total + missCount;
  const projectedPct = calculateAttendancePct(base.attended, projectedTotal, base.dutyLeave);
  const pctDelta = round2(projectedPct - base.pct);
  const status = determineStatus(projectedPct, requiredPct);
  const isSafe = projectedPct >= requiredPct;

  const currentBunkLimit = calculateBunkLimit(base.attended, base.total, base.dutyLeave, requiredPct);
  const remainingBunkLimit = Math.max(0, currentBunkLimit - missCount);

  let summary = `Missing ${missCount} ${missCount === 1 ? 'class' : 'classes'} reduces your attendance from ${base.pct.toFixed(2)}% to ${projectedPct.toFixed(2)}% (${pctDelta.toFixed(2)}%).`;
  let explanation = '';

  if (!isSafe) {
    explanation = `Warning: This drops your attendance below the required ${requiredPct}% threshold! You would need to attend ${calculateClassesNeeded(base.attended, projectedTotal, base.dutyLeave, requiredPct) ?? 1} consecutive classes to recover.`;
  } else {
    explanation = `You remain safe above ${requiredPct}%. You can still miss ${remainingBunkLimit} more ${remainingBunkLimit === 1 ? 'class' : 'classes'} before reaching the threshold.`;
  }

  return {
    scope: courseCode,
    scopeName,
    scenarioType: 'miss',
    currentAttended: base.attended,
    currentDutyLeave: base.dutyLeave,
    currentTotal: base.total,
    currentMissed: base.missed,
    currentPct: base.pct,
    projectedAttended: base.attended,
    projectedDutyLeave: base.dutyLeave,
    projectedTotal,
    projectedMissed: base.missed + missCount,
    projectedPct,
    pctDelta,
    requiredPct,
    status,
    isSafe,
    classesMissedSimulated: missCount,
    bunkLimit: remainingBunkLimit,
    summary,
    explanation,
    formula: `(${base.attended + base.dutyLeave}) / (${base.total} + ${missCount}) = ${projectedPct.toFixed(2)}%`,
    scheduleDetails,
  };
}
