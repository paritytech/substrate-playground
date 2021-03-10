import { Instance } from "./connect";

export async function startNode(instance: Instance, path: string): Promise<Record<string, unknown>> {
    return await instance.execute("substrate.startNode", path);
}

export async function openFile(instance: Instance, path: string): Promise<Record<string, unknown>> {
    return await instance.execute("vscode.open", path);
}

export async function gotoLine(instance: Instance): Promise<Record<string, unknown>> {
    return await instance.execute("workbench.action.gotoLine", {lineNumber: "10", at: "top"});
}

export async function cursorMove(instance: Instance): Promise<Record<string, unknown>> {
    return await instance.execute("cursorMove", {to: "top", by: "line"});
}
