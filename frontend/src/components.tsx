import React, { useState } from "react";
import { useSpring, animated } from 'react-spring'
import { Alert, AlertTitle } from '@material-ui/lab';
import AppBar from '@material-ui/core/AppBar';
import Avatar from '@material-ui/core/Avatar';
import Button from '@material-ui/core/Button';
import Box from '@material-ui/core/Box';
import CircularProgress from '@material-ui/core/CircularProgress';
import Container from "@material-ui/core/Container";
import Fade from '@material-ui/core/Fade';
import GitHubIcon from '@material-ui/icons/GitHub';
import IconButton from '@material-ui/core/IconButton';
import Link from '@material-ui/core/Link';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { PlaygroundUser } from "@substrate/playground-client";
import { useInterval } from './hooks';

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

function ErrorMessageAction({action, actionTitle = "TRY AGAIN"}: {action: (() => void) | Promise<void> , actionTitle?: string}): JSX.Element {
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

export function ErrorMessage({ title = "Oops! Looks like something went wrong :(", reason, action, actionTitle }: { title?: string, reason?: string, action: (() => void) | Promise<void> , actionTitle?: string}): JSX.Element {
    return (
        <Alert severity="error" style={{ flex: 1, margin: 20, alignItems: "center" }}
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

function Phase({ value }: { value: string }): JSX.Element {
    switch (value) {
        case "Preparing":
            return <div>Preparing...</div>;
        case "Pending":
            return <div>Deploying image</div>;
        case "Running":
            return <div>Creating your custom domain</div>;
        default:
            return <></>;
    }
}

export function Loading({ phase, retry = 0 }: { phase?: string, retry?: number }): JSX.Element {
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

function Nav({ onPlayground, onStatsClick, onAdminClick, onLogout, user }: { onPlayground: () => void, onStatsClick: () => void, onAdminClick: () => void, onLogout: () => void, user: PlaygroundUser }): JSX.Element  {
    const [anchorEl, setAnchorEl] = React.useState(null);
    const open = Boolean(anchorEl);
    const handleMenu = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);
    const [anchorElAdmin, setAnchorElAdmin] = React.useState(null);
    const openAdmin = Boolean(anchorElAdmin);
    const handleMenuAdmin = (event) => setAnchorElAdmin(event.currentTarget);
    const handleCloseAdmin = () => setAnchorElAdmin(null);
    return (
        <AppBar position="sticky">
            <Toolbar style={{ justifyContent: "space-between" }} variant="dense">
                <Typography variant="h6">
                    <Button onClick={onPlayground}>Playground</Button>
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
                            <MenuItem onClick={async () => {handleCloseAdmin(); onStatsClick();}}>STATS</MenuItem>
                            <MenuItem onClick={async () => {handleCloseAdmin(); onAdminClick();}}>ADMIN</MenuItem>
                        </Menu>
                    </div>}
                    {user
                     ? <div style={{paddingLeft: 12}}>
                     <IconButton
                         aria-label="account of current user"
                         aria-controls="menu-appbar"
                         aria-haspopup="true"
                         onClick={handleMenu}
                         color="inherit"
                         size="small"
                     >
                         <Avatar alt={user.id} src={user.avatar} />
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
                         <MenuItem onClick={async () => {handleClose(); onLogout()}}>LOGOUT</MenuItem>
                     </Menu>
                 </div>
                        :
                        <div style={{paddingLeft: 12}}>
                        <IconButton
                            aria-label="account of current user"
                            aria-controls="menu-appbar"
                            aria-haspopup="true"
                            color="inherit"
                            size="small"
                        >
                            <Avatar alt="Not logged">
                                <GitHubIcon />
                            </Avatar>
                        </IconButton>
                        </div>}
                </div>
            </Toolbar>
        </AppBar>
    );
}

export function Wrapper({ onPlayground, onStatsClick, onAdminClick, onLogout, user, children}: { onPlayground: () => void, onStatsClick: () => void, onAdminClick: () => void, onLogout: () => void, user: PlaygroundUser, children: React.ReactElement}): JSX.Element {
    return (
        <div style={{display: "flex", flexDirection: "column", width: "inherit", height: "inherit"}}>

            <Nav onPlayground={onPlayground} onStatsClick={onStatsClick} onAdminClick={onAdminClick} onLogout={onLogout} user={user} />

            <Fade in appear>
                {children}
            </Fade>

            <Container style={{display: "flex", justifyContent: "center"}} component="footer" maxWidth={false}>
                <Link
                    href="https://www.parity.io/privacy/"
                    rel="noreferrer"
                    variant="inherit"
                    style={{ margin: 15 }}>
                    Privacy Policy
                </Link>
            </Container>

        </div>
    );
}
