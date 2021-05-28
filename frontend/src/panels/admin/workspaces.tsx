import React, { Dispatch, SetStateAction, useState } from "react";
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import Checkbox from '@material-ui/core/Checkbox';
import Container from '@material-ui/core/Container';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Link from '@material-ui/core/Link';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TableFooter from '@material-ui/core/TableFooter';
import TablePagination from '@material-ui/core/TablePagination';
import TextField from '@material-ui/core/TextField';
import { Autocomplete } from '@material-ui/lab';
import { Client, Configuration, LoggedUser, Pool, Repository, User, Workspace, WorkspaceConfiguration, WorkspaceUpdateConfiguration } from '@substrate/playground-client';
import { useStyles, EnhancedTableToolbar, NoResourcesContainer, TablePaginationActions, Resources } from '.';
import { ErrorSnackbar } from '../../components';
import { useInterval } from '../../hooks';
import { canCustomizeDuration, canCustomizePoolAffinity, find, workspaceUrl } from '../../utils';

export function canCustomize(user: LoggedUser): boolean {
    return canCustomizeDuration(user) || canCustomizePoolAffinity(user);
}

export function WorkspaceCreationDialog({ client, conf, workspaces, user, template, templates, show, onCreate, onHide, allowUserSelection = false }: { client: Client, conf: Configuration, workspaces?: Workspace[], user?: LoggedUser, template?: string, templates: Repository[] | undefined, show: boolean, onCreate: (conf: WorkspaceConfiguration, id?: string) => void, onHide: () => void , allowUserSelection?: boolean}): JSX.Element {
    const [selectedUser, setUser] = React.useState<string | undefined | null>(user?.id);
    const [selectedTemplate, setTemplate] = React.useState<string | null>(null);
    const [duration, setDuration] = React.useState(conf.workspace.duration);
    const [poolAffinity, setPoolAffinity] = React.useState(conf.workspace.poolAffinity);
    const [pools, setPools] = useState<Pool[] | null>(null);
    const [users, setUsers] = useState<User[] | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
        if (allowUserSelection) {
            setUsers(await client.listUsers());
        }
    }, 5000);

    const handleUserChange = (_event: unknown, newValue: string | null) => setUser(newValue);
    const handleTemplateChange = (event: React.ChangeEvent<HTMLInputElement>) => setTemplate(event.target.value);
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const duration = Number.parseInt(event.target.value);
        setDuration(Number.isNaN(duration)? 0 : duration);
    };
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);

    const currentUser = selectedUser || user?.id;
    const currentTemplate = template || selectedTemplate;

    function valid(): boolean {
        if (duration <= 0) {
            return false;
        }
        if (!currentUser) {
            return false;
        }
        if (!currentTemplate) {
            return false;
        }
        if (!poolAffinity) {
            return false;
        }
        if (workspaces && find(workspaces, currentUser) != null) {
            return false;
        }
        return true;
    }

    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Workspace details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    {allowUserSelection &&
                    <Autocomplete
                        size="small"
                        freeSolo
                        onInputChange={handleUserChange}
                        options={users ? Object.keys(users) : []}
                        defaultValue={user?.id}
                        getOptionLabel={(user) => user}
                        renderInput={(params) => <TextField {...params} label="User" />}
                      />
                    }
                    {!template &&
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={template}
                        onChange={handleTemplateChange}
                        required
                        label="Template"
                        >
                    {templates &&
                    Object.keys(templates).map(id => (
                        <MenuItem key={id} value={id}>
                        {id}
                        </MenuItem>))
                    }
                    </TextField>
                    }
                    {user && canCustomizePoolAffinity(user) &&
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={poolAffinity}
                        onChange={handlePoolAffinityChange}
                        required
                        label="Pool affinity"
                        >
                    {pools &&
                    Object.keys(pools).map(id => (
                        <MenuItem key={id} value={id}>
                        {id}
                        </MenuItem>))
                    }
                    </TextField>
                    }
                    {user && canCustomizeDuration(user) &&
                    <TextField
                        style={{marginBottom: 20}}
                        value={duration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        />}
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={!valid()} onClick={() => {onCreate({repositoryDetails: {id: currentTemplate || "", reference: 'latest'}, duration: duration, poolAffinity: poolAffinity}, currentUser); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function WorkspaceUpdateDialog({ id, duration, show, onUpdate, onHide }: { id: string, duration?: number, show: boolean, onUpdate: (id: string, conf: WorkspaceUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [newDuration, setDuration] = React.useState(0);

    React.useEffect(() => {
        if (duration) {
            setDuration(duration);
        }
    }, []);

    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const duration = Number.parseInt(event.target.value);
        setDuration(Number.isNaN(duration)? 0 : duration);
    };
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Workspace details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        value={newDuration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        autoFocus
                        />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={ newDuration <= 0 || duration == newDuration} onClick={() => {onUpdate(id.toLowerCase(), {duration: newDuration}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

export function Workspaces({ client, conf, user }: { client: Client, conf: Configuration, user?: LoggedUser }): JSX.Element {
    const classes = useStyles();
    const [selected, setSelected] = useState<string | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isSelected = (name: string) => selected == name;
    const handleClick = (_event: React.MouseEvent<unknown>, name: string) => {
        if (selected == name) {
            setSelected(null);
        } else {
            setSelected(name);
        }
    };
    const [templates, setTemplates] = useState<Repository[] | undefined>();

    useInterval(async () => {
        setTemplates(await client.listRepositories());
    }, 5000);

    function workspaceMock(conf: WorkspaceConfiguration): Workspace {
        return {
            id: "",
            maxDuration: 0,
            userId: "",
            state: {
                tag: "Paused",
            },
            repositoryDetails: {
                id: "",
                reference: "",
            }
        };
    }

    async function onCreate(conf: WorkspaceConfiguration, id: string | null | undefined, setWorkspaces: Dispatch<SetStateAction<Workspace[] | null>>): Promise<void> {
        try {
            if (id) {
                await client.createWorkspace(id, conf);
            } else {
                await client.createCurrentWorkspace(conf);
            }
        } catch (e) {
            console.error(e);
            setErrorMessage(`Failed to create workspace: ${e}`);
        }
    }

    async function onUpdate(id: string, conf: WorkspaceUpdateConfiguration, setWorkspaces: Dispatch<SetStateAction<Workspace[] | null>>): Promise<void> {
        try {
            await client.updateWorkspace(id, conf);
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to update workspace");
        }
    }

    async function onDelete(setWorkspaces: Dispatch<SetStateAction<Workspace[] | null>>): Promise<void> {
        if (selected) {
            try {
                await client.deleteWorkspace(selected);
                setSelected(null);
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to delete workspace");
            }
        } else {
            setErrorMessage("Can't delete currently logged workspace");
        }
    }

    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(5);
    const handleChangePage = (event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
      setPage(newPage);
    };

    const handleChangeRowsPerPage = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    };

    const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

    return (
        <Resources<Workspace> callback={async () => await client.listWorkspaces()}>
            {(resources: Workspace[], setWorkspaces: Dispatch<SetStateAction<Workspace[] | null>>) => {
                const allResources = Object.entries(resources);
                const filteredResources = rowsPerPage > 0 ? allResources.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : allResources;
                return (
                    <>
                        {filteredResources.length > 0
                        ?
                        <>
                            <EnhancedTableToolbar user={user} label="Workspaces" selected={selected} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setWorkspaces)} />
                            <TableContainer component={Paper}>
                                <Table className={classes.table} aria-label="simple table">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell></TableCell>
                                            <TableCell>ID</TableCell>
                                            <TableCell>Repository</TableCell>
                                            <TableCell>URL</TableCell>
                                            <TableCell>Duration</TableCell>
                                            <TableCell>State</TableCell>
                                            <TableCell>Node</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                    {filteredResources.map(([id, workspace]: [id: string, workspace: Workspace], index: number) => {
                                        const isItemSelected = isSelected(id);
                                        const labelId = `enhanced-table-checkbox-${index}`;
                                        const url = workspaceUrl(workspace);
                                        return (
                                            <TableRow
                                                key={id}
                                                hover
                                                onClick={(event) => handleClick(event, id)}
                                                role="checkbox"
                                                aria-checked={isItemSelected}
                                                tabIndex={-1}
                                                selected={isItemSelected}>
                                                <TableCell padding="checkbox">
                                                    <Checkbox
                                                        checked={isItemSelected}
                                                        inputProps={{ 'aria-labelledby': labelId }}
                                                    />
                                                </TableCell>
                                                <TableCell component="th" scope="row">
                                                    <Link href={`https://github.com/${id}`} target="_blank" rel="noreferrer" onClick={stopPropagation}>{id}</Link>
                                                </TableCell>
                                                <TableCell>{workspace.repositoryDetails.id}</TableCell>
                                                <TableCell>
                                                    {url
                                                    ? <Link href={url} target="_blank" rel="noreferrer" onClick={stopPropagation}>Browse {url}</Link>
                                                    : "N/A"}
                                                </TableCell>
                                                <TableCell>N/A</TableCell>
                                                <TableCell>{workspace.state}</TableCell>
                                            </TableRow>
                                        )})}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow>
                                            <TablePagination
                                                rowsPerPageOptions={[5, 10, 25, { label: 'All', value: -1 }]}
                                                colSpan={3}
                                                count={Object.entries(resources).length}
                                                rowsPerPage={rowsPerPage}
                                                page={page}
                                                SelectProps={{
                                                    inputProps: { 'aria-label': 'rows per page' },
                                                    native: true,
                                                }}
                                                onChangePage={handleChangePage}
                                                onChangeRowsPerPage={handleChangeRowsPerPage}
                                                ActionsComponent={TablePaginationActions}
                                                />
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </TableContainer>
                        </>
                        : <NoResourcesContainer user={user} label="No workspaces" action={() => setShowCreationDialog(true)} />}
                        {errorMessage &&
                        <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                        {showCreationDialog &&
                        <WorkspaceCreationDialog allowUserSelection={true} client={client} conf={conf} workspaces={resources} user={user} templates={templates} show={showCreationDialog} onCreate={(conf, id) => onCreate(conf, id, setWorkspaces)} onHide={() => setShowCreationDialog(false)} />}
                        {(selected && showUpdateDialog) &&
                        <WorkspaceUpdateDialog id={selected} duration={find(resources, selected)?.maxDuration} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setWorkspaces)} onHide={() => setShowUpdateDialog(false)} />}
                    </>
                );
            }}
        </Resources>
    );
}
