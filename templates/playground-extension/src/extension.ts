// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { Client } from '@substrate/playground-client';
import * as Octokit from '@octokit/rest';

import 'cross-fetch/dist/node-polyfill.js';

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

export async function conectToPlayground(id: string) {
    const uri = vscode.Uri.parse(`vscode-remote://ssh-remote+${id}.playground.substrate.io/`);
    await vscode.commands.executeCommand('vscode.openFolder', uri, true);
}

class GitpodWorksapcePorts extends vscode.TreeItem {
	readonly ports = new Map<number, number>();
	constructor() {
		super('Ports', vscode.TreeItemCollapsibleState.Expanded);
	}
}

type GitpodWorkspaceElement = GitpodWorksapcePorts;

export class GitpodWorkspaceTreeDataProvider implements vscode.TreeDataProvider<GitpodWorkspaceElement> {

	readonly ports = new GitpodWorksapcePorts();

	protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<GitpodWorkspaceElement | undefined>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(
		private readonly context: vscode.ExtensionContext
	) {
	}

	getTreeItem(element: GitpodWorkspaceElement): vscode.TreeItem {
		return element;
	}

	getChildren(element?: GitpodWorkspaceElement): vscode.ProviderResult<GitpodWorkspaceElement[]> {
		if (!element) {
			return [this.ports];
		}
		return [];
	}

	getParent(element: GitpodWorkspaceElement): GitpodWorkspaceElement | undefined {
		return undefined;
	}

}

function apiHost(): string {
    const paths = window.location.host.split('.');
    paths.shift();
    return `https://${paths.join('.')}/api`;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const gitpodWorkspaceTreeDataProvider = new GitpodWorkspaceTreeDataProvider(context);
	const workspaceView = vscode.window.createTreeView('github.playground.explorer', {
		treeDataProvider: gitpodWorkspaceTreeDataProvider,
	});
    context.subscriptions.push(workspaceView);

    const details = await new Client("https://playground.substrate.io/api"/*apiHost()*/, 30000, {credentials: "include"}).get();
    console.log(details);


    const session = await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });
    console.log(session);

    context.subscriptions.push(vscode.authentication.onDidChangeSessions(async e => {
        console.log(e)
    }));

    if (session) {
        const octokit = new Octokit.Octokit({
            auth: session.accessToken
        });
        const userInfo = await octokit.users.getAuthenticated();

		vscode.window.showInformationMessage(`Logged into GitHub as ${userInfo.data.login}`);
    }


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
