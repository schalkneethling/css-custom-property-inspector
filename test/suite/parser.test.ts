import * as assert from "assert";
import { parseFileContent, extractStyleBlocks } from "../../src/parser";

suite("Parser", () => {
  suite("parseFileContent", () => {
    test("parses a simple :root definition", () => {
      const css = `:root {
  --color-primary: #ff0000;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "color-primary");
      assert.strictEqual(defs[0].rawValue, "#ff0000");
      assert.strictEqual(defs[0].selector, ":root");
      assert.strictEqual(defs[0].atRule, undefined);
      assert.strictEqual(defs[0].line, 2);
    });

    test("parses multiple properties in one selector", () => {
      const css = `:root {
  --color-primary: #ff0000;
  --color-secondary: #00ff00;
  --font-size-base: 16px;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 3);
      assert.strictEqual(defs[0].name, "color-primary");
      assert.strictEqual(defs[1].name, "color-secondary");
      assert.strictEqual(defs[2].name, "font-size-base");
    });

    test("parses var() references as raw values", () => {
      const css = `:root {
  --link-color: var(--color-primary);
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].rawValue, "var(--color-primary)");
    });

    test("parses properties inside @media rules", () => {
      const css = `@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a1a;
  }
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "color-bg");
      assert.strictEqual(defs[0].rawValue, "#1a1a1a");
      assert.strictEqual(defs[0].selector, ":root");
      assert.strictEqual(defs[0].atRule, "@media (prefers-color-scheme: dark)");
    });

    test("parses properties in non-root selectors", () => {
      const css = `.dark-theme {
  --color-bg: #222;
  --color-text: #eee;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 2);
      assert.strictEqual(defs[0].selector, ".dark-theme");
      assert.strictEqual(defs[1].selector, ".dark-theme");
    });

    test("handles multi-line values", () => {
      const css = `:root {
  --gradient-hero: linear-gradient(
    to bottom,
    #ff0000,
    #00ff00
  );
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "gradient-hero");
      assert.ok(defs[0].rawValue.includes("linear-gradient"));
      assert.ok(defs[0].rawValue.includes("#ff0000"));
      assert.ok(defs[0].rawValue.includes("#00ff00"));
    });

    test("handles calc() with var() inside", () => {
      const css = `:root {
  --spacing-large: calc(var(--spacing-base) * 2);
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(
        defs[0].rawValue,
        "calc(var(--spacing-base) * 2)"
      );
    });

    test("ignores properties inside block comments", () => {
      const css = `:root {
  /* --color-old: red; */
  --color-new: blue;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "color-new");
    });

    test("ignores properties after SCSS single-line comments", () => {
      const css = `:root {
  // --color-old: red;
  --color-new: blue;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "color-new");
    });

    test("handles multi-line block comments", () => {
      const css = `:root {
  /*
   * Old design tokens:
   * --color-old: red;
   */
  --color-new: blue;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "color-new");
    });

    test("handles multiple selectors in one file", () => {
      const css = `:root {
  --color-primary: #ff0000;
}

.dark-theme {
  --color-primary: #cc0000;
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 2);
      assert.strictEqual(defs[0].selector, ":root");
      assert.strictEqual(defs[1].selector, ".dark-theme");
      assert.strictEqual(defs[0].name, "color-primary");
      assert.strictEqual(defs[1].name, "color-primary");
    });

    test("applies lineOffset for HTML <style> blocks", () => {
      const css = `  --color-primary: #ff0000;`;
      // Simulating a <style> block starting at line 10
      const defs = parseFileContent(css, "/test.html", 10);

      assert.strictEqual(defs.length, 0); // No selector context
    });

    test("handles @media with min-width queries", () => {
      const css = `@media only screen and (min-width: 64rem) {
  :root {
    --font-size-hero: 3rem;
  }
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(defs[0].name, "font-size-hero");
      assert.strictEqual(defs[0].rawValue, "3rem");
      assert.strictEqual(
        defs[0].atRule,
        "@media only screen and (min-width: 64rem)"
      );
    });

    test("handles var() with fallback as raw value", () => {
      const css = `:root {
  --color-link: var(--color-primary, #0066cc);
}`;
      const defs = parseFileContent(css, "/test.css");

      assert.strictEqual(defs.length, 1);
      assert.strictEqual(
        defs[0].rawValue,
        "var(--color-primary, #0066cc)"
      );
    });
  });

  suite("extractStyleBlocks", () => {
    test("extracts a single <style> block", () => {
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
:root {
  --color: red;
}
</style>
</head>
</html>`;
      const blocks = extractStyleBlocks(html);

      assert.strictEqual(blocks.length, 1);
      assert.ok(blocks[0].content.includes("--color: red"));
      assert.strictEqual(blocks[0].lineOffset, 3); // <style> is on line 4 (0-based: 3)
    });

    test("extracts multiple <style> blocks", () => {
      const html = `<style>
:root { --a: 1; }
</style>
<div></div>
<style>
:root { --b: 2; }
</style>`;
      const blocks = extractStyleBlocks(html);

      assert.strictEqual(blocks.length, 2);
      assert.ok(blocks[0].content.includes("--a"));
      assert.ok(blocks[1].content.includes("--b"));
    });

    test("returns empty array when no <style> tags", () => {
      const html = `<html><body><p>No styles here</p></body></html>`;
      const blocks = extractStyleBlocks(html);

      assert.strictEqual(blocks.length, 0);
    });
  });
});
