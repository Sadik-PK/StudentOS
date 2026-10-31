import assert from 'node:assert';

// Core deterministic functions matching src/utils/attendancePredictor.ts
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

console.log('--- RUNNING MATHEMATICAL ENGINE VERIFICATION ---');

// Test 1: User's Example from Prompt
// Attended: 32, Total: 40 (80%)
// Miss next 2: Attended: 32, Total: 42 => 76.19%
// Attend next 2: Attended: 34, Total: 42 => 80.95%
{
  const cur = calculateAttendancePct(32, 40);
  assert.strictEqual(cur, 80.00);

  const miss2 = calculateAttendancePct(32, 42);
  assert.strictEqual(miss2, 76.19);

  const attend2 = calculateAttendancePct(34, 42);
  assert.strictEqual(attend2, 80.95);
  console.log('✓ 1. User example: Miss 2 classes (76.19%) and Attend 2 classes (80.95%) verified');
}

// Test 2: Bunk limit
// 32/40 at 75% threshold
// Max bunkable = 2 (since 32/42 = 76.19% >= 75%, but 32/43 = 74.42% < 75%)
{
  const maxBunk = calculateBunkLimit(32, 40, 0, 75);
  assert.strictEqual(maxBunk, 2);
  assert.strictEqual(calculateAttendancePct(32, 40 + maxBunk) >= 75, true);
  assert.strictEqual(calculateAttendancePct(32, 40 + maxBunk + 1) < 75, true);
  console.log('✓ 2. Bunk limit at 75%: Exactly 2 classes safe to bunk');
}

// Test 3: Classes needed to reach target %
// 32/40 (80%), target 90%
// (32 + x) / (40 + x) >= 0.9 => 32 + x >= 36 + 0.9x => 0.1x >= 4 => x >= 40 classes
{
  const needed = calculateClassesNeeded(32, 40, 0, 90);
  assert.strictEqual(needed, 40);
  assert.strictEqual(calculateAttendancePct(32 + 40, 40 + 40), 90.00);
  assert.strictEqual(calculateAttendancePct(32 + 39, 40 + 39) < 90.00, true);
  console.log('✓ 3. Target attendance: Exactly 40 classes needed to reach 90%');
}

// Test 4: Duty Leave handling
{
  const curDL = calculateAttendancePct(30, 40, 2);
  assert.strictEqual(curDL, 80.00);
  const bunkDL = calculateBunkLimit(30, 40, 2, 75);
  assert.strictEqual(bunkDL, 2);
  console.log('✓ 4. Duty leave handling verified');
}

// Test 5: Edge cases
{
  // Total 0
  assert.strictEqual(calculateAttendancePct(0, 0), 100);
  assert.strictEqual(calculateBunkLimit(0, 0, 0, 75), 0);
  assert.strictEqual(calculateClassesNeeded(0, 0, 0, 75), 1);

  // Already below threshold (e.g. 10/20 = 50%, threshold 75%)
  assert.strictEqual(calculateBunkLimit(10, 20, 0, 75), 0);

  // Target 100% when missed > 0 (impossible)
  assert.strictEqual(calculateClassesNeeded(10, 20, 0, 100), null);

  // Target 100% when missed === 0
  assert.strictEqual(calculateClassesNeeded(10, 10, 0, 100), 0);

  // Target already met
  assert.strictEqual(calculateClassesNeeded(32, 40, 0, 75), 0);
  console.log('✓ 5. All edge cases verified');
}

console.log('\n>>> ALL DETERMINISTIC TESTS PASSED CLEANLY <<<\n');

