import React, { useEffect, useRef, useState } from "react";
import { useSpring, animated } from 'react-spring'
import { Alert, AlertTitle } from '@material-ui/lab';
import AppBar from '@material-ui/core/AppBar';
import Avatar from '@material-ui/core/Avatar';
import Badge from '@material-ui/core/Badge';
import Button from '@material-ui/core/Button';
import Box from '@material-ui/core/Box';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CircularProgress from '@material-ui/core/CircularProgress';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Divider from '@material-ui/core/Divider';
import FeedbackIcon from '@material-ui/icons/Feedback';
import HelpIcon from '@material-ui/icons/Help';
import IconButton from '@material-ui/core/IconButton';
import GitHubIcon from '@material-ui/icons/GitHub';
import Link from '@material-ui/core/Link';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Toolbar from '@material-ui/core/Toolbar';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import marked from 'marked';
import { useHistory, useLocation, useParams } from "react-router-dom";
import Fade from '@material-ui/core/Fade';
import { Container } from "@material-ui/core";
import { Client } from "@substrate/playground-api";
import { Responder } from "./connect";
import { useInterval, useLocalStorage } from './hooks';
import { useLifecycle, deploy, deploying, failed, logged, restart, setup, stop, stopping } from './lifecycle';
import { fetchWithTimeout, navigateToAdmin, navigateToInstance, navigateToHomepage } from "./utils";

import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import crypto from 'crypto';

import terms from 'bundle-text:./terms.md';

const termsHash = crypto.createHash('md5').update(terms).digest('hex');

function wrapAction(action: (() => void) | Promise<void>, call: (boolean) => void):(() => void) | Promise<void> {
    if (action instanceof Promise) {
        call(true);
        return new Promise<void>((resolve, reject) => {
            action.then(() => {
                resolve();
            }).catch(() => {
                reject();
            }).finally(() => {
                call(false);
            });
        });
    }
    return action;
}

function ErrorMessageAction({action, actionTitle = "TRY AGAIN"}: {action: (() => void) | Promise<void> , actionTitle?: string}) {
    if (action instanceof Promise) {
        const [executing, setExecuting] = useState(false);
        return (
            <Button onClick={async () => {wrapAction(action, setExecuting)}}>
                {executing &&
                <CircularProgress size={20} />}
                {actionTitle}
            </Button>
        );
    } else {
        return (
            <Button onClick={action}>
                {actionTitle}
            </Button>
        );
    }
}

export function ErrorMessage({ title = "Oops! Looks like something went wrong :(", reason, action, actionTitle }:{ title?: string, reason?: string, action: (() => void) | Promise<void> , actionTitle?: string}) {
    return (
        <Alert severity="error" style={{ margin: 20, alignItems: "center" }}
            action={<ErrorMessageAction action={action} actionTitle={actionTitle} />}>
            <AlertTitle>{title}</AlertTitle>
            {reason &&
            <Box component="span" display="block">{reason}</Box>}
        </Alert>
    );
}

const loadingPhrases = [
    'First, you take the dinglepop',
    'You smooth it out with a bunch of schleem',
    'The schleem is then repurposed for later batches',
    'Then you take the dinglebop and push it through the grumbo',
    "It's important that the fleeb is rubbed",
    'A Shlami shows up and he rubs it, and spits on it',
    "There's several hizzards in the way.",
    'The blaffs rub against the chumbles',
    'That leaves you with a regular old plumbus!']

function Phase({ value }: { value: string }) {
    switch (value) {
        case "Preparing":
            return <div>Preparing...</div>;
        case "Pending":
            return <div>Deploying image</div>;
        case "Running":
            return <div>Creating your custom domain</div>;
    }
    return null;
}

