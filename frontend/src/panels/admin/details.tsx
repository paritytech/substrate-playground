import React from "react";
import Container from '@material-ui/core/Container';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import { Configuration } from "@substrate/playground-client";
import { useStyles } from '.';

export function Details({ conf }: { conf: Configuration }): JSX.Element {
    const classes = useStyles();
    const { duration, maxWorkspacesPerPod, poolAffinity } = conf.workspace;
    return (
        <Container>
            <Typography variant="h6" id="tableTitle" component="div">
            Workspace defaults
            </Typography>
            <TableContainer component={Paper}>
                <Table className={classes.table} aria-label="simple table">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Value</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow key="duration">
                            <TableCell>Duration</TableCell>
                            <TableCell>{duration}</TableCell>
                        </TableRow>
                        <TableRow key="maxWorkspacesPerPod">
                            <TableCell>Max workspaces per Pod</TableCell>
                            <TableCell>{maxWorkspacesPerPod}</TableCell>
                        </TableRow>
                        <TableRow key="poolAffinity">
                            <TableCell>Pool affinity</TableCell>
                            <TableCell>{poolAffinity}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
}
