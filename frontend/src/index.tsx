import * as React from "react";
import ReactDOM from "react-dom";
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { Router, Route } from "react-router-dom";
import { createBrowserHistory } from "history";
import { MainPanel, TheiaPanel } from './components';
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
        <Route exact path={"/"} component={MainPanel} />
        <Route path={"/:uuid"} component={TheiaPanel} />
      </Router>
    </ThemeProvider>
  );
}

if (process.env.NODE_ENV === 'development') {
  intercept({});
}

ReactDOM.render(
    <App />,
    document.querySelector("main")
);
