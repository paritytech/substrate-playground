import React, { useState } from "react";
import { useSpring, animated } from 'react-spring'
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import marked from 'marked';
import { useHover, useInterval, useWindowMaxDimension } from './hooks';
import { useLifecycle, checking, deploy, deployed, deploying, failed, initial, restart, show } from './lifecycle';
import frontendImage from './../public/help/front-end.png';
import initialImage from './../public/help/initial.png';
import newTerminalImage from './../public/help/new-terminal.png';
import polkadotJSAppsImage from './../public/help/polkadotjs-apps.png';
import terminalFrontendImage from './../public/help/terminal-front-end.png';
import terminalFrontendServeImage from './../public/help/terminal-front-end-serve.png';
import terminalNodeImage from './../public/help/terminal-node.png';

export function HelpPanel({open, onClose}: {open: boolean, onClose: () => void}) {
    return (
        <Dialog aria-labelledby="help-dialog" open={open} onClose={onClose} scroll="paper" maxWidth="lg">
            <DialogTitle>Getting started with the playground</DialogTitle>
            <DialogContent dividers={true} style={{display: "flex", flexDirection: "column", alignItems: "center", padding: 100}}>
                <DialogContentText>
                    Playground is the simplest way to get started with Substrate.
                    From the comfort of your browser, hack and start a remotely-accessible node.
                    It gives you access to an IDE similar to VS Code, with full terminal support.
                    <br />
                    This help page will guide you through the process of starting a stock node and accessing it via external web UIs.
                    <br />
                    To give it a try, just click the <em>Experiment!</em> button.
                </DialogContentText>
                <img src={initialImage} style={{width: 800}} />
                <DialogContentText style={{paddingTop: 50}}>
                    First, create a new terminal.
                </DialogContentText>
                <img src={newTerminalImage} style={{width: 300}} />
                <DialogContentText style={{paddingTop: 50}}>
                    This terminal will host our new Substrate node.
                    It can be started with the following command: <code>./target/release/node-template --dev --ws-external</code>
                </DialogContentText>
                <img src={terminalNodeImage} style={{width: 800}} />
                <DialogContentText style={{paddingTop: 50}}>
                    Create a second terminal.
                    This terminal will host the HTTP server serving the code from <code>substrate-front-end-template</code>.
                    This can be done by executing the following command: <code>yarn build && yarn serve</code>
                </DialogContentText>
                <img src={terminalFrontendImage} style={{width: 800}} />
                <DialogContentText style={{paddingTop: 50}}>
                    Wait for the following output before proceding to the next step.
                </DialogContentText>
                <img src={terminalFrontendServeImage} style={{width: 500}} />
                <DialogContentText style={{paddingTop: 50}}>
                    The regular PolkadotJS Apps can be used to browse your node. Just follow the <em>Polkadot Apps</em> link.
                </DialogContentText>
                <img src={polkadotJSAppsImage} style={{width: 500}} />
                <DialogContentText style={{paddingTop: 50}}>
                    Similarly, you can access the front-end template. Just follow the <em>Front end</em> link.
                </DialogContentText>
                <img src={frontendImage} style={{width: 800}} />
            </DialogContent>
        </Dialog>);
}