export function Loading({ phase, retry = 0 }: { phase?: string, retry?: number }) {
    const [phrase, setPhrase] = useState(loadingPhrases[0]);
    const [props, set] = useSpring(() => ({ opacity: 1 }));

    useInterval(() => {
        set({ opacity: 0 });

        setTimeout(function () { setPhrase(loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)]); }, 500);
        setTimeout(function () { set({ opacity: 1 }); }, 1000);
    }, 3000);

    return (
        <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center", flexDirection: "column", textAlign: "center" }}>
            <Typography variant="h3">Please wait, because</Typography>
            <animated.h1 style={props}>{phrase}</animated.h1>
            {(retry > 10) &&
                <div>It looks like it takes longer than expected to load. Please be patient :)</div>}
            {phase &&
                <Phase value={phase} />}
        </div>
    );
}

export function AdminPanel({ client }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    return (
        <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center"}}>
            <Wrapper client={client} send={send} details={details}>
                <div>
                <iframe src="http://playground-dev.substrate.test/grafana/dashboard-solo/new?from=1598506143076&to=1598527743076&orgId=1&panelId=2" width="600" height="400" frameborder="0"></iframe>
                </div>
            </Wrapper>
        </div>
    );
}

export function TheiaInstance({ uuid, embedded = false, client }: { uuid: string, embedded: boolean, client: Client }) {
    const maxRetries = 5*60;
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    const ref = useRef();
    const user = details?.user;
    const [data, setData] = useState({ type: "LOADING", phase: "Preparing" });

    useEffect(() => {
        const responder = new Responder(uuid, o => {
            const el = ref.current;
            if (el) {
                el.contentWindow.postMessage(o, "*")
            } else {
                console.error("No accessible iframe instance");
            }
        });

        const processMessage = o => {
            const {type, data} = o.data;
            switch (type) {
                case "extension-advertise":
                    if (data.online) {
                        responder.announce();
                    } else {
                        responder.unannounce();
                    }
                    break;
                case "extension-online":
                    responder.announce();
                    responder.setStatus(true);
                    break;
                case "extension-offline":
                    responder.setStatus(false);
                    /* TODO ignore offline for now, too trigger happy
                    setData({type: "ERROR", value: "Instance went offline", action: () => navigateToHomepage(history)});
                    responder.unannounce();*/
                    break;
                case "extension-answer-offline":
                case "extension-answer-error":
                    console.error("Error while processing message", o);
                case "extension-answer":
                    // Got an answer from the instance, respond back
                    responder.respond(o.data);
                    break;
                default:
                    console.error(`Unknown instance message type ${type}`, o);
                    break;
            }
        };
        window.addEventListener('message', processMessage, false);
        return () => {
            window.removeEventListener('message', processMessage, false);
            responder.close();
        }
    }, []);

    useEffect(() => {
        async function fetchData() {
            const { result, error } = await client.getInstanceDetails(uuid);
            if (error) {
                // This instance doesn't exist
                setData({ type: "ERROR", value: "Couldn't locate the theia instance", action: () => navigateToHomepage(history) });
                return;
            }

            const phase = result?.pod?.details?.status?.phase;
            if (phase == "Running" || phase == "Pending") {
                const containerStatuses = result?.pod?.details?.status?.containerStatuses;
                if (containerStatuses?.length > 0) {
                    const state = containerStatuses[0].state;
                    const reason = state?.waiting?.reason;
                    if (reason === "CrashLoopBackOff" || reason === "ErrImagePull" || reason === "ImagePullBackOff" || reason === "InvalidImageName") {
                        setData({ type: "ERROR", value: state?.waiting?.message, action: () => navigateToHomepage(history) });
                        return;
                    }
                }
                // Check URL is fine
                const url = result.url;
                if ((await fetchWithTimeout(url)).ok) {
                    setData({ type: "SUCCESS", url: url });
                    return;
                }
            }

            const retry = data.retry ?? 0;
            if (retry < maxRetries) {
                setTimeout(() => setData({ type: "LOADING", phase: phase, retry: retry + 1 }), 1000);
            } else if (retry == maxRetries) {
                setData({ type: "ERROR", value: "Couldn't access the theia instance in time", action: () => navigateToHomepage(history) });
            }
        }

        if (user && data.type != "ERROR" && data.type != "SUCCESS") {
            fetchData();
        }
    }, [data, uuid, user]);

    function Content({data}) {
        if (data.type == 'ERROR') {
            return <ErrorMessage reason={data.value} action={data.action} />;
        } else {
            return <Loading phase={data.phase} retry={data.retry} />;
        }
    }

    if (data.type == "SUCCESS") {
        return <iframe ref={ref} src={data.url} frameBorder="0" width="100%" height="100%"></iframe>
    } else {
        return (
        <Wrapper client={client} send={send} details={details} embedded={embedded}>
            <Container style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                    {(details == null || user)
                    ? <Content data={data} />
                    : <LoginPanel />}
                </Paper>
            </Container>
        </Wrapper>
        );
    }
}

