

import React, { useState } from "react";
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
import { Client, Configuration, NameValuePair, LoggedUser, Port, Session, SessionConfiguration, Template } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, ErrorSnackbar, LoadingPanel } from "../components";
import { useInterval } from "../hooks";
import { canCustomize, formatDuration, mainSessionId } from "../utils";
import { SessionCreationDialog } from "./admin/sessions";

const options = [{id: 'create', label: 'Create'}, {id: 'custom', label: 'Customize and Create'}];

export default function SplitButton({ template, disabled, onCreate, onCreateCustom }: { template: string, disabled: boolean, onCreate: (conf: SessionConfiguration) => void, onCreateCustom: () => void}): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const handleClick = () => {
      const selection = options[selectedIndex];
      if (selection.id == 'create') {
        onCreate({template: template});
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

function TemplateSelector({client, conf, user, onDeployed, onRetry}: {client: Client, conf: Configuration, user: LoggedUser, onDeployed: (conf: SessionConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [templates, setTemplates] = useState<Template[]>();
    const [deploying, setDeploying] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [openCustom, setOpenCustom] = useState(false);
    const [selection, select] = useState<Template | null>(null);

    useInterval(async () => {
        const templates = await client.listTemplates();
        const publicTemplates = templates.filter(template => template.tags?.public == "true");
        const template = publicTemplates[0];
        // Initialize the selection if none has been set
        if (!selection && template) {
            select(template);
        }
        setTemplates(publicTemplates);
    }, 5000);

    async function onCreateClick(conf: SessionConfiguration): Promise<void> {
        try {
            setDeploying(true);
            await onDeployed(conf);
        } catch (e: any) {
            setErrorMessage(`Failed to create a new session: ${e.message}`);
        } finally {
            setDeploying(false);
        }
    }

    function createEnabled(): boolean {
        return !deploying;
    }

    if (!templates) {
        return <LoadingPanel />;
    } else if (selection) {
        return (
            <>
                <Typography variant="h5" style={{padding: 20}}>Select a template</Typography>
                <Divider orientation="horizontal" />
                <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
                    <div style={{display: "flex", flex: 1, flexDirection: "row", minHeight: 0, height: "100%"}}>
                            <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                                {templates.map((template: Template, index: number) => (
                                <ListItem button key={index} selected={selection.id === template.id} onClick={() => select(template)}>
                                    <ListItemText primary={template.id} />
                                </ListItem>
                                ))}
                            </List>
                            <Divider flexItem={true} orientation={"vertical"} light={true} />
                            <div style={{flex: 1, marginLeft: 20, paddingRight: 20, overflow: "auto", textAlign: "left"}}>
                                <Typography>
                                    <span dangerouslySetInnerHTML={{__html:marked(selection.description)}}></span>
                                </Typography>
                                <Divider orientation={"horizontal"} light={true} />
                                <Typography variant="overline">
                                    #{selection.image}
                                </Typography>
                            </div>
                        </div>
                </Container>
                <Divider orientation="horizontal" />
                <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    {canCustomize(user)
                    ? <SplitButton template={selection.id} onCreate={() => onCreateClick({template: selection.id})} onCreateCustom={() => setOpenCustom(true)} disabled={!createEnabled()} />
                    : <Button onClick={() => onCreateClick({template: selection.id})} color="primary" variant="contained" disableElevation disabled={!createEnabled()}>
                          Create
                      </Button>}
                </Container>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {openCustom &&
                <SessionCreationDialog client={client} user={user} template={selection.id} conf={conf} templates={templates} show={openCustom} onCreate={onCreateClick} onHide={() => setOpenCustom(false)} />}
            </>
        );
    } else {
        return (
            <CenteredContainer>
                <ErrorMessage reason="Can't find any public template. The templates configuration might be incorrect." action={onRetry} />
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
                {state.tag == 'Running' &&
                <Typography color="textSecondary" gutterBottom>
                Started {formatDuration(state.startTime)} ago ({formatDuration(maxDuration*60-state.startTime)} left)
                </Typography>
                }
                {state.tag == 'Deploying' &&
                <Typography color="textSecondary" gutterBottom>
                Deploying
                </Typography>
                }
                {state.tag == 'Failed' &&
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
        } finally {
            setStopping(false);
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
                    <Button onClick={() => onConnectClick(session)} disabled={stopping || session.state.tag !== 'Running'} disableElevation>
                        Connect
                    </Button>
                </ButtonGroup>
            </Container>
            {errorMessage &&
            <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
        </>
    );
}

export function SessionPanel({ client, conf, user, onDeployed, onConnect, onRetry, onStop }: {client: Client, conf: Configuration, user: LoggedUser, onStop: () => Promise<void>, onConnect: (session: Session) => void, onDeployed: (conf: SessionConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);
    const sessionId = mainSessionId(user.id);

    useInterval(async () => setSession(await client.getSession(sessionId)), 5000);

    return (
        <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                {session === undefined
                 ? <LoadingPanel />
                 : session
                 ?<ExistingSession session={session} onConnect={onConnect} onStop={onStop} />
                 : <TemplateSelector client={client} conf={conf} user={user} onRetry={onRetry} onDeployed={onDeployed} />}
            </Paper>
        </Container>
    );
}
