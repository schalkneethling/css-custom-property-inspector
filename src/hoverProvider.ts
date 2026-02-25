import * as vscode from "vscode";
import { CustomPropertyDefinition } from "./types";
import { CustomPropertyIndexer } from "./indexer";
import { resolveValue } from "./resolver";
import { getConfig } from "./config";

/** Matches hex colors: #rgb, #rrggbb, #rrggbbaa */
const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

/** Matches rgb/rgba/hsl/hsla functions */
const CSS_COLOR_FN = /^(?:rgba?|hsla?|oklch|oklab|lch|lab)\(/i;

/** Common named CSS colors for swatch detection */
const NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
  "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
  "burlywood", "cadetblue", "chartreuse", "chocolate", "coral",
  "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
  "darksalmon", "darkseagreen", "darkslateblue", "darkslategray",
  "darkslategrey", "darkturquoise", "darkviolet", "deeppink",
  "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick",
  "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite",
  "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki",
  "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
  "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray",
  "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen",
  "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
  "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon",
  "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
  "mediumseagreen", "mediumslateblue", "mediumspringgreen",
  "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive",
  "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip",
  "peachpuff", "peru", "pink", "plum", "powderblue", "purple",
  "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown",
  "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver",
  "skyblue", "slateblue", "slategray", "slategrey", "snow",
  "springgreen", "steelblue", "tan", "teal", "thistle", "tomato",
  "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
]);

/**
 * Check if a CSS value looks like a color and return the color string
 * suitable for use in an inline style, or undefined if not a color.
 */
