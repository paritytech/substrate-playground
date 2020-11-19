import React from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Wrapper } from '../components';
import { useLifecycle } from '../lifecycle';
import { makeStyles } from '@material-ui/core/styles';
import { Container } from "@material-ui/core";
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';

const useStyles = makeStyles({
    table: {
      minWidth: 650,
    },
});

function Instances({ instances }) {
    const classes = useStyles();
    return (
        <TableContainer component={Paper}>
        <Table className={classes.table} aria-label="simple table">
            <TableHead>
            <TableRow>
                <TableCell>ID</TableCell>
                <TableCell align="right">Template</TableCell>
                <TableCell align="right">URL</TableCell>
            </TableRow>
            </TableHead>
            <TableBody>
            {instances.map((instance) => (
                <TableRow key={instance[0]}>
                <TableCell component="th" scope="row">
                    {instance[0]}
                </TableCell>
                <TableCell align="right">{instance[1].template.name}</TableCell>
                <TableCell align="right"><a href={instance[1].url}>{instance[1].url}</a></TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
        </TableContainer>
    );
}

function Templates({ templates }) {
    const classes = useStyles();
    return (
        <TableContainer component={Paper}>
        <Table className={classes.table} aria-label="simple table">
            <TableHead>
            <TableRow>
                <TableCell>ID</TableCell>
                <TableCell align="right">Name</TableCell>
                <TableCell align="right">Image</TableCell>
            </TableRow>
            </TableHead>
            <TableBody>
            {templates.map((template) => (
                <TableRow key={template.id}>
                <TableCell component="th" scope="row">
                    {template.id}
                </TableCell>
                <TableCell align="right">{template.name}</TableCell>
                <TableCell align="right">{template.image}</TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
        </TableContainer>
    );
}

export function AdminPanel({ client }) {
    const location = useLocation();
    const history = useHistory();
    const [state, send] = useLifecycle(history, location, client);
    const details = state.context.details;
    const instances = Object.entries(details ? details["all_instances"] : {});
    return (
        <div style={{ display: "flex", width: "100vw", height: "100vh", alignItems: "center", justifyContent: "center"}}>
            <Wrapper send={send} details={details}>
                <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", marginTop: 20, justifyContent: "center", width: "80vw", height: "80vh"}} elevation={3}>
                        {details?.templates.length > 0
                        ? <div style={{margin: 20}}>
                            <Typography variant="h5">Templates</Typography>
                            <Templates templates={details?.templates} />
                          </div>
                        : <Container style={{display: "flex", flex: 1, flexDirection: "column", padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                            <Typography variant="h5">No templates</Typography>
                        </Container>}
                        {instances.length > 0
                        ? <div style={{margin: 20}}>
                            <Typography variant="h5">Instances</Typography>
                            <Instances instances={instances} />
                          </div>
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
            <Wrapper send={send} details={details}>
                <iframe src="/grafana/" width="100%" height="100%" frameBorder="0"></iframe>
            </Wrapper>
        </div>
    );
}