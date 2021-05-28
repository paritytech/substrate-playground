import React from "react";
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { Client, LoggedUser, Pool } from "@substrate/playground-client";
import { useStyles, EnhancedTableToolbar, Resources } from '.';

export function Pools({ client, user }: { client: Client, user?: LoggedUser }): JSX.Element {
    const classes = useStyles();

    return (
        <Resources<Pool> callback={async () => await client.listPools()}>
        {(resources: Pool[]) => (
            <>
                <EnhancedTableToolbar user={user} label="Pools" />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Instance type</TableCell>
                                <TableCell># of nodes</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {resources.map(pool => (
                        <TableRow key={pool.id}>
                            <TableCell>{pool.id}</TableCell>
                            <TableCell>{pool.instanceType}</TableCell>
                            <TableCell>{pool.nodes.length}</TableCell>
                        </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </>
            )}
        </Resources>
    );
}
