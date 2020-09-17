import * as React from "react";
import ReactDOM from "react-dom";
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { Redirect, Route, Router, Switch } from "react-router-dom";
import { createBrowserHistory } from "history";
import { AdminPanel, ControllerPanel, MainPanel, TheiaPanel } from './components';
import { TutorialPanel } from './tutorial';
import { intercept } from './server';

const history = createBrowserHistory();

function App() {
  const theme = createMuiTheme({
    palette: {
      type: 'dark',
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <Router history={history}>
        <Switch>
          <Route exact path={"/"} component={MainPanel} />
          <Route exact path={"/logged"}>
            <Redirect
              to={{
                pathname: "/",
                state: { freshLog: true }
              }}
            />
          </Route>
          <Route exact path={"/tutorial"} component={TutorialPanel} />
          <Route exact path={"/controller"} component={ControllerPanel} />
          <Route exact path={"/admin"} component={AdminPanel} />
          <Route path={"/:uuid"} component={TheiaPanel} />
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

const base = process.env.BASE_URL;
if (base) {
  console.log(`Using custom base URL: ${base}`);
} else {
  if (devMode()) {
    console.log("Installing HTTP interceptor");
    intercept({noInstance: false, logged: true});
  }
}

const version = process.env.GITHUB_SHA;
if (version) {
  console.log(`Version ${version}`);
}

ReactDOM.render(
    <App />,
    document.querySelector("main")
);

const members = document.domain.split(".");
document.domain = members.slice(members.length-2).join(".");