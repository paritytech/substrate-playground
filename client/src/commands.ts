import { WorkspaceClient } from "./workspace";

// See list here: https://code.visualstudio.com/api/references/commands

export async function startNode(workspace: WorkspaceClient, path: string): Promise<void> {
    return await workspace.exec("substrate.startNode", path);
}

export async function openFile(workspace: WorkspaceClient, path: string): Promise<void> {
    return await workspace.exec("vscode.open", path);
}

export async function gotoLine(workspace: WorkspaceClient): Promise<void> {
    return await workspace.exec("workbench.action.gotoLine", {lineNumber: "10", at: "top"});
}

export async function cursorMove(workspace: WorkspaceClient): Promise<void> {
    return await workspace.exec("cursorMove", {to: "top", by: "line"});
}
