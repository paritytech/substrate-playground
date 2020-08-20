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
import Checkbox from '@material-ui/core/Checkbox';
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
import Zoom from '@material-ui/core/Zoom';
import Fade from '@material-ui/core/Fade';
import { Container } from "@material-ui/core";
import { getInstanceDetails, logout } from "./api";
import { startNode, openFile, gotoLine, cursorMove } from "./commands";
import { Discoverer, Responder } from "./connect";
import { useHover, useInterval, useWindowMaxDimension } from './hooks';
import { useLifecycle, deploy, deploying, failed, logged, restart, setup, stop, stopping } from './lifecycle';
import { fetchWithTimeout, navigateToAdmin, navigateToInstance, navigateToHomepage } from "./utils";

import InputLabel from '@material-ui/core/InputLabel';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';

//https://playground-staging.substrate.dev/login-callback?error=redirect_uri_mismatch&error_description=The+redirect_uri+MUST+match+the+registered+callback+URL+for+this+application.&error_uri=https%3A%2F%2Fdeveloper.github.com%2Fapps%2Fmanaging-oauth-apps%2Ftroubleshooting-authorization-request-errors%2F%23redirect-uri-mismatch&state=secret123
function githubAuthorizationURL(): string {
    return '/api/login/github';
}

export function Background({ state }: { state: string }) {
    const preloading = state == "PRELOADING";
    const loading = state == "LOADING";
    const blurFactor = preloading ? 0 : 10;
    const dimension = useWindowMaxDimension();

    useEffect(() => {
        const className = "loading";
        if (loading) {
            document.body.classList.add(className);
        }
        return () => { document.body.classList.remove(className); }
    });

    return (
        <React.Fragment>
            <div className="box-bg box-fullscreen bg-screen" style={{ filter: `blur(${blurFactor}px)` }}></div>
            <div className="box-bg box-fullscreen">
                <div id="svgBox" className="box-svg" data-state={preloading ? 2 : 1} style={{ width: dimension, height: dimension }}>
                    <svg id="svg" width={dimension} height={dimension} viewBox="0 0 1535 1535" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 483.5H1535" stroke="#C4C4C4" strokeWidth="120" />
                        <path d="M0 820H1535" stroke="#DBDCDC" strokeWidth="120" />
                        <path d="M0 1363.5H1535" stroke="#DBDCDC" strokeWidth="120" />
                        <path d="M0 130.5H1535" stroke="#FF1864" />
                        <path d="M0 249.5H1535" stroke="#C4C4C4" />
                        <path d="M0 397.5H1535" stroke="#FF1864" />
                        <path d="M0 513.5H1535" stroke="#000000" />
                        <path d="M0 620.5H1535" stroke="#C4C4C4" />
                        <path d="M0 688.5H1535" stroke="#6E6E6E" />
                        <path d="M0 756.5H1535" stroke="#FF1864" />
                        <path d="M0 921.5H1535" stroke="#C4C4C4" />
                        <path d="M0 850H1535" stroke="#FF1864" />
                        <path d="M0 1097.5H1535" stroke="#000000" />
                        <path d="M0 1196.5H1535" stroke="#C4C4C4" />
                        <path d="M0 1253.5H1535" stroke="#FF1864" />
                        <path d="M0 1273.5H1535" stroke="#FF1864" />
                        <path d="M0 1293.5H1535" stroke="#C4C4C4" />

                        <path d="M0 938.5H1535" stroke="#000000" />
                        <path d="M0 738.5H1535" stroke="#FFFFFF" />
                        <path d="M0 338.5H1535" stroke="#FF1864" />
                    </svg>
                </div>
            </div>
        </React.Fragment>);
}

