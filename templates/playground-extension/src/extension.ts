// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

export function openWorkspaceLocation(): boolean {
	if (vscode.workspace.workspaceFolders) {
		return false;
	}
	const workspaceUri = vscode.Uri.file('/home/playground/workspace');
	vscode.commands.executeCommand('vscode.openFolder', workspaceUri, { forceReuseWindow: true });
	return true;
}

function parseCommands(command: any): Array<string> {
    if (typeof command === "string") {
        return [command];
    } else if (Array.isArray(command)) {
        return command;
    } else if (command) {
        console.error(`Unknown command type: ${command}`);
    }
    return [];
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await openWorkspaceLocation();

 if (vscode.workspace.workspaceFolders) {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.file(path.resolve(vscode.workspace.workspaceFolders[0].uri.path, '.devcontainer/devcontainer.json')));
    // TODO filter comments from JSON
    const { extensions, postStartCommand } = JSON.parse(Buffer.from(data).toString('utf8'));
    for (const command of parseCommands(postStartCommand)) {
        const terminal = vscode.window.createTerminal({
            name: "My Command",
        });
        terminal.show();
        terminal.sendText(command);
    }

    for (const extension of extensions) {
        vscode.commands.executeCommand('workbench.extensions.installExtension', extension);
    }
 }
}
