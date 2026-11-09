/**
 * Evaluates the subset of Prisma `where` filters the admin queries use, following SQL's three-valued logic:
 * comparing a missing (NULL) value is "unknown", `NOT unknown` is still unknown, and a row is kept only when the
 * whole filter is TRUE. A plain two-valued evaluator would hide bugs where a NOT over a nullable column silently drops rows.
 */
type Truth = boolean | null;

const and = (parts: Truth[]): Truth => (parts.includes(false) ? false : parts.includes(null) ? null : true);
const or = (parts: Truth[]): Truth => (parts.includes(true) ? true : parts.includes(null) ? null : false);

function evaluate(record: any, where: any): Truth {
  return and(Object.entries(where ?? {}).map(([key, condition]: [string, any]): Truth => {
    if (key === "AND") return and(condition.map((part: any) => evaluate(record, part)));
    if (key === "OR") return or(condition.map((part: any) => evaluate(record, part)));
    if (key === "NOT") { const inner = evaluate(record, condition); return inner === null ? null : !inner; }
    const value = record?.[key];
    const missing = value === null || value === undefined;
    if (condition === null) return missing; // IS NULL is never unknown
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      // A relation filter becomes EXISTS (...): true or false, never unknown.
      if ("is" in condition) return condition.is === null ? missing : !missing && evaluate(value, condition.is) === true;
      const time = (x: unknown) => (x instanceof Date ? x.getTime() : x as number);
      return and(Object.entries(condition).map(([op, operand]): Truth => {
        if (op === "mode") return true;
        if (op === "not" && operand === null) return !missing; // IS NOT NULL is never unknown
        if (missing) return null;
        if (op === "not") return value !== operand;
        if (op === "in") return (operand as unknown[]).includes(value);
        if (op === "contains") return String(value).toLowerCase().includes(String(operand).toLowerCase());
        if (op === "lt") return time(value) < time(operand);
        if (op === "lte") return time(value) <= time(operand);
        if (op === "gt") return time(value) > time(operand);
        if (op === "gte") return time(value) >= time(operand);
        return false;
      }));
    }
    return missing ? null : value === condition;
  }));
}

export function matches(record: any, where: any): boolean {
  return evaluate(record, where) === true;
}
