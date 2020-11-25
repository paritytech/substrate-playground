import React, { useEffect, useRef, useState } from "react";
import marked from 'marked';
import { useHistory, useLocation } from "react-router-dom";
import { useSpring, animated } from 'react-spring'
import { Client } from "@substrate/playground-api";
import { Alert, AlertTitle } from '@material-ui/lab';
import AppBar from '@material-ui/core/AppBar';
import Avatar from '@material-ui/core/Avatar';
import Badge from '@material-ui/core/Badge';
import Button from '@material-ui/core/Button';
import Box from '@material-ui/core/Box';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CircularProgress from '@material-ui/core/CircularProgress';
import Container from "@material-ui/core/Container";
import Divider from '@material-ui/core/Divider';
import Fade from '@material-ui/core/Fade';
import IconButton from '@material-ui/core/IconButton';
import Link from '@material-ui/core/Link';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import GitHubIcon from '@material-ui/icons/GitHub';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { Responder } from "./connect";
import { useInterval } from './hooks';
import { useLifecycle, deploy, deploying, failed, logged, logout, restart, setup, stop, stopping } from './lifecycle';
import { fetchWithTimeout, navigateToAdmin, navigateToStats, navigateToInstance } from "./utils";

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

export function ErrorMessage({ title = "Oops! Looks like something went wrong :(", reason, action, actionTitle }:{ title?: string, reason?: string, action?: (() => void) | Promise<void> , actionTitle?: string}) {
    return (
        <Alert severity="error" style={{ margin: 20, alignItems: "center" }}
            action={<ErrorMessageAction action={action} actionTitle={actionTitle} />}>
            <AlertTitle style={{margin: "unset"}}>{title}</AlertTitle>
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

export function Panel({ client, children }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
            <Wrapper send={send} details={details}>
                {children}
            </Wrapper>
        </div>
        );
  }

export function NotFoundPanel({client, message}: {message?: string, client: Client}) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    return (
        <Panel client={client}>
            <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                    <ErrorMessage title={message || "Oups"} action={() => send(restart)} actionTitle="GO HOME" />
                </Paper>
            </Container>
        </Panel>
        );
}

function login(): void {
    localStorage.setItem('login', "true");
    window.location.href = "/api/login/github";
}

function Nav({ send, details }) {
    const user = details?.user;
    const history = useHistory();
    const [anchorEl, setAnchorEl] = React.useState(null);
    const open = Boolean(anchorEl);
    const handleMenu = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);
    const [anchorElAdmin, setAnchorElAdmin] = React.useState(null);
    const openAdmin = Boolean(anchorElAdmin);
    const handleMenuAdmin = (event) => setAnchorElAdmin(event.currentTarget);
    const handleCloseAdmin = () => setAnchorElAdmin(null);

    const logged = details != null && user;
    return (
        <AppBar position="sticky">
            <Toolbar style={{ justifyContent: "space-between" }} variant="dense">
                <Typography variant="h6">
                    <Button onClick={() => send(restart)}>Playground</Button>
                </Typography>
                <div style={{display: "flex", alignItems: "center"}}>
                    {user?.admin &&
                    <div style={{paddingLeft: 12}}>
                        <IconButton
                            aria-label="account of current user"
                            aria-controls="menu-admin"
                            aria-haspopup="true"
                            onClick={handleMenuAdmin}
                            color="inherit"
                            size="small"
                        >
                            <MoreVertIcon />
                        </IconButton>
                        <Menu
                            id="menu-admin"
                            anchorEl={anchorElAdmin}
                            anchorOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                            }}
                            keepMounted
                            transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                            }}
                            open={openAdmin}
                            onClose={handleCloseAdmin}
                        >
                            <MenuItem onClick={async () => {handleCloseAdmin(); await navigateToStats(history)}}>STATS</MenuItem>
                            <MenuItem onClick={async () => {handleCloseAdmin(); await navigateToAdmin(history)}}>ADMIN</MenuItem>
                        </Menu>
                    </div>}
                    {logged
                        ? <div style={{paddingLeft: 12}}>
                            <IconButton
                                aria-label="account of current user"
                                aria-controls="menu-appbar"
                                aria-haspopup="true"
                                onClick={handleMenu}
                                color="inherit"
                                size="small"
                            >
                                <Badge color="secondary" variant="dot" invisible={!user.admin}>
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
                                <MenuItem onClick={() => window.open("https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true")}>FEEDBACK</MenuItem>
                                <MenuItem onClick={async () => {handleClose(); send(logout)}}>LOGOUT</MenuItem>
                            </Menu>
                        </div>
                        : (user === null
                            ? <Button onClick={login} startIcon={<GitHubIcon />}>LOGIN</Button>
                            : <div style={{paddingLeft: 12}}>
                                <IconButton
                                    aria-label="account of current user"
                                    aria-controls="menu-appbar"
                                    aria-haspopup="true"
                                    color="inherit"
                                    size="small"
                                >
                                    <Badge color="secondary" variant="dot" invisible={true}>
                                        <Avatar alt="Not logged">
                                            <GitHubIcon />
                                        </Avatar>
                                    </Badge>
                                </IconButton>
                              </div>)}
                </div>
            </Toolbar>
        </AppBar>
    );
}

export function Wrapper({ send, details, light = false, children}) {
    return (
        <div style={{display: "flex", flexDirection: "column", width: "inherit", height: "inherit"}}>

            <Nav send={send} details={details} />

            <Fade in appear>
                {children}
            </Fade>

            {!light &&
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