export function TheiaPanel({ client }) {
    const { uuid } = useParams();

    return (
    <div style={{display: "flex", width: "100vw", height: "100vh"}}>
        <TheiaInstance client={client} uuid={uuid} />
    </div>
    );
}

function login(): void {
    localStorage.setItem('login', "true");
    window.location.href = "/api/login/github";
}

function Terms({ show, set, hide }) {
    return (
    <Dialog open={show} maxWidth="md">
        <DialogTitle>Terms</DialogTitle>
        <DialogContent>
            <DialogContentText id="alert-dialog-description">
                <span dangerouslySetInnerHTML={{__html:marked(terms)}}></span>
            </DialogContentText>
            <Button onClick={() => {set(); hide();}}>ACCEPT</Button>
            <Button onClick={hide}>CLOSE</Button>
        </DialogContent>
    </Dialog>
    );
}

function LoginPanel() {
    const [previousTermsHash, setTermsHash] = useLocalStorage('termsApproved', "");
    const [showTerms, setVisibleTerms] = useState(false);
    const termsApproved = previousTermsHash == termsHash;
    return (
        <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", justifyContent: "center", flexDirection: "column"}}>
            <Typography variant="h3" style= {{ textAlign: "center" }}>
                You must log in to use Playground
            </Typography>
            <Terms show={showTerms} set={() => setTermsHash(termsHash)} hide={() => setVisibleTerms(false)} />
            {termsApproved
            ?<Button style={{ marginTop: 40 }} startIcon={<GitHubIcon />} onClick={login} color="primary" variant="contained" disableElevation disabled={!termsApproved}>LOGIN</Button>
            :<Button onClick={() => setVisibleTerms(true)}>Show terms</Button>}
        </Container>);
}

function Nav({ client, send, details, toggleDetails }) {
    const user = details?.user;
    const history = useHistory();
    const [anchorEl, setAnchorEl] = React.useState(null);
    const open = Boolean(anchorEl);
    const handleMenu = (event) => {
        setAnchorEl(event.currentTarget);
      };
    
      const handleClose = () => {
        setAnchorEl(null);
      };
    const logged = details != null && user;
    return (
        <AppBar position="sticky">
            <Toolbar style={{ justifyContent: "space-between" }}>
                <Typography variant="h6">
                    <Button onClick={() => navigateToHomepage(history)}>Playground</Button>
                </Typography>
                <div style={{display: "flex", alignItems: "center"}}>
                    <IconButton
                        onClick={() => window.open("https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true")}
                    >
                        <FeedbackIcon />
                    </IconButton>
                    {logged
                        ? <div style={{paddingLeft: 12}}>
                            <IconButton
                                aria-label="account of current user"
                                aria-controls="menu-appbar"
                                aria-haspopup="true"
                                onClick={handleMenu}
                                color="inherit"
                            >
                                <Badge color="secondary" variant={user.admin ? "standard" : "dot"} invisible={!user.parity}>
                                    <Avatar alt={user.username} src={user.avatar} />
                                </Badge>
                            </IconButton>
                            <Menu
                                id="menu-appbar"
                                anchorEl={anchorEl}
                                anchorOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                                }}
                                keepMounted
                                transformOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                                }}
                                open={open}
                                onClose={handleClose}
                            >
                                <MenuItem onClick={async () => {handleClose(); await navigateToAdmin(history)}}>ADMIN</MenuItem>
                                <MenuItem onClick={async () => {handleClose(); await client.logout(); await navigateToHomepage(history); send(restart)}}>LOGOUT</MenuItem>
                            </Menu>
                        </div>
                        : <Button onClick={login} startIcon={<GitHubIcon />}>LOGIN</Button>}
                </div>
            </Toolbar>
        </AppBar>
    );
}

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        root: {
            '& > * + *': {
                marginLeft: theme.spacing(2),
            },
        },
    }),
);

