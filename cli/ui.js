const {useState, useEffect} = require('react');
const React = require('react');
const {render, Box, Text} = require('ink');
const SelectInput = require('ink-select-input');
const Markdown = require('ink-markdown');
const Gradient = require('ink-gradient');
const BigText = require('ink-big-text');
const Link = require('ink-link');
const { argv } = require('yargs')

async function dockerRun(templateId, tag, ui) {
	const { spawn } = require('child_process');

	const image = `paritytech/substrate-playground-template-${templateId}${ui?"-theia":""}:${tag}`;
	if (ui) {
		return spawn('docker', ['run', '-p', '80:3000' , image]);
	} else {
		return spawn('docker', ['run', '-it', image, 'bash'], {stdio: 'inherit'});
	}
}

const App = (object) => {
	const templates = object.result.templates;
	const templateIds = Object.keys(templates);
	const [description, setDescription] = useState(templates[templateIds[0]].description);
	const [templateId, setTemplateId] = useState(argv.template);
	const [web, setWeb] = useState(argv.web);

	const handleSelect = (template) => {
		setTemplateId(template.value);
	};

	const handleHighlight = selection => {
		setDescription(templates[selection.value].description);
	};

	useEffect(() => {
		async function deploy() {
			const tag = templates[templateId].image.split(":").slice(-1)[0];
			const p = await dockerRun(templateId, tag, web);
			p.on('exit', function (code) {
				console.log('\nTemplate shut down');
			});
		}

		if (templateId && templates[templateId]) {
			deploy();
		}
	}, [templateId]);
	
	const items = templateIds.map((key) => {return {label: key, value: key}});
	
	return (
	<Box flexDirection="column">
		<Box flexDirection="column">
			<Gradient name="rainbow">
				<BigText text="Playground"/>
			</Gradient>
			<Text>Locally deploy a playground <Text bold>template</Text> from CLI (<Text bold color="green">{argv.env || 'staging'}</Text> environment)</Text>
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

		{(templateId && templates[templateId] && web) &&
		<Box borderStyle="double" borderColor="green" flexDirection="column" margin={2}>
			<Box flexDirection="column" alignItems="center" justifyContent="center" margin={1}>
				<Link url="http://localhost">Browse <Text bold color="green">{templateId}</Text> at <Text bold>localhost</Text></Link>
				<Text>Hit <Text color="red" bold>Ctrl+c</Text> to exit</Text>
			</Box>
		</Box>}

		{(templateId && templates[templateId] && !web) &&
		<Box borderStyle="double" borderColor="green" flexDirection="column" margin={2}>
			<Box flexDirection="column" alignItems="center" justifyContent="center" margin={1}>
				<Text>Starting <Text bold color="green">{templateId}</Text></Text>
				<Text>Hit <Text color="red" bold>Ctrl+d</Text> to exit</Text>
			</Box>
		</Box>}

		{(templateId && !templates[templateId]) &&
		<Box borderStyle="double" borderColor="red" flexDirection="column" margin={2}>
			<Text>Unknown template <Text bold color="green">{templateId}</Text></Text>
		</Box>}
	</Box>);
};

function rend(templates) {
	return render(React.createElement(App, templates));
}

module.exports = rend;