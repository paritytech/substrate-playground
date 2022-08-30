import React, { Dispatch, SetStateAction, useState } from "react";
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from "@mui/material/DialogActions";
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { Client, Preference, Preferences, ResourcePermission, ResourceType, Role, RoleConfiguration, RoleUpdateConfiguration, User } from '@substrate/playground-client';
import { ErrorSnackbar } from '../../components';
import { useStyles, EnhancedTableToolbar, Resources } from '.';
import { find } from "../../utils";

function createPermissions(): Record<ResourceType, Array<ResourcePermission>> {
    return {
        Pool: [],
        Preference: [],
        Profile: [],
        Repository: [],
        RepositoryVersion: [],
        Role: [],
        Session: [],
        SessionExecution: [],
        User: [],
        Workspace: []
    };
}

function RoleCreationDialog({ client, preferences, roles, show, onCreate, onHide }: { client: Client, preferences: Preference[], roles: Role[], show: boolean, onCreate: (id: string, conf: RoleConfiguration) => void, onHide: () => void }): JSX.Element {
    const [id, setID] = React.useState('');
    const [permissions, setPermissions] = React.useState(find(preferences, Preferences.SessionPoolAffinity)?.value);

    const handleIDChange = (event: React.ChangeEvent<HTMLInputElement>) => setID(event.target.value);
    const handlePermissionsChange = (event: React.ChangeEvent<HTMLInputElement>) => setPermissions(event.target.value);
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Role details</DialogTitle>
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
                        value={permissions}
                        onChange={handlePermissionsChange}
                        required
                        label="Permissions"
                        />
                    <DialogActions>
                        <Button disabled={!id || find(roles, id) != null || !permissions} onClick={() => {onCreate(id, {permissions: createPermissions()}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

export function Roles({ client, user, preferences }: { client: Client, user: User, preferences: Preference[] }): JSX.Element {
    const classes = useStyles();
    const [selected, setSelected] = useState<Role | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isSelected = (role: Role) => selected?.id == role.id;
    const handleClick = (_event: React.MouseEvent<unknown>, role: Role) => {
        if (isSelected(role)) {
            setSelected(null);
        } else {
            setSelected(role);
        }
   };

    async function onCreate(id: string, conf: RoleConfiguration, setRoles: Dispatch<SetStateAction<Role[] | null>>): Promise<void> {
        try {
            await client.createRole(id, conf);
        } catch (e: any) {
            setErrorMessage(`Failed to create role: ${JSON.stringify(e.data)}`);
        }
    }

    async function onUpdate(id: string, conf: RoleUpdateConfiguration, setRoles: Dispatch<SetStateAction<Role[] | null>>): Promise<void> {
        try {
            await client.updateRole(id, conf);
        } catch (e: any) {
            setErrorMessage(`Failed to update role: ${JSON.stringify(e.data)}`);
        }
    }

    async function onDelete(setRoles: Dispatch<SetStateAction<Role[] | null>>): Promise<void> {
        if (selected && selected.id != user.id) {
            try {
                await client.deleteRole(selected.id);
                setSelected(null);
            } catch (e: any) {
                setErrorMessage(`Failed to delete role: ${JSON.stringify(e.data)}`);
            }
        } else {
            setErrorMessage("Can't delete currently logged user");
        }
    }

    return (
        <Resources<Role> callback={async () => await client.listRoles()}>
        {(resources: Role[], setRoles: Dispatch<SetStateAction<Role[] | null>>) => (
            <>
                <EnhancedTableToolbar client={client} user={user} label="Users" selected={selected?.id} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setRoles)} resourceType={ResourceType.User} />
                <TableContainer component={Paper}>
                    <Table className={classes.table} aria-label="simple table">
                        <TableHead>
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell>ID</TableCell>
                                <TableCell>Permissions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {resources.map((role, index) => {
                                    const isItemSelected = isSelected(role);
                                    const labelId = `enhanced-table-checkbox-${index}`;
                                    return (
                                <TableRow
                                    key={role.id}
                                    hover
                                    onClick={(event) => handleClick(event, role)}
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
                                        {role.id}
                                    </TableCell>
                                    <TableCell>{JSON.stringify(role.permissions)}</TableCell>
                                </TableRow>
                                )})}
                        </TableBody>
                    </Table>
                </TableContainer>
                {errorMessage &&
                <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                {showCreationDialog &&
                <RoleCreationDialog client={client} preferences={preferences} roles={resources} show={showCreationDialog} onCreate={(id, conf) => onCreate(id, conf, setRoles)} onHide={() => setShowCreationDialog(false)} />}
            </>
        )}
        </Resources>
    );
}
