import * as React from "react";
import ReactDOM from "react-dom";
import useMediaQuery from '@material-ui/core/useMediaQuery';
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { Router, Route } from "react-router-dom";
import { createBrowserHistory } from "history";
import { MainPanel, TheiaPanel } from './components';

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  const theme = React.useMemo(
    () =>
      createMuiTheme({
        palette: {
          type: prefersDarkMode ? 'dark' : 'light',
        },
      }),
    [prefersDarkMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <Router history={history}>
        <Route exact path={"/"} component={MainPanel} />
        <Route path={"/:uuid"} component={TheiaPanel} />
      </Router>
    </ThemeProvider>
  );
}

const history = createBrowserHistory();

ReactDOM.render(
    <App />,
    document.querySelector("main")
);
