/**
 * Minimal, dependency-free test harness. No framework — just enough to make
 * assertions, group them, and report pass/fail with a nonzero exit code on
 * failure so `npm test` works in CI and locally without extra tooling.
 */

let currentSuite = "";
let passCount = 0;
let failCount = 0;
const failures: string[] = [];

export function suite(name: string, fn: () => void) {
  currentSuite = name;
  console.log(`\n${name}`);
  fn();
}

export function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    failCount++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${currentSuite} > ${name}: ${msg}`);
    console.log(`  FAIL - ${name}`);
    console.log(`         ${msg}`);
  }
}

function stringify(v: unknown): string {
  return JSON.stringify(v);
}

export function assertEqual<T>(actual: T, expected: T, label = "value") {
  const a = stringify(actual);
  const e = stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

export function assertTrue(cond: boolean, label = "condition") {
  if (!cond) throw new Error(`${label}: expected true, got false`);
}

export function assertDeepIncludes<T>(actual: T[], expected: T, label = "array") {
  const found = actual.some((a) => stringify(a) === stringify(expected));
  if (!found) throw new Error(`${label}: expected to find ${stringify(expected)} in ${stringify(actual)}`);
}

export function summarize(): number {
  console.log(`\n${"-".repeat(50)}`);
  console.log(`${passCount} passed, ${failCount} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  return failCount === 0 ? 0 : 1;
}
