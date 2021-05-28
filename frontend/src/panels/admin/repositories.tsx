import React, { useState } from "react";
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import Container from '@material-ui/core/Container';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TextField from '@material-ui/core/TextField';
import { Client, LoggedUser, Repository, RepositoryConfiguration } from "@substrate/playground-client";
import { useStyles, EnhancedTableToolbar, Resources } from '.';
import { ErrorSnackbar } from '../../components';

function RepositoryCreationDialog({ show, onCreate, onHide }: { show: boolean, onCreate: (id: string, conf: RepositoryConfiguration) => void, onHide: () => void }): JSX.Element {

    const [id, setID] = React.useState('');
    const [url, setURL] = React.useState('');

    const handleIDChange = (event: React.ChangeEvent<HTMLInputElement>) => setID(event.target.value);
    const handleURLChange = (event: React.ChangeEvent<HTMLInputElement>) => setURL(event.target.value);
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>User details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        value={id}
                        onChange={handleIDChange}
                        required
                        label="ID"
                        autoFocus
                        />
                    <TextField
                        style={{marginBottom: 20}}
                        value={url}
                        onChange={handleURLChange}
                        required
                        label="URL"
                        />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={!id || !url} onClick={() => {onCreate(id.toLowerCase(), {tags: {"public": "true"}, url: url}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

export function Repositories({ client, user }: { client: Client, user?: LoggedUser }): JSX.Element {
    const classes = useStyles();
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    return (
        <Resources<Repository> callback={async () => await client.listRepositories()}>
        {(resources: Repository[]) => (
            <>
                <EnhancedTableToolbar user={user} label="Repositories" onCreate={() => setShowCreationDialog(true)} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>URL</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {resources.map(repository => (
                        <TableRow key={repository.id}>
                            <TableCell component="th" scope="row">
                                {repository.id}
                            </TableCell>
                            <TableCell>{repository.url}</TableCell>
                        </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {showCreationDialog &&
                <RepositoryCreationDialog
                    show={showCreationDialog}
                    onCreate={async (id, conf) => {
                        try {
                            await client.createRepository(id, conf);
                        } catch (e) {
                            setErrorMessage(`Error during creation: ${e.message}`);
                        }
                    }}
                    onHide={() => setShowCreationDialog(false)} />}
            </>
            )}
        </Resources>
    );
}
