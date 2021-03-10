import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Client, Configuration, LoggedUser, Template } from '@substrate/playground-client';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import Typography from "@material-ui/core/Typography";
import { Session } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, LoadingPanel, Wrapper } from './components';
import { useInterval } from "./hooks";
import { useLifecycle, Events, PanelId, States } from './lifecycle';
import { AdminPanel } from './panels/admin';
import { LoginPanel } from './panels/login';
import { SessionPanel } from './panels/session';
import { StatsPanel } from './panels/stats';
import { TermsPanel } from './panels/terms';
import { TheiaPanel } from './panels/theia';
import { terms } from "./terms";
import { formatDuration } from "./utils";

function MainPanel({ client, conf, user, params, id, templates, onConnect, onDeployed, restartAction }: { client: Client, conf: Configuration, user: LoggedUser, params: Params, id: PanelId, templates: Record<string, Template>, restartAction: () => void, onConnect: () => void, onDeployed: () => void}): JSX.Element {
    switch(id) {
        case PanelId.Session:
          return <SessionPanel client={client} conf={conf} user={user} templates={templates} onRetry={restartAction}
                    onStop={async () => {
                        await client.deleteCurrentSession();
                    }}
                    onDeployed={async conf => {
                        await client.createCurrentSession(conf);
                        onDeployed();
                    }}
                    onConnect={onConnect} />;
        case PanelId.Stats:
          return <StatsPanel />;
        case PanelId.Admin:
          return <AdminPanel client={client} conf={conf} user={user} />;
        case PanelId.Theia:
          return <TheiaPanel client={client} autoDeploy={params.deploy} templates={templates} onMissingSession={restartAction} onSessionFailing={restartAction} onSessionTimeout={restartAction} />;
      }
}

function ExtraTheiaNav({ client }: { client: Client }): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useInterval(async () => setSession(await client.getCurrentSession()), 5000);

    if (session) {
        const { pod, duration } = session;
        const { startTime } = pod;
        return (
            <Typography variant="h6">
                {formatDuration(duration*60-startTime)} before the session&apos;s end
            </Typography>
        );
    } else {
        return <></>;
    }
}

function App({ params }: { params: Params }): JSX.Element {
    const client = new Client(params.base, 30000, {credentials: "include"});
    const { deploy } = params;
    const [state, send] = useLifecycle(client, deploy? PanelId.Theia: PanelId.Session);
    const { panel, templates, user, conf, error } = state.context;

    const restartAction = () => send(Events.RESTART);
    const selectPanel = (id: PanelId) => send(Events.SELECT, {panel: id});
    const theme = createMuiTheme({
        palette: {
          type: 'dark',
        },
    });

    const isTheia = state.matches(States.LOGGED) && panel == PanelId.Theia;
    return (
        <ThemeProvider theme={theme}>
            <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
                <Wrapper conf={conf} extraNav={isTheia ? <ExtraTheiaNav client={client} /> : <></>} params={params} thin={isTheia} onPlayground={() => selectPanel(PanelId.Session)} onAdminClick={() => selectPanel(PanelId.Admin)} onStatsClick={() => selectPanel(PanelId.Stats)} onLogout={() => send(Events.LOGOUT)} user={user}>
                    {state.matches(States.LOGGED)
                    ? <MainPanel client={client} conf={conf} user={user} params={params} id={panel} templates={templates} onConnect={() => selectPanel(PanelId.Theia)} onDeployed={() => selectPanel(PanelId.Theia)} restartAction={restartAction} />
                    : state.matches(States.TERMS_UNAPPROVED)
                        ? <TermsPanel terms={terms} onTermsApproved={() => send(Events.TERMS_APPROVAL)} />
                        : state.matches(States.UNLOGGED)
                        ? error
                        ? <CenteredContainer>
                            <ErrorMessage reason={error} action={restartAction} />
                          </CenteredContainer>
                        : <LoginPanel />
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
    return {deploy: params.get('deploy'),
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
