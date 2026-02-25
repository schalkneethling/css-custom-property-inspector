# CSS Custom Property Inspector

A VS Code extension that shows CSS custom property values, definitions, and resolved references on hover. Works with CSS, SCSS, Less, and HTML files.

Compatible with VS Code, VS Codium, Cursor, and Windsurf.

## Features

- **Hover to inspect** — hover over any `--property-name` or `var(--property-name)` to see its value and where it's defined
- **Recursive resolution** — follows `var()` reference chains (e.g., `--color-primary: var(--blue-500)`) and shows the fully resolved value
- **Multiple definitions** — shows all definitions across the workspace, including those inside `@media` queries and different selectors
- **Color swatches** — displays a color preview next to hex, rgb, hsl, oklch, and named color values
- **Clickable file links** — jump directly to the definition in the source file
- **Fallback values** — surfaces fallback values from `var(--name, fallback)` expressions
- **Not-found feedback** — tells you when a custom property has no definition in the workspace
- **Live updates** — re-indexes automatically when CSS files are created, changed, or deleted

## How it works

When the extension activates, it scans all CSS, SCSS, and Less files in your workspace for custom property definitions (`--name: value`). It also extracts definitions from `<style>` blocks in HTML files. The index is kept up to date via a file system watcher.

When you hover over a custom property reference, the extension looks it up in the index and displays:

1. The property name
2. The resolved value (if the raw value contains `var()` references)
3. The resolution chain (which properties were followed)
4. Each definition with its selector context, at-rule context, raw value, and source file location

## Extension settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `cssCustomPropertyInspector.showResolvedValue` | boolean | `true` | Show the fully resolved value after following `var()` references |
| `cssCustomPropertyInspector.resolutionDepth` | number | `10` | Maximum depth for recursive `var()` resolution |
| `cssCustomPropertyInspector.excludePatterns` | string | `**/node_modules/**` | Glob pattern for files/folders to exclude from scanning |
| `cssCustomPropertyInspector.includeFileTypes` | string[] | `["css", "scss", "less"]` | File extensions to scan for custom property definitions |
| `cssCustomPropertyInspector.showFileLinks` | boolean | `true` | Show clickable links to the definition files in the hover |

## Development

```sh
# Install dependencies
npm install

# Compile
npm run compile

# Watch for changes
npm run watch
```

Press **F5** in VS Code to launch an Extension Development Host for testing.

## License

[MIT](LICENSE)