export function Background({isHovered}: {isHovered: boolean}) {
    const blurFactor = isHovered ? 0 : 10;
    const dimension = useWindowMaxDimension();
    return (
        <React.Fragment>
            <div className="box-bg box-fullscreen bg-screen" style={{filter: `blur(${blurFactor}px)`}}></div>
            <div className="box-bg box-fullscreen">
                <div id="svgBox" className="box-svg" data-state={isHovered ? 2 : 1} style={{width: dimension, height: dimension}}>
                    <svg id="svg" width={dimension} height={dimension} viewBox="0 0 1535 1535" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 483.5H1535" stroke="#C4C4C4" strokeWidth="120"/>
                        <path d="M0 820H1535" stroke="#DBDCDC" strokeWidth="120"/>
                        <path d="M0 1363.5H1535" stroke="#DBDCDC" strokeWidth="120"/>
                        <path d="M0 130.5H1535" stroke="#FF1864"/>
                        <path d="M0 249.5H1535" stroke="#C4C4C4"/>
                        <path d="M0 397.5H1535" stroke="#FF1864"/>
                        <path d="M0 513.5H1535" stroke="#000000"/>
                        <path d="M0 620.5H1535" stroke="#C4C4C4"/>
                        <path d="M0 688.5H1535" stroke="#6E6E6E"/>
                        <path d="M0 756.5H1535" stroke="#FF1864"/>
                        <path d="M0 921.5H1535" stroke="#C4C4C4"/>
                        <path d="M0 850H1535" stroke="#FF1864"/>
                        <path d="M0 1097.5H1535" stroke="#000000"/>
                        <path d="M0 1196.5H1535" stroke="#C4C4C4"/>
                        <path d="M0 1253.5H1535" stroke="#FF1864"/>
                        <path d="M0 1273.5H1535" stroke="#FF1864"/>
                        <path d="M0 1293.5H1535" stroke="#C4C4C4"/>

                        <path d="M0 938.5H1535" stroke="#000000"/>
                        <path d="M0 738.5H1535" stroke="#FFFFFF"/>
                        <path d="M0 338.5H1535" stroke="#FF1864"/>
                    </svg>
                </div>
            </div>
        </React.Fragment>);
}

