import { SessionClient } from "./session";


export async function startNode(session: SessionClient, path: string): Promise<void> {
    return await session.exec("substrate.startNode", path);
}

export async function openFile(session: SessionClient, path: string): Promise<void> {
    return await session.exec("vscode.open", path);
}

export async function gotoLine(session: SessionClient): Promise<void> {
    return await session.exec("workbench.action.gotoLine", {lineNumber: "10", at: "top"});
}

export async function cursorMove(session: SessionClient): Promise<void> {
    return await session.exec("cursorMove", {to: "top", by: "line"});
}