function TemplateSelector({templates, onSelect, onRetryClick, state, user}) {
    const publicTemplates = templates.filter(t => t.public);
    const [selection, select] = useState(publicTemplates[0]);
    const templatesAvailable = templates?.length > 0;
    const classes = useStyles();
    const imageName = selection.image.split(":")[0];
    return (
    <React.Fragment>
        <Typography variant="h5" style={{padding: 20}}>Select a template</Typography>
        <Divider orientation="horizontal" />
        <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
            {(!state.matches(failed) && templatesAvailable)
                ? <div style={{display: "flex", flex: 1, flexDirection: "row", minHeight: 0, height: "100%"}}>
                    <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                        {publicTemplates.map((template, index: number) => (
                        <ListItem button key={index} selected={selection.id === template.id} onClick={() => select(template)}>
                            <ListItemText primary={template.name} />
                        </ListItem>
                        ))}
                    </List>
                    <Divider flexItem={true} orientation={"vertical"} light={true} />
                    {selection &&
                    <div style={{flex: 1, marginLeft: 20, paddingRight: 20, overflow: "auto", textAlign: "left"}}>
                        <Typography>
                            <span dangerouslySetInnerHTML={{__html:marked(selection.description)}}></span>
                        </Typography>
                        <Divider orientation={"horizontal"} light={true} />
                        <Typography className={classes.root} variant="overline">
                            Built using the following
                            <Link
                                        href={`https://hub.docker.com/r/${imageName}/tags`}
                                        rel="noreferrer"
                                        variant="inherit"
                                        style={{ margin: 5 }}>
                                        image
                            </Link>
                                </Typography>
                            </div>}
                    </div>
                    : <ErrorMessage reason="Can't find any template. Is the templates configuration incorrect." action={onRetryClick} />
                }
            </Container>
            <Divider orientation="horizontal" />
            <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                <Button onClick={() => onSelect(selection.id)} color="primary" variant="contained" disableElevation disabled={user == null || (!templatesAvailable || state.matches(failed))}>
                    Create
                </Button>
            </Container>
        </React.Fragment>
    );
}

