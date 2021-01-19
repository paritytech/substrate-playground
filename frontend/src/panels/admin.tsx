import clsx from 'clsx';
import React, { useState } from "react";
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
import { CenteredContainer, ErrorSnackbar } from '../components';
import { useInterval } from '../hooks';
import { Container } from '@material-ui/core';

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

function Sessions({ client }: { client: Client }): JSX.Element {
    const classes = useStyles();
    const [sessions, setSessions] = useState<Record<string, Session>>({});

    useInterval(async () => {
        setSessions(await client.listSessions());
    }, 5000);

    if (Object.keys(sessions).length > 0) {
        return (
            <Container>
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
                        {Object.entries(sessions).map(([id, session]) => (
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
            </Container>
        );
    } else {
        return <EmptyPanel label="No sessions" />;
    }
}

function Templates({ client }: { client: Client }): JSX.Element {
    const classes = useStyles();
    const [templates, setTemplates] = useState<Record<string, Template>>({});

    useInterval(async () => {
        const { templates } = await client.get();
        setTemplates(templates);
    }, 5000);

    if (Object.keys(templates).length > 0) {
        return (
            <Container>
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
                        {Object.entries(templates).map(([id, template]) => (
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
            </Container>
        );
    } else {
        return <EmptyPanel label="No templates" />;
    }
}

async function createOrUpdateUser(client: Client, id: string, admin: boolean): Promise<void> {
    await client.createOrUpdateUser(id, {admin: admin});
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

function EnhancedTableToolbar({ label, selected = null, onDelete }: { label: string, selected?: string | null, onDelete?: () => void}): JSX.Element {
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
        ) : (
            <Tooltip title="Create">
            <IconButton aria-label="create">
                <CreateIcon />
            </IconButton>
            </Tooltip>
        )}
        </Toolbar>
    );
}

function Users({ client, user }: { client: Client, user: PlaygroundUser }): JSX.Element {
    const classes = useStyles();
    const [selected, setSelected] = useState<string | null>(null);
    const [users, setUsers] = useState<Record<string, User>>({});
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isSelected = (name: string) => selected == name;
    const handleClick = (_event: React.MouseEvent<unknown>, name: string) => {
        if (selected == name) {
            setSelected(null);
        } else {
            setSelected(name);
        }
   };

    useInterval(async () => {
        setUsers(await client.listUsers());
    }, 5000);

    async function onDelete(): Promise<void> {
        if (selected && selected != user.id) {
            delete users[selected];
            setUsers({...users});
            setSelected(null);
            try {
                await deleteUser(client, selected);
            } catch {
                setErrorMessage("Failed to delete user");
            }
        } else {
            setErrorMessage("Can't delete currently logged user");
        }
    }

    if (Object.keys(users).length > 0) {
        return (
            <Container>
                <EnhancedTableToolbar label="Users" selected={selected} onDelete={onDelete} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell align="right">Admin</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.entries(users).map(([id, user], index) => {
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
            </Container>
        );
    } else {
        return <EmptyPanel label="No users" />;
    }
}

function DetailsPanel({ client }: { client: Client }): JSX.Element {
    const [configuration, setConfiguration] = useState<Configuration | null>(null);

    useInterval(async () => {
        const { configuration } = await client.get();
        setConfiguration(configuration);
    }, 10000);

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
