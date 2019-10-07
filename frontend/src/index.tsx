import React from "react";
import * as ReactDOM from "react-dom";
import { Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import {SVGBox, Error, Loading} from './components';
import {useHover} from './hooks';

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

function App() {
    const [state, send] = useMachine(lifecycle);
    const [hoverRef, isHovered] = useHover();

    const uuid = new URLSearchParams(window.location.search).get("uuid");
    if (uuid) {
        send("FETCH", {uuid: uuid});
    }

    if (state.matches('fetching')) {
        document.body.classList.add("loading");
        const id = setInterval(async () => {
            const result = await getDeployment(state.event.uuid);
            if (result.status == "pending") {
                return;
            } else if (result.status == "ko") {
                send("FAIL", {reason: result.reason});
            }
            clearInterval(id);
            const url = result.URL;
            if (url) {
                send("DONE", {url: url});
            }
        }, 1000);
    }

    if (state.matches('loaded') || state.matches('error')) {
        document.body.classList.remove("loading");
    }

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
                <iframe src={state.event.url} onError={() => send("FAIL", {reason: "Failed to load theia"})} frameBorder="0" style={{overflow:"hidden",height:"100vh",width:"100vm"}} height="100%" width="100%"></iframe>
            </div>
        }

        {state.matches('error') &&
            <Error state={state} />
        }
        </React.Fragment>
    );

}

ReactDOM.render(
    <App />,
    document.getElementById("root")
);
