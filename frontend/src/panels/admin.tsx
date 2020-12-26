import clsx from 'clsx';
import React, { useState } from "react";
import { createStyles, lighten, makeStyles, Theme } from '@material-ui/core/styles';
import Checkbox from '@material-ui/core/Checkbox';
import Container from "@material-ui/core/Container";
import IconButton from '@material-ui/core/IconButton';
import DeleteIcon from '@material-ui/icons/Delete';
import FilterListIcon from '@material-ui/icons/FilterList';
import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Tooltip from '@material-ui/core/Tooltip';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { Client, User } from '@substrate/playground-api';

const useStyles = makeStyles({
    table: {
      minWidth: 650,
    },
});

function Instances({ instances }) {
    const classes = useStyles();
    return (
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
                {instances.map((instance) => (
                <TableRow key={instance[0]}>
                    <TableCell component="th" scope="row">
                        {instance[0]}
                    </TableCell>
                    <TableCell align="right">{instance[1].template.name}</TableCell>
                    <TableCell align="right"><a href={instance[1].url}>{instance[1].url}</a></TableCell>
                </TableRow>
                ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

function Templates({ templates }) {
    const classes = useStyles();
    return (
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
                {templates.map((template) => (
                <TableRow key={template.id}>
                    <TableCell component="th" scope="row">
                        {template.id}
                    </TableCell>
                    <TableCell align="right">{template.name}</TableCell>
                    <TableCell align="right">{template.image}</TableCell>
                </TableRow>
                ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

async function createOrUpdateUser(client: Client, id: String, admin: boolean): Promise<void> {
    await client.createOrUpdateUser(id, {admin: admin});
}

async function deleteUser(client: Client, id: String, admin: boolean): Promise<void> {
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

async function handleUsersDelete(o) {
    console.log(o)
}

function EnhancedTableToolbar({ client, selected }: { client: Client, selected: Array<String>}) {
    const classes = useToolbarStyles();
    return (
        <Toolbar
        className={clsx(classes.root, {
            [classes.highlight]: selected.length > 0,
        })}
        >
        {selected.length > 0 ? (
            <Typography className={classes.title} color="inherit" variant="subtitle1" component="div">
            {selected.length} selected
            </Typography>
        ) : (
            <Typography className={classes.title} variant="h6" id="tableTitle" component="div">
            Users
            </Typography>
        )}
        {selected.length > 0 ? (
            <Tooltip title="Delete">
            <IconButton aria-label="delete" onClick={() => handleUsersDelete(selected)}>
                <DeleteIcon />
            </IconButton>
            </Tooltip>
        ) : (
            <Tooltip title="Filter list">
            <IconButton aria-label="filter list">
                <FilterListIcon />
            </IconButton>
            </Tooltip>
        )}
        </Toolbar>
    );
}

function Users({ client, users }: { client: Client, users: Array<User> }) {
    const classes = useStyles();
    const [selected, setSelected] = useState<string[]>([]);
    const isSelected = (name: string) => selected.indexOf(name) !== -1;
    const handleClick = (event: React.MouseEvent<unknown>, name: string) => {
        const selectedIndex = selected.indexOf(name);
        let newSelected: string[] = [];
    
        if (selectedIndex === -1) {
          newSelected = newSelected.concat(selected, name);
        } else if (selectedIndex === 0) {
          newSelected = newSelected.concat(selected.slice(1));
        } else if (selectedIndex === selected.length - 1) {
          newSelected = newSelected.concat(selected.slice(0, -1));
        } else if (selectedIndex > 0) {
          newSelected = newSelected.concat(
            selected.slice(0, selectedIndex),
            selected.slice(selectedIndex + 1),
          );
        }
    
        setSelected(newSelected);
      };
    return (
        <>
            <EnhancedTableToolbar client={client} selected={selected} />
            <TableContainer component={Paper}>
                <Table className={classes.table} aria-label="simple table">
                    <TableHead>
                        <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell align="right">Admin</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                    {users.map((user, index) => {
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
                        <TableCell align="right">{user.admin.toString()}</TableCell>
                    </TableRow>
                    )})}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    );
}

export function AdminPanel({ client, state }: { client: Client }) {
    const details = state.context.details;
    const instances = Object.entries(details ? details["all_instances"] : {});
    return (
        <Container style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", marginTop: 20, justifyContent: "center", width: "80vw", height: "80vh"}} elevation={3}>
                {details?.users?.length > 0
                ? <div style={{margin: 20}}>
                        <Users client={client} users={details.users} />
                    </div>
                : <Container style={{display: "flex", flex: 1, flexDirection: "column", padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                        <Typography variant="h5">No users</Typography>
                    </Container>}
                {details?.templates.length > 0
                ? <div style={{margin: 20}}>
                    <Typography variant="h5">Templates</Typography>
                    <Templates templates={details?.templates} />
                    </div>
                : <Container style={{display: "flex", flex: 1, flexDirection: "column", padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                    <Typography variant="h5">No templates</Typography>
                    </Container>}
                {instances.length > 0
                ? <div style={{margin: 20}}>
                    <Typography variant="h5">Instances</Typography>
                    <Instances instances={instances} />
                    </div>
                : <Container style={{display: "flex", flex: 1, flexDirection: "column", padding: 0, justifyContent: "center", alignItems: "center", overflowY: "auto"}}>
                    <Typography variant="h5">No instance currently running</Typography>
                </Container>}
            </Paper>
        </Container>
    );
}