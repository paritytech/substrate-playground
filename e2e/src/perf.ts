import { Client, EnvironmentType, getAuthorization, getVerification, playgroundBaseURL } from '@substrate/playground-client';
import 'cross-fetch/polyfill';
import 'abort-controller/polyfill';
import * as readline from 'readline';
import yargs from 'yargs/yargs';

interface Arguments {
    env: string,
    template: string,
    instances: number,
}

const argv: Arguments = yargs(process.argv.slice(2))
	.options({
		'env': {
			alias: 'e',
			describe: 'provide the environment to interact with',
			choices: ['production', 'staging', 'local'],
			default: 'production',
		},
		'template': {
			alias: '',
			describe: 'template to deploy',
			type: 'string',
            default: 'node-template'
		},
		'instances': {
			alias: 'i',
			describe: 'provide the environment to interact with',
			type: 'number',
			default: 50,
		},
	})
	.argv

function parseCookies(response: any): string {
    const raw = response.headers.raw()['set-cookie'];
    return raw.map((entry) => {
      const parts = entry.split(';');
      const cookiePart = parts[0];
      return cookiePart;
    }).join(';');
  }

async function main() {
    console.log(`Accessing ${argv.env}. About to deploy ${argv.instances} instances of ${argv.template}`);

    const env = EnvironmentType[argv.env];
    const url = playgroundBaseURL(env);
    const timeout = 10000;
    const client = new Client(url, timeout, {credentials: "include"});
    const details = await client.get();
    const githubClientId = details.configuration.githubClientId;
    const verification = await getVerification(githubClientId);

    console.log(`Enter code ${verification.userCode} at ${verification.verificationUri}`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("Ready ? ", async function() {
        const authorization = await getAuthorization(githubClientId, verification.deviceCode);

        try {
            const res = await client.login(authorization.accessToken);
            const cookies = parseCookies(res);

            const loggedClient = new Client(url, timeout, {'headers': {'accept': '*','cookie': cookies }});
            for (let i = 0; i < argv.instances; i++) {
                const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                const name = `perftest-${id}`;
                await loggedClient.createWorkspace(name, {template: argv.template});
                console.log(`Created workspace ${name}`);
            }
            console.log("Done");
        } catch (e) {
            console.log("exception:", e);
        }

        rl.close();
    });
}

(async function() {
	await main();
  }().catch(e => {
	  console.error("Failed to start:" ,e)
}));
