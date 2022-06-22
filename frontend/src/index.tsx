import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { Client, Configuration, User, Session, ResourceType } from '@substrate/playground-client';
import { createTheme, ThemeProvider, Theme, StyledEngineProvider, adaptV4Theme } from '@mui/material/styles';
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMachine } from '@xstate/react';
import { CenteredContainer, ErrorMessage, Footer, LoadingPanel, Nav, NavMenuLogged, NavMenuUnlogged, NavSecondMenuAdmin } from './components';
import { useInterval } from "./hooks";
import { newMachine, Events, PanelId, States } from './lifecycle';
import { AdminPanel } from './panels/admin/index';
import { LoginPanel } from './panels/login';
import { StatsPanel } from './panels/stats';
import { TermsPanel } from './panels/terms';
import { RunningSessionPanel } from './panels/session_running';
import { SessionPanel } from './panels/session';
import { terms } from "./terms";
import { hasPermission, mainSessionId } from "./utils";
import { SubstrateLight } from './themes';
import { CssBaseline } from "@mui/material";

declare module '@mui/styles/defaultTheme' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultTheme extends Theme {}
}

function MainPanel({ client, params, conf, user, panel, onRetry, onConnect, onAfterDeployed }: { client: Client, params: Params, conf: Configuration, user: User, panel: PanelId, onRetry: () => void, onConnect: () => void, onAfterDeployed: () => void }): JSX.Element {
    switch(panel) {
        case PanelId.Session:
          return <SessionPanel client={client} conf={conf} user={user} onRetry={onRetry}
                    onStop={async () => {
                        await client.deleteSession(mainSessionId(user.id));
                    }}
                    onDeployed={async conf => {
                        await client.createSession(mainSessionId(user.id), conf);
                        onAfterDeployed();
                    }}
                    onConnect={onConnect} />;
        case PanelId.Stats:
          return <StatsPanel />;
        case PanelId.Admin:
          return <AdminPanel client={client} conf={conf} user={user} />;
        case PanelId.Theia:
          return <RunningSessionPanel client={client} user={user} autoDeployRepository={params.autoDeployRepository} onMissingSession={onRetry} onSessionFailing={onRetry} onSessionTimeout={onRetry} />;
    }
}

function ExtraTheiaNav({ client, user, conf, restartAction }: { client: Client, user: User, conf: Configuration, restartAction: () => void }): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);
    const sessionId = mainSessionId(user.id);

    useInterval(async () => {
        const session = await client.getSession(sessionId);
        setSession(session);

        // Periodically extend duration of running sessions
        if (session) {
            const { state, maxDuration } = session;
            if (state.tag == 'Running') {
                const remaining = maxDuration - (state.startTime || 0) / 60; // In minutes
                const maxConfDuration = conf.session.maxDuration;
                // Increase duration
                if (remaining < 10 && maxDuration < maxConfDuration) {
                    const newDuration = Math.min(maxConfDuration, maxDuration + 10);
                    await client.updateSession(sessionId, {duration: newDuration});
                }
            }
        }
    }, 5000);

    if (session) {
        const { state, maxDuration } = session;
        if (state.tag == 'Running') {
            const remaining = maxDuration * 60 - (state.startTime || 0);
            if (remaining < 300) { // 5 minutes
                return (
                    <Typography variant="h6">
                        Your session is about to end. Make sure your changes have been exported.
                    </Typography>
                );
            }
        } else if (state.tag == 'Failed') {
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

function CustomLoggedNav({ client, send, conf, user, panel }: { client: Client, send: (event: Events) => void, conf: Configuration, user: User, panel: PanelId }): JSX.Element  {
    return (
        <Nav onPlayground={() => selectPanel(send, PanelId.Session)}>
            <>
              {(panel == PanelId.Theia) &&
                <ExtraTheiaNav client={client} user={user} conf={conf} restartAction={() => restart(send)} />}
              <div style={{display: "flex", alignItems: "center"}}>
                  {hasPermission(client, user, ResourceType.Session, {tag: "Custom", name: "Administrate"}) &&
                  <NavSecondMenuAdmin onAdminClick={() => selectPanel(send, PanelId.Admin)} onStatsClick={() => selectPanel(send, PanelId.Stats)} />}
                  <NavMenuLogged conf={conf} user={user} onLogout={() => send(Events.LOGOUT)} />
              </div>
            </>
        </Nav>
    );
}

function CustomNav({ send }: { send: (event: Events) => void }): JSX.Element  {
    return (
        <Nav onPlayground={() => selectPanel(send, PanelId.Session)}>
            <NavMenuUnlogged />
        </Nav>
    );
}

const theme = createTheme(adaptV4Theme(SubstrateLight));

function App({ params }: { params: Params }): JSX.Element {
    const client = new Client(params.base, 30000, {credentials: "include"});
    const { autoDeployRepository } = params;
    const [state, send] = useMachine(newMachine(client, autoDeployRepository? PanelId.Theia: PanelId.Session), { devTools: true });
    const { panel, error } = state.context;
    const logged = state.matches(States.LOGGED);

    useEffect(() => {
        // Remove transient parameters when logged, to prevent recursive behaviors
        if (logged) {
            removeTransientsURLParams();
        }
    }, [state]);

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
                    <div style={{display: "flex", flexDirection: "column", width: "inherit", height: "inherit"}}>
                       {logged
                       ? <CustomLoggedNav client={client} send={send} conf={state.context.conf} user={state.context.user} panel={panel} />
                       : <CustomNav send={send} />}
                       {logged
                       ? <MainPanel client={client} params={params} conf={state.context.conf} user={state.context.user} panel={panel}
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
                       {panel == PanelId.Theia &&
                         <Footer base={params.base} version={params.version} />}
                    </div>
                </div>
            </ThemeProvider>
        </StyledEngineProvider>
    );
}

export interface Params {
    version?: string,
    autoDeployRepository: string | null,
    base: string,
}

const autoDeployRepositoryParamName = 'autoDeployRepository';

function extractParams(): Params {
    const params = new URLSearchParams(window.location.search);
    const autoDeployRepository = params.get(autoDeployRepositoryParamName);
    return {autoDeployRepository: autoDeployRepository,
            version: process.env.GITHUB_SHA,
            base: "/api"};
}

function removeTransientsURLParams() {
    const params = new URLSearchParams(window.location.search);
    const autoDeployRepository = params.get(autoDeployRepositoryParamName);
    if (autoDeployRepository) {
        params.delete(autoDeployRepositoryParamName);
        const paramsStr = params.toString();
        window.history.replaceState({}, '', `${location.pathname}${paramsStr != "" ? params : ""}`);
    }
}

function main(): void {
    ReactDOM.render(
        <App params={extractParams()} />,
        document.querySelector("main")
    );
}

main();
