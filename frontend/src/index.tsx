import React from "react";
import * as ReactDOM from "react-dom";
import { Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { SVGBox, ErrorMessage, Loading } from './components';
import { useHover } from './hooks';

async function deployDocker(template: string) {
    const response = await fetch(`/api/new?template=${template}`, {
        method: 'GET',
        headers: {'Accept': 'application/json',
                  'Content-Type': 'application/json'}
    });
    const contentType = response.headers.get("content-type");
    if (response.status == 200 && contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    } else {
        return {"reason": response.statusText};
    }
}

async function getDeployment(uuid: string) {
    const response = await fetch(`/api/url?uuid=${uuid}`, {
        method: 'GET',
        headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
        }
    });
    if (response.status == 200) {
        return await response.json();
    } else {
          return {"reason": response.statusText};
    }
}

async function deployAndRedirect(send, template: string) {
    const result = await deployDocker(template);
    if (result && result.status === "ok") {
        const uuid = result.uuid;
        if (!!uuid) {
            send("FETCH", {uuid: uuid});
            window.history.replaceState(null, "", `${window.location.pathname}?uuid=${uuid}`);
        } else {
            send("FAIL", {reason: "Missing id in returned response"});
        }
    } else {
        send("FAIL", {reason: result.reason});
    }
}

const lifecycle = Machine({
    id: 'lifecycle',
    initial: 'initial',
    states: {
        initial: {
          on: { LOAD: 'loading',
                FETCH: 'fetching',
                FAIL: 'error' }
        },
        loading: {
          on: { FETCH: 'fetching',
                FAIL: 'error' }
        },
        fetching: {
            on: { DONE: 'loaded',
                  FAIL: 'error' }
        },
        loaded: {
          on: { RESTART: 'initial' }
        },
        error: {
          on: { RESTART: 'initial' }
        }
    }
});

function rejectAfterTimeout(ms: number) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

function App() {
    const [state, send] = useMachine(lifecycle);
    const [hoverRef, isHovered] = useHover();

    const uuid = new URLSearchParams(window.location.search).get("uuid");
    if (uuid) {
        send("FETCH", {uuid: uuid});
    }

    if (state.matches('fetching')) {
        document.body.classList.add("loading");
        var retries = 0;
        const id = setInterval(async () => {
            const url = `//${state.event.uuid}.playground-staging.substrate.dev`;
            const response = await Promise.race([fetch(url), rejectAfterTimeout(5000)]);
            if (response.status == 200 || response.status == 304) {
                clearInterval(id);
                send("DONE", {url: url});
            } else {
                retries ++;
                if (retries > 60) {
                    clearInterval(id);
                    send("FAIL", {reason: "Failed to access the theia image in time"});
                }
            }
        }, 1000);
    }

    if (state.matches('loaded') || state.matches('error')) {
        document.body.classList.remove("loading");
    }


    let polkadotJSURL = `https://polkadot.js.org/apps/?rpc=wss:${state.event.url}/wss`;
    let frontendURL = `${state.event.url}/front-end`;

    // Landing page
    return (
    <React.Fragment>
        {!state.matches('loaded') &&
            <SVGBox isHovered={isHovered} />
        }
        
        {state.matches('initial') &&
            <div className="box-fullscreen box-text">
                <h1>
                    Start hacking your substrate runtime in a web based VSCode like IDE
                </h1>
                <div ref={hoverRef} className="cta" onClick={() => {send("LOAD"); deployAndRedirect(send, "default")}}>
                    <span>Experiment!</span>
                </div>
            </div>
        }
        {state.matches('loading') || state.matches('fetching') &&
            <Loading />
        }
        {state.matches('loaded') &&
            <div>
                <div>
                    <a href={polkadotJSURL}>Polkadot Apps</a>
                    <a href={frontendURL}>Front end</a>
                </div>
                <iframe src={state.event.url} onError={() => send("FAIL", {reason: "Failed to load theia"})} frameBorder="0" style={{overflow:"hidden",height:"100vh",width:"100vm"}} height="100%" width="100%"></iframe>
            </div>
        }

        {state.matches('error') &&
            <ErrorMessage state={state} send={send} />
        }
        </React.Fragment>
    );

}

ReactDOM.render(
    <App />,
    document.getElementById("root")
);
