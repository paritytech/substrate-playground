const {useState, useEffect} = require('react');
const React = require('react');
const {render, Box, Text} = require('ink');
const SelectInput = require('ink-select-input');
const Markdown = require('ink-markdown');
const Gradient = require('ink-gradient');
const BigText = require('ink-big-text');
const Link = require('ink-link');
const Spinner = require('ink-spinner');

async function dockerRun(templateId, tag, web) {
	const { spawn } = require('child_process');

	const image = `paritytech/substrate-playground-template-${templateId}${web?"-theia":""}:${tag}`;
	if (web) {
		return spawn('docker', ['run', '-p', '80:3000' , image]);
	} else {
		return spawn('docker', ['run', '-it', image, 'bash'], {stdio: 'inherit'});
	}
}

function WebCartouche({ state, templateId }) {
	switch (state) {
		case STATE_INIT:
		case STATE_DOWNLOADING:
			return <Text>Downloading image for <Text bold color="green">{templateId}</Text> <Spinner.default /></Text>;
		case STATE_DOWNLOADING:
		case STATE_STARTING:
			return <Text>Starting <Text bold color="green">{templateId}</Text></Text>;
		case STATE_STARTED:
			return (
				<>
					<Text><Text bold color="green">{templateId}</Text> started</Text>
					<Link url="http://localhost">Browse <Text bold>http://localhost</Text></Link>
					<Text>Hit <Text color="red" bold>Ctrl+c</Text> to exit</Text>
				</>
			);
	}
}

function CLICartouche({ templateId }) {
	return <Text>Hit <Text color="red" bold>Ctrl+d</Text> to exit</Text>;
}

function Cartouche({state, web, templateId}) {
	return (
		<Box borderStyle="double" borderColor="green" flexDirection="column" margin={2}>
			<Box flexDirection="column" alignItems="center" justifyContent="center" margin={1}>
				{web
				 ? <WebCartouche state={state} templateId={templateId} />
				 : <CLICartouche templateId={templateId} />}
			</Box>
		</Box>
	);
}

const STATE_INIT = "INIT";
const STATE_DOWNLOADING = "DOWNLOADING";
const STATE_DOWNLOADED = "DOWNLOADED";
const STATE_STARTING = "STARTING";
const STATE_STARTED = "STARTED";

const App = (object) => {
	const web = object.web;
	const debug = object.debug;
	const env = object.env;
	const templates = object.result.templates;
	const templateIds = Object.keys(templates);
	const items = templateIds.map((key) => {return {label: key, value: key}});
	const [description, setDescription] = useState(templates[templateIds[0]].description);
	const [templateId, setTemplateId] = useState(object.template);
	const template = templates[templateId];
	const [state, setState] = useState(STATE_INIT);

	const handleSelect = (template) => {
		setTemplateId(template.value);
	};

	const handleHighlight = selection => {
		setDescription(templates[selection.value].description);
	};

	useEffect(() => {
		async function deploy(template) {
			const tag = template.image.split(":").slice(-1)[0];
			const p = await dockerRun(templateId, tag, web, debug);
			if (p.stdout) {
				p.stdout.on('data', function(data) {
					const s = data.toString();
					if (s.match(/.*Status: Downloaded newer image.*/)) {
						setState(STATE_DOWNLOADED);
					} else if (s.match(/.*Unable to find image.*/)) {
						setState(STATE_DOWNLOADING);
					} else if (s.match(/.*INFO Deploy plugins.*/)) {
						setState(STATE_STARTED);
					} else if (s.match(/.*INFO Configuration directory URI.*/)) {
						setState(STATE_STARTING);
					}
				});
			}
			p.on('exit', () => console.log('\nTemplate shut down'));
		}

		if (templateId && template) {
			deploy(template);
		}
	}, [templateId]);

	return (
	<Box flexDirection="column">

		<Box flexDirection="column">
			<Gradient name="rainbow">
				<BigText text="Playground"/>
			</Gradient>
			<Text>Locally deploy a playground <Text bold>template</Text> from CLI (<Text bold color="green">{env}</Text> environment)</Text>
		</Box>
		
		{templateId == null &&
		<Box flexDirection="column" margin={2}>
			<Text>Select a template:</Text>
			<Box borderStyle="double" borderColor="green">
				<Box flexGrow={1}>
					<SelectInput.default items={items} onSelect={handleSelect} onHighlight={handleHighlight} />
				</Box>
				<Box flexGrow={3} justifyContent="flex-start">
					<Markdown.default>{description}</Markdown.default>
				</Box>
			</Box>
		</Box>}

		{template &&
		<Cartouche state={state} web={web} templateId={templateId} />}

		{(templateId && !template) &&
		<Box borderStyle="double" borderColor="red" flexDirection="column" margin={2}>
			<Text>Unknown template <Text bold color="green">{templateId}</Text></Text>
		</Box>}
	</Box>);
};

function rend(templates) {
	return render(React.createElement(App, templates));
}

module.exports = rend;