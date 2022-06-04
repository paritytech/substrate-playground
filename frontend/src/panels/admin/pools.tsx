import React from "react";
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Client, User, Pool } from "@substrate/playground-client";
import { useStyles, EnhancedTableToolbar, Resources } from '.';

export function Pools({ client, user }: { client: Client, user: User }): JSX.Element {
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
