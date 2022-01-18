import React from "react";
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
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
