import clsx from 'clsx';
import React, { Dispatch, SetStateAction, useState } from "react";
import { createStyles, lighten, makeStyles, useTheme, Theme } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import Checkbox from '@material-ui/core/Checkbox';
import Container from '@material-ui/core/Container';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import IconButton from '@material-ui/core/IconButton';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContentText from '@material-ui/core/DialogContentText';
import EditIcon from '@material-ui/icons/Edit';
import Link from '@material-ui/core/Link';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import Tab from '@material-ui/core/Tab';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import FirstPageIcon from '@material-ui/icons/FirstPage';
import KeyboardArrowLeft from '@material-ui/icons/KeyboardArrowLeft';
import KeyboardArrowRight from '@material-ui/icons/KeyboardArrowRight';
import LastPageIcon from '@material-ui/icons/LastPage';
import TableFooter from '@material-ui/core/TableFooter';
import TablePagination from '@material-ui/core/TablePagination';
import { Autocomplete } from '@material-ui/lab';
import { Client, Configuration, LoggedUser, Pool, Workspace, WorkspaceConfiguration, WorkspaceUpdateConfiguration, Template, User, UserConfiguration, UserUpdateConfiguration } from '@substrate/playground-client';
import { CenteredContainer, ErrorSnackbar, LoadingPanel } from '../components';
import { useInterval } from '../hooks';
import { canCustomizeDuration, canCustomizePoolAffinity, hasAdminEditRights } from '../utils';


const useStyles = makeStyles({
    table: {
      minWidth: 650,
    },
});

function NoResourcesContainer({ user, label, action }: { user?: LoggedUser, label: string, action?: () => void}): JSX.Element {
    return (
        <Container>
            <Typography variant="h6">
                {label}
                {(action && user && hasAdminEditRights(user)) &&
                 <Tooltip title="Create">
                    <IconButton aria-label="create" onClick={action}>
                        <AddIcon />
                    </IconButton>
                </Tooltip>}
            </Typography>
        </Container>
    );
}

function Resources<T>( { children, callback }: { children: (resources: Record<string, T>, setter: Dispatch<SetStateAction<Record<string, T> | null>>) => NonNullable<React.ReactNode>, callback: () => Promise<Record<string, T>> }): JSX.Element {
    const [resources, setResources] = useState<Record<string, T> | null>(null);

    useInterval(async () => {
        try {
            setResources(await callback());
        } catch (e) {
            setResources({});
            console.error(e);
        }
    }, 5000);

    if (!resources) {
        return <LoadingPanel />;
    } else {
        return (
            <Container>
                {children(resources, setResources)}
            </Container>
        );
    }
}

export function canCustomize(user: LoggedUser): boolean {
    return canCustomizeDuration(user) || canCustomizePoolAffinity(user);
}

