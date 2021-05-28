import React, { Dispatch, SetStateAction, useState } from "react";
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import Checkbox from '@material-ui/core/Checkbox';
import Container from '@material-ui/core/Container';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TextField from '@material-ui/core/TextField';
import { Client, Configuration, LoggedUser, Pool, User, UserConfiguration, UserUpdateConfiguration } from '@substrate/playground-client';
import { ErrorSnackbar } from '../../components';
import { useInterval } from '../../hooks';
import { useStyles, EnhancedTableToolbar, Resources } from '.';
import { find } from "src/utils";

function UserCreationDialog({ client, conf, users, show, onCreate, onHide }: { client: Client, conf: Configuration, users: User[], show: boolean, onCreate: (id: string, conf: UserConfiguration) => void, onHide: () => void }): JSX.Element {
    const [id, setID] = React.useState('');
    const [adminChecked, setAdminChecked] = React.useState(false);
    const [poolAffinity, setPoolAffinity] = React.useState<string>(conf.workspace.poolAffinity);
    const [customizeDurationChecked, setCustomizeDurationChecked] = React.useState(false);
    const [customizePoolAffinityChecked, setCustomizePoolAffinityChecked] = React.useState(false);
    const [pools, setPools] = useState<Pool[] | null>(null);

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
                        <Button disabled={!id || find(users, id) != null || !poolAffinity} onClick={() => {onCreate(id.toLowerCase(), {admin: adminChecked, poolAffinity: poolAffinity, canCustomizeDuration: customizeDurationChecked, canCustomizePoolAffinity: customizePoolAffinityChecked}); onHide();}}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function UserUpdateDialog({ client, id, user, show, onUpdate, onHide }: { client: Client, id: string, user: User | undefined, show: boolean, onUpdate: (id: string, conf: UserUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
    const [adminChecked, setAdminChecked] = React.useState(user?.admin || false);
    const [poolAffinity, setPoolAffinity] = React.useState(user?.poolAffinity || "");
    const [customizeDurationChecked, setCustomizeDurationChecked] = React.useState(user?.canCustomizeDuration || false);
    const [customizePoolAffinityChecked, setCustomizePoolAffinityChecked] = React.useState(user?.canCustomizePoolAffinity || false);
    const [pools, setPools] = useState<Pool[] | null>(null);

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
                        <Button disabled={ adminChecked == user?.admin && poolAffinity == user?.poolAffinity && customizeDurationChecked == user?.canCustomizeDuration && customizePoolAffinityChecked == user?.canCustomizePoolAffinity } onClick={() => {onUpdate(id.toLowerCase(), {admin: adminChecked, poolAffinity: poolAffinity, canCustomizeDuration: customizeDurationChecked, canCustomizePoolAffinity: customizePoolAffinityChecked}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

export function Users({ client, user, conf }: { client: Client, user?: LoggedUser, conf: Configuration }): JSX.Element {
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

    async function onCreate(id: string, conf: UserConfiguration, setUsers: Dispatch<SetStateAction<User[] | null>>): Promise<void> {
        try {
            await client.createUser(id, conf);
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to create user");
        }
    }

    function updatedUserMock(conf: UserUpdateConfiguration, user?: User): User {
        return {id: user?.id || "", admin: conf.admin, poolAffinity: user?.poolAffinity || "", canCustomizeDuration: conf.canCustomizeDuration, canCustomizePoolAffinity: user?.canCustomizePoolAffinity || false};
    }

    async function onUpdate(id: string, conf: UserUpdateConfiguration, setUsers: Dispatch<SetStateAction<User[] | null>>): Promise<void> {
        try {
            await client.updateUser(id, conf);
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to update user");
        }
    }

    async function onDelete(setUsers: Dispatch<SetStateAction<User[] | null>>): Promise<void> {
        if (selected && selected != user?.id) {
            try {
                await client.deleteUser(selected);
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
        {(resources: User[], setUsers: Dispatch<SetStateAction<User[] | null>>) => (
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
                            {resources.map((user, index) => {
                                    const isItemSelected = isSelected(user.id);
                                    const labelId = `enhanced-table-checkbox-${index}`;
                                    return (
                                <TableRow
                                    key={user.id}
                                    hover
                                    onClick={(event) => handleClick(event, user.id)}
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
                <UserUpdateDialog client={client} id={selected} user={find(resources, selected)} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setUsers)} onHide={() => setShowUpdateDialog(false)} />}
            </>
        )}
        </Resources>
    );
}
