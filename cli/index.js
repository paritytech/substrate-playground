#!/usr/bin/env node

const fetch = require('node-fetch');
const importJsx = require('import-jsx');
const { lookpath } = require('lookpath');
const rend = importJsx('./ui');
const argv = require('yargs')
	.options({
		'web': {
			alias: 'w',
			describe: 'enable web IDE',
			type: 'boolean'
		},
		'env': {
			alias: 'e',
			describe: 'provide the environment to interact with',
			choices: ['production', 'staging', 'dev'],
			default: 'production'
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
			type: 'int',
			default: 80
		}
	})
	.argv

function playgroundBaseFrom(env) {
	switch (env) {
		case 'production':
			return 'https://playground.substrate.dev/';
		case 'staging':
			return 'https://playground-staging.substrate.dev/';
		case 'dev':
			return 'https://playground-dev.substrate.test/';
	}
}

async function playgroundDetail(base) {
	return await fetch(`${base}/api/`);
}

(async function() {
	if (!await lookpath('docker')) {
		console.error("A local docker installation is required");
		process.exit(1);
	}

	const env =  argv.env;
	const playgroundBase = playgroundBaseFrom(env);

	const res = await playgroundDetail(playgroundBase);
	const object = await res.json();

	rend(Object.assign(object, argv));
  }().catch(e => {
	  console.error("Failed to start template" ,e)
}));
