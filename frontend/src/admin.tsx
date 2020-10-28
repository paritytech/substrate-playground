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
                <div>
                <iframe src="http://playground-dev.substrate.test/grafana/dashboard-solo/new?from=1598506143076&to=1598527743076&orgId=1&panelId=2" width="600" height="400" frameborder="0"></iframe>
                </div>
            </Wrapper>
        </div>
    );
}