import React, { useState } from "react";
import marked from 'marked';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Container from "@material-ui/core/Container";
import Divider from '@material-ui/core/Divider';
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
import { NameValuePair, Port, Session, Template } from '@substrate/playground-client';
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

function TemplateSelector({templates, onDeployed, onRetry}: {templates: Record<string, Template>, onDeployed: (name: string) => void, onRetry: () => void}): JSX.Element {
    const publicTemplates = Object.entries(templates).filter(([k, v]) => v.tags.public == "true");
    const templatesAvailable = publicTemplates.length > 0;
    const [selection, select] = useState(templatesAvailable ? publicTemplates[0] : null);
    const classes = useStyles();
    if (selection) {
        return (
            <React.Fragment>
                <Typography variant="h5" style={{padding: 20}}>Select a template</Typography>
                <Divider orientation="horizontal" />
                <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
                    <div style={{display: "flex", flex: 1, flexDirection: "row", minHeight: 0, height: "100%"}}>
                            <List style={{paddingTop: 0, paddingBottom: 0, overflowY: "auto"}}>
                                {publicTemplates.map(([id, template], index: number) => (
                                <ListItem button key={index} selected={selection[1].name === template.name} onClick={() => select([id, template])}>
                                    <ListItemText primary={template.name} />
                                </ListItem>
                                ))}
                            </List>
                            <Divider flexItem={true} orientation={"vertical"} light={true} />
                            <div style={{flex: 1, marginLeft: 20, paddingRight: 20, overflow: "auto", textAlign: "left"}}>
                                <Typography>
                                    <span dangerouslySetInnerHTML={{__html:marked(selection[1].description)}}></span>
                                </Typography>
                                <Divider orientation={"horizontal"} light={true} />
                                <Typography className={classes.root} variant="overline">
                                    Built using image {selection[1].image}
                                </Typography>
                            </div>
                        </div>
                </Container>
                <Divider orientation="horizontal" />
                <Container style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingTop: 10, paddingBottom: 10 }}>
                    <Button onClick={() => onDeployed(selection[0])} color="primary" variant="contained" disableElevation disabled={!templatesAvailable}>
                        Create
                    </Button>
                </Container>
            </React.Fragment>
        );
    } else {
        return (
            <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", overflowY: "auto"}}>
                <ErrorMessage reason="Can't find any public template. The templates configuration might be incorrect." action={onRetry} />
            </Container>
        );
    }
}

function EnvTable({ env }: {env?: NameValuePair[]}): JSX.Element {
    return (
        <TableContainer component={Paper}>
            <Table size="small" aria-label="a dense table">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell align="right">Value</TableCell>
                    </TableRow>
                </TableHead>
                {env &&
                    <TableBody>
                        {env.map(e => (
                            <TableRow key={e.name}>
                                <TableCell component="th" scope="row">
                                    {e.name}
                                </TableCell>
                                <TableCell align="right">{e.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                }
            </Table>
        </TableContainer>
    );
}

function PortsTable({ ports }: {ports?: Port[]}): JSX.Element {
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
                        {ports.map(port => (
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

export function SessionDetails({ session }: {session: Session}): JSX.Element {
    const { pod, template } = session;
    const { name, runtime } = template;
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
                {runtime &&
                    <div style={{display: "flex", paddingTop: 20}}>
                        <div style={{flex: 1, paddingRight: 10}}>
                            <Typography variant="h6" id="tableTitle" component="div">
                            Environment
                            </Typography>
                            <EnvTable env={runtime.env} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Typography variant="h6" id="tableTitle" component="div">
                                Ports
                            </Typography>
                            <PortsTable ports={runtime.ports} />
                        </div>
                    </div>
                }
            </CardContent>
        </Card>
    );
}

function ExistingSession({session, onStop, onConnect}: {session: Session, onStop: () => void, onConnect: (session: Session) => void}): JSX.Element {
    const status = session.pod?.details?.status;
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

export function SessionPanel({ templates, session, onDeployed, onConnect, onRetry, onStopSession }: {templates: Record<string, Template>, session: Session, onStopSession: () => void, onConnect: (session: Session) => void, onDeployed: (name: string) => void, onRetry: () => void}): JSX.Element {
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
