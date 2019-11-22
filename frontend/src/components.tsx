import React, {useState} from "react";
import { State } from 'xstate';
import { useSpring, animated } from 'react-spring'
import { useWindowMaxDimension, useInterval } from './hooks';
import DialogTitle from '@material-ui/core/DialogTitle';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import frontendImage from './../assets/help/front-end.png';
import initialImage from './../assets/help/initial.png';
import newTerminalImage from './../assets/help/new-terminal.png';
import polkadotJSAppsImage from './../assets/help/polkadotjs-apps.png';
import terminalFrontendImage from './../assets/help/terminal-front-end.png';
import terminalFrontendServeImage from './../assets/help/terminal-front-end-serve.png';
import terminalNodeImage from './../assets/help/terminal-node.png';

export function Help({open, onClose}: {open: boolean}) {
    return (<Dialog aria-labelledby="help-dialog" open={open} onClose={onClose} scroll="paper" maxWidth="lg">
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

export function SVGBox({isHovered}: {isHovered: boolean}) {
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

export function ErrorMessage({state, send}: {state: State, send: (name: string) => void}) {
    const reason = state.context.reason || state.event.reason;
    return (
        <div className="box-fullscreen box-text">
            <h1>
                Oops! Looks like something went wrong :(
            </h1>
            <h2>{reason}</h2>
            <div className="cta" onClick={() => {window.history.replaceState(null, "", window.location.pathname); send("RESTART")}}>
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

export function Loading() {
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
        </div>
    );
}