export function ErrorMessage({ reason, onClick }: { reason?: string, onClick: () => void }) {
    return (
        <Alert severity="error" style={{ flex: 1, padding: 20, alignItems: "center" }}
            action={<Button onClick={onClick}>TRY AGAIN</Button>}>
            <AlertTitle>Oops! Looks like something went wrong :(</AlertTitle>
            <Box component="span" display="block">{reason}</Box>
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

function useDiscovery() {
    const [instances, setInstances] = useState([]);

    useEffect(() => {
        const refresher = (_) => setInstances(Array.from(discoverer.instances.entries()));
        const discoverer = new Discoverer(refresher, refresher);
        return () => discoverer.close();
    }, []);

    return instances;
}

function InstanceController({ instances }) {
    const [selectedInstance, setInstance] = useState(null);
    const [commands, setCommands] = useState(null);
    const [command, setCommand] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => {
        const onlyInstance = instances.length == 1 ? instances[0] : null;
        if (onlyInstance) {
            selectInstance(onlyInstance[1]);
        }
    }, [instances]);

    async function selectInstance(instance) {
        setInstance(instance);
        const commands = await instance.list();
        setCommands(commands);
    }

    async function executeCommand(command, data) {
        try {
            const result = await selectedInstance.execute(command, data);
            setResult(result);
        } catch (error) {
            console.error(error);
        }
    }

    const handleChange = (event: React.ChangeEvent<{ value: unknown }>) => {
        setCommand(event.target.value as string);
    };

    if (instances.length > 0) {
    return (
    <div style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", margin: 20}}>
        {selectedInstance &&
        <Typography variant="h6">
            Instance #{selectedInstance.uuid}
        </Typography>
        }
        {(instances && !selectedInstance) &&
        <ul>
        {instances.map((value, index) => {
            return (
                <li key={index}>
                    <div>{value[0]}</div>
                    <Checkbox checked={selectedInstance?.uuid == value[0]} onChange={async () => await selectInstance(value[1])}></Checkbox>
                </li>
            );
        })}
        </ul>
        }
        {commands &&
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", margin: 20}}>
            <FormControl style={{minWidth: 120}}>
                <InputLabel id="commands">Commands</InputLabel>
                <Select
                labelId="commands"
                value={command}
                onChange={handleChange}
                >
                {commands.filter(({id, label}) => id && label && label != "").map(({id, label}, index) =>
                     <MenuItem key={id} value={id}>{label}</MenuItem>
                )}
                            </Select>
                        </FormControl>
                        <Button style={{ marginLeft: 40 }} color="primary" variant="contained" disableElevation onClick={() => executeCommand(selectedInstance, command)}>EXECUTE</Button>
                    </div>
                }
                {selectedInstance &&
                    <>
                        <Button style={{ marginTop: 10 }} color="primary" variant="contained" disableElevation onClick={startNode}>START NODE</Button>
                        <div style={{ marginTop: 10 }}>
                            <Button color="primary" variant="contained" disableElevation onClick={gotoLine}>GOTO LINE</Button>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <Button color="primary" variant="contained" disableElevation onClick={cursorMove}>CURSOR MOVE</Button>
                        </div>
                    </>}
            </div>
        );
    } else {
        return (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography variant="h6">
                    No instance detected
            </Typography>
            </div>
        );
    }
}

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

export function AdminPanel() {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location);
    const details = state.context.details;
    return (
        <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center"}}>
            <Wrapper send={send} details={details}>
                <div>
                ADMIN PANEL
                </div>
            </Wrapper>
        </div>
    );
}

export function ControllerPanel() {
    const instances = useDiscovery();
    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <InstanceController instances={instances} />
        </div>
    );
}

