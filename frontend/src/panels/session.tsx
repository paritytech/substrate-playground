import React, { useEffect, useState } from "react";
import { marked } from 'marked';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Button from '@mui/material//Button';
import ButtonGroup from "@mui/material//ButtonGroup";
import Card from '@mui/material//Card';
import CardContent from '@mui/material//CardContent';
import ClickAwayListener from "@mui/material//ClickAwayListener";
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grow from '@mui/material/Grow';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Client, NameValuePair, User, Port, Session, SessionConfiguration, Repository, RepositoryVersion, mainSessionId, Preference } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, ErrorSnackbar, LoadingPanel } from "../components";
import { useInterval } from "../hooks";
import { canCustomizeSession, formatDuration } from "../utils";
import { SessionCreationDialog } from "./admin/sessions";

const options = [{id: 'create', label: 'Create'}, {id: 'custom', label: 'Customize and Create'}];

export default function SplitButton({ disabled, onCreate, onCreateCustom }: { disabled: boolean, onCreate: () => void, onCreateCustom: () => void}): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const handleClick = () => {
      const selection = options[selectedIndex];
      if (selection.id == 'create') {
        onCreate();
      } else {
        onCreateCustom();
      }
  };

  const handleMenuItemClick = (
    event: React.MouseEvent<HTMLLIElement, MouseEvent>,
    index: number,
  ) => {
    setSelectedIndex(index);
    setOpen(false);
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: MouseEvent | TouchEvent) => {
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
                        onClick={(event: any) => handleMenuItemClick(event, index)}
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

export async function fetchRepositoriesWithLatestVersions(client: Client): Promise<[Repository, RepositoryVersion][]> {
    const repositories = await client.listRepositories();
    const repositoriesWithCurrentVersions = (await Promise.all(repositories.map(async repository => {
        const repositoryVersion = repository.currentVersion ? await client.getRepositoryVersion(repository.id, repository.currentVersion) : null;
        return [repository, repositoryVersion];
    }))) as Array<[Repository, RepositoryVersion | null]>;
    return repositoriesWithCurrentVersions.filter(repositoryWithCurrentVersion => {
        const state = repositoryWithCurrentVersion[1]?.state;
        if (state?.type == "Ready") {
            const devcontainer = JSON.parse(state.devcontainerJson);
            return getPlaygroundCustomizations(devcontainer)?.tags?.public == "true";
        }
        return false;
    }) as Array<[Repository, RepositoryVersion]>;
}

function getPlaygroundCustomizations(devcontainer: any): any | undefined {
    return devcontainer.customizations["substrate-playground"];
}

function getDescription(devcontainer: any): string {
    return getPlaygroundCustomizations(devcontainer)?.description || "";
}

function RepositorySelector({client, preferences, user, onDeployed, onRetry}: {client: Client, preferences: Preference[], user: User, onDeployed: (conf: SessionConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [repositories, setRepositories] = useState<[Repository, RepositoryVersion][]>();
    const [deploying, setDeploying] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [openCustom, setOpenCustom] = useState(false);
    const [selection, setSelection] = useState<number | null>(null);
    const [canCustomize, setCanCustomize] = React.useState(false);

    function getSelectedRepositoryWithLatestVersion(): [Repository, RepositoryVersion] | undefined {
        return selection != null ? repositories?.at(selection) : undefined;
    }

    useInterval(async () => {
        try {
            const publicRepositoriesWithLatestVersions = await fetchRepositoriesWithLatestVersions(client);
            setRepositories(publicRepositoriesWithLatestVersions);

            // Initialize the selection if none has been set
            if (!selection && publicRepositoriesWithLatestVersions[0]) {
                setSelection(0);
            }
        } catch(e) {
            console.error("Failed to fetch repositories", e)

            setRepositories([]);
        }
    }, 5000);

    useEffect(() => {
        async function fetchData() {
            setCanCustomize(await canCustomizeSession(client, user));
        }

        fetchData();
    }, []);

    async function onCreateClick(repositoryId: string, repositoryVersionId: string): Promise<void> {
        try {
            setDeploying(true);
            const sessionConfiguration = {repositorySource: {repositoryId: repositoryId, repositoryVersionId: repositoryVersionId}}
            await onDeployed(sessionConfiguration);
        } catch (e: any) {
            setErrorMessage(`Failed to create a new session: ${e.message}`);
        } finally {
            setDeploying(false);
        }
    }

    function createEnabled(): boolean {
        return !deploying;
    }

    const selectedRepository = getSelectedRepositoryWithLatestVersion();
    if (!repositories) {
        return <LoadingPanel />;
    } else if (selectedRepository && selectedRepository[1].state.type == "Ready") {
        const devcontainer = JSON.parse(selectedRepository[1].state.devcontainerJson);
        return (
            <>
                <Typography variant="h5" style={{padding: 20}}>Select a template</Typography>
                <Divider orientation="horizontal" />
                <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
                    <div style={{display: "flex", flex: 1, flexDirection: "row", minHeight: 0, height: "100%"}}>
                            <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                                {repositories.map((repository: [Repository, RepositoryVersion], index: number) => (
                                <ListItem button key={index} selected={selection === index} onClick={() => setSelection(index)}>
                                    <ListItemText primary={repository[0].id} />
                                </ListItem>
                                ))}
                            </List>
                            <Divider flexItem={true} orientation={"vertical"} light={true} />
                            <div style={{flex: 1, marginLeft: 20, paddingRight: 20, overflow: "auto", textAlign: "left"}}>
                                <Typography>
                                    <span dangerouslySetInnerHTML={{__html:marked(getDescription(devcontainer))}}></span>
                                </Typography>
                                <Divider orientation={"horizontal"} light={true} />
                                <Typography variant="overline">
                                    #{devcontainer.image}
                                </Typography>
                            </div>
                        </div>
                </Container>
                <Divider orientation="horizontal" />
                <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    {canCustomize
                    ? <SplitButton onCreate={() => onCreateClick(selectedRepository[0].id, selectedRepository[1].id)} onCreateCustom={() => setOpenCustom(true)} disabled={!createEnabled()} />
                    : <Button onClick={() => onCreateClick(selectedRepository[0].id, selectedRepository[1].id)} color="primary" variant="contained" disableElevation disabled={!createEnabled()}>
                          Create
                      </Button>}
                </Container>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {openCustom &&
                <SessionCreationDialog client={client} user={user} repository={selectedRepository[0].id} preferences={preferences} repositories={repositories} show={openCustom} onCreate={() => onCreateClick(selectedRepository[0].id, selectedRepository[1].id)} onHide={() => setOpenCustom(false)} />}
            </>
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

export function SessionDetails({ session }: {session: Session}): JSX.Element {
    const { id, state, maxDuration } = session;
    return (
        <Card style={{ margin: 20 }} variant="outlined">
            <CardContent>
                <Typography>
                    {id}
                </Typography>
                {state.type == 'Running' &&
                <Typography color="textSecondary" gutterBottom>
                Started {formatDuration(state.startTime)} ago ({formatDuration(maxDuration*60-(Date.now()-state.startTime))} left)
                </Typography>
                }
                {state.type == 'Deploying' &&
                <Typography color="textSecondary" gutterBottom>
                Deploying
                </Typography>
                }
                {state.type == 'Failed' &&
                <Typography color="textSecondary" gutterBottom>
                Failed
                {state.message && `(${state.reason})`}
                </Typography>
                }
            </CardContent>
        </Card>
    );
}

function ExistingSession({session, onStop, onConnect}: {session: Session, onStop: () => Promise<void>, onConnect: (session: Session) => void}): JSX.Element {
    const [stopping, setStopping] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function onConnectClick(session: Session): void {
        try {
            onConnect(session);
        } catch {
            setErrorMessage("Failed to connect to the session");
        }
    }

    async function onStopClick(): Promise<void> {
        try {
            setStopping(true);
            await onStop();
        } catch {
            setErrorMessage("Failed to stop the session");
        }
    }

    return (
        <>
            <Typography variant="h5" style={{padding: 20}}>Existing session</Typography>
            <Divider orientation="horizontal" />
            <Container style={{display: "flex", flex: 1, padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                <SessionDetails session={session} />
            </Container>
            <Divider orientation="horizontal" />
            <Container style={{display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10}}>
                <ButtonGroup style={{alignSelf: "flex-end"}} size="small">
                    <Button onClick={onStopClick} disabled={stopping} color="secondary" disableElevation>
                        Stop
                    </Button>
                    <Button onClick={() => onConnectClick(session)} disabled={stopping || session.state.type !== 'Running'} disableElevation>
                        Connect
                    </Button>
                </ButtonGroup>
            </Container>
            {errorMessage &&
            <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
        </>
    );
}

export function SessionPanel({ client, preferences, user, onDeployed, onConnect, onRetry, onStop }: {client: Client, preferences: Preference[], user: User, onStop: () => Promise<void>, onConnect: (session: Session) => void, onDeployed: (conf: SessionConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useInterval(async () => setSession(await client.getUserSession(user.id, mainSessionId(user))), 1000);

    return (
        <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                {session === undefined
                 ? <LoadingPanel />
                 : session
                 ?<ExistingSession session={session} onConnect={onConnect} onStop={onStop} />
                 : <RepositorySelector client={client} preferences={preferences} user={user} onRetry={onRetry} onDeployed={onDeployed} />}
            </Paper>
        </Container>
    );
}
