#!/usr/bin/env node

const { argv } = require('yargs')
const fetch = require('node-fetch');
const importJsx = require('import-jsx');
const rend = importJsx('./ui');

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
	const env =  argv.env || 'staging';
	const playgroundBase = playgroundBaseFrom(env);

	const res = await playgroundDetail(playgroundBase);
	const object = await res.json();

	rend(object);
  }().catch(e => {
	  console.log(e)
}));
