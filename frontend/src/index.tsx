import React from "react";
import ReactDOM from "react-dom";
import { Client } from '@substrate/playground-client';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { createBrowserHistory } from "history";
import { Redirect, Route, Router, Switch } from "react-router-dom";
import { AdminPanel } from './panels/admin';
import { LoginPanel } from './panels/login';
import { SessionPanel } from './panels/session';
import { StatsPanel } from './panels/stats';
import { TermsPanel } from './panels/terms';
import { TheiaPanel } from './panels/theia';
import { Wrapper } from './components';
import { useLifecycle, logged, logout, restart, select, termsApproval, termsUnapproved } from './lifecycle';
import { intercept } from './server';

// https://dev.to/annlin/consolelog-with-css-style-1mmp
// https://github.com/circul8/console.ascii
// https://gist.github.com/IAmJulianAcosta/fb1813926c2fa3adefc0
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

export enum PanelId {Session, Admin, Stats, Theia}

function MainPanelComponent({ client, send, state, restartAction, id }: {client: Client, id: PanelId}) {
  if (state.matches(logged)) {
    switch(id) {
      case PanelId.Session:
        return <SessionPanel state={state} onRetry={restartAction}
                onStopSession={() => client.stopInstance()}
                onDeployed={() => send(select, {panel: PanelId.Theia})}
                onConnect={() => send(select, {panel: PanelId.Theia})} />;
      case PanelId.Stats:
        return <StatsPanel />;
      case PanelId.Admin:
        return <AdminPanel client={client} state={state} />;
      case PanelId.Theia:
        return <TheiaPanel client={client} onMissingSession={restartAction} onSessionFailing={restartAction} onSessionTimeout={restartAction} />;
    }
  } else if (state.matches(termsUnapproved)) {
    return <TermsPanel terms={state.context.terms} onTermsApproved={() => send(termsApproval)} />
  } else {
    return <LoginPanel />;
  }
}

function Panel() {
  const client = new Client({base: base}, {credentials: "include"});
  const [state, send] = useLifecycle(client);

  function restartAction() {
    send(restart);
  }
  const {panel, details} = state.context;
  return (
      <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center" }}>
          <Wrapper onPlayground={() => send(select, {panel: PanelId.Session})} onAdminClick={() => send(select, {panel: PanelId.Admin})} onStatsClick={() => send(select, {panel: PanelId.Stats})} onLogout={() => send(logout)} details={details}>
              <MainPanelComponent client={client} restartAction={restartAction} send={send} state={state} id={panel || PanelId.Session} />
          </Wrapper>
      </div>
    );
}

function App() {
  const history = createBrowserHistory();
  const theme = createMuiTheme({
    palette: {
      type: 'dark',
    },
  });

  // TODO: handle URL parameters. deploy, .., propagate to Theia. Survive GH login.

  return (
    <ThemeProvider theme={theme}>
      <Router history={history}>
        <Switch>
          <Route path={"/"} component={() =>
            <Panel />
            }
          />
          <Route exact path={"/logged"}>
            <Redirect
              to={{
                pathname: "/",
                state: { freshLog: true }
              }}
            />
          </Route>
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

function devMode() {
  const param = new URLSearchParams(window.location.search).get('devMode');
  if (param) {
    return param === "true";
  }
  return process.env.NODE_ENV === 'dev';
}

ReactDOM.render(
    <App />,
    document.querySelector("main")
);
