#!/usr/bin/env node

const fetch = require('node-fetch');
const importJsx = require('import-jsx');
const { lookpath } = require('lookpath');
const rend = importJsx('./ui');
const argv = require('yargs')
	.options({
		'web': {
			alias: 'w',
			describe: 'run your program',
			type: 'boolean'
		},
		'env': {
			alias: 'e',
			describe: 'provide a path to file',
			choices: ['production', 'staging', 'dev'],
			default: 'production'
		},
		'template': {
			alias: 't',
			describe: 'provide a path to file',
			type: 'string'
		},
		'debug': {
			alias: 'd',
			describe: 'program specifications',
			type: 'boolean'
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
	if (!await lookpath('dockera')) {
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
