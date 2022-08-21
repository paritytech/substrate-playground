import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { Client, Configuration, User, Session, ResourceType, mainSessionId, Preference, Preferences } from '@substrate/playground-client';
import { CssBaseline } from "@mui/material";
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
import { SubstrateLight } from './themes';
import { terms } from "./terms";
import { find, hasPermission } from "./utils";

declare module '@mui/styles/defaultTheme' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultTheme extends Theme {}
}

function MainPanel({ client, params, preferences, user, panel, onRetry, onConnect, onAfterDeployed }: { client: Client, params: Params, preferences: Preference[], user: User, panel: PanelId, onRetry: () => void, onConnect: () => void, onAfterDeployed: () => void }): JSX.Element {
    switch(panel) {
        case PanelId.SessionSelection:
          return <SessionPanel client={client} preferences={preferences} user={user} onRetry={onRetry}
                    onStop={async () => {
                        await client.deleteUserSession(user.id, mainSessionId(user));
                    }}
                    onDeployed={async conf => {
                        await client.createUserSession(user.id, mainSessionId(user), conf);
                        onAfterDeployed();
                    }}
                    onConnect={onConnect} />;
        case PanelId.Stats:
          return <StatsPanel />;
        case PanelId.Admin:
          return <AdminPanel client={client} preferences={preferences} user={user} />;
        case PanelId.RunningSession:
          return <RunningSessionPanel client={client} user={user} autoDeployRepository={params.autoDeployRepository} onMissingSession={onRetry} onSessionFailing={onRetry} onSessionTimeout={onRetry} />;
    }
}

function ExtraTheiaNav({ client, user, preferences, restartAction }: { client: Client, user: User, preferences: Preference[], restartAction: () => void }): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);
    const sessionId = mainSessionId(user);

    useInterval(async () => {
        const session = await client.getUserSession(user.id, sessionId);
        setSession(session);

        // Periodically extend duration of running sessions
        if (session) {
            const { state, maxDuration } = session;
            if (state.type == 'Running') {
                const remaining = maxDuration - (state.startTime || 0) / 60; // In minutes
                const maxConfDuration = Number.parseInt(find(preferences, Preferences.SessionMaxDuration) || "600");
                // Increase duration
                if (remaining < 10 && maxDuration < maxConfDuration) {
                    const newDuration = Math.min(maxConfDuration, maxDuration + 10);
                    await client.updateUserSession(user.id, sessionId, {duration: newDuration});
                }
            }
        }
    }, 5000);

    if (session) {
        const { state, maxDuration } = session;
        if (state.type == 'Running') {
            const remaining = maxDuration * 60 - (state.startTime || 0);
            if (remaining < 300) { // 5 minutes
                return (
                    <Typography variant="h6">
                        Your session is about to end. Make sure your changes have been exported.
                    </Typography>
                );
            }
        } else if (state.type == 'Failed') {
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

function CustomLoggedNav({ client, send, conf, preferences, user, panel }: { client: Client, send: (event: Events) => void, conf: Configuration, preferences: Preference[], user: User, panel: PanelId }): JSX.Element  {
    const [canAdministrate, setCanAdministrate] = React.useState(false);

    useEffect(() => {
        async function fetchData() {
            setCanAdministrate(await hasPermission(client, user, ResourceType.Session, {type: "Custom", name: "Administrate"}));
        }

        fetchData();
    }, []);

    return (
        <Nav onPlayground={() => selectPanel(send, PanelId.SessionSelection)}>
            <>
              {(panel == PanelId.RunningSession) &&
                <ExtraTheiaNav client={client} user={user} preferences={preferences} restartAction={() => restart(send)} />}
              <div style={{display: "flex", alignItems: "center"}}>
                  {canAdministrate &&
                  <NavSecondMenuAdmin onAdminClick={() => selectPanel(send, PanelId.Admin)} onStatsClick={() => selectPanel(send, PanelId.Stats)} />}
                  <NavMenuLogged conf={conf} user={user} onLogout={() => send(Events.LOGOUT)} />
              </div>
            </>
        </Nav>
    );
}

function CustomNav({ send }: { send: (event: Events) => void }): JSX.Element  {
    return (
        <Nav onPlayground={() => selectPanel(send, PanelId.SessionSelection)}>
            <NavMenuUnlogged />
        </Nav>
    );
}

const theme = createTheme(adaptV4Theme(SubstrateLight));

function App({ params }: { params: Params }): JSX.Element {
    const client = new Client(params.base, 30000, {credentials: "include"});
    const [preferences, setPreferences] = useState<Preference[]>([]);
    const { autoDeployRepository } = params;
    const [state, send] = useMachine(newMachine(client, autoDeployRepository? PanelId.RunningSession: PanelId.SessionSelection), { devTools: true });
    const { panel, error } = state.context;
    const logged = state.matches(States.LOGGED);

    useEffect(() => {
        // Remove transient parameters when logged, to prevent recursive behaviors
        if (logged) {
            removeTransientsURLParams();
        }
    }, [state]);

    useInterval(async () => {
        setPreferences(await client.listPreferences());
    }, 30000);

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
                    <div style={{display: "flex", flexDirection: "column", width: "inherit", height: "inherit"}}>
                       {logged
                       ? <CustomLoggedNav client={client} send={send} conf={state.context.conf} preferences={preferences} user={state.context.user} panel={panel} />
                       : <CustomNav send={send} />}
                       {logged
                       ? <MainPanel client={client} params={params} preferences={preferences} user={state.context.user} panel={panel}
                                 onRetry={() => restart(send)}
                                 onAfterDeployed={() => selectPanel(send, PanelId.RunningSession)}
                                 onConnect={() => selectPanel(send, PanelId.RunningSession)} />
                       : state.matches(States.TERMS_UNAPPROVED)
                         ? <TermsPanel terms={terms} onTermsApproved={() => send(Events.TERMS_APPROVAL)} />
                         : state.matches(States.UNLOGGED)
                         ? error
                         ? <CenteredContainer>
                             <ErrorMessage reason={error} action={() => restart(send)} />
                         </CenteredContainer>
                         : <LoginPanel client={client} />
                         : <LoadingPanel />}
                       {panel == PanelId.RunningSession &&
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
