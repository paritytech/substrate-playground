import React, { useState } from "react";
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import Button from '@material-ui/core/Button';
import ButtonGroup from "@material-ui/core/ButtonGroup";
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import ClickAwayListener from "@material-ui/core/ClickAwayListener";
import Container from "@material-ui/core/Container";
import Divider from '@material-ui/core/Divider';
import Grow from '@material-ui/core/Grow';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import MenuItem from '@material-ui/core/MenuItem';
import MenuList from '@material-ui/core/MenuList';
import Paper from '@material-ui/core/Paper';
import Popper from '@material-ui/core/Popper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { Client, Configuration, NameValuePair, LoggedUser, Port, Workspace, WorkspaceConfiguration, Repository, WorkspaceState, RepositoryRuntimeConfiguration, RepositoryConfiguration } from '@substrate/playground-client';
import { WorkspaceCreationDialog, canCustomize } from "./admin/workspaces";
import { CenteredContainer, ErrorMessage, ErrorSnackbar, LoadingPanel } from "../components";
import { useInterval } from "../hooks";
import { formatDuration } from "../utils";

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        root: {
            '& > * + *': {
                marginLeft: theme.spacing(2),
            },
        },
    }),
);

const options = [{id: 'create', label: 'Create'}, {id: 'custom', label: 'Customize and Create'}];

export default function SplitButton({ repository, disabled, onCreate, onCreateCustom }: { repository: Repository, disabled: boolean, onCreate: (conf: WorkspaceConfiguration) => void, onCreateCustom: () => void}): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const handleClick = () => {
      const selection = options[selectedIndex];
      if (selection.id == 'create') {
        const conf = {repositoryDetails: {id: repository.id, reference: ""}};
        onCreate(conf);
      } else {
        onCreateCustom();
      }
  };

  const handleMenuItemClick = (
    _event: React.MouseEvent<HTMLLIElement, MouseEvent>,
    index: number,
  ) => {
    setSelectedIndex(index);
    setOpen(false);
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: React.MouseEvent<Document, MouseEvent>) => {
    if (anchorRef.current && anchorRef.current.contains(event.target as HTMLElement)) {
      return;
    }

    setOpen(false);
  };

  return (
      <>
        <ButtonGroup variant="contained" color="primary" ref={anchorRef} aria-label="split button">
          <Button onClick={handleClick} disabled={disabled}>{options[selectedIndex].label}</Button>
          <Button
            color="primary"
            size="small"
            aria-controls={open ? 'split-button-menu' : undefined}
            aria-expanded={open ? 'true' : undefined}
            aria-label="select merge strategy"
            aria-haspopup="menu"
            onClick={handleToggle}
          >
            <ArrowDropDownIcon />
          </Button>
        </ButtonGroup>
        <Popper open={open} anchorEl={anchorRef.current} role={undefined} transition disablePortal>
          {({ TransitionProps, placement }) => (
            <Grow
              {...TransitionProps}
              style={{
                transformOrigin: placement === 'bottom' ? 'center top' : 'center bottom',
              }}
            >
              <Paper>
                <ClickAwayListener onClickAway={handleClose}>
                  <MenuList id="split-button-menu">
                    {options.map((option, index) => (
                      <MenuItem
                        key={option.id}
                        selected={index === selectedIndex}
                        onClick={(event) => handleMenuItemClick(event, index)}
                      >
                        {option.label}
                      </MenuItem>
                    ))}
                  </MenuList>
                </ClickAwayListener>
              </Paper>
            </Grow>
          )}
        </Popper>
      </>
  );
}

function workspaceConfiguration(repository: Repository, reference: string): WorkspaceConfiguration {
    return {repositoryDetails: {id: repository.id, reference: reference}};
}

