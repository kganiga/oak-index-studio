import { PropRestriction, OakPropType } from "../types";

export function pushOp(p: { ops: string[] }, op: string) {
  if (!p.ops.includes(op)) p.ops.push(op);
}

export function applyValueType(p: PropRestriction, valType: OakPropType) {
  // Never downgrade an explicit non-String inference back to String.
  if (p.type === "String") p.type = valType;
}

export function stripQuoted(s: string): string {
  return s.replace(/'(?:[^'\\]|\\.)*'/g, "''");
}
