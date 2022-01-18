import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { State } from "xstate";
import Analytics from "analytics";
import simpleAnalyticsPlugin from "analytics-plugin-simple-analytics";
import { Client, Configuration, LoggedUser, Workspace } from '@substrate/playground-client';
import { createTheme, ThemeProvider, Theme, StyledEngineProvider, adaptV4Theme } from '@mui/material/styles';
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMachine } from '@xstate/react';
import { CenteredContainer, ErrorMessage, LoadingPanel, Nav, NavMenuLogged, NavMenuUnlogged, NavSecondMenuAdmin, Wrapper } from './components';
import { useInterval } from "./hooks";
import { newMachine, Context, Event, Events, PanelId, States, Typestate, SchemaType } from './lifecycle';
import { AdminPanel } from './panels/admin/index';
import { LoginPanel } from './panels/login';
import { StatsPanel } from './panels/stats';
import { TermsPanel } from './panels/terms';
import { TheiaPanel } from './panels/theia';
import { WorkspacePanel } from './panels/workspace';
import { terms } from "./terms";
import { hasAdminReadRights } from "./utils";
import { SubstrateLight, SubstrateDark } from './themes';
import LogoSubstrate from "./LogoSubstrate";
import { CssBaseline } from "@mui/material";


declare module '@mui/styles/defaultTheme' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultTheme extends Theme {}
}


function MainPanel({ client, params, conf, user, id, templates, onRetry, onConnect, onAfterDeployed }: { client: Client, params: Params, conf: Configuration, user?: LoggedUser, templates: Record<string, Template>, id: PanelId, onRetry: () => void, onConnect: () => void, onAfterDeployed: () => void }): JSX.Element {
    switch(id) {
        case PanelId.Workspace:
          return <WorkspacePanel client={client} conf={conf} templates={templates} user={user} onRetry={onRetry}
                    onStop={async () => {
                        await client.deleteCurrentWorkspace();
                    }}
                    onDeployed={async conf => {
                        await client.createCurrentWorkspace(conf);
                        onAfterDeployed();
                    }}
                    onConnect={onConnect} />;
        case PanelId.Stats:
          return <StatsPanel />;
        case PanelId.Admin:
          return <AdminPanel client={client} conf={conf} user={user} />;
        case PanelId.Theia:
          return <TheiaPanel client={client} autoDeploy={params.deploy} onMissingWorkspace={onRetry} onWorkspaceFailing={onRetry} onWorkspaceTimeout={onRetry} />;
    }
    return <></>;
}

function ExtraTheiaNav({ client, conf, restartAction }: { client: Client, conf: Configuration, restartAction: () => void }): JSX.Element {
    const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined);

    useInterval(async () => {
        const workspace = await client.getCurrentWorkspace();
        setWorkspace(workspace);

        // Periodically extend duration of running workspaces
        if (workspace) {
            const { state, maxDuration } = workspace;
            if (state.tag == 'Running') {
                const remaining = maxDuration - (state.startTime || 0) / 60; // In minutes
                const maxConfDuration = conf.workspace.maxDuration;
                // Increase workspace duration
                if (remaining < 10 && maxDuration < maxConfDuration) {
                    const newDuration = Math.min(maxConfDuration, maxDuration + 10);
                    await client.updateCurrentWorkspace({duration: newDuration});
                }
            }
        }
    }, 5000);

    if (workspace) {
        const { state, maxDuration } = workspace;
        if (state.tag == 'Running') {
            const remaining = maxDuration * 60 - (state.startTime || 0);
            if (remaining < 300) { // 5 minutes
                return (
                    <Typography variant="h6">
                        Your workspace is about to end. Make sure your changes have been exported.
                    </Typography>
                );
            }
        } else if (state.tag == 'Failed') {
            return (
                <Typography variant="h6">
                    Your workspace is over. <Button onClick={restartAction}>Restart it</Button>
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
        <Nav onPlayground={() => selectPanel(send, PanelId.Workspace)}>
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

const theme = createTheme(adaptV4Theme(SubstrateLight));

function App({ params }: { params: Params }): JSX.Element {
    const client = new Client(params.base, 30000, {credentials: "include"});
    const { deploy } = params;
    const [state, send] = useMachine(newMachine(client, deploy? PanelId.Theia: PanelId.Workspace), { devTools: true });
    const { panel, templates, error } = state.context;

    /*const theme = createTheme({
        palette: {
          mode: 'light',
          primary: {
            main: 'rgba(38,224,162, 1)',
          },
          secondary: {
            main: 'rgb(0, 255, 0)',
          },
        },
    });*/

    const isTheia = state.matches(States.LOGGED) && panel == PanelId.Theia;

    useEffect(() => {
        // Remove transient parameters when logged, to prevent recursive behaviors
        if (state.matches(States.LOGGED)) {
            removeTransientsURLParams();
        }
    }, [state]);


    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
                    <Wrapper thin={isTheia}
                             nav={<CustomNav client={client} send={send} state={state} />}
                             params={params}>
                       {state.matches(States.LOGGED)
                       ? <MainPanel client={client} params={params} templates={templates} conf={state.context.conf} user={state.context.user} id={panel}
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
        </StyledEngineProvider>
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
    return {deploy: deploy,
            version: process.env.GITHUB_SHA,
            base: process.env.BASE || "/api"};
}

function removeTransientsURLParams() {
    const params = new URLSearchParams(window.location.search);
    const deploy = params.get('deploy');
    if (deploy) {
        params.delete('deploy');
        const paramsStr = params.toString();
        window.history.replaceState({}, '', `${location.pathname}${paramsStr != "" ? params : ""}`);
    }
}

function main(): void {
    // Set domain to root DNS so that they share the same origin and communicate
    const members = document.domain.split(".");
    if (members.length > 1) {
      document.domain = members.slice(members.length-2).join(".");
    }

    const analytics = Analytics({
        app: "substrate-playground",
        plugins: [
          simpleAnalyticsPlugin(),
        ]
    });

    ReactDOM.render(
        <App params={extractParams()} />,
        document.querySelector("main")
    );
}

main();