function RepositorySelector({client, conf, user, onDeployed, onRetry}: {client: Client, conf: Configuration, user?: LoggedUser, onDeployed: (conf: WorkspaceConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [repositories, setRepositories] = useState<Repository[] | undefined>();
    const publicTemplates = Object.entries(repositories || {}).filter(([, v]) => v.tags?.public == "true");
    const templatesAvailable = publicTemplates.length > 0;
    const [selection, select] = useState<[string, Repository]>();
    const [deploying, setDeploying] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [openCustom, setOpenCustom] = useState(false);

    useInterval(async () => {
        try {
            setRepositories(await client.listRepositories());
        } catch (e) {
            setErrorMessage(e.message);
            setRepositories([]);
        }
    }, 5000);

    React.useEffect(() => {
        if (!selection) {
            select(publicTemplates?.[0] || null);
        }
    }, [publicTemplates]);

    async function onCreateClick(conf: WorkspaceConfiguration): Promise<void> {
        try {
            setDeploying(true);
            await onDeployed(conf);
        } catch (e) {
            setErrorMessage(`Failed to create a new workspace: ${e.message}`);
        } finally {
            setDeploying(false);
        }
    }

    function createEnabled(): boolean {
        if (!templatesAvailable) {
            return false;
        } else {
            return !deploying;
        }
    }

    if (errorMessage) {
        return <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />;
    } else if (repositories == undefined) {
        return <LoadingPanel />;
    } else if (selection) {
        return (
            <div style={{width: 200}}>
                <Typography variant="h5" style={{padding: 20}}>Select a repository</Typography>
                <Divider orientation="horizontal" />
                <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
                    <div style={{flex: 1}}>
                            <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                                {publicTemplates.map(([id, repository], index: number) => (
                                <ListItem button key={index} selected={selection[1].id === repository.id} onClick={() => select([id, repository])}>
                                    <ListItemText primary={repository.id} />
                                </ListItem>
                                ))}
                            </List>
                        </div>
                </Container>
                <Divider orientation="horizontal" />
                <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    {user && canCustomize(user)
                    ? <SplitButton repository={selection[1]} onCreate={() => onCreateClick(workspaceConfiguration(selection[1], ""))} onCreateCustom={() => setOpenCustom(true)} disabled={!createEnabled()} />
                    : <Button onClick={() => onCreateClick(workspaceConfiguration(selection[1], ""))} color="primary" variant="contained" disableElevation disabled={!createEnabled()}>
                          Create
                      </Button>}
                </Container>
                {openCustom &&
                <WorkspaceCreationDialog client={client} user={user} template={selection[0]} conf={conf} templates={repositories} show={openCustom} onCreate={onCreateClick} onHide={() => setOpenCustom(false)} />}
            </div>
        );
    } else {
        return (
            <CenteredContainer>
                <ErrorMessage reason="Can't find any public repository." action={onRetry} />
            </CenteredContainer>
        );
    }
}

function EnvTable({ env }: {env?: NameValuePair[]}): JSX.Element {
    return (
        <TableContainer component={Paper}>
            <Table size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell align="right">Value</TableCell>
                    </TableRow>
                </TableHead>
                {env &&
                    <TableBody>
                        {env.map(e => (
                            <TableRow key={e.name}>
                                <TableCell component="th" scope="row">
                                    {e.name}
                                </TableCell>
                                <TableCell align="right">{e.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                }
            </Table>
        </TableContainer>
    );
}

function PortsTable({ ports }: {ports?: Port[]}): JSX.Element {
    return (
        <TableContainer component={Paper}>
            <Table size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Path</TableCell>
                        <TableCell>Value</TableCell>
                    </TableRow>
                </TableHead>
                {ports &&
                    <TableBody>
                        {ports.map(port => (
                            <TableRow key={port.name}>
                                <TableCell component="th" scope="row">
                                    {port.name}
                                </TableCell>
                                <TableCell>{port.path}</TableCell>
                                <TableCell>{port.port}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                }
            </Table>
        </TableContainer>
    );
}

function WorkspaceRuntime({ runtime }: { runtime: RepositoryRuntimeConfiguration }): JSX.Element {
    return (
        <div>
            <div style={{display: "flex", paddingTop: 20}}>
                <div style={{flex: 1, paddingRight: 10}}>
                    <Typography variant="h6" id="tableTitle" component="div">
                    Environment
                    </Typography>
                    <EnvTable env={runtime.env} />
                </div>
                <div style={{ flex: 1 }}>
                    <Typography variant="h6" id="tableTitle" component="div">
                        Ports
                    </Typography>
                    <PortsTable ports={runtime.ports} />
                </div>
            </div>
        </div>
    );
}

function WorkspaceStateDetails({ workspace }: { workspace: Workspace}): JSX.Element {
    const { maxDuration, state } = workspace;
    switch (state.tag) {
        case "Running":
            return (
            <>
                <Typography color="textSecondary" gutterBottom>
                Started {formatDuration(state.startTime)} ago ({formatDuration(maxDuration*60-state.startTime)} left)
                </Typography>
                <WorkspaceRuntime runtime={state.runtime} />
            </>);
        case "Failed":
            return (
                <Typography color="textSecondary" gutterBottom>
                Phase: <em>{state.tag}</em> (${state.reason})
                </Typography>
            );
        default:
            return <></>;
    }
}

export function WorkspaceDetails({ workspace }: {workspace: Workspace}): JSX.Element {
    const { repositoryDetails } = workspace;
    const { id } = repositoryDetails;
    return (
        <Card style={{ margin: 20 }} variant="outlined">
            <CardContent>
                <Typography>
                    {id}
                </Typography>
                <WorkspaceStateDetails workspace={workspace} />
            </CardContent>
        </Card>
    );
}

function ExistingWorkspace({workspace, onStop, onConnect}: {workspace: Workspace, onStop: () => void, onConnect: (workspace: Workspace) => void}): JSX.Element {
    const [stopping, setStopping] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function onConnectClick(workspace: Workspace): void {
        try {
            onConnect(workspace);
        } catch {
            setErrorMessage("Failed to connect to the workspace");
        }
    }

    function onStopClick(): void {
        try {
            setStopping(true);
            onStop();
        } catch {
            setStopping(false);
            setErrorMessage("Failed to stop the workspace");
        }
    }

    return (
        <>
            <Typography variant="h5" style={{padding: 20}}>Existing workspace</Typography>
            <Divider orientation="horizontal" />
            <Container style={{display: "flex", flex: 1, padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                <WorkspaceDetails workspace={workspace} />
            </Container>
            <Divider orientation="horizontal" />
            <Container style={{display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10}}>
                <ButtonGroup style={{alignSelf: "flex-end"}} size="small">
                    <Button onClick={onStopClick} disabled={stopping} color="secondary" disableElevation>
                        Stop
                    </Button>
                    <Button onClick={() => onConnectClick(workspace)} disabled={stopping || workspace.state.tag !== 'Running'} disableElevation>
                        Connect
                    </Button>
                </ButtonGroup>
            </Container>
            {errorMessage &&
            <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
        </>
    );
}

export function WorkspacePanel({ client, conf, user, onDeployed, onConnect, onRetry, onStop }: {client: Client, conf: Configuration, user?: LoggedUser, onStop: () => void, onConnect: (workspace: Workspace) => void, onDeployed: (conf: WorkspaceConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined);

    useInterval(async () => setWorkspace(await client.getCurrentWorkspace()), 5000);

    return (
        <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                {workspace === undefined
                 ? <LoadingPanel />
                 : workspace
                 ?<ExistingWorkspace workspace={workspace} onConnect={onConnect} onStop={onStop} />
                 : <RepositorySelector client={client} conf={conf} user={user} onRetry={onRetry} onDeployed={onDeployed} />}
            </Paper>
        </Container>
    );
}
