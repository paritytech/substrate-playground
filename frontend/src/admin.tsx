import React from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useLifecycle } from './lifecycle';
import { Wrapper } from './components';

export function AdminPanel({ client }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center"}}>
            <Wrapper client={client} send={send} details={details}>
            </Wrapper>
        </div>
    );
}

export function StatsPanel({ client }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center"}}>
            <Wrapper client={client} send={send} details={details}>
                <iframe src="http://playground-dev.substrate.test/grafana/" width="100%" height="100%" frameBorder="0"></iframe>
            </Wrapper>
        </div>
    );
}