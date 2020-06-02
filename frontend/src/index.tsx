import * as React from "react";
import ReactDOM from "react-dom";
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { Route, Router, Switch } from "react-router-dom";
import { createBrowserHistory } from "history";
import { ControllerPanel, MainPanel, TheiaPanel } from './components';
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
        <div>
          <Switch>
            <Route exact path={"/"} component={MainPanel} />
            <Route path={"/tutorial"} component={TutorialPanel} />
            <Route exact path={"/controller"} component={ControllerPanel} />
            <Route path={"/:uuid"} component={TheiaPanel} />
          </Switch>
        </div>
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

if (devMode()) {
  console.log("Installing HTTP interceptor");
  intercept({noInstance: true});
}

const version = process.env.GITHUB_SHA;
if (version) {
  console.log(`Version ${version}`);
}

//document.domain = "substrate.dev";

ReactDOM.render(
    <App />,
    document.querySelector("main")
);
