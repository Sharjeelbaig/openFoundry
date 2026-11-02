import { describe, expect, it } from "vitest";
import {
  ExpressionError,
  asBoolean,
  evaluateExpression,
  evaluateTemplate,
  evaluateValue,
} from "@/lib/workflows/expression";

const env = {
  "Local.Name": "Ada",
  "Local.Count": 2,
  "Local.Items": ["a", "b"],
  "Local.LatestMessage": "Work is [COMPLETE] now",
  "System.LastMessage.Text": "hello",
  "System.Activity": { text: "hello" },
};

describe("openFoundry expressions", () => {
  it("evaluates comparisons and boolean logic", () => {
    expect(evaluateExpression("Local.Count = 2", env)).toBe(true);
    expect(evaluateExpression("Local.Count <> 3 and Local.Name = \"Ada\"", env)).toBe(true);
    expect(evaluateExpression("not (Local.Count > 2)", env)).toBe(true);
  });

  it("evaluates the functions used by the templates", () => {
    expect(
      evaluateExpression(
        '!IsBlank(Find("[COMPLETE]", Upper(Local.LatestMessage)))',
        env
      )
    ).toBe(true);
    expect(evaluateExpression("Upper(Local.Name)", env)).toBe("ADA");
    expect(evaluateExpression("Concat(Local.Name, \"!\")", env)).toBe("Ada!");
    expect(evaluateExpression("CountRows(Local.Items)", env)).toBe(2);
    expect(evaluateExpression("Last(Local.Items)", env)).toBe("b");
  });

  it("reads nested system properties", () => {
    expect(evaluateExpression("System.Activity.text", env)).toBe("hello");
    expect(evaluateExpression("System.LastMessage.Text", env)).toBe("hello");
  });

  it("evaluates templates and bare expressions", () => {
    expect(evaluateTemplate("Hello {Local.Name}", env)).toBe("Hello Ada");
    expect(evaluateValue("Local.Name", env)).toBe("Ada");
    expect(evaluateValue("plain text", env)).toBe("plain text");
    expect(evaluateValue("=Local.Count + 1", env)).toBe(3);
  });

  it("rejects unsupported syntax instead of using eval", () => {
    expect(() => evaluateExpression("process.exit()", env)).toThrow(ExpressionError);
    expect(() => evaluateExpression("UnknownFunction(1)", env)).toThrow(
      ExpressionError
    );
  });

  it("coerces booleans", () => {
    expect(asBoolean("true")).toBe(true);
    expect(asBoolean("0")).toBe(false);
  });
});
