import clsx from 'clsx';
import React, { Dispatch, SetStateAction, useState } from "react";
import { createStyles, lighten, makeStyles, Theme } from '@material-ui/core/styles';
import Checkbox from '@material-ui/core/Checkbox';
import IconButton from '@material-ui/core/IconButton';
import CreateIcon from '@material-ui/icons/Create';
import DeleteIcon from '@material-ui/icons/Delete';
import Paper from '@material-ui/core/Paper';
import Tab from '@material-ui/core/Tab';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Tabs from '@material-ui/core/Tabs';
import Tooltip from '@material-ui/core/Tooltip';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { Client, Configuration, PlaygroundUser, Session, Template, User } from '@substrate/playground-client';
import { CenteredContainer, ErrorSnackbar, LoadingPanel } from '../components';
import { useInterval } from '../hooks';
import { Button, ButtonGroup, Container, Dialog, DialogContent, DialogContentText, DialogTitle, TextField } from '@material-ui/core';

const useStyles = makeStyles({
    table: {
      minWidth: 650,
    },
});

function EmptyPanel({ label }: { label: string}): JSX.Element {
    return (
        <Container>
            <Typography variant="h6">
                {label}
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
    } else if (Object.keys(resources).length > 0) {
        return (
            <Container>
                {children(resources, setResources)}
            </Container>
        );
    } else {
        return <EmptyPanel label={`No ${label.toLowerCase()}`} />;
    }
}

function Sessions({ client }: { client: Client }): JSX.Element {
    const classes = useStyles();

    return (
        <Resources<Session> label="Sessions" callback={async () => await client.listSessions()}>
            {(resources: Record<string, Session>) => (
            <>
                <EnhancedTableToolbar label="Sessions" />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell align="right">Template</TableCell>
                                <TableCell align="right">URL</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                        {Object.entries(resources).map(([id, session]) => (
                        <TableRow key={id}>
                            <TableCell component="th" scope="row">
                                {id}
                            </TableCell>
                            <TableCell align="right">{session.template.name}</TableCell>
                            <TableCell align="right"><a href={session.url}>{session.url}</a></TableCell>
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

function EnhancedTableToolbar({ label, selected = null, onCreate, onDelete }: { label: string, selected?: string | null, onCreate?: () => void, onDelete?: () => void}): JSX.Element {
    const classes = useToolbarStyles();
    return (
        <Toolbar
        className={clsx(classes.root, {
            [classes.highlight]: selected != null,
        })}
        >
        <Typography className={classes.title} variant="h6" id="tableTitle" component="div">
            {label}
        </Typography>
        {selected ? (
            <Tooltip title="Delete">
            <IconButton aria-label="delete" onClick={onDelete}>
                <DeleteIcon />
            </IconButton>
            </Tooltip>
        ) : onCreate ? (
            <Tooltip title="Create">
            <IconButton aria-label="create" onClick={onCreate}>
                <CreateIcon />
            </IconButton>
            </Tooltip>
        ) : <></>}
        </Toolbar>
    );
}

function UserCreationDialog({ users, show, onCreate, onHide }: { users: Record<string, User>, show: boolean, onCreate: (id: string) => void, onHide: () => void }): JSX.Element {
    const [value, setValue] = React.useState('');

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
    };
    return (
        <Dialog open={show} maxWidth="md">
            <DialogTitle>User details</DialogTitle>
            <DialogContent>
                <div style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        value={value}
                        onChange={handleChange}
                        required
                        label="GitHub ID"
                        autoFocus
                        />
                    <ButtonGroup style={{alignSelf: "flex-end"}} size="small">
                        <Button disabled={!value || users[value] != null} onClick={() => {setValue(''); onCreate(value.toLowerCase()); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Users({ client, user }: { client: Client, user: PlaygroundUser }): JSX.Element {
    const classes = useStyles();
    const [selected, setSelected] = useState<string | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isSelected = (name: string) => selected == name;
    const handleClick = (_event: React.MouseEvent<unknown>, name: string) => {
        if (selected == name) {
            setSelected(null);
        } else {
            setSelected(name);
        }
   };

    async function onCreate(id: string, setUsers: Dispatch<SetStateAction<Record<string, User> | null>>): Promise<void> {
        try {
            const details = {admin: false};
            await client.createOrUpdateUser(id, details);
            setUsers((users: Record<string, User> | null) => {
                if (users) {
                    users[id] = details;
                }
                return {...users};
            });
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to create user");
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
                <EnhancedTableToolbar label="Users" selected={selected} onCreate={() => setShowCreationDialog(true)} onDelete={() => onDelete(setUsers)} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell>ID</TableCell>
                                <TableCell align="right">Admin</TableCell>
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
                                </TableRow>
                                )})}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                <UserCreationDialog users={resources} show={showCreationDialog} onCreate={(id) => onCreate(id, setUsers)} onHide={() => setShowCreationDialog(false)} />
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
