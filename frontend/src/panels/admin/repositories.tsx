import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { Client, User, Repository, RepositoryConfiguration, RepositoryVersion, ResourceType, RepositoryUpdateConfiguration } from "@substrate/playground-client";
import { useStyles, EnhancedTableToolbar, Resources } from '.';
import { ErrorSnackbar } from '../../components';
import { find } from "../../utils";
import { Checkbox, DialogActions, MenuItem } from "@mui/material";

function RepositoryCreationDialog({ repositories, show, onCreate, onHide }: { repositories: Repository[], show: boolean, onCreate: (id: string, conf: RepositoryConfiguration) => void, onHide: () => void }): JSX.Element {
    const [id, setID] = React.useState('');
    const [url, setURL] = React.useState('');

    const handleIDChange = (event: React.ChangeEvent<HTMLInputElement>) => setID(event.target.value);
    const handleURLChange = (event: React.ChangeEvent<HTMLInputElement>) => setURL(event.target.value);
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Repository details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        value={id}
                        onChange={handleIDChange}
                        required
                        margin="dense"
                        label="ID"
                        autoFocus
                        variant="standard"
                        />
                    <TextField
                        style={{marginBottom: 20}}
                        value={url}
                        onChange={handleURLChange}
                        margin="dense"
                        required
                        label="URL"
                        variant="standard"
                        />
                    <DialogActions>
                        <Button disabled={id.length == 0 || find(repositories, id) != null || url.length == 0} onClick={() => {onCreate(id.toLowerCase(), {url: url}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function RepositoryVersionUpdateDialog({ client, repository, show, onSetVersionClick, onHide }: { client: Client, repository: Repository, show: boolean, onSetVersionClick: (id: string, conf: RepositoryUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [repositoryVersions, setRepositoryVersions] = useState<RepositoryVersion[]>([]);
    const [currentVersion, setCurrentVersion] = React.useState<string | undefined>();

    useEffect(() => {
        async function fetchData() {
            const versions = await client.listRepositoryVersions(repository.id);
            setRepositoryVersions(versions);
        }

        fetchData();
    }, []);

    const handleCurrentVersionChange = (event: React.ChangeEvent<HTMLInputElement>) => setCurrentVersion(event.target.value);
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Repository details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={currentVersion}
                        onChange={handleCurrentVersionChange}
                        required
                        label="Repository Version"
                        >
                    {repositoryVersions &&
                      repositoryVersions.map((repositoryVersion, index) => {
                        return (
                          <MenuItem key={index} value={index}>
                          {repositoryVersion.id}
                          </MenuItem>
                        );
                      })
                    }
                    </TextField>
                    <DialogActions>
                        <Button disabled={!currentVersion} onClick={() => {onSetVersionClick(repository.id, {currentVersion: currentVersion}); onHide();}}>Set version</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function RepositoryVersionsTable({ client, repositoryVersions }: { client: Client, repositoryVersions: RepositoryVersion[] }): JSX.Element {
    // TODO allow to specify versions
    return (
    <Box margin={1}>
        <Typography variant="h6" gutterBottom component="div">
            Versions
        </Typography>
        <Button onClick={() => {client.createRepositoryVersion("node-template", "e1abd651d1412a5171db6595fa37f613b57a73f3")}}>CREATE NEW VERSION</Button>
        <Table size="small" aria-label="versions">
            <TableHead>
            <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>State</TableCell>
            </TableRow>
            </TableHead>
            <TableBody>
            {repositoryVersions.map((version) => (
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
    );
}

function RepositoryRow({ client, repository, index, selected, setSelected }: { client: Client, repository: Repository, index: number, selected: Repository | null, setSelected: Dispatch<SetStateAction<Repository | null>> }): JSX.Element {
    const [open, setOpen] = useState(false);
    const [repositoryVersions, setRepositoryVersions] = useState<RepositoryVersion[]>([]);
    const isSelected = (repository: Repository) => selected?.id == repository.id;
    const handleClick = (_event: React.MouseEvent<unknown>, repository: Repository) => {
        if (isSelected(repository)) {
            setSelected(null);
        } else {
            setSelected(repository);
        }
    };
    useEffect(() => {
        async function fetchData() {
            const versions = await client.listRepositoryVersions(repository.id);
            setRepositoryVersions(versions);
        }

        if (open) {
            fetchData();
        }
    }, [open]);
    const isItemSelected = isSelected(repository);
    const labelId = `enhanced-table-checkbox-${index}`;

    return (
        <>
            <TableRow
                key={repository.id}
                hover
                onClick={(event) => handleClick(event, repository)}
                role="checkbox"
                aria-checked={isItemSelected}
                tabIndex={-1}
                selected={isItemSelected}>
                <TableCell>
                    <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell component="th" scope="row">
                    {repository.id}
                </TableCell>
                <TableCell>{repository.url}</TableCell>
                <TableCell>{repository.currentVersion}</TableCell>
            </TableRow>
            <TableRow>
                <TableCell padding="checkbox">
                    <Checkbox
                        checked={isItemSelected}
                        inputProps={{ 'aria-labelledby': labelId }}
                    />
                </TableCell>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <RepositoryVersionsTable client={client} repositoryVersions={repositoryVersions} />
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

export function Repositories({ client, user }: { client: Client, user: User }): JSX.Element {
    const classes = useStyles();
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showSetVersionDialog, setShowSetVersionDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selected, setSelected] = useState<Repository | null>(null);

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
                                <TableCell>Current Version</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {resources.map((repository, index) => (
                            <RepositoryRow key={repository.id} client={client} repository={repository} index={index} selected={selected} setSelected={setSelected} />
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
                        } catch (e: any) {
                            setErrorMessage(`Error during Repository creation: : ${JSON.stringify(e.data)}`);
                        }
                    }}
                    onHide={() => setShowCreationDialog(false)} />}
                {selected && showSetVersionDialog &&
                <RepositoryVersionUpdateDialog
                    client={client}
                    repository={selected}
                    show={showSetVersionDialog}
                    onSetVersionClick={async (id, conf) => {
                        try {
                            await client.updateRepository(id, conf);
                        } catch (e: any) {
                            setErrorMessage(`Error during creation: : ${JSON.stringify(e.data)}`);
                        }
                    }}
                    onHide={() => setShowSetVersionDialog(false)} />}
            </>
            )}
        </Resources>
    );
}
