#!/usr/bin/env node

import { Client, EnvironmentType, Template, playgroundBaseURL } from '@substrate/playground-client';
import { spawn } from 'child_process';
import 'cross-fetch/polyfill';
import 'abort-controller/polyfill';
import { lookpath } from 'lookpath';
import yargs from 'yargs/yargs';
import { ui } from './ui';

interface Arguments {
    web: boolean;
    env: string;
    template: string | undefined;
    debug: boolean;
    port: number;
}

const argv: Arguments = yargs(process.argv.slice(2))
	.options({
		'web': {
			alias: 'w',
			describe: 'enable web IDE',
			type: 'boolean'
		},
		'env': {
			alias: 'e',
			describe: 'provide the environment to interact with',
			choices: ['production', 'staging', 'local'],
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
	.argv

async function fetchTemplates(base: string): Promise<Template[]> {
    const client = new Client(base);
    return Object.values((await client.get()).templates);
}

async function listTemplates(web: boolean): Promise<Template[]> {
    return await new Promise<Template[]>(resolve => {
        const templates: Template[] = [];
        const filter = web ? 'paritytech/substrate-playground-template-*-theia' : 'paritytech/substrate-playground-template-*';
        const regexp = web ? /paritytech\/substrate-playground-template-(.*?)-theia/ : /paritytech\/substrate-playground-template-(.*)/;
        const p = spawn('docker', ['images', filter, '--format' , '{{.Repository}}:{{.Tag}}']);
        p.stdout.on('data', data => {
            data.toString().split("\n").forEach(image => {
                const [template] = image.split(":");
                const [_, name] = regexp.exec(template);
                // Only add the first version of a template
                if (!templates.find(t => t.name == name)) {
                    templates.push({name: name, image: image, description: template, tags: {public: "true"}});
                }
            });
        });
        p.stdout.on('close', () => resolve(templates));
    });
}

(async function() {
	if (!await lookpath('docker')) {
		console.error("A local docker installation is required");
		process.exit(1);
	}

    const env = EnvironmentType[argv.env];
    const templates = argv.env == 'local' ? await listTemplates(argv.web) : await fetchTemplates(playgroundBaseURL(env));
	ui(Object.assign({templates: templates}, argv));
  }().catch(e => {
	  console.error("Failed to start template" ,e)
}));
