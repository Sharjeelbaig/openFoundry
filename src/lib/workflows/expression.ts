/**
 * A small, safe expression language for openFoundry workflows.
 *
 * It intentionally implements the Power Fx *patterns* used by the workflow
 * templates (variables, comparisons, boolean logic, property access and a set
 * of string/collection functions) without evaluating JavaScript. Unsupported
 * syntax fails with a clear message instead of falling back to `eval`.
 */

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "punct"; value: string }
  | { type: "eof" };

type Ast =
  | { kind: "literal"; value: unknown }
  | { kind: "variable"; path: string[] }
  | { kind: "unary"; op: string; arg: Ast }
  | { kind: "binary"; op: string; left: Ast; right: Ast }
  | { kind: "call"; name: string; args: Ast[] }
  | { kind: "member"; object: Ast; property: string };

const OPERATORS = [
  "<=",
  ">=",
  "<>",
  "!=",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "&",
  "!",
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const current = source[index];
        if (current === '"') {
          if (source[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        if (current === "\\" && source[index + 1]) {
          value += source[index + 1];
          index += 2;
          continue;
        }
        value += current;
        index += 1;
      }
      if (!closed) throw new ExpressionError("Unterminated string literal.");
      tokens.push({ type: "string", value });
      continue;
    }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] || ""))) {
      let raw = "";
      while (index < source.length && /[0-9.]/.test(source[index])) {
        raw += source[index];
        index += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value))
        throw new ExpressionError(`Invalid number "${raw}".`);
      tokens.push({ type: "number", value });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let raw = "";
      while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) {
        raw += source[index];
        index += 1;
      }
      tokens.push({ type: "identifier", value: raw });
      continue;
    }
    const operator = OPERATORS.find((item) => source.startsWith(item, index));
    if (operator) {
      tokens.push({ type: "operator", value: operator });
      index += operator.length;
      continue;
    }
    if ("(),.".includes(char)) {
      tokens.push({ type: "punct", value: char });
      index += 1;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${char}".`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private match(type: Token["type"], value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && (token as { value?: string }).value !== value)
      return false;
    this.index += 1;
    return true;
  }

  private expect(type: Token["type"], value?: string): Token {
    const token = this.peek();
    if (
      token.type !== type ||
      (value !== undefined && (token as { value?: string }).value !== value)
    ) {
      throw new ExpressionError(
        `Expected ${value ?? type} near "${String(
          (token as { value?: unknown }).value ?? "end"
        )}".`
      );
    }
    return this.next();
  }

  parse(): Ast {
    const expression = this.parseOr();
    if (this.peek().type !== "eof")
      throw new ExpressionError("Unexpected trailing input.");
    return expression;
  }

  private parseOr(): Ast {
    let left = this.parseAnd();
    while (
      this.peek().type === "identifier" &&
      String((this.peek() as { value: string }).value).toLowerCase() === "or"
    ) {
      this.next();
      left = { kind: "binary", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Ast {
    let left = this.parseComparison();
    while (
      this.peek().type === "identifier" &&
      String((this.peek() as { value: string }).value).toLowerCase() === "and"
    ) {
      this.next();
      left = { kind: "binary", op: "and", left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Ast {
    let left = this.parseAdditive();
    for (;;) {
      const token = this.peek();
      if (token.type !== "operator") break;
      if (!["=", "<>", "!=", "<", ">", "<=", ">="].includes(token.value)) break;
      this.next();
      left = {
        kind: "binary",
        op: token.value === "!=" ? "<>" : token.value,
        left,
        right: this.parseAdditive(),
      };
    }
    return left;
  }

  private parseAdditive(): Ast {
    let left = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.type !== "operator") break;
      if (!["+", "-", "&"].includes(token.value)) break;
      this.next();
      left = {
        kind: "binary",
        op: token.value,
        left,
        right: this.parseMultiplicative(),
      };
    }
    return left;
  }

  private parseMultiplicative(): Ast {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.type !== "operator") break;
      if (!["*", "/"].includes(token.value)) break;
      this.next();
      left = {
        kind: "binary",
        op: token.value,
        left,
        right: this.parseUnary(),
      };
    }
    return left;
  }

  private parseUnary(): Ast {
    const token = this.peek();
    if (token.type === "operator" && token.value === "-") {
      this.next();
      return { kind: "unary", op: "-", arg: this.parseUnary() };
    }
    if (
      (token.type === "identifier" && token.value.toLowerCase() === "not") ||
      (token.type === "operator" && token.value === "!")
    ) {
      this.next();
      return { kind: "unary", op: "not", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Ast {
    const token = this.peek();
    if (token.type === "number" || token.type === "string") {
      this.next();
      return { kind: "literal", value: token.value };
    }
    if (token.type === "identifier") {
      this.next();
      const lower = token.value.toLowerCase();
      if (lower === "true") return { kind: "literal", value: true };
      if (lower === "false") return { kind: "literal", value: false };
      if (lower === "blank") return { kind: "literal", value: null };
      if (this.match("punct", "(")) {
        const args: Ast[] = [];
        if (!this.match("punct", ")")) {
          do {
            args.push(this.parseOr());
          } while (this.match("punct", ","));
          this.expect("punct", ")");
        }
        return this.parseMembers({
          kind: "call",
          name: token.value,
          args,
        });
      }
      return this.parseMembers({
        kind: "variable",
        path: token.value.split("."),
      });
    }
    if (this.match("punct", "(")) {
      const expression = this.parseOr();
      this.expect("punct", ")");
      return this.parseMembers(expression);
    }
    throw new ExpressionError(
      `Unexpected token "${String(
        (token as { value?: unknown }).value ?? "end"
      )}".`
    );
  }

  private parseMembers(base: Ast): Ast {
    let expression = base;
    while (
      this.peek().type === "punct" &&
      (this.peek() as { value: string }).value === "."
    ) {
      this.next();
      const property = this.expect("identifier");
      expression = {
        kind: "member",
        object: expression,
        property: (property as { value: string }).value,
      };
    }
    return expression;
  }
}

function lookupKey(env: Record<string, unknown>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(env, key)) return key;
  const lower = key.toLowerCase();
  return Object.keys(env).find((item) => item.toLowerCase() === lower);
}

function readProperty(value: unknown, property: string): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    if (property.toLowerCase() === "count") return value.length;
    const index = Number(property);
    if (Number.isInteger(index)) return value[index];
    return undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const key = lookupKey(record, property);
    return key === undefined ? undefined : record[key];
  }
  return undefined;
}

function resolveVariable(path: string[], env: Record<string, unknown>): unknown {
  const flat = path.join(".");
  const flatKey = lookupKey(env, flat);
  if (flatKey !== undefined) return env[flatKey];

  // Match the longest flat prefix in the environment, then walk the rest.
  // This makes both "System.LastMessage.Text" (flat) and
  // "System.Activity.text" (object + property) work.
  for (let length = path.length - 1; length >= 1; length -= 1) {
    const prefix = path.slice(0, length).join(".");
    const prefixKey = lookupKey(env, prefix);
    if (prefixKey === undefined) continue;
    let value: unknown = env[prefixKey];
    for (const segment of path.slice(length)) {
      value = readProperty(value, segment);
    }
    return value;
  }
  return undefined;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(toText(value));
  if (!Number.isFinite(parsed))
    throw new ExpressionError(`"${toText(value)}" is not a number.`);
  return parsed;
}

function equals(left: unknown, right: unknown): boolean {
  if (isBlank(left) && isBlank(right)) return true;
  if (typeof left === "number" || typeof right === "number")
    return toNumber(left) === toNumber(right);
  if (typeof left === "boolean" || typeof right === "boolean")
    return Boolean(left) === Boolean(right);
  return toText(left) === toText(right);
}

function compare(
  left: unknown,
  right: unknown,
  op: "<" | ">" | "<=" | ">="
): boolean {
  const numeric =
    typeof left === "number" ||
    typeof right === "number" ||
    (!Number.isNaN(Number(left)) && !Number.isNaN(Number(right)) && left !== "" && right !== "");
  const a = numeric ? toNumber(left) : toText(left);
  const b = numeric ? toNumber(right) : toText(right);
  if (op === "<") return a < b;
  if (op === ">") return a > b;
  if (op === "<=") return a <= b;
  return a >= b;
}

function callFunction(
  name: string,
  args: unknown[],
  env: Record<string, unknown>
): unknown {
  const key = name.toLowerCase();
  switch (key) {
    case "if":
      return args[0] ? args[1] : args[2];
    case "text":
      return toText(args[0]);
    case "value":
    case "number":
      return toNumber(args[0]);
    case "boolean":
      return Boolean(args[0]);
    case "upper":
      return toText(args[0]).toUpperCase();
    case "lower":
      return toText(args[0]).toLowerCase();
    case "trim":
      return toText(args[0]).trim();
    case "len":
      return toText(args[0]).length;
    case "concat":
    case "concatenate":
      return args.map(toText).join("");
    case "find": {
      const needle = toText(args[0]);
      const haystack = toText(args[1]);
      const index = haystack.toLowerCase().indexOf(needle.toLowerCase());
      return index < 0 ? null : index + 1;
    }
    case "isblank":
      return isBlank(args[0]);
    case "coalesce":
      return args.find((value) => !isBlank(value));
    case "first":
      return Array.isArray(args[0]) ? args[0][0] : args[0];
    case "last": {
      const value = args[0];
      if (!Array.isArray(value)) return value;
      return value[value.length - 1];
    }
    case "countrows":
    case "count":
      return Array.isArray(args[0]) ? args[0].length : 0;
    case "json":
    case "parsejson": {
      try {
        return JSON.parse(toText(args[0]));
      } catch {
        throw new ExpressionError(`"${toText(args[0])}" is not valid JSON.`);
      }
    }
    case "startswith":
      return toText(args[1]).toLowerCase().startsWith(toText(args[0]).toLowerCase());
    case "endswith":
      return toText(args[1]).toLowerCase().endsWith(toText(args[0]).toLowerCase());
    case "substitute":
      return toText(args[0]).split(toText(args[1])).join(toText(args[2]));
    case "now":
      return new Date().toISOString();
    case "today":
      return new Date().toISOString().slice(0, 10);
    case "runid":
      return env["System.RunId"];
    default:
      throw new ExpressionError(`Unsupported function ${name}().`);
  }
}

function evaluate(ast: Ast, env: Record<string, unknown>): unknown {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "variable":
      return resolveVariable(ast.path, env);
    case "member":
      return readProperty(evaluate(ast.object, env), ast.property);
    case "unary": {
      const value = evaluate(ast.arg, env);
      return ast.op === "not" ? !value : -toNumber(value);
    }
    case "binary": {
      if (ast.op === "and")
        return Boolean(evaluate(ast.left, env)) && Boolean(evaluate(ast.right, env));
      if (ast.op === "or")
        return Boolean(evaluate(ast.left, env)) || Boolean(evaluate(ast.right, env));
      const left = evaluate(ast.left, env);
      const right = evaluate(ast.right, env);
      switch (ast.op) {
        case "=":
          return equals(left, right);
        case "<>":
          return !equals(left, right);
        case "<":
        case ">":
        case "<=":
        case ">=":
          return compare(left, right, ast.op);
        case "+":
          return toNumber(left) + toNumber(right);
        case "-":
          return toNumber(left) - toNumber(right);
        case "*":
          return toNumber(left) * toNumber(right);
        case "/":
          return toNumber(left) / toNumber(right);
        case "&":
          return toText(left) + toText(right);
        default:
          throw new ExpressionError(`Unsupported operator ${ast.op}.`);
      }
    }
    case "call":
      return callFunction(
        ast.name,
        ast.args.map((arg) => evaluate(arg, env)),
        env
      );
    default:
      return undefined;
  }
}