function extractColor(value: string): string | undefined {
  const trimmed = value.trim();
  if (HEX_COLOR.test(trimmed)) {
    return trimmed;
  }
  if (CSS_COLOR_FN.test(trimmed)) {
    return trimmed;
  }
  if (NAMED_COLORS.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  return undefined;
}

/**
 * Build a color swatch as an HTML span: a small colored circle.
 */
function colorSwatch(color: string): string {
  return `<span style="background-color:${color};">\u00a0\u00a0\u00a0\u00a0</span>`;
}

interface PropertyAtPosition {
  /** Property name without -- */
  name: string;
  /** Fallback value from var(--name, fallback), if present */
  fallback?: string;
  /** Range in the document to highlight on hover */
  range: vscode.Range;
}

export class CSSCustomPropertyHoverProvider implements vscode.HoverProvider {
  constructor(private indexer: CustomPropertyIndexer) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    await this.indexer.initialize();

    const lineText = document.lineAt(position.line).text;

    const property = this.getPropertyAtPosition(
      lineText,
      position.character,
      position.line
    );

    if (!property) {
      return undefined;
    }

    const definitions = this.indexer.lookup(property.name);
    if (!definitions || definitions.length === 0) {
      const md = this.createMarkdown();
      md.appendMarkdown(`$(warning) **\`--${property.name}\`**\n\n`);
      md.appendMarkdown("*No definition found in the workspace.*");
      if (property.fallback) {
        const fallbackColor = extractColor(property.fallback);
        md.appendMarkdown("\n\n**Fallback:** ");
        if (fallbackColor) {
          md.appendMarkdown(`${colorSwatch(fallbackColor)} `);
        }
        md.appendMarkdown(`\`${property.fallback}\``);
      }
      return new vscode.Hover(md, property.range);
    }


    const content = this.buildHoverContent(
      property.name,
      property.fallback,
      definitions
    );

    return new vscode.Hover(content, property.range);
  }

  /**
   * Create a MarkdownString with HTML and theme icon support enabled,
   * prefixed with the extension name header.
   */
  private createMarkdown(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;
    md.supportThemeIcons = true;
    md.appendMarkdown("*CSS Custom Property Inspector*\n\n");
    return md;
  }

  /**
   * Detect if the cursor position is on a CSS custom property.
   * Tries var(--name) first (more specific), then bare --name.
   */
  private getPropertyAtPosition(
    lineText: string,
    charIndex: number,
    lineNumber: number
  ): PropertyAtPosition | undefined {
    // 1. Check if cursor is inside a var() function
    const varRegex = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g;
    let match: RegExpExecArray | null;

    while ((match = varRegex.exec(lineText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (charIndex >= start && charIndex <= end) {
        return {
          name: match[1].substring(2),
          fallback: match[2]?.trim(),
          range: new vscode.Range(
            lineNumber,
            start,
            lineNumber,
            end
          ),
        };
      }
    }

    // 2. Check if cursor is on a bare --property-name
    const bareRegex = /--[\w-]+/g;
    while ((match = bareRegex.exec(lineText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (charIndex >= start && charIndex <= end) {
        return {
          name: match[0].substring(2),
          fallback: undefined,
          range: new vscode.Range(
            lineNumber,
            start,
            lineNumber,
            end
          ),
        };
      }
    }

    return undefined;
  }

  private buildHoverContent(
    propertyName: string,
    fallback: string | undefined,
    definitions: CustomPropertyDefinition[]
  ): vscode.MarkdownString {
    const config = getConfig();
    const md = this.createMarkdown();

    md.appendMarkdown(`**\`--${propertyName}\`**\n\n`);

    // Show resolved value if enabled and the raw value contains var()
    if (config.showResolvedValue && definitions.length > 0) {
      const firstDef = definitions[0];
      if (firstDef.rawValue.includes("var(")) {
        const resolved = resolveValue(
          firstDef.rawValue,
          this.indexer.getIndex(),
          new Set(),
          config.resolutionDepth
        );

        const resolvedColor = extractColor(resolved.value);
        md.appendMarkdown("**Resolved:** ");
        if (resolvedColor) {
          md.appendMarkdown(`${colorSwatch(resolvedColor)} `);
        }
        md.appendMarkdown(`\`${resolved.value}\`\n\n`);

        if (resolved.chain.length > 0) {
          md.appendMarkdown(
            `*via ${resolved.chain.map((c) => `\`${c}\``).join(" \u2192 ")}*\n\n`
          );
        }

        if (resolved.partial) {
          md.appendMarkdown(
            "$(warning) *Could not fully resolve (cycle or missing reference)*\n\n"
          );
        }
      }
    }

    // Show fallback value if present in the var() call
    if (fallback) {
      const fallbackColor = extractColor(fallback);
      md.appendMarkdown("**Fallback:** ");
      if (fallbackColor) {
        md.appendMarkdown(`${colorSwatch(fallbackColor)} `);
      }
      md.appendMarkdown(`\`${fallback}\`\n\n`);
    }

    md.appendMarkdown("---\n\n");

    // Show each definition
    const count = definitions.length;
    md.appendMarkdown(
      `**${count} definition${count > 1 ? "s" : ""} found:**\n\n`
    );

    for (const def of definitions) {
      const relativePath = vscode.workspace.asRelativePath(def.filePath);

      // Build the context label: selector + optional at-rule wrapper
      let context = def.selector;
      if (def.atRule) {
        context = `${def.atRule} { ${def.selector} }`;
      }

      // Value with optional color swatch
      const valueColor = extractColor(def.rawValue);
      md.appendMarkdown(`\`${context}\`\n\n`);
      if (valueColor) {
        md.appendMarkdown(`${colorSwatch(valueColor)} \`--${def.name}: ${def.rawValue};\`\n\n`);
      } else {
        md.appendMarkdown(`\`--${def.name}: ${def.rawValue};\`\n\n`);
      }

      if (config.showFileLinks) {
        const args = encodeURIComponent(
          JSON.stringify([def.filePath, def.line])
        );
        md.appendMarkdown(
          `$(file) [${relativePath}:${def.line}](command:cssCustomPropertyInspector.goToDefinition?${args})\n\n`
        );
      } else {
        md.appendMarkdown(`$(file) *${relativePath}:${def.line}*\n\n`);
      }
    }

    return md;
  }
}
