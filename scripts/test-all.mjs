import assert from 'node:assert';

// Simulated environment for comprehensive testing
const COURSES = [
  { code: 'CSE111', name: 'Orientation to Computing', credits: 3 },
  { code: 'CSE326', name: 'Internet Programming', credits: 2 },
  { code: 'INT108', name: 'Python Programming', credits: 4 },
  { code: 'INT335', name: 'Design Thinking', credits: 2 },
  { code: 'MEC136', name: 'Engineering Drawing with AutoCAD', credits: 4 },
  { code: 'MTH165', name: 'Mathematics for Engineers', credits: 4 },
];

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function calculateAttendancePct(attended, total, dutyLeave = 0) {
  if (total <= 0) return 100;
  const effective = attended + dutyLeave;
  return round2((effective / total) * 100);
}

function calculateBunkLimit(attended, total, dutyLeave = 0, requiredPct = 75) {
  const effective = attended + dutyLeave;
  if (total <= 0) return 0;
  const currentPct = (effective / total) * 100;
  if (currentPct < requiredPct) return 0;
  if (requiredPct <= 0) return 999;
  const maxTotalAllowed = (effective * 100) / requiredPct;
  const limit = Math.floor(maxTotalAllowed - total + 1e-9);
  return Math.max(0, limit);
}

function calculateClassesNeeded(attended, total, dutyLeave = 0, targetPct = 75) {
  const effective = attended + dutyLeave;
  if (total <= 0) return targetPct <= 100 ? 1 : null;
  const currentPct = (effective / total) * 100;
  if (currentPct >= targetPct) return 0;
  if (targetPct >= 100) {
    const missed = total - effective;
    if (missed > 0) return null;
    return 0;
  }
  const numerator = targetPct * total - 100 * effective;
  const denominator = 100 - targetPct;
  const raw = numerator / denominator;
  return Math.max(1, Math.ceil(raw - 1e-9));
}

function getAggregateRecord(attendance, courseCode) {
  if (courseCode && courseCode !== 'overall') {
    const found = attendance.find((r) => r.courseCode.toUpperCase() === courseCode.toUpperCase());
    const attended = found ? found.attended : 0;
    const dutyLeave = found ? found.dutyLeave || 0 : 0;
    const total = found ? found.total : 0;
    const effective = attended + dutyLeave;
    const missed = Math.max(0, total - effective);
    const pct = total === 0 ? 100 : round2((effective / total) * 100);
    return { attended, dutyLeave, total, missed, pct };
  }

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

const WORD_TO_NUMBER = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, next: 1, single: 1, couple: 2, few: 3
};

function extractNumber(text) {
  const digitMatch = text.match(/\b\d+\b/);
  if (digitMatch) return parseInt(digitMatch[0], 10);
  const words = text.toLowerCase().split(/[\s,?!.]+/);
  for (const w of words) {
    if (WORD_TO_NUMBER[w] !== undefined) return WORD_TO_NUMBER[w];
  }
  return null;
}

function extractCourseCode(query) {
  const q = query.toLowerCase();
  for (const c of COURSES) {
    if (q.includes(c.code.toLowerCase())) return c.code;
  }
  if (q.includes('math') || q.includes('calculus')) return 'MTH165';
  if (q.includes('python')) return 'INT108';
  if (q.includes('internet') || q.includes('web')) return 'CSE326';
  if (q.includes('orientation') || q.includes('computing')) return 'CSE111';
  if (q.includes('design thinking') || q.includes('thinking')) return 'INT335';
  if (q.includes('autocad') || q.includes('cad') || q.includes('drawing')) return 'MEC136';
  if (q.includes('overall') || q.includes('all')) return 'overall';
  return undefined;
}

function parseAttendanceQuery(query, context) {
  const clean = query.trim().toLowerCase();
  const explicitCourse = extractCourseCode(clean);
  const courseCode = explicitCourse ?? (context.selectedCourseCode || 'overall');

  const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
  const explicitPct = pctMatch ? parseFloat(pctMatch[1]) : undefined;

  const isTomorrow = clean.includes('tomorrow');

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
    };
  }

  const isReachTargetQuery =
    clean.includes('reach') ||
    clean.includes('to get') ||
    clean.includes('to maintain') ||
    clean.includes('how many classes do i need to attend') ||
    clean.includes('how many classes must i attend') ||
    clean.includes('classes needed') ||
    clean.includes('classes required');

  if (isReachTargetQuery) {
    return {
      scenarioType: 'reach_target',
      courseCode,
      targetPct: explicitPct ?? 75,
    };
  }

  if (isTomorrow && (clean.includes('skip') || clean.includes('miss') || clean.includes('bunk') || clean.includes('what if'))) {
    const numberMatch = extractNumber(clean);
    return {
      scenarioType: 'schedule_day',
      courseCode,
      isTomorrow: true,
      missCount: numberMatch ?? undefined,
    };
  }

  const isMissQuery = clean.includes('miss') || clean.includes('skip') || clean.includes('bunk') || clean.includes('absent');
  if (isMissQuery) {
    return {
      scenarioType: 'miss',
      courseCode,
      missCount: extractNumber(clean) ?? 1,
    };
  }

  const isAttendQuery = clean.includes('attend') || clean.includes('present') || clean.includes('go to');
  if (isAttendQuery) {
    return {
      scenarioType: 'attend',
      courseCode,
      attendCount: extractNumber(clean) ?? 1,
    };
  }

  return {
    scenarioType: 'bunk_limit',
    courseCode,
    requiredPct: context.requiredPct ?? 75,
  };
}

console.log('--- COMPREHENSIVE SUITE TESTING ALL USER REQUIREMENTS ---');