function EnvTable({ envs }) {
    return (
        <TableContainer component={Paper}>
            <Table size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell align="right">Value</TableCell>
                    </TableRow>
                </TableHead>
                {envs &&
                    <TableBody>
                        {envs.map((env) => (
                            <TableRow key={env.name}>
                                <TableCell component="th" scope="row">
                                    {env.name}
                                </TableCell>
                                <TableCell align="right">{env.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                }
            </Table>
        </TableContainer>
    );
}

function PortsTable({ ports }) {
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
                        {ports.map((port) => (
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

function InstanceDetails({ instance }) {
    const { instance_uuid, pod, template } = instance;
    const { name, runtime } = template;
    const { env, ports } = runtime;
    const status = pod?.details?.status;
    const containerStatuses = status?.containerStatuses;
    let reason;
    if (containerStatuses?.length > 0) {
        const state = containerStatuses[0].state;
        reason = state?.waiting?.reason;
    }

    return (
        <Card style={{ margin: 20 }} variant="outlined">
            <CardContent>
                <Typography>
                    {name} ({instance_uuid})
                </Typography>
                {status?.startTime &&
                <Typography color="textSecondary" gutterBottom>
                Started at {status?.startTime}
                </Typography>
                }
                <Typography color="textSecondary" gutterBottom>
                Phase: <em>{status?.phase}</em> {reason && `(${reason})`}
                </Typography>
                <div style={{display: "flex", paddingTop: 20}}>
                    <div style={{flex: 1, paddingRight: 10}}>
                        <Typography variant="h6" id="tableTitle" component="div">
                        Environment
                        </Typography>
                        <EnvTable envs={env} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <Typography variant="h6" id="tableTitle" component="div">
                            Ports
                        </Typography>
                        <PortsTable ports={ports} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function ExistingInstances({instances, onStopClick, onConnectClick}) {
     // A single instance per user is supported for now
     //    const runningInstances = instances?.filter(instance => instance?.pod?.details?.status?.phase === "Running");
    const instance = instances[0];
    const status = instance?.pod?.details?.status;
    return (
    <React.Fragment>
        <Typography variant="h5" style={{padding: 20}}>Existing instance</Typography>
        <Divider orientation="horizontal" />
        <Container style={{display: "flex", flex: 1, padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
            <InstanceDetails instance={instance} />
        </Container>
        <Divider orientation="horizontal" />
        <Container style={{display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10}}>
            <div>
                <Button style={{marginRight: 10}} onClick={() => onStopClick(instance)} color="secondary" variant="outlined" disableElevation>
                    Stop
                </Button>
                <Button onClick={() => onConnectClick(instance)} disabled={status?.phase != "Running"} color="primary" variant="contained" disableElevation>
                    Connect
                </Button>
                </div>
            </Container>
        </React.Fragment>
    );
}

export function MainPanel({ client }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);

    const details = state.context.details;

    function Content() {
        if (state.matches(logged)) {
            if (details?.instances?.length > 0) {
                return <ExistingInstances onConnectClick={(instance) => navigateToInstance(history, instance.instance_uuid)} onStopClick={(instance) => send(stop, {instance: instance})} instances={details.instances} />;
            } else if (details?.user) {
                return <TemplateSelector state={state} user={details.user} templates={details.templates} onRetryClick={() => send(restart)} onSelect={(template) => send(deploy, { template: template })} onErrorClick={() => send(restart)} />;
            } else {
                return <LoginPanel />;
            }
        } else if (state.matches(setup) || state.matches(stopping) || state.matches(deploying)) {
            return <Loading />;
        } else if (state.matches(failed)) {
            if (state.context?.data?.instances) {
                const instance = state.context?.data?.instances[0];
                return <ErrorMessage title="Quota reached" actionTitle="Shoot it" reason="Your maximum number of instances concurrently running has been reached" action={() => send(stop, {instance: instance})} />;
            } else {
                return <ErrorMessage reason={state.context.error?.toString() || "Unknown error"} action={() => send(restart)} />;
            }
        } else if (details?.instances?.length + details?.templates?.length == 0) {
            return <ErrorMessage reason={"No templates"} action={() => send(restart)} />;
        } else {
            return <div>Unknown state: ${state.value}</div>;
        }
    }

    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
            <Wrapper client={client} send={send} details={details}>
                <Container style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                        <Content />
                    </Paper>
                </Container>
            </Wrapper>
        </div>
    );
}

export function Wrapper({ client, send, details, embedded = false, children}) {
    const [showDetails, setDetails] = useState(false);
    function toggleDetails() { setDetails(!showDetails); }
    return (
        <div style={{display: "flex", flexDirection: "column", width: "inherit"}}>
            <Dialog open={showDetails} onClose={toggleDetails}>
                <DialogTitle>Playground</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        Version: {details?.version}
                    </DialogContentText>
                    <DialogContentText id="alert-dialog-description">
                        Started at: {details?.details?.status?.startTime}
                    </DialogContentText>
                </DialogContent>
            </Dialog>

            {!embedded &&
            <Nav client={client} send={send} details={details} toggleDetails={toggleDetails} />}

            <Fade in appear>
                <Container style={{ display: "flex", flex: "1", alignItems: "center" }}>
                    {children}
                </Container>
            </Fade>

            {!embedded &&
            <Container style={{display: "flex", justifyContent: "center"}} component="footer" maxWidth={false}>
                <Link
                    href="https://www.parity.io/privacy/"
                    rel="noreferrer"
                    variant="inherit"
                    style={{ margin: 15 }}>
                    Privacy Policy
                </Link>
            </Container>}

        </div>
    );
}
