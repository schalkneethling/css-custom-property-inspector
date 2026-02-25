import { CustomPropertyDefinition } from "./types";

/** Matches a custom property declaration start: --name: */
const CUSTOM_PROP_START = /^\s*(--[\w-]+)\s*:\s*(.*)/;

/** Matches a semicolon ending a declaration */
const HAS_SEMICOLON = /;/;

/** Matches an at-rule opening (media, supports, layer, container) */
const AT_RULE_OPEN = /^\s*(@(?:media|supports|layer|container)\b[^{]*)/;

/** Matches a selector line (anything before an opening brace that isn't an at-rule or comment) */
const SELECTOR_LINE = /^([^@{}/*][^{]*)/;

/** Matches SCSS/Less single-line comment */
const LINE_COMMENT = /\/\/.*/;

/** Matches block comment open */
const BLOCK_COMMENT_OPEN = /\/\*/;

/** Matches block comment close */
const BLOCK_COMMENT_CLOSE = /\*\//;

/**
 * Represents a style block extracted from an HTML file,
 * with its content and the line offset within the HTML file.
 */
export interface StyleBlock {
  content: string;
  lineOffset: number;
}

/**
 * Extract CSS content from <style> tags in an HTML file.
 * Returns blocks with their line offsets so line numbers stay correct.
 */
export function extractStyleBlocks(htmlContent: string): StyleBlock[] {
  const blocks: StyleBlock[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;

  while ((match = styleRegex.exec(htmlContent)) !== null) {
    const cssContent = match[1];
    // Count newlines before this match to get the line offset
    const textBefore = htmlContent.substring(0, match.index + match[0].indexOf(cssContent));
    const lineOffset = textBefore.split("\n").length - 1;

    blocks.push({ content: cssContent, lineOffset });
  }

  return blocks;
}

/**
 * Strip single-line block comments (/* ... *​/ on one line) from a line of text.
 */
function stripInlineBlockComments(line: string): string {
  return line.replace(/\/\*.*?\*\//g, "");
}

/**
 * Parse CSS/SCSS/Less file content and extract all custom property definitions.
 * Uses a line-by-line state-tracking approach to capture selector and at-rule context.
 */
export function parseFileContent(
  content: string,
  filePath: string,
  lineOffset: number = 0
): CustomPropertyDefinition[] {
  const definitions: CustomPropertyDefinition[] = [];
  const lines = content.split("\n");

  let inBlockComment = false;
  let braceDepth = 0;
  let currentSelector: string | null = null;
  let currentAtRule: string | null = null;
  let atRuleBraceDepth = -1;
  let selectorBraceDepth = -1;

  // Multi-line value accumulation
  let accumulatingProp: string | null = null;
  let accumulatingValue = "";
  let accumulatingLine = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNumber = i + 1 + lineOffset; // 1-based + offset for HTML

    // Handle block comments
    if (inBlockComment) {
      if (BLOCK_COMMENT_CLOSE.test(line)) {
        inBlockComment = false;
        line = line.substring(line.indexOf("*/") + 2);
      } else {
        // If accumulating a multi-line value, include comment lines
        // (they'll be stripped later if needed)
        continue;
      }
    }

    // Check for block comment opening on this line
    if (BLOCK_COMMENT_OPEN.test(line)) {
      if (BLOCK_COMMENT_CLOSE.test(line.substring(line.indexOf("/*") + 2))) {
        // Single-line block comment — strip it
        line = stripInlineBlockComments(line);
      } else {
        // Multi-line block comment starts
        const beforeComment = line.substring(0, line.indexOf("/*"));
        inBlockComment = true;
        line = beforeComment;
      }
    }

    // Strip single-line comments (SCSS/Less)
    line = line.replace(LINE_COMMENT, "");

    // Strip any remaining inline block comments
    line = stripInlineBlockComments(line);

    // If we're accumulating a multi-line value, continue collecting
    if (accumulatingProp !== null) {
      const semicolonIdx = line.indexOf(";");
      if (semicolonIdx !== -1) {
        // Found the end of the value
        accumulatingValue += " " + line.substring(0, semicolonIdx).trim();
        definitions.push({
          name: accumulatingProp,
          rawValue: accumulatingValue.trim(),
          filePath,
          selector: currentSelector || ":root",
          atRule: currentAtRule || undefined,
          line: accumulatingLine,
        });
        accumulatingProp = null;
        accumulatingValue = "";

        // Process the rest of the line for braces
        const rest = line.substring(semicolonIdx + 1);
        countBraces(rest);
      } else if (line.includes("}")) {
        // Brace before semicolon — value likely ended without semicolon
        // (e.g., last property before closing brace)
        accumulatingValue += " " + line.substring(0, line.indexOf("}")).trim();
        if (accumulatingValue.trim()) {
          definitions.push({
            name: accumulatingProp,
            rawValue: accumulatingValue.trim(),
            filePath,
            selector: currentSelector || ":root",
            atRule: currentAtRule || undefined,
            line: accumulatingLine,
          });
        }
        accumulatingProp = null;
        accumulatingValue = "";
        // Fall through to brace counting below
      } else {
        accumulatingValue += " " + line.trim();
        continue;
      }
    }

    // Check for at-rule
    const atRuleMatch = line.match(AT_RULE_OPEN);
    if (atRuleMatch && !currentAtRule) {
      currentAtRule = atRuleMatch[1].trim();
      atRuleBraceDepth = braceDepth;
    }

    // Check for selector (only when not inside a rule block already)
    if (!atRuleMatch) {
      const selectorMatch = line.match(SELECTOR_LINE);
      if (selectorMatch && line.includes("{")) {
        const selectorText = selectorMatch[1].trim();
        if (selectorText && !selectorText.startsWith("}")) {
          // Only set selector if we're at the right nesting level
          if (
            currentAtRule === null
              ? braceDepth === 0
              : braceDepth === atRuleBraceDepth + 1
          ) {
            currentSelector = selectorText;
            selectorBraceDepth = braceDepth;
          }
        }
      }
    } else if (line.includes("{") && !currentSelector) {
      // at-rule with selector on same line handled above
    }

    // Check for custom property declaration
    const propMatch = line.match(CUSTOM_PROP_START);
    if (propMatch && currentSelector !== null) {
      const propName = propMatch[1].substring(2); // strip --
      const valuePart = propMatch[2];

      if (HAS_SEMICOLON.test(valuePart)) {
        // Complete single-line declaration
        const value = valuePart.substring(0, valuePart.indexOf(";")).trim();
        definitions.push({
          name: propName,
          rawValue: value,
          filePath,
          selector: currentSelector,
          atRule: currentAtRule || undefined,
          line: lineNumber,
        });
      } else {
        // Multi-line value — start accumulating
        accumulatingProp = propName;
        accumulatingValue = valuePart.trim();
        accumulatingLine = lineNumber;
      }
    }

    // Count braces to track nesting depth
    countBraces(line);
  }

  function countBraces(text: string) {
    for (const ch of text) {
      if (ch === "{") {
        braceDepth++;
      } else if (ch === "}") {
        braceDepth--;
        if (
          currentSelector !== null &&
          braceDepth <= selectorBraceDepth
        ) {
          currentSelector = null;
          selectorBraceDepth = -1;
        }
        if (
          currentAtRule !== null &&
          braceDepth <= atRuleBraceDepth
        ) {
          currentAtRule = null;
          atRuleBraceDepth = -1;
        }
      }
    }
  }

  return definitions;
}
