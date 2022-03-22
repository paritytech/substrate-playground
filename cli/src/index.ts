#!/usr/bin/env node

import { Client, EnvironmentType, Template, getAuthorization, getVerification, playgroundBaseURL } from '@substrate/playground-client';
import clipboard from 'clipboardy';
import open from 'open';
import 'cross-fetch/polyfill';
import yargs from 'yargs/yargs';
import * as readline from 'readline';
import { ui } from './perf';

interface Arguments {
    web: boolean;
    env: string;
    template?: string;
    debug: boolean;
    port: number;
}

const argv: Arguments = yargs(process.argv.slice(2))
	.options({
		'web': {
			alias: 'w',
			describe: 'enable web IDE',
			type: 'boolean',
            default: true
		},
		'env': {
			alias: 'e',
			describe: 'provide the environment to interact with',
			choices: ['production', 'staging', 'dev'],
			default: 'production',
		},
		'template': {
			alias: 't',
			describe: 'provide template id',
			type: 'string'
		},
		'debug': {
			alias: 'd',
			describe: 'enable debug logs',
			type: 'boolean'
		},
		'port': {
			alias: 'p',
			describe: 'web port',
			type: 'number',
			default: 80
		}
	})
	.argv;

(async function() {
    const env = EnvironmentType[argv.env];
    const client = new Client(playgroundBaseURL(env));
  /*  const details = await client.get();

    const githubClientId = details.configuration.githubClientId;
    const verification = await getVerification(githubClientId);

    clipboard.writeSync(verification.userCode);
    await open(verification.verificationUri);
    console.log(`Enter code ${verification.userCode} at ${verification.verificationUri}`);
*/
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("Ready ? ", async function() {
        try {
          //  const authorization = await getAuthorization(githubClientId, verification.deviceCode);

            //await client.login(authorization.accessToken);

            const { waitUntilExit } = ui(argv, client);
            await waitUntilExit();
        } catch (e) {
            console.log("exception:", e);
        }

        rl.close();
    });


  }().catch(e => {
	  console.error("Failed to start template" ,e)
}));
