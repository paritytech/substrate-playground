import React from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useLifecycle } from './lifecycle';
import { InstanceDetails, Wrapper } from './components';
import { Container } from "@material-ui/core";
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

export function AdminPanel({ client }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    const instances = Object.entries(details ? details["all_instances"] : {});
    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center"}}>
            <Wrapper client={client} send={send} details={details}>
                <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <Paper style={{ display: "flex", flexDirection: "column", marginTop: 20, justifyContent: "center", width: "80vw", height: "80vh"}} elevation={3}>
                        {instances.length > 0
                        ? <Grid container justify="center" spacing={1} style={{margin: 10}}>
                        {instances.map((entry, index) => {
                            return (
                                <Grid key={index} item>
                                    <Container style={{display: "flex", flex: 1, flexDirection: "column", padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                                        <Typography variant="h5">{entry[0]}</Typography>
                                        <InstanceDetails instance={entry[1]} />
                                    </Container>
                                </Grid>
                            );
                        })}
                        </Grid>
                        : <Container style={{display: "flex", flex: 1, flexDirection: "column", padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                            <Typography variant="h5">No instance currently running</Typography>
                        </Container>}
                    </Paper>
                </Container>
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
                <iframe src="/grafana/" width="100%" height="100%" frameBorder="0"></iframe>
            </Wrapper>
        </div>
    );
}