const {useState, useEffect} = require('react');
const React = require('react');
const { spawn } = require('child_process');
const {render, Box, Text} = require('ink');
const SelectInput = require('ink-select-input');
const Markdown = require('ink-markdown');
const Gradient = require('ink-gradient');
const BigText = require('ink-big-text');
const Link = require('ink-link');
const Spinner = require('ink-spinner');

async function dockerRun(templateId, tag, web, port) {
	const image = `paritytech/substrate-playground-template-${templateId}${web?"-theia":""}:${tag}`;
	if (web) {
		return spawn('docker', ['run', '-p', `${port}:3000` , image]);
	} else {
		return spawn('docker', ['run', '-it', image, 'bash'], {stdio: 'inherit'});
	}
}

function TemplateSelector({ templates, onSelect }) {
	const items = templates.map(t => {return {label: t.id, value: t.id, template: t}});
	const [description, setDescription] = useState(templates[0].description);
	const handleHighlight = item => setDescription(item.template.description);
	return (
		<Box flexDirection="column" margin={2}>
			<Text>Select a template:</Text>
			<Box borderStyle="double" borderColor="green">
				<Box flexGrow={1}>
					<SelectInput.default items={items} onSelect={onSelect} onHighlight={handleHighlight} />
				</Box>
				<Box flexGrow={3} justifyContent="flex-start">
					<Markdown.default>{description}</Markdown.default>
				</Box>
			</Box>
		</Box>
	);
}

function Cartouche({borderColor, children}) {
	return (
		<Box borderStyle="double" borderColor={borderColor} flexDirection="column" margin={2}>
			<Box flexDirection="column" alignItems="center" justifyContent="center" margin={1}>
				{children}
			</Box>
		</Box>
	);
}

function StatusContent({state, web, templateId, port}) {
	switch (state) {
		case STATE_NO_TEMPLATE:
			return <Text>No templates</Text>;
		case STATE_UNKNOWN_TEMPLATE:
			return <Text>Unknown template <Text bold color="green">{templateId}</Text></Text>;
		case STATE_PORT_ALREADY_USED:
			return <Text>Port {port} already used!</Text>;
		case STATE_INIT:
		case STATE_DOWNLOADING:
			return <Text>Downloading image for <Text bold color="green">{templateId}</Text> <Spinner.default /></Text>;
		case STATE_DOWNLOADED:
		case STATE_STARTING:
			return <Text>Starting <Text bold color="green">{templateId}</Text></Text>;
		case STATE_STARTED:
			if (web) {
				return (
					<>
						<Text><Text bold color="green">{templateId}</Text> started</Text>
						<Link url={`http://localhost:${port}`}>Browse <Text bold>{`http://localhost:${port}`}</Text></Link>
						<Text>Hit <Text color="red" bold>Ctrl+c</Text> to exit</Text>
					</>
				);
			} else {
				return <Text>Hit <Text color="red" bold>Ctrl+d</Text> to exit</Text>;
			}
	}
}

function statusBorderColor(state) {
	switch (state) {
		case STATE_UNKNOWN_TEMPLATE:
		case STATE_NO_TEMPLATE:
		case STATE_PORT_ALREADY_USED:
			return "red";
		default:
			return "green";
	}
}

function Status({state, web, templateId, port}) {
	return (
		<Cartouche borderColor={statusBorderColor(state)}>
			<StatusContent state={state} web={web} templateId={templateId} port={port} />
		</Cartouche>
	);
}

const STATE_INIT = "INIT";
const STATE_UNKNOWN_TEMPLATE = "UNKNOWN_TEMPLATE";
const STATE_NO_TEMPLATE = "NO_TEMPLATE";
const STATE_DOWNLOADING = "DOWNLOADING";
const STATE_DOWNLOADED = "DOWNLOADED";
const STATE_STARTING = "STARTING";
const STATE_STARTED = "STARTED";
const STATE_PORT_ALREADY_USED = "STATE_PORT_ALREADY_USED";

const App = ({web, port, env, template, templates, offline}) => {
	const defaultemplate = templates.find(t => t.id == template);
	const [state, setState] = useState((template && !defaultemplate) ? STATE_UNKNOWN_TEMPLATE : (templates.length > 0 ? null : STATE_NO_TEMPLATE));
	const [selectedTemplate, setTemplate] = useState(defaultemplate);

	useEffect(() => {
		async function deploy(template) {
			setState(STATE_INIT);
			const p = await dockerRun(template.id, template.tag, web, port);
			if (p.stderr) {
				p.stderr.on('data', function(data) {
					const s = data.toString();
					if (s.match(/.*Ports are not available.*/)) {
						setState(STATE_PORT_ALREADY_USED);
					}
				});
			}
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
			} else {
				setState(STATE_STARTED);
			}
		}

		if (selectedTemplate) {
			deploy(selectedTemplate);
		}
	}, [selectedTemplate]);

	return (
	<Box flexDirection="column">

		<Box flexDirection="column">
			<Gradient name="rainbow">
				<BigText text="Playground"/>
			</Gradient>
			<Text>Locally deploy a playground <Text bold>template</Text> from CLI (<Text bold color="green">{offline ? "OFFLINE": env}</Text>)</Text>
		</Box>

		{state
		? <Status state={state} web={web} templateId={template || (selectedTemplate && selectedTemplate.id)} port={port} />
		: <TemplateSelector templates={templates} onSelect={item => setTemplate(item.template)} />}
	</Box>);
};

function ui(object) {
	return render(React.createElement(App, object));
}

module.exports = ui;