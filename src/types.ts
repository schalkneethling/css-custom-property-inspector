/**
 * A single definition of a CSS custom property found in the workspace.
 */
export interface CustomPropertyDefinition {
  /** The property name without the leading --, e.g. "color-primary" */
  name: string;

  /** The raw value as written in the source, e.g. "var(--blue-500)" or "#ff0000" */
  rawValue: string;

  /** Absolute file path where this definition lives */
  filePath: string;

  /** The selector enclosing the definition, e.g. ":root", ".dark-theme" */
  selector: string;

  /** Optional enclosing at-rule context, e.g. "@media (prefers-color-scheme: dark)" */
  atRule?: string;

  /** 1-based line number of the definition in the source file */
  line: number;
}

/**
 * The full index: maps property name (without --) to all its definitions.
 */
export type CustomPropertyIndex = Map<string, CustomPropertyDefinition[]>;

/**
 * Result of resolving a var() reference chain.
 */
export interface ResolvedValue {
  /** The final resolved value (may still contain var() if unresolvable) */
  value: string;

  /** The chain of properties traversed to reach the resolved value */
  chain: string[];

  /** Whether resolution terminated because of a cycle or depth limit */
  partial: boolean;
}
