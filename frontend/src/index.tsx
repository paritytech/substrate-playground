import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Client, Configuration, LoggedUser, Session, Template, User } from '@substrate/playground-client';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
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

function MainPanel({ client, conf, user, id, templates, restartAction, onConnect, onDeployed }: { client: Client, conf: Configuration, user: LoggedUser, id: PanelId, templates: Record<string, Template>, restartAction: () => void, onConnect: () => void, onDeployed: () => void }): JSX.Element {
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
        default:
            return <></>;
    }
}

function ExtraTheiaNav({ session, restartAction }: { session: Session | null | undefined, restartAction: () => void }): JSX.Element {
    if (session) {
        const { pod, duration } = session;
        if (pod.phase == 'Running') {
            const { startTime } = pod;
            const remaining = duration * 60 - (startTime || 0);
            if (remaining < 300) { // 5 minutes
                return (
                    <Typography variant="h6">
                        Your session is about to end. Make sure your changes have been exported.
                    </Typography>
                );
            }
        } else {
            return (
                <Typography variant="h6">
                    Your session is over. <Button onClick={restartAction}>Restart it</Button>
                </Typography>
            );
        }
    }
    return <></>;
}

function WrappedSessionPanel({ params, conf, client, user, templates, selectPanel, restartAction, send }: { params: Params, client: Client, conf: Configuration, user: LoggedUser, templates: Record<string, Template>, selectPanel: (id: PanelId) => void, restartAction: () => void, send: (event: Events) => void }): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useInterval(async () => {
        const session = await client.getCurrentSession();
        setSession(session);

        const duration = session?.duration || 0;
        const maxDuration = conf.session.maxDuration;
        if (maxDuration - duration < 600) { // 10 minutes
            const newDuration = Math.max(maxDuration, duration + 60*30);
            await client.updateCurrentSession({duration: newDuration}); // Increase session duration
        }
    }, 5000);

    return (
        <Wrapper conf={conf} extraNav={<ExtraTheiaNav session={session} restartAction={restartAction} />} params={params} thin={true} onPlayground={() => selectPanel(PanelId.Session)} onAdminClick={() => selectPanel(PanelId.Admin)} onStatsClick={() => selectPanel(PanelId.Stats)} onLogout={() => send(Events.LOGOUT)} user={user}>
            <TheiaPanel client={client} autoDeploy={params.deploy} templates={templates} onMissingSession={restartAction} onSessionFailing={restartAction} onSessionTimeout={restartAction} />
        </Wrapper>
    );
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
                {isTheia
                 ? <WrappedSessionPanel client={client} conf={conf} params={params} user={user} templates={templates} selectPanel={selectPanel} restartAction={restartAction} send={send} />
                 :
                 <Wrapper conf={conf} params={params} onPlayground={() => selectPanel(PanelId.Session)} onAdminClick={() => selectPanel(PanelId.Admin)} onStatsClick={() => selectPanel(PanelId.Stats)} onLogout={() => send(Events.LOGOUT)} user={user}>
                    {state.matches(States.LOGGED)
                    ? <MainPanel client={client} conf={conf} user={user} id={panel} templates={templates} restartAction={restartAction} onDeployed={() => selectPanel(PanelId.Theia)} onConnect={() => selectPanel(PanelId.Theia)} />
                    : state.matches(States.TERMS_UNAPPROVED)
                        ? <TermsPanel terms={terms} onTermsApproved={() => send(Events.TERMS_APPROVAL)} />
                        : state.matches(States.UNLOGGED)
                        ? error
                        ? <CenteredContainer>
                            <ErrorMessage reason={error} action={restartAction} />
                        </CenteredContainer>
                        : <LoginPanel />
                        : <LoadingPanel />}
                </Wrapper>}
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
