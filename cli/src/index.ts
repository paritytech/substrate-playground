#!/usr/bin/env node

import { Client, EnvironmentType, playgroundBaseURL, Repository } from '@substrate/playground-client';
import 'cross-fetch/polyfill';
import 'abort-controller/polyfill';
import { lookpath } from 'lookpath';
import yargs from 'yargs/yargs';
import { ui } from './ui';

interface Arguments {
    web: boolean;
    env: string;
    repository?: string;
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
			choices: ['production', 'staging'],
			default: 'production',
		},
		'repository': {
			alias: 'r',
			describe: 'provide repository id',
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
	.argv

async function fetchRepositories(base: string): Promise<Repository[]> {
    const client = new Client(base);
    return Object.values((await client.listRepositories()));
}

(async function() {
	if (!await lookpath('docker')) {
		console.error("A local docker installation is required");
		process.exit(1);
	}

    const env = EnvironmentType[argv.env];
	ui(Object.assign({repositories: await fetchRepositories(playgroundBaseURL(env))}, argv));
  }().catch(e => {
	  console.error("Failed to start template" ,e)
}));
