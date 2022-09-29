import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { lighten, Theme } from '@mui/material/styles';
import createStyles from '@mui/styles/createStyles';
import makeStyles from '@mui/styles/makeStyles';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import EditIcon from '@mui/icons-material/Edit';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Client, Preference, ResourceType, User } from '@substrate/playground-client';
import { CenteredContainer, ErrorSnackbar, LoadingPanel } from '../../components';
import { useInterval } from '../../hooks';
import { Preferences } from './preferences';
import { Pools } from './pools';
import { Repositories } from './repositories';
import { Sessions } from './sessions';
import { Users } from './users';
import { hasPermission } from "../../utils";
import { Roles } from "./roles";

export const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      flexShrink: 0,
      marginLeft: theme.spacing(2.5),
    },
    table: {
      minWidth: 650,
    },
  }),
);

export function NoResourcesContainer({ client, user, label, action, resourceType }: { client: Client, user: User, label: string, action?: () => void, resourceType: ResourceType }): JSX.Element {
  return (
    <Container>
      <Typography variant="h6">
        {label}
        {(action && hasPermission(client, user, resourceType, {type: "Create"})) &&
          <Tooltip title="Create">
            <IconButton aria-label="create" onClick={action} size="large">
              <AddIcon />
            </IconButton>
          </Tooltip>}
      </Typography>
    </Container>
  );
}

export function Resources<T>({ children, callback }: { children: (resources: T[], setter: Dispatch<SetStateAction<T[] | null>>) => NonNullable<React.ReactNode>, callback: () => Promise<T[]> }): JSX.Element {
  const [resources, setResources] = useState<T[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useInterval(async () => {
    try {
      setResources(await callback());
    } catch (e: any) {
        setResources([]);
        setErrorMessage(`Error during fetching: ${e.message}`);
    }
  }, 5000);

  if (!resources) {
    return <LoadingPanel />;
  } else {
    return (
      <Container>
        {children(resources, setResources)}
        {errorMessage && <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
      </Container>
    );
  }
}

const useToolbarStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(1),
    },
    highlight:
      theme.palette.mode === 'light'
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

function DeleteConfirmationDialog({ open, onClose, onConfirmation }: { open: boolean, onClose: () => void, onConfirmation?: () => void }): JSX.Element {
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
        <Button onClick={() => { onClose(); if (onConfirmation) onConfirmation(); }}>
          Agree
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EditToolbar({ client, user, resourceType, selected, onCreate, onUpdate, onDelete }: { client: Client, user: User, resourceType: ResourceType, selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void }): JSX.Element {
  const [canCreate, setCanCreate] = React.useState(false);
  const [canUpdate, setCanUpdate] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  useEffect(() => {
    async function fetchData() {
        setCanCreate(await hasPermission(client, user, resourceType, {type: "Create"}));
        const owns = (resourceType == ResourceType.User && selected == user.id);
        setCanUpdate(owns || await hasPermission(client, user, resourceType, {type: "Update"}));
        setCanDelete(await hasPermission(client, user, resourceType, {type: "Delete"}));
    }

    fetchData();
  }, []);

  if (selected) {
    return <>
      {onUpdate &&
        <Tooltip title="Update">
          <IconButton disabled={!canUpdate} aria-label="update" onClick={onUpdate} size="large">
            <EditIcon />
          </IconButton>
        </Tooltip>}
      {onDelete &&
        <Tooltip title="Delete">
          <IconButton disabled={!canDelete} aria-label="delete" onClick={() => setOpen(true)} size="large">
            <DeleteIcon />
          </IconButton>
        </Tooltip>}
      <DeleteConfirmationDialog open={open} onClose={() => setOpen(false)} onConfirmation={onDelete} />
    </>;
  } else {
    return <>
      {onCreate &&
        <Tooltip title="Create">
          <IconButton disabled={!canCreate} aria-label="create" onClick={onCreate} size="large">
            <AddIcon />
          </IconButton>
        </Tooltip>}
    </>;
  }
}

export function EnhancedTableToolbar({ client, user, label, selected = null, onCreate, onUpdate, onDelete, resourceType }: { client: Client, user: User, label: string, selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void, resourceType: ResourceType }): JSX.Element {
  const classes = useToolbarStyles();
  return (
    <>
      <Toolbar
      >
        <Typography className={classes.title} variant="h6" id="tableTitle" component="div">
          {label}
        </Typography>
        <EditToolbar client={client} user={user} resourceType={resourceType} selected={selected} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
      </Toolbar>
    </>
  );
}

const panels = {
    Preferences: (_client: Client, preferences: Preference[], _user: User) => <Preferences preferences={preferences} /> ,
    Repositories: (client: Client, _preferences: Preference[], user: User) => <Repositories client={client} user={user} />,
    Roles: (client: Client, preferences: Preference[], user: User) => <Roles client={client} user={user} preferences={preferences} />,
    Users: (client: Client, preferences: Preference[], user: User) => <Users client={client} user={user} preferences={preferences} />,
    Pools: (client: Client, _preferences: Preference[], user: User) => <Pools client={client} user={user} />,
    Sessions: (client: Client, preferences: Preference[], user: User) => <Sessions client={client} preferences={preferences} user={user} />
};

export function AdminPanel({ client, preferences, user }: { client: Client, preferences: Preference[], user: User }): JSX.Element {
  const [value, setValue] = React.useState(0);

  const handleChange = (_: React.ChangeEvent<unknown>, newValue: number) => {
    setValue(newValue);
  };

  return (
    <CenteredContainer>
      <Tabs value={value} onChange={handleChange} aria-label="wrapped label tabs example">
      {Object.keys(panels).map((panel, id) =>
        <Tab key={id} label={panel} />)
      }
      </Tabs>

      <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", alignItems: 'center', justifyContent: 'center', textAlign: 'center', marginTop: 20, width: "80vw", height: "80vh" }} elevation={3}>
        {Object.values(panels)[value](client, preferences, user)}
      </Paper>
    </CenteredContainer>
  );
}