export function WorkspaceCreationDialog({ client, conf, workspaces, user, template, templates, show, onCreate, onHide, allowUserSelection = false }: { client: Client, conf: Configuration, workspaces?: Record<string, Workspace>, user?: LoggedUser, template?: string, templates: Record<string, Template> | undefined, show: boolean, onCreate: (conf: WorkspaceConfiguration, id?: string, ) => void, onHide: () => void , allowUserSelection?: boolean}): JSX.Element {
    const [selectedUser, setUser] = React.useState<string | undefined | null>(user?.id);
    const [selectedTemplate, setTemplate] = React.useState<string | null>(null);
    const [duration, setDuration] = React.useState(conf.workspace.duration);
    const [poolAffinity, setPoolAffinity] = React.useState(conf.workspace.poolAffinity);
    const [pools, setPools] = useState<Record<string, Pool> | null>(null);
    const [users, setUsers] = useState<Record<string, User> | null>(null);

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
        if (workspaces && workspaces[currentUser] != null) {
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
                        <Button disabled={!valid()} onClick={() => {onCreate({template: currentTemplate || "", duration: duration, poolAffinity: poolAffinity}, currentUser); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function WorkspaceUpdateDialog({ id, duration, show, onUpdate, onHide }: { id: string, duration: number, show: boolean, onUpdate: (id: string, conf: WorkspaceUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [newDuration, setDuration] = React.useState(0);

    React.useEffect(() => {
        setDuration(duration);
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

const useStyles1 = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      flexShrink: 0,
      marginLeft: theme.spacing(2.5),
    },
  }),
);
interface TablePaginationActionsProps {
    count: number;
    page: number;
    rowsPerPage: number;
    onChangePage: (event: React.MouseEvent<HTMLButtonElement>, newPage: number) => void;
  }

  function TablePaginationActions(props: TablePaginationActionsProps) {
    const classes = useStyles1();
    const theme = useTheme();
    const { count, page, rowsPerPage, onChangePage } = props;

    const handleFirstPageButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onChangePage(event, 0);
    };

    const handleBackButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onChangePage(event, page - 1);
    };

    const handleNextButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onChangePage(event, page + 1);
    };

    const handleLastPageButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onChangePage(event, Math.max(0, Math.ceil(count / rowsPerPage) - 1));
    };

    return (
      <div className={classes.root}>
        <IconButton
          onClick={handleFirstPageButtonClick}
          disabled={page === 0}
          aria-label="first page"
        >
          {theme.direction === 'rtl' ? <LastPageIcon /> : <FirstPageIcon />}
        </IconButton>
        <IconButton onClick={handleBackButtonClick} disabled={page === 0} aria-label="previous page">
          {theme.direction === 'rtl' ? <KeyboardArrowRight /> : <KeyboardArrowLeft />}
        </IconButton>
        <IconButton
          onClick={handleNextButtonClick}
          disabled={page >= Math.ceil(count / rowsPerPage) - 1}
          aria-label="next page"
        >
          {theme.direction === 'rtl' ? <KeyboardArrowLeft /> : <KeyboardArrowRight />}
        </IconButton>
        <IconButton
          onClick={handleLastPageButtonClick}
          disabled={page >= Math.ceil(count / rowsPerPage) - 1}
          aria-label="last page"
        >
          {theme.direction === 'rtl' ? <FirstPageIcon /> : <LastPageIcon />}
        </IconButton>
      </div>
    );
  }

function Workspaces({ client, conf, user }: { client: Client, conf: Configuration, user?: LoggedUser }): JSX.Element {
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
    const [templates, setTemplates] = useState<Record<string, Template> | undefined>();

    useInterval(async () => {
        setTemplates(await client.listTemplates());
    }, 5000);

    function workspaceMock(conf: WorkspaceConfiguration): Workspace {
        return {
            maxDuration: 0,
            userId: "",
        };
    }

    async function onCreate(conf: WorkspaceConfiguration, id: string | null | undefined, setWorkspaces: Dispatch<SetStateAction<Record<string, Workspace> | null>>): Promise<void> {
        try {
            if (id) {
                await client.createWorkspace(id, conf);
                setWorkspaces((workspaces: Record<string, Workspace> | null) => {
                    if (workspaces) {
                        workspaces[id] = workspaceMock(conf);
                    }
                    return {...workspaces};
                });
            } else {
                await client.createCurrentWorkspace(conf);
            }
        } catch (e) {
            console.error(e);
            setErrorMessage(`Failed to create workspace: ${e}`);
        }
    }

    async function onUpdate(id: string, conf: WorkspaceUpdateConfiguration, setWorkspaces: Dispatch<SetStateAction<Record<string, Workspace> | null>>): Promise<void> {
        try {
            await client.updateWorkspace(id, conf);
            setWorkspaces((workspaces: Record<string, Workspace> | null) => {
                if (workspaces && conf.duration) {
                    workspaces[id].duration = conf.duration;
                }
                return {...workspaces};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to update workspace");
        }
    }

    async function onDelete(setWorkspaces: Dispatch<SetStateAction<Record<string, Workspace> | null>>): Promise<void> {
        if (selected) {
            try {
                await client.deleteWorkspace(selected);

                setWorkspaces((workspaces: Record<string, Workspace> | null) => {
                    if (workspaces) {
                        delete workspaces[selected];
                    }
                    return workspaces;
                });
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
            {(resources: Record<string, Workspace>, setWorkspaces: Dispatch<SetStateAction<Record<string, Workspace> | null>>) => {
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
                                            <TableCell>Template</TableCell>
                                            <TableCell>URL</TableCell>
                                            <TableCell>Duration</TableCell>
                                            <TableCell>Phase</TableCell>
                                            <TableCell>Node</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                    {filteredResources.map(([id, workspace]: [id: string, workspace: Workspace], index: number) => {
                                        const isItemSelected = isSelected(id);
                                        const labelId = `enhanced-table-checkbox-${index}`;
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
                                                <TableCell>{workspace.template.name}</TableCell>
                                                <TableCell><Link href={`//${workspace.url}`} target="_blank" rel="noreferrer" onClick={stopPropagation}>Browse {workspace.url}</Link></TableCell>
                                                <TableCell>{workspace.duration}</TableCell>
                                                <TableCell>{workspace.pod.phase}</TableCell>
                                                <TableCell>{workspace.node}</TableCell>
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
                        <WorkspaceUpdateDialog id={selected} duration={resources[selected].duration} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setWorkspaces)} onHide={() => setShowUpdateDialog(false)} />}
                    </>
                );
            }}
        </Resources>
    );
}

function Templates({ client, user }: { client: Client, user?: LoggedUser }): JSX.Element {
    const classes = useStyles();

    return (
        <Resources<Template> callback={async () => await client.listTemplates()}>
        {(resources: Record<string, Template>) => (
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
                                {template.name}
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

async function deleteUser(client: Client, id: string): Promise<void> {
    await client.deleteUser(id);
}

const useToolbarStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(1),
    },
    highlight:
      theme.palette.type === 'light'
        ? {
            color: theme.palette.secondary.main,
            backgroundColor: lighten(theme.palette.secondary.light, 0.85),
          }
        : {
            color: theme.palette.text.primary,
            backgroundColor: theme.palette.secondary.dark,
          },
    title: {
      flex: '1 1 100%',
    },
  }),
);

function DeleteConfirmationDialog({open, onClose, onConfirmation}: {open: boolean, onClose: () => void, onConfirmation?: () => void}): JSX.Element {
    return (
        <Dialog
        open={open}
        onClose={onClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">Are you sure?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This resource will be deleted
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} autoFocus>
            Disagree
          </Button>
          <Button onClick={() => {onClose(); if (onConfirmation) onConfirmation();}}>
            Agree
          </Button>
        </DialogActions>
      </Dialog>
    );
}

function EditToolbar({ selected, onCreate, onUpdate, onDelete }: {selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void}): JSX.Element {
    const [open, setOpen] = React.useState(false);
    if (selected) {
        return (
            <>
                {onUpdate &&
                <Tooltip title="Update">
                    <IconButton aria-label="update" onClick={onUpdate}>
                        <EditIcon />
                    </IconButton>
                </Tooltip>}
                {onDelete &&
                <Tooltip title="Delete">
                    <IconButton aria-label="delete" onClick={() => setOpen(true)}>
                        <DeleteIcon />
                    </IconButton>
                </Tooltip>}
                <DeleteConfirmationDialog open={open} onClose={() => setOpen(false)} onConfirmation={onDelete} />
            </>
        );
    } else {
        return (
            <>
                {onCreate &&
                <Tooltip title="Create">
                        <IconButton aria-label="create" onClick={onCreate}>
                            <AddIcon />
                        </IconButton>
                </Tooltip>}
            </>
        );
    }
}

function EnhancedTableToolbar({ user, label, selected = null, onCreate, onUpdate, onDelete }: { user?: LoggedUser, label: string, selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void}): JSX.Element {
    const classes = useToolbarStyles();
    return (
        <>
            <Toolbar
            className={clsx(classes.root, {
                [classes.highlight]: selected != null,
            })}
            >
            <Typography className={classes.title} variant="h6" id="tableTitle" component="div">
                {label}
            </Typography>
            {user && hasAdminEditRights(user) &&
            <EditToolbar selected={selected} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />}
            </Toolbar>
        </>
    );
}

function UserCreationDialog({ client, conf, users, show, onCreate, onHide }: { client: Client, conf: Configuration, users: Record<string, User>, show: boolean, onCreate: (id: string, conf: UserConfiguration) => void, onHide: () => void }): JSX.Element {
    const [id, setID] = React.useState('');
    const [adminChecked, setAdminChecked] = React.useState(false);
    const [poolAffinity, setPoolAffinity] = React.useState<string>(conf.workspace.poolAffinity);
    const [customizeDurationChecked, setCustomizeDurationChecked] = React.useState(false);
    const [customizePoolAffinityChecked, setCustomizePoolAffinityChecked] = React.useState(false);
    const [pools, setPools] = useState<Record<string, Pool> | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
    }, 5000);

    const handleIDChange = (event: React.ChangeEvent<HTMLInputElement>) => setID(event.target.value);
    const handleAdminChange = (event: React.ChangeEvent<HTMLInputElement>) => setAdminChecked(event.target.checked);
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);
    const handleCustomizeDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => setCustomizeDurationChecked(event.target.checked);
    const handleCustomizePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setCustomizePoolAffinityChecked(event.target.checked);
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
                        label="GitHub ID"
                        autoFocus
                        />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={adminChecked}
                                onChange={handleAdminChange}
                                />
                        }
                        label="Is admin"
                    />
                   <TextField
                        style={{marginBottom: 20}}
                        select
                        value={poolAffinity}
                        onChange={handlePoolAffinityChange}
                        required
                        label="Pool Affinity"
                        autoFocus
                        >
                    {pools &&
                    Object.keys(pools).map(id => (
                        <MenuItem key={id} value={id}>
                        {id}
                        </MenuItem>))
                    }
                    </TextField>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={customizeDurationChecked}
                                onChange={handleCustomizeDurationChange}
                                />
                        }
                        label="Can Customize duration"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={customizePoolAffinityChecked}
                                onChange={handleCustomizePoolAffinityChange}
                                />
                        }
                        label="Can Customize pool affinity"
                    />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={!id || users[id] != null || !poolAffinity} onClick={() => {onCreate(id.toLowerCase(), {admin: adminChecked, poolAffinity: poolAffinity, canCustomizeDuration: customizeDurationChecked, canCustomizePoolAffinity: customizePoolAffinityChecked}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function UserUpdateDialog({ client, id, user, show, onUpdate, onHide }: { client: Client, id: string, user: User, show: boolean, onUpdate: (id: string, conf: UserUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [adminChecked, setAdminChecked] = React.useState(user.admin);
    const [poolAffinity, setPoolAffinity] = React.useState(user.poolAffinity);
    const [customizeDurationChecked, setCustomizeDurationChecked] = React.useState(user.canCustomizeDuration);
    const [customizePoolAffinityChecked, setCustomizePoolAffinityChecked] = React.useState(user.canCustomizePoolAffinity);
    const [pools, setPools] = useState<Record<string, Pool> | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
    }, 5000);

    const handleAdminChange = (event: React.ChangeEvent<HTMLInputElement>) => setAdminChecked(event.target.checked);
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);
    const handleCustomizeDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => setCustomizeDurationChecked(event.target.checked);
    const handleCustomizePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setCustomizePoolAffinityChecked(event.target.checked);
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>User details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={adminChecked}
                                onChange={handleAdminChange}
                                />
                        }
                        label="Is admin"
                    />
                  <TextField
                        style={{marginBottom: 20}}
                        select
                        value={poolAffinity}
                        onChange={handlePoolAffinityChange}
                        required
                        label="Pool Affinity"
                        autoFocus
                        >
                    {pools &&
                    Object.keys(pools).map(id => (
                        <MenuItem key={id} value={id}>
                        {id}
                        </MenuItem>))
                    }
                    </TextField>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={customizeDurationChecked}
                                onChange={handleCustomizeDurationChange}
                                />
                        }
                        label="Can Customize duration"
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={customizePoolAffinityChecked}
                                onChange={handleCustomizePoolAffinityChange}
                                />
                        }
                        label="Can Customize pool affinity"
                    />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={ adminChecked == user.admin && poolAffinity == user.poolAffinity && customizeDurationChecked == user.canCustomizeDuration && customizePoolAffinityChecked == user.canCustomizePoolAffinity } onClick={() => {onUpdate(id.toLowerCase(), {admin: adminChecked, poolAffinity: poolAffinity, canCustomizeDuration: customizeDurationChecked, canCustomizePoolAffinity: customizePoolAffinityChecked}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function Users({ client, user, conf }: { client: Client, user?: LoggedUser, conf: Configuration }): JSX.Element {
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

    async function onCreate(id: string, conf: UserConfiguration, setUsers: Dispatch<SetStateAction<Record<string, User> | null>>): Promise<void> {
        try {
            await client.createUser(id, conf);
            setUsers((users: Record<string, User> | null) => {
                if (users) {
                    users[id] = updatedUserMock(conf);
                }
                return {...users};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to create user");
        }
    }

    function updatedUserMock(conf: UserUpdateConfiguration, user?: User): User {
        return {admin: conf.admin, poolAffinity: user?.poolAffinity || "", canCustomizeDuration: conf.canCustomizeDuration, canCustomizePoolAffinity: user?.canCustomizePoolAffinity || false};
    }

    async function onUpdate(id: string, conf: UserUpdateConfiguration, setUsers: Dispatch<SetStateAction<Record<string, User> | null>>): Promise<void> {
        try {
            await client.updateUser(id, conf);
            setUsers((users: Record<string, User> | null) => {
                if (users) {
                    users[id] = updatedUserMock(conf, users[id]);
                }
                return {...users};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to update user");
        }
    }

    async function onDelete(setUsers: Dispatch<SetStateAction<Record<string, User> | null>>): Promise<void> {
        if (selected && selected != user?.id) {
            try {
                await deleteUser(client, selected);

                setUsers((users: Record<string, User> | null) => {
                    if (users) {
                        delete users[selected];
                    }
                    return users;
                });
                setSelected(null);
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to delete user");
            }
        } else {
            setErrorMessage("Can't delete currently logged user");
        }
    }

    return (
        <Resources<User> callback={async () => await client.listUsers()}>
        {(resources: Record<string, User>, setUsers: Dispatch<SetStateAction<Record<string, User> | null>>) => (
            <>
                <EnhancedTableToolbar user={user} label="Users" selected={selected} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setUsers)} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell>ID</TableCell>
                                <TableCell>Pool Affinity</TableCell>
                                <TableCell>Admin</TableCell>
                                <TableCell>Can Customize Duration</TableCell>
                                <TableCell>Can Customize Pool Affinity</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.entries(resources).map(([id, user], index) => {
                                    const isItemSelected = isSelected(id);
                                    const labelId = `enhanced-table-checkbox-${index}`;
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
                                        {id}
                                    </TableCell>
                                    <TableCell>{user.poolAffinity}</TableCell>
                                    <TableCell>{user.admin.toString()}</TableCell>
                                    <TableCell>{user.canCustomizeDuration.toString()}</TableCell>
                                    <TableCell>{user.canCustomizePoolAffinity.toString()}</TableCell>
                                </TableRow>
                                )})}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {showCreationDialog &&
                <UserCreationDialog client={client} conf={conf} users={resources} show={showCreationDialog} onCreate={(id, conf) => onCreate(id, conf, setUsers)} onHide={() => setShowCreationDialog(false)} />}
                {(selected && showUpdateDialog) &&
                <UserUpdateDialog client={client} id={selected} user={resources[selected]} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setUsers)} onHide={() => setShowUpdateDialog(false)} />}
            </>
        )}
        </Resources>
    );
}

function DetailsPanel({ conf }: { conf: Configuration }): JSX.Element {
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

function Pools({ client, user }: { client: Client, user?: LoggedUser }): JSX.Element {
    const classes = useStyles();

    return (
        <Resources<Pool> callback={async () => await client.listPools()}>
        {(resources: Record<string, Pool>) => (
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
                        {Object.entries(resources).map(([id, pool]) => (
                        <TableRow key={id}>
                            <TableCell>{pool.name}</TableCell>
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

export function AdminPanel({ client, user, conf }: { client: Client, user?: LoggedUser, conf: Configuration }): JSX.Element {
    const [value, setValue] = React.useState(0);

    const handleChange = (_: React.ChangeEvent<Record<string, unknown>>, newValue: number) => {
        setValue(newValue);
    };

    return (
        <CenteredContainer>
            <Tabs value={value} onChange={handleChange} aria-label="wrapped label tabs example">
                <Tab label="Details" />
                <Tab label="Templates" />
                <Tab label="Users" />
                <Tab label="Workspaces" />
                <Tab label="Pools" />
            </Tabs>

            <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", alignItems: 'center', justifyContent: 'center', textAlign: 'center', marginTop: 20, width: "80vw", height: "80vh"}} elevation={3}>
                {value == 0
                ? <DetailsPanel conf={conf} />
                : value == 1
                ? <Templates client={client} user={user} />
                : value == 2
                ? <Users client={client} user={user} conf={conf} />
                : value == 3
                ? <Workspaces client={client} conf={conf} user={user} />
                : <Pools client={client} user={user} />}
            </Paper>
        </CenteredContainer>
    );
}
