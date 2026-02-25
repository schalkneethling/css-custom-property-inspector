import * as vscode from "vscode";
import { CustomPropertyIndexer } from "./indexer";
import { CSSCustomPropertyHoverProvider } from "./hoverProvider";

let indexer: CustomPropertyIndexer | undefined;

export function activate(context: vscode.ExtensionContext): void {
  indexer = new CustomPropertyIndexer();

  const languages: vscode.DocumentFilter[] = [
    { language: "css" },
    { language: "scss" },
    { language: "less" },
    { language: "html" },
  ];

  const hoverProvider = new CSSCustomPropertyHoverProvider(indexer);
  const registration = vscode.languages.registerHoverProvider(
    languages,
    hoverProvider
  );

  context.subscriptions.push(registration);
  context.subscriptions.push(indexer);

  // Command for navigating to a custom property definition.
  // Works reliably for both same-file and cross-file jumps.
  const goToDefCommand = vscode.commands.registerCommand(
    "cssCustomPropertyInspector.goToDefinition",
    async (filePath: string, line: number) => {
      const uri = vscode.Uri.file(filePath);
      const zeroBasedLine = line - 1;
      const range = new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        selection: range,
        preserveFocus: false,
      });
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
  );
  context.subscriptions.push(goToDefCommand);

  // Start indexing in the background — don't block activation.
  // The hover provider awaits initialize() on first hover.
  indexer.initialize().then(() => {
    const count = indexer?.getIndex().size ?? 0;
    console.log(`CSS Custom Property Inspector: indexed ${count} custom properties`);
  }).catch((err) => {
    console.error("CSS Custom Property Inspector: indexing failed", err);
  });

  // Re-index when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cssCustomPropertyInspector")) {
        indexer?.reindexAll();
      }
    })
  );
}

export function deactivate(): void {
  indexer?.dispose();
  indexer = undefined;
}