export function ErrorMessage({reason, onClick}: {reason?: string, onClick: () => void}) {
    return (
        <div className="box-fullscreen box-text">
            <h1>
                Oops! Looks like something went wrong :(
            </h1>
            {reason &&
            <h2>{reason}</h2>
            }
            <div className="cta" onClick={onClick}>
                <span>Try again!</span>
            </div>
        </div>
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

function Phase( {value}: {value: string}) {
    switch (value) {
        case "Pending":
            return <div>Deploying image</div>;
        case "Running":
            return <div>Creating your custom domain</div>;
    }
    return null;
}

export function Loading({phase}: {phase?: string}) {
    const [phrase, setPhrase] = useState(loadingPhrases[0]);
    const [props, set] = useSpring(() => ({opacity: 1}));

    useInterval(() => {
        set({ opacity: 0 });

        setTimeout(function(){ setPhrase(loadingPhrases[Math.floor(Math.random()*loadingPhrases.length)]); }, 500);
        setTimeout(function(){ set({ opacity: 1 }); }, 1000);
    }, 3000);

    return (
        <div className="box-fullscreen box-text">
            <span>Please wait, because</span>
            <animated.h1 style={props}>{phrase}</animated.h1>
            {false &&
                <div>It looks like it takes longer than expected to load. Please be patient :)</div>}
            {phase &&
                <Phase value={phase} />}
        </div>
    );
}

export function Theia({url}: {url: string}) {
    return (
        <div>
            <iframe src={url} frameBorder="0" style={{overflow:"hidden",height:"100vh",width:"100vm"}} height="100%" width="100%"></iframe>
        </div>
    );
}

function Nav({setShowHelp}: {setShowHelp: (_: boolean) => void}) {
    return (
        <div style={{fontSize: 20, fontWeight: "bold", color: "#FF1864",padding: "0.9em 2em 1em 3.3em", position: "fixed", top: 20, right: 20, cursor: "pointer"}}>
            <span style={{padding: 10}} onClick={() => window.open("https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true")}>Send Feedback</span>
            <span onClick={() => setShowHelp(true)}>Help</span>
        </div>
    );
}

function TemplateSelector({templates, hoverRef, onSelect, onErrorClick}) {
    const [selection, select] = useState(templates[0]);
    const border = "1px solid #3c3c3c";
    if (templates.length != 0) {
        return (
            <div ref={hoverRef} style={{display: "flex", flexDirection: "column", backgroundColor: "black", width: "50vw", height: "50vh"}}>
                <Typography variant="h5" noWrap style={{padding: 10}}>Select a template</Typography>
                <div style={{display: "flex", flexDirection: "row", flex: 1, borderTop: border, borderBottom: border, minHeight: 0}}>
                    <List style={{borderRight: border, overflow: "auto"}}>
                        {templates.map((template, index: number) => (
                        <ListItem button key={index} onClick={() => select(template)}>
                            <ListItemText primary={template.name} />
                        </ListItem>
                        ))}
                    </List>
                    {selection &&
                    <Typography component="div" style={{margin: 20, overflow: "auto"}}>
                        <div dangerouslySetInnerHTML={{__html:marked(selection.description)}}></div>
                    </Typography>}
                </div>
                <div style={{display: "flex", justifyContent: "flex-end", paddingRight: 20, paddingTop: 10, paddingBottom: 10}}>
                    <Button variant="contained" color="primary" onClick={() => onSelect(selection.id)}>
                        Create
                    </Button>
                </div>
            </div>
        );
    } else {
        return <ErrorMessage reason={"No template available"} onClick={onErrorClick} />
    }
}

function EnvTable({envs}) {
    return (
    <TableContainer component={Paper}>
        <Table size="small" aria-label="a dense table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Value</TableCell>
            </TableRow>
          </TableHead>
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
        </Table>
      </TableContainer>
    );
}

function PortsTable({ports}) {
    return (
    <TableContainer component={Paper}>
        <Table size="small" aria-label="a dense table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ports.map((port) => (
              <TableRow key={port.name}>
                <TableCell component="th" scope="row">
                  {port.name}
                </TableCell>
                <TableCell align="right">{port.port}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
}

function Instance({instance}) {
    const {instance_uuid, started_at, template, phase} = instance;
    const {image, name, description, runtime} = template;
    const {env, ports} = runtime;
    return (
    <Card style={{margin: 20}} variant="outlined">
        <CardContent>
            <Typography>
            {name} ({instance_uuid})
            </Typography>
            <Typography color="textSecondary" gutterBottom>
            Started at {started_at}, {phase}
            </Typography>
            <Typography color="textSecondary">
            {image}
            </Typography>
            <Typography color="textSecondary">
            {description}
            </Typography>
            <div style={{display: "flex", paddingTop: 20}}>
                <div style={{flex: 1, paddingRight: 10}}>
                    <Typography variant="h6" id="tableTitle" component="div">
                    Environment
                    </Typography>
                    <EnvTable envs={env} />
                </div>
                <div style={{flex: 1}}>
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

function ExistingInstances({instances, onClick, hoverRef}) {
    const instance = instances[0]; // A single instance per user is supported for now
    return (
    <Dialog
        open={true}
        scroll={"paper"}
        aria-labelledby="scroll-dialog-title"
        aria-describedby="scroll-dialog-description"
    >
        <DialogTitle id="scroll-dialog-title">Running instance</DialogTitle>
        <DialogContent dividers={true}>
            <Instance instance={instance} />
        </DialogContent>
        <DialogActions ref={hoverRef}>
            <Button onClick={() => onClick(instance)} color="primary">
                Connect
            </Button>
        </DialogActions>
    </Dialog>
    );
}

export function MainPanel() {
    const [state, send] = useLifecycle();
    const [showHelp, setShowHelp] = useState(false);
    const [hoverRef, isHovered] = useHover<string>();

    if (state.matches(deployed)) {
        return <Theia url={state.context.instanceURL} />;
    } else {
        const {instances, templates, phase, error} = state.context;
        return (
            <React.Fragment>
                <Background isHovered={isHovered} />

                <Nav setShowHelp={setShowHelp} />

                <HelpPanel open={showHelp} onClose={() => setShowHelp(false)} />

                {state.matches(initial) &&
                    <div className="box-fullscreen box-text">
                        {instances?.length == 0
                            ? <TemplateSelector hoverRef={hoverRef} templates={templates} onSelect={(template) => {send(deploy, {template: template});}} onErrorClick={() => send(restart)} />
                            : <ExistingInstances hoverRef={hoverRef} onClick={(instance) => send(show, {instance: instance})} instances={instances} />
                        }
                    </div>
                }

                {state.matches(deploying) || state.matches(checking) &&
                    <Loading phase={phase} />
                }
    
                {state.matches(failed) &&
                    <ErrorMessage reason={error} onClick={() => send(restart)} />
                }
            </React.Fragment>
        );
    }
}