const testAttendance = [
  { courseCode: 'CSE111', attended: 8, total: 10, dutyLeave: 0 },
  { courseCode: 'CSE326', attended: 6, total: 8, dutyLeave: 0 },
  { courseCode: 'INT108', attended: 14, total: 18, dutyLeave: 0 },
  { courseCode: 'INT335', attended: 5, total: 7, dutyLeave: 0 },
  { courseCode: 'MEC136', attended: 10, total: 14, dutyLeave: 0 },
  { courseCode: 'MTH165', attended: 9, total: 12, dutyLeave: 0 },
];

const ctx = {
  attendance: testAttendance,
  requiredPct: 75,
  selectedCourseCode: 'overall'
};

// 1. "What will my attendance be if I miss the next 2 classes?"
{
  const intent = parseAttendanceQuery('What will my attendance be if I miss the next 2 classes?', ctx);
  assert.strictEqual(intent.scenarioType, 'miss');
  assert.strictEqual(intent.missCount, 2);
  const agg = getAggregateRecord(ctx.attendance, intent.courseCode);
  const projectedPct = calculateAttendancePct(agg.attended, agg.total + 2, agg.dutyLeave);
  // Total: 52 attended out of 69 total => 75.36%
  // Miss 2: 52 / 71 => 73.24%
  assert.strictEqual(projectedPct, 73.24);
  console.log('✓ Query 1 passed: "What will my attendance be if I miss the next 2 classes?"');
}

// 2. "What if I attend the next 5 classes?"
{
  const intent = parseAttendanceQuery('What if I attend the next 5 classes?', ctx);
  assert.strictEqual(intent.scenarioType, 'attend');
  assert.strictEqual(intent.attendCount, 5);
  const agg = getAggregateRecord(ctx.attendance, intent.courseCode);
  const projectedPct = calculateAttendancePct(agg.attended + 5, agg.total + 5, agg.dutyLeave);
  // (52 + 5) / (69 + 5) = 57 / 74 => 77.03%
  assert.strictEqual(projectedPct, 77.03);
  console.log('✓ Query 2 passed: "What if I attend the next 5 classes?"');
}

// 3. "How many classes can I bunk while maintaining 75%?"
{
  const intent = parseAttendanceQuery('How many classes can I bunk while maintaining 75%?', ctx);
  assert.strictEqual(intent.scenarioType, 'bunk_limit');
  assert.strictEqual(intent.requiredPct, 75);
  const agg = getAggregateRecord(ctx.attendance, intent.courseCode);
  const limit = calculateBunkLimit(agg.attended, agg.total, agg.dutyLeave, 75);
  // 52 * 100 / 75 = 69.333 - 69 = 0.333 => 0 classes
  assert.strictEqual(limit, 0);
  console.log('✓ Query 3 passed: "How many classes can I bunk while maintaining 75%?"');
}

// 4. "How many classes do I need to attend to reach 90%?"
{
  const intent = parseAttendanceQuery('How many classes do I need to attend to reach 90%?', ctx);
  assert.strictEqual(intent.scenarioType, 'reach_target');
  assert.strictEqual(intent.targetPct, 90);
  const agg = getAggregateRecord(ctx.attendance, intent.courseCode);
  const needed = calculateClassesNeeded(agg.attended, agg.total, agg.dutyLeave, 90);
  // (90 * 69 - 100 * 52) / (100 - 90) = (6210 - 5200) / 10 = 1010 / 10 = 101
  assert.strictEqual(needed, 101);
  assert.strictEqual(calculateAttendancePct(agg.attended + 101, agg.total + 101, agg.dutyLeave), 90.00);
  console.log('✓ Query 4 passed: "How many classes do I need to attend to reach 90%?"');
}

// 5. "What happens if I miss 3 consecutive classes?"
{
  const intent = parseAttendanceQuery('What happens if I miss 3 consecutive classes?', ctx);
  assert.strictEqual(intent.scenarioType, 'miss');
  assert.strictEqual(intent.missCount, 3);
  console.log('✓ Query 5 passed: "What happens if I miss 3 consecutive classes?"');
}

// 6. "Can I skip 2 classes tomorrow?"
{
  const intent = parseAttendanceQuery('Can I skip 2 classes tomorrow?', ctx);
  assert.strictEqual(intent.scenarioType, 'schedule_day');
  assert.strictEqual(intent.isTomorrow, true);
  assert.strictEqual(intent.missCount, 2);
  console.log('✓ Query 6 passed: "Can I skip 2 classes tomorrow?"');
}

// 7. "How many classes can I miss before my attendance falls below 75%?"
{
  const intent = parseAttendanceQuery('How many classes can I miss before my attendance falls below 75%?', ctx);
  assert.strictEqual(intent.scenarioType, 'bunk_limit');
  assert.strictEqual(intent.requiredPct, 75);
  console.log('✓ Query 7 passed: "How many classes can I miss before my attendance falls below 75%?"');
}

// 8. Subject detection: "What if I bunk 3 python classes?"
{
  const intent = parseAttendanceQuery('What if I bunk 3 python classes?', ctx);
  assert.strictEqual(intent.courseCode, 'INT108');
  assert.strictEqual(intent.scenarioType, 'miss');
  assert.strictEqual(intent.missCount, 3);
  const rec = getAggregateRecord(ctx.attendance, 'INT108');
  // Current: 14 / 18 = 77.78%
  // Miss 3: 14 / 21 = 66.67%
  assert.strictEqual(calculateAttendancePct(rec.attended, rec.total + 3), 66.67);
  console.log('✓ Query 8 passed: Subject-wise question ("What if I bunk 3 python classes?")');
}

console.log('\n>>> ALL SCENARIOS AND NATURAL LANGUAGE QUERIES PASS PERFECTLY! <<<\n');

