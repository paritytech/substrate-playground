import React, { useState } from "react";
import marked from 'marked';
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
import { Client, Configuration, NameValuePair, LoggedUser, Port, Session, SessionConfiguration, Template } from '@substrate/playground-client';
import { SessionCreationDialog, canCustomize } from "./admin";
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

function TemplateSelector({client, conf, user, templates, onDeployed, onRetry}: {client: Client, conf: Configuration, user: LoggedUser, templates: Record<string, Template>, onDeployed: (conf: SessionConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const publicTemplates = Object.entries(templates).filter(([, v]) => v.tags?.public == "true");
    const templatesAvailable = publicTemplates.length > 0;
    const [selection, select] = useState(templatesAvailable ? publicTemplates[0] : null);
    const [deploying, setDeploying] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [openCustom, setOpenCustom] = React.useState(false);
    const classes = useStyles();

    async function onCreateClick(conf: SessionConfiguration): Promise<void> {
        try {
            setDeploying(true);
            await onDeployed(conf);
            setDeploying(false);
        } catch (e) {
            setErrorMessage(`Failed to create a new session: ${e}`);
        }
    }

    function createEnabled(): boolean {
        if (!templatesAvailable) {
            return false;
        } else {
            return !deploying;
        }
    }

    if (selection) {
        return (
            <>
                <Typography variant="h5" style={{padding: 20}}>Select a template</Typography>
                <Divider orientation="horizontal" />
                <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
                    <div style={{display: "flex", flex: 1, flexDirection: "row", minHeight: 0, height: "100%"}}>
                            <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                                {publicTemplates.map(([id, template], index: number) => (
                                <ListItem button key={index} selected={selection[1].name === template.name} onClick={() => select([id, template])}>
                                    <ListItemText primary={template.name} />
                                </ListItem>
                                ))}
                            </List>
                            <Divider flexItem={true} orientation={"vertical"} light={true} />
                            <div style={{flex: 1, marginLeft: 20, paddingRight: 20, overflow: "auto", textAlign: "left"}}>
                                <Typography>
                                    <span dangerouslySetInnerHTML={{__html:marked(selection[1].description)}}></span>
                                </Typography>
                                <Divider orientation={"horizontal"} light={true} />
                                <Typography className={classes.root} variant="overline">
                                    #{selection[1].image}
                                </Typography>
                            </div>
                        </div>
                </Container>
                <Divider orientation="horizontal" />
                <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    {canCustomize(user)
                    ? <SplitButton template={selection[0]} onCreate={() => onCreateClick({template: selection[0]})} onCreateCustom={() => setOpenCustom(true)} disabled={!createEnabled()} />
                    : <Button onClick={() => onCreateClick({template: selection[0]})} color="primary" variant="contained" disableElevation disabled={!createEnabled()}>
                          Create
                      </Button>}
                </Container>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {openCustom &&
                <SessionCreationDialog client={client} user={user} template={selection[0]} conf={conf} templates={templates} show={openCustom} onCreate={onCreateClick} onHide={() => setOpenCustom(false)} />}
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
    const { pod, template, duration } = session;
    const { name, runtime } = template;
    const { container, phase, startTime, conditions } = pod;
    const reason = container?.reason || (conditions && conditions.length > 0 && conditions[0].reason);
    return (
        <Card style={{ margin: 20 }} variant="outlined">
            <CardContent>
                <Typography>
                    {name}
                </Typography>
                {startTime &&
                <Typography color="textSecondary" gutterBottom>
                Started {formatDuration(startTime)} ago ({formatDuration(duration*60-startTime)} left)
                </Typography>
                }
                <Typography color="textSecondary" gutterBottom>
                Phase: <em>{phase}</em> {reason && `(${reason})`}
                </Typography>
                {runtime &&
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
                }
            </CardContent>
        </Card>
    );
}

function ExistingSession({session, onStop, onConnect}: {session: Session, onStop: () => void, onConnect: (session: Session) => void}): JSX.Element {
    const [stopping, setStopping] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function onConnectClick(session: Session): void {
        try {
            onConnect(session);
        } catch {
            setErrorMessage("Failed to connect to the session");
        }
    }

    function onStopClick(): void {
        try {
            setStopping(true);
            onStop();
        } catch {
            setStopping(false);
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
                    <Button onClick={() => onConnectClick(session)} disabled={stopping || session.pod.phase !== 'Running'} disableElevation>
                        Connect
                    </Button>
                </ButtonGroup>
            </Container>
            {errorMessage &&
            <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
        </>
    );
}

export function SessionPanel({ client, conf, user, templates, onDeployed, onConnect, onRetry, onStop }: {client: Client, conf: Configuration, user: LoggedUser, templates: Record<string, Template>, onStop: () => void, onConnect: (session: Session) => void, onDeployed: (conf: SessionConfiguration) => Promise<void>, onRetry: () => void}): JSX.Element {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useInterval(async () => setSession(await client.getCurrentSession()), 5000);
    return (
        <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                {session === undefined
                 ? <LoadingPanel />
                 : session
                 ?<ExistingSession session={session} onConnect={onConnect} onStop={onStop} />
                 : <TemplateSelector client={client} conf={conf} user={user} templates={templates} onRetry={onRetry} onDeployed={onDeployed} />}
            </Paper>
        </Container>
    );
}
