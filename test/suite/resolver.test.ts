import * as assert from "assert";
import { resolveValue } from "../../src/resolver";
import { CustomPropertyIndex, CustomPropertyDefinition } from "../../src/types";

function makeDef(
  name: string,
  rawValue: string
): CustomPropertyDefinition {
  return {
    name,
    rawValue,
    filePath: "/test.css",
    selector: ":root",
    line: 1,
  };
}

function makeIndex(
  entries: Array<[string, string]>
): CustomPropertyIndex {
  const index: CustomPropertyIndex = new Map();
  for (const [name, value] of entries) {
    index.set(name, [makeDef(name, value)]);
  }
  return index;
}

suite("Resolver", () => {
  test("returns a plain value unchanged", () => {
    const index = makeIndex([]);
    const result = resolveValue("#ff0000", index);

    assert.strictEqual(result.value, "#ff0000");
    assert.strictEqual(result.chain.length, 0);
    assert.strictEqual(result.partial, false);
  });

  test("resolves a single var() reference", () => {
    const index = makeIndex([["blue-500", "#3b82f6"]]);
    const result = resolveValue("var(--blue-500)", index);

    assert.strictEqual(result.value, "#3b82f6");
    assert.deepStrictEqual(result.chain, ["--blue-500"]);
    assert.strictEqual(result.partial, false);
  });

  test("resolves a two-level chain", () => {
    const index = makeIndex([
      ["color-primary", "var(--blue-500)"],
      ["blue-500", "#3b82f6"],
    ]);
    const result = resolveValue("var(--color-primary)", index);

    assert.strictEqual(result.value, "#3b82f6");
    assert.deepStrictEqual(result.chain, [
      "--color-primary",
      "--blue-500",
    ]);
    assert.strictEqual(result.partial, false);
  });

  test("resolves multiple var() in one value", () => {
    const index = makeIndex([
      ["x", "10px"],
      ["y", "20px"],
    ]);
    const result = resolveValue(
      "calc(var(--x) + var(--y))",
      index
    );

    assert.strictEqual(result.value, "calc(10px + 20px)");
    assert.strictEqual(result.partial, false);
  });

  test("uses fallback when property is missing", () => {
    const index = makeIndex([]);
    const result = resolveValue("var(--missing, #fff)", index);

    assert.strictEqual(result.value, "#fff");
    assert.strictEqual(result.partial, false);
  });

  test("resolves fallback that contains var()", () => {
    const index = makeIndex([["fallback-color", "green"]]);
    const result = resolveValue(
      "var(--missing, var(--fallback-color))",
      index
    );

    assert.strictEqual(result.value, "green");
    assert.strictEqual(result.partial, false);
  });

  test("detects cycles and marks as partial", () => {
    const index = makeIndex([
      ["a", "var(--b)"],
      ["b", "var(--a)"],
    ]);
    const result = resolveValue("var(--a)", index);

    assert.strictEqual(result.partial, true);
  });

  test("respects depth limit", () => {
    // Create a chain of depth 15
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < 15; i++) {
      entries.push([`level-${i}`, `var(--level-${i + 1})`]);
    }
    entries.push(["level-15", "final-value"]);

    const index = makeIndex(entries);
    const result = resolveValue("var(--level-0)", index, new Set(), 5);

    assert.strictEqual(result.partial, true);
  });

  test("marks as partial when property is missing with no fallback", () => {
    const index = makeIndex([]);
    const result = resolveValue("var(--nonexistent)", index);

    assert.strictEqual(result.partial, true);
    // The unresolvable var() stays in the output
    assert.ok(result.value.includes("var(--nonexistent)"));
  });

  test("handles value with mixed static and var() parts", () => {
    const index = makeIndex([["size", "16px"]]);
    const result = resolveValue(
      "0 var(--size) solid black",
      index
    );

    assert.strictEqual(result.value, "0 16px solid black");
    assert.strictEqual(result.partial, false);
  });
});
