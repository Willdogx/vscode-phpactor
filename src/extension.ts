import { spawn } from 'child_process';
import {
    LanguageClient,
    ServerOptions,
    LanguageClientOptions,
    RevealOutputChannelOn,
} from "vscode-languageclient";

import * as vscode from "vscode";
import { promisify } from "util";

const exec = promisify(require('child_process').exec);
const LanguageID = 'php';

let languageClient: LanguageClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    let workspaceConfig = vscode.workspace.getConfiguration();
    const config = workspaceConfig.get("phpactor") as any;
    const enable = config.enable;

    if (enable === false) return;

    languageClient = createClient(config);

    languageClient.start();
}

export function deactivate() {
	if (!languageClient) {
		return undefined;
	}
	return languageClient.stop();
}

function createClient(config: any): LanguageClient {
    let serverOptions: ServerOptions = {
        run: {
            command: config.path,
            args: [
                "language-server"
            ]
        },
        debug: {
            command: "phpactor",
            args: [
                "language-server"
            ]
        },
    };

    let clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: LanguageID, scheme: 'file' },
            { language: LanguageID, scheme: 'untitled' }
        ],
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        initializationOptions: config.config,
    };

    languageClient = new LanguageClient(
        "phpactor",
        "Phpactor Language Server",
        serverOptions,
        clientOptions
    );

    vscode.commands.registerCommand('phpactor.reindex', reindex);
    vscode.commands.registerCommand('phpactor.config.dump', dumpConfig);
    vscode.commands.registerCommand('phpactor.services.list', servicesList);
    vscode.commands.registerCommand('phpactor.status', status);
    vscode.commands.registerCommand('phpactor.class_new', newClass);

    return languageClient;
}

function reindex(): void {
	if(!languageClient) {
		return;
    }

    languageClient.sendRequest('indexer/reindex');
}

function dumpConfig(): void {
	if(!languageClient) {
		return;
    }

    languageClient.sendRequest('session/dumpConfig');
}

function servicesList(): void {
	if(!languageClient) {
		return;
    }

    languageClient.sendRequest('service/running');
}

function status(): void {
	if(!languageClient) {
		return;
    }

    languageClient.sendRequest('system/status');
}

async function newClass(file: any): Promise<void> {
    if (!languageClient) {
        return;
    }

    const workingDir = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.path;
    let currentPath: string;
    if (file instanceof vscode.Uri) {
        currentPath = file.path;
    } else {
        currentPath = vscode.window.activeTextEditor.document.fileName;
    }

    
    const newClassPath = await vscode.window.showInputBox({
        placeHolder: 'Path to new file',
        prompt: 'Path to new file',
        value: currentPath
    });

    if (newClassPath === undefined) {
        return;
    }

    const { error, stdout, stderr } = await exec(`phpactor class:new ${newClassPath}`, { cwd: workingDir });
    
    if (error) {
        languageClient.outputChannel.appendLine(error.message);
        return;
    }
    
    if (stderr) {
        languageClient.outputChannel.appendLine(stderr);
        return;
    }

    languageClient.outputChannel.appendLine(stdout);

    const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(newClassPath));
    vscode.window.showTextDocument(textDocument);
}

function rpcPhpActor(workingDir: string, command: { action: string, parameters: any}): Promise<any> {
    if (command.action === 'return') {
      return command.parameters.value;
    }
    return new Promise((resolve, reject) => {
      const sh = 'phpactor rpc';
      const cmd = spawn(sh, {
        cwd: workingDir,
        shell: '/bin/bash'
      });

      cmd.stdin.write(JSON.stringify(command));

      let result = '';
      cmd.stdout.on('data', function (data: Buffer) {
        result += data.toString();
      });

      cmd.on('close', function () {
        resolve(JSON.parse(result));
      });

      cmd.on('error', function (err: Error) {
        reject(err);
      });
      cmd.stdin.end();
    });
}