export function evaluateExpression(
  source: string,
  env: Record<string, unknown>
): unknown {
  const trimmed = source.trim();
  if (!trimmed) return "";
  const ast = new Parser(tokenize(trimmed)).parse();
  return evaluate(ast, env);
}

/**
 * Evaluate a field that may be a literal, an `=` expression or a template with
 * `{Expression}` placeholders. This mirrors the mixed literal/expression fields
 * in the reference designer while keeping the parser safe.
 */
export function evaluateValue(
  source: unknown,
  env: Record<string, unknown>
): unknown {
  if (source === null || source === undefined) return "";
  if (typeof source !== "string") return source;
  const trimmed = source.trim();
  if (trimmed.startsWith("=")) {
    return evaluateExpression(trimmed.slice(1), env);
  }
  if (trimmed.includes("{")) {
    return evaluateTemplate(trimmed, env);
  }
  // A bare expression (for example Local.Name) is evaluated; plain prose that
  // does not parse is kept as literal text.
  try {
    const result = evaluateExpression(trimmed, env);
    return result === undefined ? source : result;
  } catch {
    return source;
  }
}

export function evaluateTemplate(
  template: string,
  env: Record<string, unknown>
): string {
  let output = "";
  let index = 0;
  while (index < template.length) {
    const start = template.indexOf("{", index);
    if (start < 0) {
      output += template.slice(index);
      break;
    }
    output += template.slice(index, start);
    let depth = 1;
    let cursor = start + 1;
    while (cursor < template.length && depth > 0) {
      if (template[cursor] === "{") depth += 1;
      if (template[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) throw new ExpressionError("Unterminated template expression.");
    const expression = template.slice(start + 1, cursor - 1);
    output += toText(evaluateExpression(expression, env));
    index = cursor;
  }
  return output;
}

export function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string")
    return ["true", "1", "yes", "y", "on"].includes(value.trim().toLowerCase());
  return Boolean(value);
}
