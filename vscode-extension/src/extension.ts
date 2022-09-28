// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { Client, environmentTypeFromString, playgroundBaseAPIURL, playgroundUserBaseURL, Session, User } from '@substrate/playground-client';

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

class UserTreeItem extends vscode.TreeItem {
    children: SessionTreeItem[]|undefined;

    constructor(user: User, children: SessionTreeItem[]) {
      super(
          user.id,
          children === undefined ? vscode.TreeItemCollapsibleState.None :
                                   vscode.TreeItemCollapsibleState.Collapsed);
      this.children = children;
    }
  }

class SessionTreeItem extends vscode.TreeItem {
    user: User;
    session: Session;
    constructor(user: User, session: Session) {
      super(
          user.id,
          vscode.TreeItemCollapsibleState.None);
          this.contextValue = "session";
          this.iconPath = new vscode.ThemeIcon("vm-outline");
          this.description = session.state.type;
          if (session.state.type == "Running") {
            const {runtimeConfiguration, startTime, node} = session.state;
            this.tooltip = new vscode.MarkdownString(`Started at ${startTime} on ${node.hostname}  \n\n   ENV: \n${runtimeConfiguration.env.map(env => `* ${env.name} = ${env.value}\n`)}`);
          }
          this.user = user;
          this.session = session;
    }
  }

export class PlaygroundTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

	protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    private readonly client;
    private readonly user;

	constructor(
		private readonly context: vscode.ExtensionContext,
        client: Client,
        user: User
	) {
        this.client = client;
        this.user = user;
	}

	getTreeItem(element: SessionTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: UserTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
		if (!element) {
              return new Promise(async resolve => {
                const userId = this.user.id;
                const session = await this.client.getSession(userId);
                if (session) {
                    resolve([new UserTreeItem(this.user, [
                        new SessionTreeItem(this.user, session)
                    ])]);
                }
			})
		}
		return element.children;
	}

}

//
// This method is called when your extension is activated
// The extension is activated the very first time the command is executed
//
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // TODO detect if running in playground

    const environment = vscode.workspace.getConfiguration().get<string>('conf.substrate-playground.environment', "production");
    const env = environmentTypeFromString(environment);
    const client = new Client(playgroundBaseAPIURL(env));

    vscode.workspace.onDidChangeConfiguration(event => {
        console.log("Configuration changed!!!!", event);
    })

    context.subscriptions.push(vscode.authentication.onDidChangeSessions(event => {
        console.log("Session changed !!!!!", event);
    }));

    const session = await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });
    if (session) {
        await client.login(session.accessToken);
        const details = await client.get();

        const user = details.user;
        if (user) {
            const treeDataProvider = new PlaygroundTreeDataProvider(context, client, user);
            const workspaceView = vscode.window.createTreeView('substrate-playground.explorer', {
                treeDataProvider: treeDataProvider,
            });
            context.subscriptions.push(workspaceView);

            // Commands

            vscode.commands.registerCommand('substrate-playground.navigate', (node: SessionTreeItem) => {
                const user = node.user;
                if (user) {
                    const url = playgroundUserBaseURL(env, user.id);
                    vscode.env.openExternal(vscode.Uri.parse(url));
                }
            });

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
                    await client.createSession(user.id, {repositorySource: {repositoryId: pick.label}});
                    const connect = "Connect to it";
                    vscode.window.showInformationMessage("Session succesfully created", connect).then(selection => {
                        if (selection === connect) {
                          connectToPlayground(user.id);
                        }
                      });
                }
            });

            vscode.commands.registerCommand('substrate-playground.closeSession', async (node: SessionTreeItem) => {
                const userId = node.user?.id;
                if (userId) {
                    await client.deleteSession(userId);
                    vscode.window.showInformationMessage("Session succesfully closed");
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
