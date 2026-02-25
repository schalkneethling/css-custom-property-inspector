import * as vscode from "vscode";
import { CustomPropertyDefinition, CustomPropertyIndex } from "./types";
import { parseFileContent, extractStyleBlocks } from "./parser";
import { getConfig } from "./config";

const BATCH_SIZE = 50;

export class CustomPropertyIndexer implements vscode.Disposable {
  private index: CustomPropertyIndex = new Map();
  private fileDefinitions: Map<string, CustomPropertyDefinition[]> = new Map();
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private htmlFileWatcher: vscode.FileSystemWatcher | undefined;
  private initPromise: Promise<void> | undefined;
  private disposables: vscode.Disposable[] = [];

  /**
   * Initialize the indexer. Safe to call multiple times — subsequent calls
   * return the same promise as the first.
   */
  initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  /**
   * Look up all definitions for a custom property.
   * @param propertyName The property name without the leading --
   */
  lookup(propertyName: string): CustomPropertyDefinition[] | undefined {
    return this.index.get(propertyName);
  }

  /**
   * Get the full index (used by the resolver).
   */
  getIndex(): CustomPropertyIndex {
    return this.index;
  }

  /**
   * Re-index the entire workspace. Called when configuration changes.
   */
  async reindexAll(): Promise<void> {
    this.index.clear();
    this.fileDefinitions.clear();
    this.disposeWatchers();
    this.initPromise = undefined;
    await this.initialize();
  }

  dispose(): void {
    this.disposeWatchers();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.index.clear();
    this.fileDefinitions.clear();
  }

  private disposeWatchers(): void {
    this.fileWatcher?.dispose();
    this.fileWatcher = undefined;
    this.htmlFileWatcher?.dispose();
    this.htmlFileWatcher = undefined;
  }

  private async doInitialize(): Promise<void> {
    const config = getConfig();
    const extensions = config.includeFileTypes.join(",");

    // Find and index CSS/SCSS/Less files
    const cssFiles = await vscode.workspace.findFiles(
      `**/*.{${extensions}}`,
      config.excludePatterns
    );

    // Find and index HTML files (for <style> blocks)
    const htmlFiles = await vscode.workspace.findFiles(
      "**/*.html",
      config.excludePatterns
    );

    // Index files in batches to avoid overwhelming the system
    const allFiles = [...cssFiles, ...htmlFiles];
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((uri) => this.indexFile(uri)));
    }

    // Set up file watchers
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      `**/*.{${extensions}}`
    );
    this.fileWatcher.onDidChange((uri) => this.reindexFile(uri));
    this.fileWatcher.onDidCreate((uri) => this.indexFile(uri));
    this.fileWatcher.onDidDelete((uri) => this.removeFile(uri));

    this.htmlFileWatcher =
      vscode.workspace.createFileSystemWatcher("**/*.html");
    this.htmlFileWatcher.onDidChange((uri) => this.reindexFile(uri));
    this.htmlFileWatcher.onDidCreate((uri) => this.indexFile(uri));
    this.htmlFileWatcher.onDidDelete((uri) => this.removeFile(uri));
  }

  private async indexFile(uri: vscode.Uri): Promise<void> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder().decode(content);
      let definitions: CustomPropertyDefinition[];

      if (uri.fsPath.endsWith(".html") || uri.fsPath.endsWith(".htm")) {
        // Extract <style> blocks and parse each with its line offset
        definitions = [];
        const blocks = extractStyleBlocks(text);
        for (const block of blocks) {
          const blockDefs = parseFileContent(
            block.content,
            uri.fsPath,
            block.lineOffset
          );
          definitions.push(...blockDefs);
        }
      } else {
        definitions = parseFileContent(text, uri.fsPath);
      }

      // Store per-file for later removal
      this.fileDefinitions.set(uri.fsPath, definitions);

      // Add to main index
      for (const def of definitions) {
        const existing = this.index.get(def.name) ?? [];
        existing.push(def);
        this.index.set(def.name, existing);
      }
    } catch {
      // File may have been deleted or be unreadable — skip silently
    }
  }

  private async reindexFile(uri: vscode.Uri): Promise<void> {
    this.removeFile(uri);
    await this.indexFile(uri);
  }

  private removeFile(uri: vscode.Uri): void {
    const oldDefs = this.fileDefinitions.get(uri.fsPath);
    if (!oldDefs) {
      return;
    }

    for (const def of oldDefs) {
      const entries = this.index.get(def.name);
      if (entries) {
        const filtered = entries.filter((d) => d.filePath !== uri.fsPath);
        if (filtered.length === 0) {
          this.index.delete(def.name);
        } else {
          this.index.set(def.name, filtered);
        }
      }
    }
    this.fileDefinitions.delete(uri.fsPath);
  }
}
