// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { Client, EnvironmentType, environmentTypeFromString, mainSessionId, playgroundBaseAPIURL, playgroundUserBaseURL } from '@substrate/playground-client';

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

export async function connectToPlayground(id: string) {
    const uri = vscode.Uri.parse(`vscode-remote://ssh-remote+${id}.playground.substrate.io/`);
    await vscode.commands.executeCommand('vscode.openFolder', uri, true);
}

class TreeItem extends vscode.TreeItem {
    children: TreeItem[]|undefined;

    constructor(label: string, children?: TreeItem[]) {
      super(
          label,
          children === undefined ? vscode.TreeItemCollapsibleState.None :
                                   vscode.TreeItemCollapsibleState.Collapsed);
      this.children = children;
      if (children == undefined) {
        this.contextValue = "session";
        this.iconPath = new vscode.ThemeIcon("vm-outline");
        this.description = "description";
        this.tooltip = new vscode.MarkdownString("Hello \n [test](test)");
      }
    }
  }

export class PlaygroundTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

	protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeItem | undefined>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private readonly client;

	constructor(
		private readonly context: vscode.ExtensionContext,
        client: Client
	) {
        this.client = client;
	}

	getTreeItem(element: TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: TreeItem): vscode.ProviderResult<TreeItem[]> {
        console.log("about to resolve");
		if (!element) {
            const userId = 'jeluard';
              return new Promise(async resolve => {
                const sessions = await this.client.listUserSessions(userId);
                resolve([new TreeItem(userId, sessions.map(session => {
                    return new TreeItem(session.id);
                }))]);
			})
		}
		return element.children;
	}

}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {

    console.log("Activation");
    const environment = vscode.workspace.getConfiguration().get<string>('conf.substrate-playground.environment', "production");
    const env = environmentTypeFromString(environment);
    const client = new Client(playgroundBaseAPIURL(env));

    vscode.commands.registerCommand('substrate-playground.navigate', (node: TreeItem) => {
        const userId = node.label;
        if (userId) {
            const url = playgroundUserBaseURL(env, userId);
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    });

	const treeDataProvider = new PlaygroundTreeDataProvider(context, client);
	const workspaceView = vscode.window.createTreeView('substrate-playground.explorer', {
		treeDataProvider: treeDataProvider,
	});
    context.subscriptions.push(workspaceView);


    vscode.workspace.onDidChangeConfiguration(event => {
        let affected = event.affectsConfiguration("riot.compiler");
        if (affected) {
            // rebuild cpp project settings

        }
    })

    context.subscriptions.push(vscode.authentication.onDidChangeSessions(async e => {
        console.log("session changed", e);
    }));

    const session = await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });

    if (session) {
        await client.login(session.accessToken);
        const details = await client.get();

        const user = details.user;
        if (user) {
            vscode.commands.registerCommand('substrate-playground.newSession', async () => {
                  const repositories = await client.listRepositories();
                  const picks = repositories.map((repository) => {
                    return {
                        label: repository.id,
                        description: repository.currentVersion,
                    };
                  });
                 const pick = await vscode.window.showQuickPick(picks, {placeHolder: "The repository to be used", matchOnDescription: true, matchOnDetail: true});
                // TODO allow to choose timeout, node pool, repo version
                 if (pick) {
                    await client.createUserSession(user.id, mainSessionId(user), {repositorySource: {repositoryId: pick.label}});
                }
            });
        } else {
            vscode.window.showErrorMessage("Failed to access current user");
        }
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
