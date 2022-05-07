import React from "react";
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Client, LoggedUser, Template } from '@substrate/playground-client';
import { useStyles, EnhancedTableToolbar, Resources } from '.';

export function Templates({ client, user }: { client: Client, user: LoggedUser }): JSX.Element {
    const classes = useStyles();

    return (
        <Resources<Template> callback={async () => (await client.listTemplates())}>
        {(resources: Template[]) => (
            <>
                <EnhancedTableToolbar user={user} label="Templates" />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Image</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {Object.entries(resources).map(([id, template]) => (
                        <TableRow key={id}>
                            <TableCell component="th" scope="row">
                                {template.id}
                            </TableCell>
                            <TableCell>{template.name}</TableCell>
                            <TableCell>{template.image}</TableCell>
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
