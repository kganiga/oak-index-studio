/**
 * Regression test for Issue 14: the performance estimator's cost range is a
 * synthetic 0-100-derived heuristic, not an emulation of Oak's real cost
 * formula (cost ~= entryCount * costPerEntry + costPerExecution), because
 * entryCount requires live repository statistics this tool doesn't have.
 * The disclaimer must say so explicitly so the heuristic numbers are never
 * mistaken for Oak's actual Explain-plan cost=X output.
 */
import { parseSQL2 } from "../lib/analyze";
import { estimatePerformance } from "../lib/performanceEstimate";
import { assertTrue, suite, test } from "./harness";

suite("estimatePerformance() — cost heuristic is clearly disclaimed as non-Oak", () => {
  test("disclaimer explicitly denies being Oak's cost() and denies costPerEntry/costPerExecution units", () => {
    const model = parseSQL2(`SELECT * FROM [cq:Page] AS p WHERE p.[status] = 'active'`);
    const perf = estimatePerformance(model);
    assertTrue(/NOT Oak's real cost\(\)/.test(perf.disclaimer), "denies being Oak's real cost()");
    assertTrue(/costPerEntry/.test(perf.disclaimer), "mentions costPerEntry");
    assertTrue(/costPerExecution/.test(perf.disclaimer), "mentions costPerExecution");
    assertTrue(/entryCount/.test(perf.disclaimer), "explains why: no access to real entryCount");
  });
});
