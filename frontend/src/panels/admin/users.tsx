import React, { Dispatch, SetStateAction, useState } from "react";
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from "@mui/material/DialogActions";
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { Client, Pool, Preference, Preferences, ResourceType, User, UserConfiguration, UserUpdateConfiguration } from '@substrate/playground-client';
import { ErrorSnackbar } from '../../components';
import { useInterval } from '../../hooks';
import { useStyles, EnhancedTableToolbar, Resources } from '.';
import { find, remove } from "../../utils";

const defaultRole = 'user';

function UserCreationDialog({ client, preferences, users, show, onCreate, onHide }: { client: Client, preferences: Preference[], users: User[], show: boolean, onCreate: (id: string, conf: UserConfiguration) => void, onHide: () => void }): JSX.Element {
    const [id, setID] = React.useState('');
    const [poolAffinity, setPoolAffinity] = React.useState<string>(find(preferences, Preferences.SessionPoolAffinity));
    const [role, setRole] = React.useState(defaultRole);
    const [pools, setPools] = useState<Pool[] | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
    }, 5000);

    const handleIDChange = (event: React.ChangeEvent<HTMLInputElement>) => setID(event.target.value);
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);
    const handleRoleChange = (event: React.ChangeEvent<HTMLInputElement>) => setRole(event.target.value);
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
                    pools.map(pool => (
                        <MenuItem key={pool.id} value={pool.id}>
                        {pool.id}
                        </MenuItem>))
                    }
                    </TextField>
                    <TextField
                        style={{marginBottom: 20}}
                        value={role}
                        onChange={handleRoleChange}
                        required
                        label="Role"
                        />
                    <DialogActions>
                        <Button disabled={!id || find(users, id) != null || !poolAffinity} onClick={() => {onCreate(id, {role: role, preferences: {poolAffinity: poolAffinity}}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function UserUpdateDialog({ client, user, show, onUpdate, onHide }: { client: Client, user: User, show: boolean, onUpdate: (id: string, conf: UserUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [poolAffinity, setPoolAffinity] = React.useState(user.preferences["poolAffinity"] || "");
    const [role, setRole] = React.useState(user.role);
    const [pools, setPools] = useState<Pool[] | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
    }, 5000);

    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);
    const handleRoleChange = (event: React.ChangeEvent<HTMLInputElement>) => setRole(event.target.value);
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>User details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
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
                     pools.map(pool => (
                        <MenuItem key={pool.id} value={pool.id}>
                        {pool.id}
                        </MenuItem>))
                    }
                    </TextField>
                    <TextField
                        style={{marginBottom: 20}}
                        value={role}
                        onChange={handleRoleChange}
                        required
                        label="Role"
                        />
                    <DialogActions>
                        <Button disabled={ poolAffinity == user.preferences["poolAffinity"] && role == user.role } onClick={() => {onUpdate(user.id, {role: role, preferences: {poolAffinity: poolAffinity}}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

export function Users({ client, user, preferences }: { client: Client, user: User, preferences: Preference[] }): JSX.Element {
    const classes = useStyles();
    const [selected, setSelected] = useState<User | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isSelected = (user: User) => selected?.id == user.id;
    const handleClick = (_event: React.MouseEvent<unknown>, user: User) => {
        if (isSelected(user)) {
            setSelected(null);
        } else {
            setSelected(user);
        }
   };

    async function onCreate(id: string, conf: UserConfiguration, setUsers: Dispatch<SetStateAction<User[] | null>>): Promise<void> {
        try {
            await client.createUser(id, conf);
        } catch (e: any) {
            setErrorMessage(`Failed to create user: ${JSON.stringify(e.data)}`);
        }
    }

    async function onUpdate(id: string, conf: UserUpdateConfiguration, setUsers: Dispatch<SetStateAction<User[] | null>>): Promise<void> {
        try {
            await client.updateUser(id, conf);
        } catch (e: any) {
            setErrorMessage(`Failed to update user: ${JSON.stringify(e.data)}`);
        }
    }

    async function onDelete(setUsers: Dispatch<SetStateAction<User[] | null>>): Promise<void> {
        if (selected && selected.id != user.id) {
            try {
                await client.deleteUser(selected.id);
                setSelected(null);
                setUsers((users: User[] | null) => {
                    if (users) {
                        return remove(users, selected.id);
                    }
                    return users;
                });
            } catch (e: any) {
                setErrorMessage(`Failed to delete user: ${JSON.stringify(e.data)}`);
            }
        } else {
            setErrorMessage("Can't delete currently logged user");
        }
    }

    return (
        <Resources<User> callback={async () => await client.listUsers()}>
        {(resources: User[], setUsers: Dispatch<SetStateAction<User[] | null>>) => (
            <>
                <EnhancedTableToolbar client={client} user={user} label="Users" selected={selected?.id} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setUsers)} resourceType={ResourceType.User} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell>ID</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Preferences</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {resources.map((user, index) => {
                                    const isItemSelected = isSelected(user);
                                    const labelId = `enhanced-table-checkbox-${index}`;
                                    return (
                                <TableRow
                                    key={user.id}
                                    hover
                                    onClick={(event) => handleClick(event, user)}
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
                                        {user.id}
                                    </TableCell>
                                    <TableCell>{user.role}</TableCell>
                                    <TableCell>{JSON.stringify(user.preferences)}</TableCell>
                                </TableRow>
                                )})}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {showCreationDialog &&
                <UserCreationDialog client={client} preferences={preferences} users={resources} show={showCreationDialog} onCreate={(id, conf) => onCreate(id, conf, setUsers)} onHide={() => setShowCreationDialog(false)} />}
                {(selected && showUpdateDialog) &&
                <UserUpdateDialog client={client} user={selected} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setUsers)} onHide={() => setShowUpdateDialog(false)} />}
            </>
        )}
        </Resources>
    );
}
