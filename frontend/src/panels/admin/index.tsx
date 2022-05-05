import React, { Dispatch, SetStateAction, useState } from "react";
import { lighten, useTheme, Theme } from '@mui/material/styles';
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
import FirstPageIcon from '@mui/icons-material/FirstPage';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import LastPageIcon from '@mui/icons-material/LastPage';
import { Client, Configuration, LoggedUser } from '@substrate/playground-client';
import { CenteredContainer, ErrorSnackbar, LoadingPanel } from '../../components';
import { useInterval } from '../../hooks';
import { hasAdminEditRights } from '../../utils';
import { Details } from './details';
import { Pools } from './pools';
import { Users } from './users';
import { Repositories } from './repositories';
import { Sessions } from './sessions';
import { Templates } from "./templates";

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

export function NoResourcesContainer({ user, label, action }: { user: LoggedUser, label: string, action?: () => void }): JSX.Element {
  return (
    <Container>
      <Typography variant="h6">
        {label}
        {(action && hasAdminEditRights(user)) &&
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

export interface TablePaginationActionsProps {
  count: number;
  page: number;
  rowsPerPage: number;
  onChangePage: (event: React.MouseEvent<HTMLButtonElement>, newPage: number) => void;
}

export function TablePaginationActions(props: TablePaginationActionsProps) {
  const classes = useStyles();
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
        size="large">
        {theme.direction === 'rtl' ? <LastPageIcon /> : <FirstPageIcon />}
      </IconButton>
      <IconButton
        onClick={handleBackButtonClick}
        disabled={page === 0}
        aria-label="previous page"
        size="large">
        {theme.direction === 'rtl' ? <KeyboardArrowRight /> : <KeyboardArrowLeft />}
      </IconButton>
      <IconButton
        onClick={handleNextButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="next page"
        size="large">
        {theme.direction === 'rtl' ? <KeyboardArrowLeft /> : <KeyboardArrowRight />}
      </IconButton>
      <IconButton
        onClick={handleLastPageButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="last page"
        size="large">
        {theme.direction === 'rtl' ? <FirstPageIcon /> : <LastPageIcon />}
      </IconButton>
    </div>
  );
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

function EditToolbar({ selected, onCreate, onUpdate, onDelete }: { selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void }): JSX.Element {
  const [open, setOpen] = React.useState(false);
  if (selected) {
    return <>
      {onUpdate &&
        <Tooltip title="Update">
          <IconButton aria-label="update" onClick={onUpdate} size="large">
            <EditIcon />
          </IconButton>
        </Tooltip>}
      {onDelete &&
        <Tooltip title="Delete">
          <IconButton aria-label="delete" onClick={() => setOpen(true)} size="large">
            <DeleteIcon />
          </IconButton>
        </Tooltip>}
      <DeleteConfirmationDialog open={open} onClose={() => setOpen(false)} onConfirmation={onDelete} />
    </>;
  } else {
    return <>
      {onCreate &&
        <Tooltip title="Create">
          <IconButton aria-label="create" onClick={onCreate} size="large">
            <AddIcon />
          </IconButton>
        </Tooltip>}
    </>;
  }
}

export function EnhancedTableToolbar({ user, label, selected = null, onCreate, onUpdate, onDelete }: { user: LoggedUser, label: string, selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void }): JSX.Element {
  const classes = useToolbarStyles();
  return (
    <>
      <Toolbar
      >
        <Typography className={classes.title} variant="h6" id="tableTitle" component="div">
          {label}
        </Typography>
        {hasAdminEditRights(user) &&
          <EditToolbar selected={selected} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />}
      </Toolbar>
    </>
  );
}

const panels = {
    Details: (_client: Client, conf: Configuration, _user: LoggedUser) => <Details conf={conf} /> ,
    Repositories: (client: Client, _conf: Configuration, user: LoggedUser) => <Repositories client={client} user={user} />,
    Users: (client: Client, conf: Configuration, user: LoggedUser) => <Users client={client} user={user} conf={conf} />,
    Pools: (client: Client, _conf: Configuration, user: LoggedUser) => <Pools client={client} user={user} />,
    Templates: (client: Client, _conf: Configuration, user: LoggedUser) => <Templates client={client} user={user} />,
    Sessions: (client: Client, conf: Configuration, user: LoggedUser) => <Sessions client={client} conf={conf} user={user} />
};

export function AdminPanel({ client, conf, user }: { client: Client, conf: Configuration, user: LoggedUser }): JSX.Element {
  const [value, setValue] = React.useState(0);

  const handleChange = (_: React.ChangeEvent<unknown>, newValue: number) => {
    setValue(newValue);
  };

  return (
    <CenteredContainer>
      <Tabs value={value} onChange={handleChange} aria-label="wrapped label tabs example">
      {Object.keys(panels).map((panel) =>
        <Tab label={panel} />)
      }
      </Tabs>

      <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", alignItems: 'center', justifyContent: 'center', textAlign: 'center', marginTop: 20, width: "80vw", height: "80vh" }} elevation={3}>
        {Object.values(panels)[value](client, conf, user)}
      </Paper>
    </CenteredContainer>
  );
}
