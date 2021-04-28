import React, { useState } from "react";
import ReactDOM from "react-dom";
import { State } from "xstate";
import { Client, Configuration, LoggedUser, Session } from '@substrate/playground-client';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import { useMachine } from '@xstate/react';
import { CenteredContainer, ErrorMessage, LoadingPanel, Nav, NavMenuLogged, NavMenuUnlogged, NavSecondMenuAdmin, Wrapper } from './components';
import { useInterval } from "./hooks";
import { newMachine, Context, Event, Events, PanelId, States, Typestate, SchemaType } from './lifecycle';
import { AdminPanel } from './panels/admin';
import { LoginPanel } from './panels/login';
import { SessionPanel } from './panels/session';
import { StatsPanel } from './panels/stats';
import { TermsPanel } from './panels/terms';
import { TheiaPanel } from './panels/theia';
import { terms } from "./terms";
import { hasAdminReadRights } from "./utils";

function MainPanel({ client, params, conf, user, id, onRetry, onConnect, onAfterDeployed }: { client: Client, params: Params, conf: Configuration, user?: LoggedUser, id: PanelId, onRetry: () => void, onConnect: () => void, onAfterDeployed: () => void }): JSX.Element {
    switch(id) {
        case PanelId.Session:
          return <SessionPanel client={client} conf={conf} user={user} onRetry={onRetry}
                    onStop={async () => {
                        await client.deleteCurrentSession();
                    }}
                    onDeployed={async conf => {
                        await client.createCurrentSession(conf);
                        onAfterDeployed();
                    }}
                    onConnect={onConnect} />;
        case PanelId.Stats:
          return <StatsPanel />;
        case PanelId.Admin:
          return <AdminPanel client={client} conf={conf} user={user} />;
        case PanelId.Theia:
          return <TheiaPanel client={client} autoDeploy={params.deploy} onMissingSession={onRetry} onSessionFailing={onRetry} onSessionTimeout={onRetry} />;
    }
    return <></>;
}

function ExtraTheiaNav({ client, conf, restartAction }: { client: Client, conf: Configuration, restartAction: () => void }): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useInterval(async () => {
        const session = await client.getCurrentSession();
        setSession(session);

        // Periodically extend duration of running sessions
        if (session) {
            const { pod, duration } = session;
            if (pod.phase == 'Running') {
                const remaining = duration - (pod.startTime || 0) / 60; // In minutes
                const maxDuration = conf.session.maxDuration;
                // Increase session duration
                if (remaining < 10 && duration < maxDuration) {
                    const newDuration = Math.min(maxDuration, duration + 10);
                    await client.updateCurrentSession({duration: newDuration});
                }
            }
        }
    }, 5000);

    if (session) {
        const { pod, duration } = session;
        if (pod.phase == 'Running') {
            const remaining = duration * 60 - (pod.startTime || 0);
            if (remaining < 300) { // 5 minutes
                return (
                    <Typography variant="h6">
                        Your session is about to end. Make sure your changes have been exported.
                    </Typography>
                );
            }
        } else if (pod.phase == 'Failed') {
            return (
                <Typography variant="h6">
                    Your session is over. <Button onClick={restartAction}>Restart it</Button>
                </Typography>
            );
        }
    }

    return <></>;
}

function restart(send: (event: Events) => void) { send(Events.RESTART)}

function selectPanel(send: (event: Events, payload: Record<string, unknown>) => void, id: PanelId) { send(Events.SELECT, {panel: id})}

function CustomNav({ client, send, state }: { client: Client, send: (event: Events) => void, state: State<Context, Event, SchemaType, Typestate> }): JSX.Element  {
    const { panel } = state.context;
    return (
        <Nav onPlayground={() => selectPanel(send, PanelId.Session)}>
            <>
            {state.matches(States.LOGGED)
            ? <>
                {(panel == PanelId.Theia) &&
                <ExtraTheiaNav client={client} conf={state.context.conf} restartAction={() => restart(send)} />}
                <div style={{display: "flex", alignItems: "center"}}>
                    {hasAdminReadRights(state.context.user) &&
                    <NavSecondMenuAdmin onAdminClick={() => selectPanel(send, PanelId.Admin)} onStatsClick={() => selectPanel(send, PanelId.Stats)} />}
                    <NavMenuLogged conf={state.context.conf} user={state.context.user} onLogout={() => send(Events.LOGOUT)} />
                </div>
                </>
                : <NavMenuUnlogged />}
            </>
        </Nav>
    );
}

function App({ params }: { params: Params }): JSX.Element {
    const client = new Client(params.base, 30000, {credentials: "include"});
    const { deploy } = params;
    const [state, send] = useMachine(newMachine(client, deploy? PanelId.Theia: PanelId.Session), { devTools: true });
    const { panel, error } = state.context;

    const theme = createMuiTheme({
        palette: {
          type: 'dark',
        },
    });

    const isTheia = state.matches(States.LOGGED) && panel == PanelId.Theia;
    return (
        <ThemeProvider theme={theme}>
            <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
                <Wrapper thin={isTheia}
                         nav={<CustomNav client={client} send={send} state={state} />}
                         params={params}>
                   {state.matches(States.LOGGED)
                   ? <MainPanel client={client} params={params} conf={state.context.conf} user={state.context.user} id={panel}
                                onRetry={() => restart(send)}
                                onAfterDeployed={() => selectPanel(send, PanelId.Theia)}
                                onConnect={() => selectPanel(send, PanelId.Theia)} />
                   : state.matches(States.TERMS_UNAPPROVED)
                     ? <TermsPanel terms={terms} onTermsApproved={() => send(Events.TERMS_APPROVAL)} />
                     : state.matches(States.UNLOGGED)
                     ? error
                     ? <CenteredContainer>
                         <ErrorMessage reason={error} action={() => restart(send)} />
                     </CenteredContainer>
                     : <LoginPanel client={client} />
                     : <LoadingPanel />}
                </Wrapper>
            </div>
        </ThemeProvider>
    );
}

export interface Params {
    version?: string,
    deploy: string | null,
    base: string,
}

function extractParams(): Params {
    const params = new URLSearchParams(window.location.search);
    const deploy = params.get('deploy');
    if (deploy) {
        params.delete('deploy');
        const paramsStr = params.toString();
        window.history.replaceState({}, '', `${location.pathname}${paramsStr != "" ? params : ""}`);
    }
    return {deploy: deploy,
            version: process.env.GITHUB_SHA,
            base: process.env.BASE || "/api"};
}

function main(): void {
    // Set domain to root DNS so that they share the same origin and communicate
    const members = document.domain.split(".");
    if (members.length > 1) {
      document.domain = members.slice(members.length-2).join(".");
    }

    ReactDOM.render(
        <App params={extractParams()} />,
        document.querySelector("main")
    );
}

main();
