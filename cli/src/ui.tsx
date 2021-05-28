import { EnvironmentType, Repository } from '@substrate/playground-client';
import React, {useState, useEffect} from 'react';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import {render, Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import Markdown from 'ink-markdown';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Link from 'ink-link';
import Spinner from 'ink-spinner';
import { Item } from 'ink-select-input/build/SelectInput';

function dockerRun(image: string, web: boolean, port: number): ChildProcessWithoutNullStreams {
	if (web) {
		return spawn('docker', ['run', '-p', `${port}:3000` , image]);
	} else {
		return spawn('docker', ['run', '-it', image, 'bash'], {stdio: 'inherit'});
	}
}

function RepositorySelector({ repositories, onSelect }: {repositories: Repository[], onSelect: (item: Item<Repository>) => void}): JSX.Element {
	const items = Object.entries(repositories).filter(([_, t]) => t.tags?.public).map(([id, t]) => {return {key: id, label: t.name, value: t}});
	const [description, setDescription] = useState(repositories[0].description);
	const handleHighlight = (item: Item<Repository>) => setDescription(item.value.description);
	return (
		<Box flexDirection="column" margin={2}>
			<Text>Select a repository:</Text>
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

function Cartouche({borderColor, children}: {borderColor: string, children: NonNullable<React.ReactNode>}): JSX.Element {
	return (
		<Box borderStyle="double" borderColor={borderColor} flexDirection="column" margin={2}>
			<Box flexDirection="column" alignItems="center" justifyContent="center" margin={1}>
				{children}
			</Box>
		</Box>
	);
}

function StatusContent({state, web, repositoryId, port}: {state: State, web: boolean, repositoryId: string, port: number}): JSX.Element {
	switch (state) {
		case State.ERROR_NO_TEMPLATE:
			return <Text>No repositories</Text>;
		case State.ERROR_UNKNOWN_TEMPLATE:
			return <Text>Unknown repository <Text bold color="green">{repositoryId}</Text></Text>;
        case State.ERROR_UNKNOWN_IMAGE:
            return <Text>Unknown image</Text>;
		case State.ERROR_PORT_ALREADY_USED:
			return <Text>Port {port} already used!</Text>;
		case State.INIT:
		case State.DOWNLOADING:
			return <Text>Downloading image for <Text bold color="green">{repositoryId}</Text> <Spinner /></Text>;
		case State.DOWNLOADED:
		case State.STARTING:
			return <Text>Starting <Text bold color="green">{repositoryId}</Text></Text>;
		case State.STARTED:
			if (web) {
				return (
					<>
						<Text><Text bold color="green">{repositoryId}</Text> started</Text>
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
		case State.ERROR_UNKNOWN_IMAGE:
        case State.ERROR_UNKNOWN_TEMPLATE:
		case State.ERROR_NO_TEMPLATE:
		case State.ERROR_PORT_ALREADY_USED:
			return "red";
		default:
			return "green";
	}
}

function Status({state, repositoryId, web, port}: {state: State, repositoryId: string, web: boolean, port: number}): JSX.Element {
	return (
		<Cartouche borderColor={statusBorderColor(state)}>
			<StatusContent state={state} web={web} repositoryId={repositoryId} port={port} />
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
    ERROR_UNKNOWN_IMAGE,
    ERROR_PORT_ALREADY_USED
}

function App({web, port, env, repository, repositories, debug}: {web: boolean, port: number, env: EnvironmentType, repository: string, repositories: Repository[], debug: boolean}): JSX.Element {
	const defaulRepository = repositories[repository];
	const [state, setState] = useState(() => {
        if (repository && !defaulRepository) {
            return State.ERROR_UNKNOWN_TEMPLATE;
        } else {
            return !repositories.length ? State.ERROR_NO_TEMPLATE : null;
        };
    });
	const [selectedRepository, setRepository] = useState(defaulRepository);

	useEffect(() => {
		function deploy(repository: Repository): void {
			setState(State.INIT);

			const image = web ? repository.image : repository.image.replace("-theia", "");
			if (debug) {
				console.log(`Using image ${image}`);
			}

			const p = dockerRun(image, web, port);
			if (p.stderr) {
				p.stderr.on('data', data => {
					const s = data.toString();
					if (s.match(/.*manifest unknown: manifest unknown.*/)) {
						setState(State.ERROR_UNKNOWN_IMAGE);
					}
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

		if (selectedRepository) {
			deploy(selectedRepository);
		}
	}, [selectedRepository]);

	return (
		<Box flexDirection="column">

			<Box flexDirection="column">
				<Gradient name="rainbow">
					<BigText text="Playground"/>
				</Gradient>
				<Text>Locally deploy a playground <Text bold>repository</Text> from CLI (<Text bold color="green">{env}</Text>)</Text>
			</Box>

			{state != null
			? <Status state={state} web={web} repositoryId={repository || (selectedRepository && selectedRepository.name)} port={port} />
			: <RepositorySelector repositories={repositories} onSelect={item => setRepository(item.value)} />}
		</Box>
	);
};

export function ui(object): React.ReactNode {
	return render(React.createElement(App, object));
}
