import React, { useEffect, useState } from "react";
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Collapse from '@mui/material/Collapse';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Client, User, Repository, RepositoryConfiguration, RepositoryVersion, ResourceType } from "@substrate/playground-client";
import { useStyles, EnhancedTableToolbar, Resources } from '.';
import { ErrorSnackbar } from '../../components';
import { find } from "../../utils";

function RepositoryCreationDialog({ repositories, show, onCreate, onHide }: { repositories: Repository[], show: boolean, onCreate: (id: string, conf: RepositoryConfiguration) => void, onHide: () => void }): JSX.Element {

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
                        <Button disabled={!id || find(repositories, id) != null|| !url} onClick={() => {onCreate(id.toLowerCase(), {url: url}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function RepositoryRow({ client, repository }: { client: Client, repository: Repository }): JSX.Element {
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState<RepositoryVersion[]>([]);

    useEffect(() => {
        async function fetchData() {
            const versions = await client.listRepositoryVersions(repository.id);
            setHistory(versions);
        }

        if (open) {
            fetchData();
        }
    }, [open]);

    return (
        <>
            <Button onClick={() => {client.createRepositoryVersion("substrate-node-template", "e1abd651d1412a5171db6595fa37f613b57a73f3")}}>CLOSE</Button>
            <TableRow key={repository.id}>
                <TableCell>
                    <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell component="th" scope="row">
                    {repository.id}
                </TableCell>
                <TableCell>{repository.url}</TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box margin={1}>
                        <Typography variant="h6" gutterBottom component="div">
                            Versions
                        </Typography>
                        <Table size="small" aria-label="purchases">
                            <TableHead>
                            <TableRow>
                                <TableCell>Reference</TableCell>
                                <TableCell>State</TableCell>
                            </TableRow>
                            </TableHead>
                            <TableBody>
                            {history.map((version) => (
                                <TableRow key={version.id}>
                                <TableCell component="th" scope="row">
                                    {version.id}
                                </TableCell>
                                <TableCell align="right">{version.state.type}</TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

export function Repositories({ client, user }: { client: Client, user: User }): JSX.Element {
    const classes = useStyles();
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    return (
        <Resources<Repository> callback={async () => await client.listRepositories()}>
        {(resources: Repository[]) => (
            <>
                <EnhancedTableToolbar client={client} user={user} label="Repositories" onCreate={() => setShowCreationDialog(true)} resourceType={ResourceType.Repository} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell />
                                <TableCell>ID</TableCell>
                                <TableCell>URL</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {resources.map(repository => (
                            <RepositoryRow key={repository.id} client={client} repository={repository} />
                        ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {showCreationDialog &&
                <RepositoryCreationDialog
                    repositories={resources}
                    show={showCreationDialog}
                    onCreate={async (id, conf) => {
                        try {
                            await client.createRepository(id, conf);
                            await client.createRepositoryVersion(id, "master");
                        } catch (e: any) {
                            setErrorMessage(`Error during creation: ${e.message}`);
                        }
                    }}
                    onHide={() => setShowCreationDialog(false)} />}
            </>
            )}
        </Resources>
    );
}
