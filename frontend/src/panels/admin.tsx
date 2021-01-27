import clsx from 'clsx';
import React, { Dispatch, SetStateAction, useState } from "react";
import { createStyles, lighten, makeStyles, Theme } from '@material-ui/core/styles';
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
import EditIcon from '@material-ui/icons/Edit';
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
import { Client, Configuration, PlaygroundUser, Session, SessionConfiguration, SessionUpdateConfiguration, Template, User, UserConfiguration, UserUpdateConfiguration } from '@substrate/playground-client';
import { CenteredContainer, ErrorSnackbar, LoadingPanel } from '../components';
import { useInterval } from '../hooks';
import { MenuItem } from '@material-ui/core';

const useStyles = makeStyles({
    table: {
      minWidth: 650,
    },
});

function NoResourcesContainer({ label, action }: { label: string, action?: () => void}): JSX.Element {
    return (
        <Container>
            <Typography variant="h6">
                {label}
                {action &&
                 <Tooltip title="Create">
                    <IconButton aria-label="create" onClick={action}>
                        <AddIcon />
                    </IconButton>
                </Tooltip>}
            </Typography>
        </Container>
    );
}

function Resources<T>( { children, label, callback }: { children: (resources: Record<string, T>, setter: Dispatch<SetStateAction<Record<string, T> | null>>) => NonNullable<React.ReactNode>, label: string, callback: () => Promise<Record<string, T>> }): JSX.Element {
    const [resources, setResources] = useState<Record<string, T> | null>(null);

    useInterval(async () => {
        setResources(await callback());
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

function SessionCreationDialog({ conf, sessions, users, templates, show, onCreate, onHide }: { conf: Configuration | null, sessions: Record<string, Session>, users: Record<string, User> | null, templates: Record<string, Template> | null, show: boolean, onCreate: (id: string, conf: SessionConfiguration) => void, onHide: () => void }): JSX.Element {
    const [user, setUser] = React.useState<string | null>(null);
    const [template, setTemplate] = React.useState<string | null>(null);
    const [duration, setDuration] = React.useState(0);

    React.useEffect(() => {
        if (conf) {
            setDuration(conf?.sessionDefaults.duration);
        }
    }, []);

    const handleUserChange = (event: React.ChangeEvent<HTMLInputElement>) => setUser(event.target.value);
    const handleTemplateChange = (event: React.ChangeEvent<HTMLInputElement>) => setTemplate(event.target.value);
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => setDuration(Number.parseInt(event.target.value));
    return (
        <Dialog open={show} maxWidth="md">
            <DialogTitle>Session details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={user}
                        onChange={handleUserChange}
                        required
                        label="User"
                        autoFocus
                        >
                    {users &&
                    Object.keys(users).map(id => (
                        <MenuItem key={id} value={id}>
                        {id}
                        </MenuItem>))
                    }
                    </TextField>
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
                    <TextField
                        style={{marginBottom: 20}}
                        value={duration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={user == null || template == null || sessions[user] != null || duration <= 0} onClick={() => {onCreate(user.toLowerCase(), {template: template, duration: duration}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function SessionUpdateDialog({ id, duration, show, onUpdate, onHide }: { id: string, duration: number, show: boolean, onUpdate: (id: string, conf: SessionUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [newDuration, setDuration] = React.useState(0);

    React.useEffect(() => {
        setDuration(duration);
    }, [duration]);

    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => setDuration(Number.parseInt(event.target.value));
    return (
        <Dialog open={show} maxWidth="md">
            <DialogTitle>Session details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        value={duration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        autoFocus
                        />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={ duration == newDuration} onClick={() => {onUpdate(id.toLowerCase(), {duration: newDuration}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function Sessions({ client }: { client: Client }): JSX.Element {
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
    const [configuration, setConfiguration] = useState<Configuration | null>(null);
    const [users, setUsers] = useState<Record<string, User> | null>(null);
    const [templates, setTemplates] = useState<Record<string, Template> | null>(null);

    useInterval(async () => {
        const { configuration, templates } = await client.get();
        setConfiguration(configuration);
        setTemplates(templates);
        setUsers(await client.listUsers());
    }, 5000);

    function sessionMock(conf: SessionConfiguration): Session {
        return {duration: conf.duration || 0, template: {name: "", image: "", description: ""}, user: "", url: "", pod: {phase: 'Pending', reason: "", message: ""}};
    }

    async function onCreate(id: string, conf: SessionConfiguration, setSessions: Dispatch<SetStateAction<Record<string, Session> | null>>): Promise<void> {
        try {
            await client.createSession(id, conf);
            setSessions((sessions: Record<string, Session> | null) => {
                if (sessions) {
                    sessions[id] = sessionMock(conf);
                }
                return {...sessions};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to create session");
        }
    }

    async function onUpdate(id: string, conf: SessionUpdateConfiguration, setSessions: Dispatch<SetStateAction<Record<string, Session> | null>>): Promise<void> {
        try {
            await client.updateSession(id, conf);
            setSessions((sessions: Record<string, Session> | null) => {
                if (sessions && conf.duration) {
                    sessions[id].duration = conf.duration;
                }
                return {...sessions};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to update session");
        }
    }

    async function onDelete(setSessions: Dispatch<SetStateAction<Record<string, Session> | null>>): Promise<void> {
        if (selected) {
            try {
                await client.deleteSession(selected);

                setSessions((sessions: Record<string, Session> | null) => {
                    if (sessions) {
                        delete sessions[selected];
                    }
                    return sessions;
                });
                setSelected(null);
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to delete session");
            }
        } else {
            setErrorMessage("Can't delete currently logged session");
        }
    }

    return (
        <Resources<Session> label="Sessions" callback={async () => await client.listSessions()}>
            {(resources: Record<string, Session>, setSessions: Dispatch<SetStateAction<Record<string, Session> | null>>) => (
            <>
                {Object.keys(resources).length > 0
                ?
                <>
                    <EnhancedTableToolbar label="Sessions" selected={selected} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setSessions)} />
                    <TableContainer component={Paper}>
                        <Table className={classes.table} aria-label="simple table">
                            <TableHead>
                                <TableRow>
                                    <TableCell></TableCell>
                                    <TableCell>ID</TableCell>
                                    <TableCell align="right">Template</TableCell>
                                    <TableCell align="right">URL</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                            {Object.entries(resources).map(([id, session], index) => {
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
                                        <TableCell align="right">{session.template.name}</TableCell>
                                        <TableCell align="right"><a href={`//${session.url}`}>{session.url}</a></TableCell>
                                    </TableRow>
                                )})}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
                : <NoResourcesContainer label={`No sessions`} action={() => setShowCreationDialog(true)} />}
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                <SessionCreationDialog conf={configuration} sessions={resources} users={users} templates={templates} show={showCreationDialog} onCreate={(id, conf) => onCreate(id, conf, setSessions)} onHide={() => setShowCreationDialog(false)} />
                {selected &&
                <SessionUpdateDialog id={selected} duration={resources[selected].duration} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setSessions)} onHide={() => setShowUpdateDialog(false)} />}
            </>
            )}
        </Resources>
    );
}

function Templates({ client }: { client: Client }): JSX.Element {
    const classes = useStyles();

    return (
        <Resources<Template> label="Templates" callback={async () => (await client.get()).templates}>
        {(resources: Record<string, Template>) => (
            <>
                <EnhancedTableToolbar label="Templates" />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell align="right">Name</TableCell>
                                <TableCell align="right">Image</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {Object.entries(resources).map(([id, template]) => (
                        <TableRow key={id}>
                            <TableCell component="th" scope="row">
                                {template.name}
                            </TableCell>
                            <TableCell align="right">{template.name}</TableCell>
                            <TableCell align="right">{template.image}</TableCell>
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

function EnhancedTableToolbar({ label, selected = null, onCreate, onUpdate, onDelete }: { label: string, selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void}): JSX.Element {
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
            {selected ?
            <>
                {onUpdate &&
                <Tooltip title="Update">
                    <IconButton aria-label="update" onClick={onUpdate}>
                        <EditIcon />
                    </IconButton>
                </Tooltip>}
                {onDelete &&
                <Tooltip title="Delete">
                    <IconButton aria-label="delete" onClick={onDelete}>
                        <DeleteIcon />
                    </IconButton>
                </Tooltip>}
            </>
            : <>
            {onCreate &&
            <Tooltip title="Create">
                    <IconButton aria-label="create" onClick={onCreate}>
                        <AddIcon />
                    </IconButton>
            </Tooltip>}
            </>
            }
            </Toolbar>
        </>
    );
}

function UserCreationDialog({ users, show, onCreate, onHide }: { users: Record<string, User>, show: boolean, onCreate: (id: string, conf: UserConfiguration) => void, onHide: () => void }): JSX.Element {
    const [id, setID] = React.useState('');
    const [durationChecked, setDurationChecked] = React.useState(false);

    function reset(): void {
        setID('');
        setDurationChecked(false);
    }
    const handleIDChange = (event: React.ChangeEvent<HTMLInputElement>) => setID(event.target.value);
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => setDurationChecked(event.target.checked);
    return (
        <Dialog open={show} maxWidth="md">
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
                                checked={durationChecked}
                                onChange={handleDurationChange}
                                />
                        }
                        label="Can Customize duration"
                    />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={!id || users[id] != null} onClick={() => {reset(); onCreate(id.toLowerCase(), {admin: false, canCustomizeDuration: durationChecked}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function UserUpdateDialog({ id, admin, canCustomizeDuration, show, onUpdate, onHide }: { id: string, admin: boolean, canCustomizeDuration: boolean, show: boolean, onUpdate: (id: string, conf: UserUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [adminChecked, setAdminChecked] = React.useState(false);
    const [durationChecked, setDurationChecked] = React.useState(false);

    React.useEffect(() => {
        setAdminChecked(admin);
        setDurationChecked(canCustomizeDuration);
    }, [admin, canCustomizeDuration]);

    function reset(): void {
        setAdminChecked(false);
        setDurationChecked(false);
    }
    const handleAdminChange = (event: React.ChangeEvent<HTMLInputElement>) => setAdminChecked(event.target.checked);
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => setDurationChecked(event.target.checked);
    return (
        <Dialog open={show} maxWidth="md">
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
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={durationChecked}
                                onChange={handleDurationChange}
                                />
                        }
                        label="Can Customize duration"
                    />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={ adminChecked == admin && durationChecked == canCustomizeDuration} onClick={() => {reset(); onUpdate(id.toLowerCase(), {admin: adminChecked, canCustomizeDuration: durationChecked}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function Users({ client, user }: { client: Client, user: PlaygroundUser }): JSX.Element {
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
                    users[id] = conf;
                }
                return {...users};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to create user");
        }
    }

    async function onUpdate(id: string, conf: UserUpdateConfiguration, setUsers: Dispatch<SetStateAction<Record<string, User> | null>>): Promise<void> {
        try {
            await client.updateUser(id, conf);
            setUsers((users: Record<string, User> | null) => {
                if (users) {
                    users[id] = conf;
                }
                return {...users};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to update user");
        }
    }

    async function onDelete(setUsers: Dispatch<SetStateAction<Record<string, User> | null>>): Promise<void> {
        if (selected && selected != user.id) {
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
        <Resources<User> label="Users" callback={async () => await client.listUsers()}>
        {(resources: Record<string, User>, setUsers: Dispatch<SetStateAction<Record<string, User> | null>>) => (
            <>
                <EnhancedTableToolbar label="Users" selected={selected} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setUsers)} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell>ID</TableCell>
                                <TableCell align="right">Admin</TableCell>
                                <TableCell align="right">Can Customize Duration</TableCell>
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
                                    <TableCell align="right">{user.admin.toString()}</TableCell>
                                    <TableCell align="right">{user.canCustomizeDuration.toString()}</TableCell>
                                </TableRow>
                                )})}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                <UserCreationDialog users={resources} show={showCreationDialog} onCreate={(id, conf) => onCreate(id, conf, setUsers)} onHide={() => setShowCreationDialog(false)} />
                {selected &&
                <UserUpdateDialog id={selected} admin={resources[selected].admin} canCustomizeDuration={resources[selected].canCustomizeDuration} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setUsers)} onHide={() => setShowUpdateDialog(false)} />}
            </>
        )}
        </Resources>
    );
}

function DetailsPanel({ client }: { client: Client }): JSX.Element {
    const [configuration, setConfiguration] = useState<Configuration | null>(null);

    useInterval(async () => {
        const { configuration } = await client.get();
        setConfiguration(configuration);
    }, 5000);

    return (
        <Container>
            Default duration: {configuration?.sessionDefaults.duration} minutes
        </Container>
    );
}

export function AdminPanel({ client, user }: { client: Client, user: PlaygroundUser }): JSX.Element {
    const [value, setValue] = React.useState(0);

    const handleChange = (_: React.ChangeEvent<{}>, newValue: number) => {
        setValue(newValue);
    };

    return (
        <CenteredContainer>
            <Tabs value={value} onChange={handleChange} aria-label="wrapped label tabs example">
                <Tab label="Details" />
                <Tab label="Templates" />
                <Tab label="Users" />
                <Tab label="Sessions" />
            </Tabs>

            <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", alignItems: 'center', justifyContent: 'center', textAlign: 'center', marginTop: 20, width: "80vw", height: "80vh"}} elevation={3}>
                {value == 0
                ? <DetailsPanel client={client} />
                : value == 1
                ? <Templates client={client} />
                : value == 2
                ? <Users client={client} user={user} />
                : <Sessions client={client} />}
            </Paper>
        </CenteredContainer>
    );
}
