import React from "react";
import ReactDOM from "react-dom";
import { Client, Session, Template } from '@substrate/playground-client';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { AdminPanel } from './panels/admin';
import { LoginPanel } from './panels/login';
import { SessionPanel } from './panels/session';
import { StatsPanel } from './panels/stats';
import { TermsPanel } from './panels/terms';
import { TheiaPanel } from './panels/theia';
import { Wrapper } from './components';
import { useLifecycle, Events, States } from './lifecycle';
import { intercept } from './server';

export enum PanelId {Session, Admin, Stats, Theia}

function MainPanel({ client, id, templates, session, onConnect, onDeployed, restartAction }: { client: Client, id: PanelId, templates: Record<string, Template>, session: Session, restartAction: () => void, onConnect: () => void, onDeployed: () => void}): JSX.Element {
    switch(id) {
        case PanelId.Session:
          return <SessionPanel templates={templates} session={session} onRetry={restartAction}
                  onStopSession={() => client.deleteUserSession()}
                  onDeployed={async template => {
                      await client.createOrUpdateUserSession({template: template});
                      onDeployed();
                  }}
                  onConnect={onConnect} />;
        case PanelId.Stats:
          return <StatsPanel />;
        case PanelId.Admin:
          return <AdminPanel client={client} templates={templates} />;
        case PanelId.Theia:
          return <TheiaPanel client={client} onMissingSession={restartAction} onSessionFailing={restartAction} onSessionTimeout={restartAction} />;
      }
}

function Panel(): JSX.Element {
  const client = new Client(base, {credentials: "include"});
  const [state, send] = useLifecycle(client);

  const restartAction = () => send(Events.RESTART);

  const {panel, session, templates, terms, user} = state.context;
  return (
      <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
          <Wrapper onPlayground={() => send(Events.SELECT, {panel: PanelId.Session})} onAdminClick={() => send(Events.SELECT, {panel: PanelId.Admin})} onStatsClick={() => send(Events.SELECT, {panel: PanelId.Stats})} onLogout={() => send(Events.LOGOUT)} user={user}>
              {state.matches(States.LOGGED)
               ? <MainPanel client={client} id={panel} templates={templates} session={session} onConnect={() => send(Events.SELECT, {panel: PanelId.Theia})} onDeployed={() => send(Events.SELECT, {panel: PanelId.Theia})} restartAction={restartAction} />
               : state.matches(States.TERMS_UNAPPROVED)
                ? <TermsPanel terms={terms} onTermsApproved={() => send(Events.TERMS_APPROVAL)} />
                : <LoginPanel />}
          </Wrapper>
      </div>
    );
}

function App(): JSX.Element {
  const theme = createMuiTheme({
    palette: {
      type: 'dark',
    },
  });

  // TODO: handle URL parameters. deploy, .., propagate to Theia. Survive GH login.

  return (
    <ThemeProvider theme={theme}>
      <Panel />
    </ThemeProvider>
  );
}

function devMode(): boolean {
  const param = new URLSearchParams(window.location.search).get('devMode');
  if (param) {
    return param === "true";
  }
  return process.env.NODE_ENV === 'dev';
}

const base = process.env.BASE || "/api";
console.log(`Connected to: ${base}`);
const version = process.env.GITHUB_SHA;
console.log(`Version ${version}`);
if (devMode()) {
  console.log("Installing HTTP interceptor");
  intercept({noInstance: true, logged: true});
}
// Set domain to root DNS so that they share the same origin and communicate
const members = document.domain.split(".");
if (members.length > 1) {
  document.domain = members.slice(members.length-2).join(".");
}

ReactDOM.render(
    <App />,
    document.querySelector("main")
);
