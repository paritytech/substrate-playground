import * as React from "react";
import ReactDOM from "react-dom";
import { Client } from '@substrate/playground-api';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { Redirect, Route, Router, Switch } from "react-router-dom";
import { createBrowserHistory } from "history";
import { AdminPanel, StatsPanel } from './panels/admin';
import { MainPanel } from './panels/main';
import { TheiaPanel } from './panels/theia';
import { NotFoundPanel } from './components';
import { intercept } from './server';

const base = process.env.BASE_URL;
if (base) {
  console.log(`Using custom base URL: ${base}`);
} else {
  if (devMode()) {
    console.log("Installing HTTP interceptor");
    intercept({noInstance: false, logged: true});
  }
}

function apiBaseURL(base: string | undefined) {
  if (base) {
      return `${base}/api`;
  }
  return "/api";
}

const client = new Client({base: apiBaseURL(base)});

function App({ client }) {
  const history = createBrowserHistory();
  const theme = createMuiTheme({
    palette: {
      type: 'dark',
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <Router history={history}>
        <Switch>
          <Route exact path={"/"} component={() => <MainPanel client={client} />} />
          <Route exact path={"/logged"}>
            <Redirect
              to={{
                pathname: "/",
                state: { freshLog: true }
              }}
            />
          </Route>
          <Route exact path={"/stats"} component={() => <StatsPanel client={client} />} />
          <Route exact path={"/admin"} component={() => <AdminPanel client={client} />} />
          <Route path={"/instance"} component={() => <TheiaPanel client={client} />} />
          <Route component={() => <NotFoundPanel client={client} message="Unknown page" />} />
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
  return process.env.NODE_ENV === 'development';
}

const version = process.env.GITHUB_SHA;
if (version) {
  console.log(`Version ${version}`);
}

ReactDOM.render(
    <App client={client} />,
    document.querySelector("main")
);

const members = document.domain.split(".");
document.domain = members.slice(members.length-2).join(".");