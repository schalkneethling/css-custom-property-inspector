import { CustomPropertyIndex, ResolvedValue } from "./types";

const VAR_REFERENCE = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g;

/**
 * Resolve a CSS value by following var() references through the index.
 * Handles recursive references, cycles, and fallback values.
 */
export function resolveValue(
  rawValue: string,
  index: CustomPropertyIndex,
  visited: Set<string> = new Set(),
  maxDepth: number = 10,
  depth: number = 0
): ResolvedValue {
  // Base case: no var() references in the value
  if (!rawValue.includes("var(")) {
    return { value: rawValue, chain: [], partial: false };
  }

  // Safety: depth limit
  if (depth >= maxDepth) {
    return { value: rawValue, chain: [], partial: true };
  }

  let result = rawValue;
  const chain: string[] = [];
  let partial = false;

  // Collect all replacements first, then apply them (to avoid regex state issues)
  const replacements: Array<{ fullMatch: string; replacement: string }> = [];

  let match: RegExpExecArray | null;
  const regex = new RegExp(VAR_REFERENCE.source, "g");

  while ((match = regex.exec(rawValue)) !== null) {
    const fullMatch = match[0];
    const propNameWithDashes = match[1]; // e.g. "--blue-500"
    const propName = propNameWithDashes.substring(2); // strip --
    const fallback = match[2]?.trim();

    // Cycle detection
    if (visited.has(propName)) {
      partial = true;
      continue;
    }

    const definitions = index.get(propName);
    if (definitions && definitions.length > 0) {
      // Use the first definition for resolution (typically :root)
      visited.add(propName);
      chain.push(`--${propName}`);

      const resolved = resolveValue(
        definitions[0].rawValue,
        index,
        visited,
        maxDepth,
        depth + 1
      );
      chain.push(...resolved.chain);
      partial = partial || resolved.partial;

      replacements.push({ fullMatch, replacement: resolved.value });
    } else if (fallback) {
      // Property not found — use fallback value
      // The fallback itself might contain var() references
      const resolvedFallback = resolveValue(
        fallback,
        index,
        visited,
        maxDepth,
        depth + 1
      );
      chain.push(...resolvedFallback.chain);
      partial = partial || resolvedFallback.partial;

      replacements.push({ fullMatch, replacement: resolvedFallback.value });
    } else {
      // Unresolvable: no definition, no fallback
      partial = true;
    }
  }

  // Apply replacements
  for (const { fullMatch, replacement } of replacements) {
    result = result.replace(fullMatch, replacement);
  }

  return { value: result, chain, partial };
}
