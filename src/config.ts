import * as vscode from "vscode";

export interface ExtensionConfig {
  showResolvedValue: boolean;
  resolutionDepth: number;
  excludePatterns: string;
  includeFileTypes: string[];
  showFileLinks: boolean;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(
    "cssCustomPropertyInspector"
  );
  return {
    showResolvedValue: config.get<boolean>("showResolvedValue", true),
    resolutionDepth: config.get<number>("resolutionDepth", 10),
    excludePatterns: config.get<string>("excludePatterns", "**/node_modules/**"),
    includeFileTypes: config.get<string[]>("includeFileTypes", [
      "css",
      "scss",
      "less",
    ]),
    showFileLinks: config.get<boolean>("showFileLinks", true),
  };
}
