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
import { Preference } from "@substrate/playground-client";
import { useStyles } from '.';

export function Preferences({ preferences }: { preferences: Preference[] }): JSX.Element {
    const classes = useStyles();
    return (
        <Container>
            <Typography variant="h6" id="tableTitle" component="div">
            Preferences
            </Typography>
            <TableContainer component={Paper}>
                <Table className={classes.table} aria-label="preferences">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Value</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                    {preferences.map(preference =>
                        <TableRow key={preference.id}>
                            <TableCell>{preference.id}</TableCell>
                            <TableCell>{preference.value}</TableCell>
                        </TableRow>)
                    }
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
}
