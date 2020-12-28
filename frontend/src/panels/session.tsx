import React, { useState } from "react";
import marked from 'marked';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Container from "@material-ui/core/Container";
import Divider from '@material-ui/core/Divider';
import Link from '@material-ui/core/Link';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import { ErrorMessage } from "../components";

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        root: {
            '& > * + *': {
                marginLeft: theme.spacing(2),
            },
        },
    }),
);

function TemplateSelector({templates, onDeployed, onRetry}) {
    const publicTemplates = templates.filter(t => t.public);
    const [selection, select] = useState(publicTemplates[0]);
    const templatesAvailable = templates?.length > 0;
    const classes = useStyles();
    const imageName = selection.image.split(":")[0];
    return (
    <React.Fragment>
        <Typography variant="h5" style={{padding: 20}}>Select a template</Typography>
        <Divider orientation="horizontal" />
        <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
            {templatesAvailable
                ? <div style={{display: "flex", flex: 1, flexDirection: "row", minHeight: 0, height: "100%"}}>
                    <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                        {publicTemplates.map((template, index: number) => (
                        <ListItem button key={index} selected={selection.id === template.id} onClick={() => select(template)}>
                            <ListItemText primary={template.name} />
                        </ListItem>
                        ))}
                    </List>
                    <Divider flexItem={true} orientation={"vertical"} light={true} />
                    {selection &&
                    <div style={{flex: 1, marginLeft: 20, paddingRight: 20, overflow: "auto", textAlign: "left"}}>
                        <Typography>
                            <span dangerouslySetInnerHTML={{__html:marked(selection.description)}}></span>
                        </Typography>
                        <Divider orientation={"horizontal"} light={true} />
                        <Typography className={classes.root} variant="overline">
                            Built using the following
                            <Link
                                        href={`https://hub.docker.com/r/${imageName}/tags`}
                                        rel="noreferrer"
                                        variant="inherit"
                                        style={{ margin: 5 }}>
                                        image
                            </Link>
                                </Typography>
                            </div>}
                    </div>
                    : <ErrorMessage reason="Can't find any template. Is the templates configuration incorrect." action={onRetry} />
                }
            </Container>
            <Divider orientation="horizontal" />
            <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                <Button onClick={() => onDeployed(selection.id)} color="primary" variant="contained" disableElevation disabled={!templatesAvailable}>
                    Create
                </Button>
            </Container>
        </React.Fragment>
    );
}

function EnvTable({ envs }) {
    return (
        <TableContainer component={Paper}>
            <Table size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell align="right">Value</TableCell>
                    </TableRow>
                </TableHead>
                {envs &&
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
                }
            </Table>
        </TableContainer>
    );
}

function PortsTable({ ports }) {
    return (
        <TableContainer component={Paper}>
            <Table size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Path</TableCell>
                        <TableCell>Value</TableCell>
                    </TableRow>
                </TableHead>
                {ports &&
                    <TableBody>
                        {ports.map((port) => (
                            <TableRow key={port.name}>
                                <TableCell component="th" scope="row">
                                    {port.name}
                                </TableCell>
                                <TableCell>{port.path}</TableCell>
                                <TableCell>{port.port}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                }
            </Table>
        </TableContainer>
    );
}

export function SessionDetails({ session }) {
    const { pod, template } = session;
    const { name, runtime } = template;
    const { env, ports } = runtime;
    const status = pod?.details?.status;
    const containerStatuses = status?.containerStatuses;
    let reason;
    if (containerStatuses?.length > 0) {
        const state = containerStatuses[0].state;
        reason = state?.waiting?.reason;
    }

    return (
        <Card style={{ margin: 20 }} variant="outlined">
            <CardContent>
                <Typography>
                    {name}
                </Typography>
                {status?.startTime &&
                <Typography color="textSecondary" gutterBottom>
                Started at {status?.startTime}
                </Typography>
                }
                <Typography color="textSecondary" gutterBottom>
                Phase: <em>{status?.phase}</em> {reason && `(${reason})`}
                </Typography>
                <div style={{display: "flex", paddingTop: 20}}>
                    <div style={{flex: 1, paddingRight: 10}}>
                        <Typography variant="h6" id="tableTitle" component="div">
                        Environment
                        </Typography>
                        <EnvTable envs={env} />
                    </div>
                    <div style={{ flex: 1 }}>
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

function ExistingISession({session, onStop, onConnect}) {
    const status = session?.pod?.details?.status;
    return (
    <React.Fragment>
        <Typography variant="h5" style={{padding: 20}}>Existing session</Typography>
        <Divider orientation="horizontal" />
        <Container style={{display: "flex", flex: 1, padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
            <SessionDetails session={session} />
        </Container>
        <Divider orientation="horizontal" />
        <Container style={{display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10}}>
            <div>
                <Button style={{marginRight: 10}} onClick={onStop} color="secondary" variant="outlined" disableElevation>
                    Stop
                </Button>
                <Button onClick={() => onConnect(session)} disabled={status?.phase != "Running"} color="primary" variant="contained" disableElevation>
                    Connect
                </Button>
                </div>
            </Container>
        </React.Fragment>
    );
}

export function SessionPanel({ state, onDeployed, onConnect, onRetry, onStopSession }) {
    const {session, templates} = state.context.details; // TODO use direct templates endpoint
    return (
        <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                {session
                 ? <ExistingSession onConnect={onConnect} onStop={onStopSession} session={session} />
                 : <TemplateSelector templates={templates} onRetry={onRetry} onDeployed={onDeployed} />}
            </Paper>
        </Container>
    );
}
