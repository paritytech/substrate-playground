import clsx from 'clsx';
import React, { Dispatch, SetStateAction, useState } from "react";
import { createStyles, lighten, makeStyles, useTheme, Theme } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Container from '@material-ui/core/Container';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import IconButton from '@material-ui/core/IconButton';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContentText from '@material-ui/core/DialogContentText';
import EditIcon from '@material-ui/icons/Edit';
import Paper from '@material-ui/core/Paper';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import Tooltip from '@material-ui/core/Tooltip';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import FirstPageIcon from '@material-ui/icons/FirstPage';
import KeyboardArrowLeft from '@material-ui/icons/KeyboardArrowLeft';
import KeyboardArrowRight from '@material-ui/icons/KeyboardArrowRight';
import LastPageIcon from '@material-ui/icons/LastPage';
import { Client, Configuration, IdentifiedResource, LoggedUser } from '@substrate/playground-client';
import { CenteredContainer, LoadingPanel } from '../../components';
import { useInterval } from '../../hooks';
import { hasAdminEditRights } from '../../utils';
import { Details } from './details';
import { Pools } from './pools';
import { Users } from './users';
import { Repositories } from './repositories';
import { Workspaces } from './workspaces';

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

export function NoResourcesContainer({ user, label, action }: { user?: LoggedUser, label: string, action?: () => void }): JSX.Element {
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

export function Resources<T>({ children, callback }: { children: (resources: T[], setter: Dispatch<SetStateAction<T[] | null>>) => NonNullable<React.ReactNode>, callback: () => Promise<T[]> }): JSX.Element {
  const [resources, setResources] = useState<T[] | null>(null);

  useInterval(async () => {
    try {
      setResources(await callback());
    } catch (e) {
      setResources([]);
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

export function EnhancedTableToolbar({ user, label, selected = null, onCreate, onUpdate, onDelete }: { user?: LoggedUser, label: string, selected?: string | null, onCreate?: () => void, onUpdate?: () => void, onDelete?: () => void }): JSX.Element {
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

export function AdminPanel({ client, user, conf }: { client: Client, user?: LoggedUser, conf: Configuration }): JSX.Element {
  const [value, setValue] = React.useState(0);

  const handleChange = (_: React.ChangeEvent<Record<string, unknown>>, newValue: number) => {
    setValue(newValue);
  };

  return (
    <CenteredContainer>
      <Tabs value={value} onChange={handleChange} aria-label="wrapped label tabs example">
        <Tab label="Details" />
        <Tab label="Repositories" />
        <Tab label="Users" />
        <Tab label="Workspaces" />
        <Tab label="Pools" />
      </Tabs>

      <Paper style={{ display: "flex", overflowY: "auto", flexDirection: "column", alignItems: 'center', justifyContent: 'center', textAlign: 'center', marginTop: 20, width: "80vw", height: "80vh" }} elevation={3}>
        {value == 0
          ? <Details conf={conf} />
          : value == 1
            ? <Repositories client={client} user={user} />
            : value == 2
              ? <Users client={client} user={user} conf={conf} />
              : value == 3
                ? <Workspaces client={client} conf={conf} user={user} />
                : <Pools client={client} user={user} />}
      </Paper>
    </CenteredContainer>
  );
}
