import { EnvironmentType, Template } from '@substrate/playground-client';
import React, {useState, useEffect} from 'react';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import {render, Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import Markdown from 'ink-markdown';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Link from 'ink-link';
import Spinner from 'ink-spinner';

function dockerRun(image: string, web: boolean, port: number): ChildProcessWithoutNullStreams {
	if (web) {
		return spawn('docker', ['run', '-p', `${port}:3000` , image]);
	} else {
		return spawn('docker', ['run', '-it', image, 'bash'], {stdio: 'inherit'});
	}
}

function TemplateSelector({ templates, onSelect }: {templates: Template[], onSelect: (item) => void}): JSX.Element {
	const items = templates.filter(t => t.tags.public).map(t => {return {label: t.name, value: t.name, template: t}});
	const [description, setDescription] = useState(templates[0].description);
	const handleHighlight = item => setDescription(item.template.description);
	return (
		<Box flexDirection="column" margin={2}>
			<Text>Select a template:</Text>
			<Box borderStyle="double" borderColor="green">
				<Box flexGrow={1}>
					<SelectInput items={items} onSelect={onSelect} onHighlight={handleHighlight} />
				</Box>
				<Box flexGrow={3} justifyContent="flex-start">
					<Markdown>{description}</Markdown>
				</Box>
			</Box>
		</Box>
	);
}

function Cartouche({borderColor, children}: {borderColor: string, children: React.ReactNode}): JSX.Element {
	return (
		<Box borderStyle="double" borderColor={borderColor} flexDirection="column" margin={2}>
			<Box flexDirection="column" alignItems="center" justifyContent="center" margin={1}>
				{children}
			</Box>
		</Box>
	);
}

function StatusContent({state, web, templateId, port}: {state: State, web: boolean, templateId: string, port: number}): JSX.Element {
	switch (state) {
		case State.ERROR_NO_TEMPLATE:
			return <Text>No templates</Text>;
		case State.ERROR_UNKNOWN_TEMPLATE:
			return <Text>Unknown template <Text bold color="green">{templateId}</Text></Text>;
		case State.ERROR_PORT_ALREADY_USED:
			return <Text>Port {port} already used!</Text>;
		case State.INIT:
		case State.DOWNLOADING:
			return <Text>Downloading image for <Text bold color="green">{templateId}</Text> <Spinner /></Text>;
		case State.DOWNLOADED:
		case State.STARTING:
			return <Text>Starting <Text bold color="green">{templateId}</Text></Text>;
		case State.STARTED:
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

function statusBorderColor(state: State): string {
	switch (state) {
		case State.ERROR_UNKNOWN_TEMPLATE:
		case State.ERROR_NO_TEMPLATE:
		case State.ERROR_PORT_ALREADY_USED:
			return "red";
		default:
			return "green";
	}
}

function Status({state, templateId, web, port}: {state: State, templateId: string, web: boolean, port: number}): JSX.Element {
	return (
		<Cartouche borderColor={statusBorderColor(state)}>
			<StatusContent state={state} web={web} templateId={templateId} port={port} />
		</Cartouche>
	);
}

enum State {
    INIT,
    DOWNLOADING,
    DOWNLOADED,
    STARTING,
    STARTED,
    ERROR_NO_TEMPLATE,
    ERROR_UNKNOWN_TEMPLATE,
    ERROR_PORT_ALREADY_USED
}

function App({web, port, env, template, templates, debug}: {web: boolean, port: number, env: EnvironmentType, template: string, templates: Template[], debug: boolean}): JSX.Element {
	const defaultemplate = templates.find(t => t.name == template);
	const [state, setState] = useState(() => {
        if (template && !defaultemplate) {
            return State.ERROR_UNKNOWN_TEMPLATE;
        } else {
            return !templates.length ? State.ERROR_NO_TEMPLATE : null;
        };
    });
	const [selectedTemplate, setTemplate] = useState(defaultemplate);

	useEffect(() => {
		function deploy(template: Template) {
			setState(State.INIT);
            const tag = template.image.split(":").slice(-1)[0];
			const image = `paritytech/substrate-playground-template-${template.name}${web?"-theia":""}:${tag}`;
			if(debug) {
				console.log(`Using image ${image}`);
			}
			const p = dockerRun(image, web, port);
			if (p.stderr) {
				p.stderr.on('data', data => {
					const s = data.toString();
					if (s.match(/.*Ports are not available.*/)) {
						setState(State.ERROR_PORT_ALREADY_USED);
					}
				});
			}
			if (p.stdout) {
				p.stdout.on('data', function(data) {
					const s = data.toString();
					if (s.match(/.*Status: Downloaded newer image.*/)) {
						setState(State.DOWNLOADED);
					} else if (s.match(/.*Unable to find image.*/)) {
						setState(State.DOWNLOADING);
					} else if (s.match(/.*INFO Deploy plugins.*/)) {
						setState(State.STARTED);
					} else if (s.match(/.*INFO Configuration directory URI.*/)) {
						setState(State.STARTING);
					}
				});
			} else {
				setState(State.STARTED);
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
			<Text>Locally deploy a playground <Text bold>template</Text> from CLI (<Text bold color="green">{env}</Text>)</Text>
		</Box>

		{state
		? <Status state={state} web={web} templateId={template || (selectedTemplate && selectedTemplate.name)} port={port} />
		: <TemplateSelector templates={templates} onSelect={item => setTemplate(item.template)} />}
	</Box>);
};

export function ui(object): React.ReactNode {
	return render(React.createElement(App, object));
}
