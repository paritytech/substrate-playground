#!/usr/bin/env node

const { Client } = require('@substrate/playground-api');
const importJsx = require('import-jsx');
const { lookpath } = require('lookpath');
const { spawn } = require('child_process');
const ui = importJsx('./ui');
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
		},
		'offline': {
			alias: 'o',
			describe: 'disable internet access',
			type: 'boolean',
			default: false
		}
	})
	.argv

async function templates({offline, web, env}) {
	if (offline) {
		const templates = await new Promise((resolve, reject) => {
			const templates = [];
			const filter = web ? 'paritytech/substrate-playground-template-*-theia' : 'paritytech/substrate-playground-template-*';
			const regexp = web ? /paritytech\/substrate-playground-template-(.*?)-theia/ : /paritytech\/substrate-playground-template-(.*)/;
			const p = spawn('docker', ['images', filter, '--format' , '{{.Repository}}:{{.Tag}}']);
			p.stdout.on('data', function(data) {
				const s = data.toString();
				s.split("\n").forEach(line => {
					const [template, tag] = line.split(":");
					if (template) {
						if (!web && template.endsWith("theia")) {
							return;
						}
						const [_, id] = regexp.exec(template);
						if (!templates.find(t => t.id == id)) {
							templates.push({id: id, tag: tag, description: template, public: true});
						}
					}
				});
			});
			p.stdout.on('close', function(data) {
				resolve(templates);
			});
        });
		return templates;
	} else {
		const client = new Client({env: env});
		const res = await client.getDetails();
		return Object.entries(res.result.templates)
			.map(([k, v]) => {
				v.id = k;
				v.tag = v.image.split(":").slice(-1)[0];
				return v;
			});
	}
}

(async function() {
	if (!await lookpath('docker')) {
		console.error("A local docker installation is required");
		process.exit(1);
	}

	ui(Object.assign({templates: await templates(argv)}, argv));
  }().catch(e => {
	  console.error("Failed to start template" ,e)
}));