export function TheiaInstance({ uuid }) {
    const maxRetries = 5*60;
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location);
    const details = state.context.details;
    const ref = useRef();
    const user = details?.user;
    const [data, setData] = useState({ type: "LOADING" });

    useEffect(() => {
        const responder = new Responder(uuid, (o) => {
            const el = ref.current;
            if (el) {
                el.contentWindow.postMessage(o.data, "*")
            } else {
                console.error("No accessible iframe instance");
            }
        });

        const processMessage = (o) => {
            const type = o.data.type;
            switch (type) {
                case "extension-advertise":
                    if (o.data.data.online) {
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
                    console.error(`Error while processing message`, o);
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
        return () => { responder.close(); window.removeEventListener('message', processMessage, false); }
    }, []);

    useEffect(() => {
        async function fetchData() {
            const { result, error } = await getInstanceDetails(uuid);
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

    if (data.type == "SUCCESS") {
        return <iframe ref={ref} src={data.url} frameBorder="0" width="100%" height="100%"></iframe>
    } else {
        if (details == null || user) {
            return <Wrapper send={send} details={details} state={data} />;
        } else {
            return <Wrapper send={send} details={details}><LoginPanel /></Wrapper>;
        }
    }
}

export function TheiaPanel() {
    const query = useQuery();
    const controller = query.get("controller");
    const files = query.get("files");
    const { uuid } = useParams();
    const instances = useDiscovery();

    useEffect(() => {
        const onlyInstance = instances.length == 1 ? instances[0] : null;
        if (onlyInstance && files) {
            decodeURIComponent(files).split(",").forEach(file => openFile(onlyInstance[1], { type: "URI", data: file }));
        }
    }, [instances]);

    return (
    <div style={{display: "flex", width: "100vw", height: "100vh"}}>
    {controller != null
        ?
        <>
            <InstanceController instances={instances} />
            <div style={{display: "flex", flex: 1}}>
                <TheiaInstance uuid={uuid} />
            </div>
        </>
        : <TheiaInstance uuid={uuid} />
    }
    </div>
    );
}

function login(): void {
    window.location.href = githubAuthorizationURL();
}

function LoginPanel() {
    return (
        <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", justifyContent: "center", flexDirection: "column"}}>
            <Typography variant="h3" style= {{ textAlign: "center" }}>
                You must be logged to use Playground
            </Typography>
            <Button style={{ marginTop: 40 }} startIcon={<GitHubIcon />} onClick={login} color="primary" variant="contained" disableElevation>LOGIN</Button>
        </Container>);
}

function Nav({ send, details, toggleDetails }) {
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
        <AppBar position="fixed">
            <Toolbar style={{ justifyContent: "space-between" }}>
                <Typography variant="h6">
                    Playground
                </Typography>
                <div style={{display: "flex", alignItems: "center"}}>
                    <IconButton
                        onClick={() => window.open("https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true")}
                    >
                        <FeedbackIcon />
                    </IconButton>
                    <IconButton
                        onClick={toggleDetails}
                    >
                        <HelpIcon />
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
                                <MenuItem onClick={async () => {handleClose(); await logout(); send(restart)}}>LOGOUT</MenuItem>
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
                    : <ErrorMessage reason={"Can't find any template. Is the templates configuration incorrect."} onClick={onRetryClick} />
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
        <Card style={{ margin: 20, alignSelf: "baseline" }} variant="outlined">
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
        <Container style={{display: "flex", flex: 1, padding: 0, justifyContent: "center", overflowY: "auto"}}>
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

export function MainPanel({ history, location }) {
    const [state, send] = useLifecycle(history, location);
    const [hoverRef, isHovered] = useHover();

    useEffect(() => {
        // Force refresh each time instances set changes
        const refresh = () => send(restart);
        const discoverer = new Discoverer(refresh, refresh);
        return () => discoverer.close();
    }, []);

    const details = state.context.details;

    function gstate() {
        if (state.matches(setup) || state.matches(stopping) || state.matches(deploying)) {
            return { type: "LOADING" };
        } else if (state.matches(failed)) {
            
            return { type: "ERROR", value: state.context.error, action: () => send(restart) };
        } else if (isHovered) {
            return { type: "PRELOADING" };
        } else {
            if (details?.instances?.length + details?.templates?.length == 0) {
                return { type: "ERROR", value: "No templates", action: () => send(restart) };
            }
        }
    }

    function content() {
        if (state.matches(logged)) {
            if (details?.instances?.length > 0) {
                return <ExistingInstances onConnectClick={(instance) => navigateToInstance(history, instance.instance_uuid)} onStopClick={(instance) => send(stop, {instance: instance})} instances={details.instances} />;
            } else if (details) {
                return <TemplateSelector state={state} user={details.user} templates={details.templates} onRetryClick={() => send(restart)} onSelect={(template) => send(deploy, { template: template })} onErrorClick={() => send(restart)} />;
            } else {
                return <LoginPanel />;
            }
        } else {
            return <div>Unknown state: ${state.value}</div>;
        }
    }

    const conten = content();
    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
            <Wrapper send={send} details={details} state={gstate()}>
                {conten &&
                    <Container style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                        <Paper ref={hoverRef} style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw" }} elevation={3}>
                            {conten}
                        </Paper>
                    </Container>
                }
            </Wrapper>
        </div>
    );
}

function WrappedContent({ state, content }) {
    switch(state?.type) {
        case "ERROR": {
            const { value, action } = state;
            return (
                <Container style={{ display: "flex", alignItems: "center" }}>
                    <ErrorMessage reason={value || "Unknown error"} onClick={action} />
                </Container>
            );
        }
        case "LOADING": {
            const { phase, retry } = state;
            return <Loading phase={phase} retry={retry} />;
        }
        default:
            return <>{content}</>;
    }
}

// state: PRELOADING, LOADING, ERROR (message, action) {type: value:}
export function Wrapper({ send, details, state, children }: {state?: any}) {
    const [showDetails, setDetails] = useState(false);
    function toggleDetails() { setDetails(!showDetails); }
    const type = state?.type;
    return (
        <>
            <Background state={type} />

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

            <Nav send={send} details={details} toggleDetails={toggleDetails} />

            <Fade in appear>
                <WrappedContent state={state} content={children} />
            </Fade>

        </>
    );
}
