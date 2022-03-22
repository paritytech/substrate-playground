import { Client, EnvironmentType, Phase, Session, Template } from '@substrate/playground-client';
import React, {useState, useEffect} from 'react';
import {render, Box, Text, Instance} from 'ink';
import SelectInput from 'ink-select-input';
import Markdown from 'ink-markdown';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import Link from 'ink-link';
import Spinner from 'ink-spinner';
import { Item } from 'ink-select-input/build/SelectInput';
import { Screen } from './utils/screen';

function SessionState({ status }: { status: SessionStatus }): JSX.Element {
    return (
        <>
        {status == SessionStatus.DEPLOYED
        ? '✔'
        : status == SessionStatus.BROKEN ? '❌'
        : <Spinner type="dots" />}
        </>
    );
}

enum SessionStatus {
    CREATING,
    DEPLOYED,
    BROKEN
}

function SessionDetails({ client, id, template, onSessionDeployed }: { client: Client, id: string, template: string, onSessionDeployed: (id: string, error?: Error) => void }) {
	const [state, setState] = useState<SessionStatus>();
    const [error, setError] = useState<Error>();

	useEffect(() => {
        async function go() {
            try {
                await client.createSession(id, {template: template});
                while (true) {
                    const session = await client.getSession(id);
                    const phase = session?.pod.phase;
                    if (phase != 'Pending') {
                        if (phase == 'Running') {
                            setState(SessionStatus.DEPLOYED);
                        } else {
                            setState(SessionStatus.BROKEN);
                        }
                        break;
                    }
                    setState(SessionStatus.CREATING);
                }
                onSessionDeployed(id);
            } catch (e) {
                console.log(e);
                onSessionDeployed(id, e);
                setError(e);
            }
        }

        go();
	}, []);

    return (
        <Text>{id} {error? <Text color='red'>Error: {error["code"]}</Text>:<SessionState status={state} />}</Text>
    );
}

function deleteAllSession(client: Client, ids: string[]) {
    ids.forEach(async (id) => {
        try {
            await client.deleteSession(id);
        } catch (e) {
            // Ignore undeployment failure
        }
    });
}

function App({web, port, env, template, debug, client}: {web: boolean, port: number, env: EnvironmentType, template: string, debug: boolean, client: Client}): JSX.Element {
	const [showBanner, setShowBanner] = useState(true);
    const [undeployed, setUndeployed] = useState(false);
    const allSessions = Array.from(Array(5).keys()).map((value, index) => value);
    const deployedSessions = Array<string>();

    function onSessionDeployed(id: string, e: Error) {
        deployedSessions.push(id);

        if (allSessions.length == deployedSessions.length) {
            deleteAllSession(client, deployedSessions);
            setUndeployed(true);
        }
    }

    useEffect(() => {
        setTimeout(() => setShowBanner(false), 2000);
	}, []);


	return (
		<Box flexDirection="column">

            {showBanner?
            <Screen>
                <Box flexGrow={1} alignSelf="center" alignItems="center" justifyContent="center">
                    <Gradient name="rainbow">
                        <BigText text="Playground"/>
                    </Gradient>
                </Box>
            </Screen>
            :
			<Box borderStyle="double" borderColor="green" flexDirection="column">
                {allSessions.map((value, index) => {
                    return <SessionDetails key={index} client={client} id={`test-${value}`} template='node-template' onSessionDeployed={onSessionDeployed} />;
                })}
			</Box>}
		</Box>
	);
};

export function ui(object, client: Client): Instance {
	return render(React.createElement(App, {client: client, ...object}));
}
