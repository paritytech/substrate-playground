import React, { Dispatch, SetStateAction, useState } from "react";
import Button from '@mui/material/Button';
import ButtonGroup from "@mui/material/ButtonGroup";
import Container from "@mui/material/Container";
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Client, Configuration, LoggedUser, Session, SessionConfiguration, Template, Pool, User, SessionUpdateConfiguration } from '@substrate/playground-client';
import { ErrorSnackbar } from "../../components";
import { useInterval } from "../../hooks";
import { canCustomizeDuration, canCustomizePoolAffinity, find, remove } from "../../utils";
import { Autocomplete, Checkbox, Dialog, DialogContent, DialogTitle, IconButton, Link, TableFooter, TablePagination, TextField } from "@mui/material";
import { FirstPage, KeyboardArrowLeft, KeyboardArrowRight, LastPage } from "@mui/icons-material";
import { EnhancedTableToolbar, NoResourcesContainer, Resources } from ".";
import { useTheme } from "@mui/styles";

export function SessionCreationDialog({ client, conf, sessions, user, template, templates, show, onCreate, onHide, allowUserSelection = false }: { client: Client, conf: Configuration, sessions?: Session[], user: LoggedUser, template?: string, templates: Template[] | null, show: boolean, onCreate: (conf: SessionConfiguration, id?: string, ) => void, onHide: () => void , allowUserSelection?: boolean}): JSX.Element {
    const [selectedUser, setUser] = React.useState<string | null>(user.id);
    const [selectedTemplate, setTemplate] = React.useState<string | null>(null);
    const [duration, setDuration] = React.useState(conf.session.duration);
    const [poolAffinity, setPoolAffinity] = React.useState(conf.session.poolAffinity);
    const [pools, setPools] = useState<Pool[] | null>(null);
    const [users, setUsers] = useState<User[] | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
        if (allowUserSelection) {
            setUsers(await client.listUsers());
        }
    }, 5000);

    const handleUserChange = (_event: unknown, newValue: string | null) => setUser(newValue);
    const handleTemplateChange = (event: React.ChangeEvent<HTMLInputElement>) => setTemplate(event.target.value);
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const duration = Number.parseInt(event.target.value);
        setDuration(Number.isNaN(duration)? 0 : duration);
    };
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);

    const currentUser = selectedUser || user.id;
    const currentTemplate = template || selectedTemplate;

    function valid(): boolean {
        if (duration <= 0) {
            return false;
        }
        if (!currentUser) {
            return false;
        }
        if (!currentTemplate) {
            return false;
        }
        if (!poolAffinity) {
            return false;
        }
        if (sessions && find(sessions, currentUser) != null) {
            return false;
        }
        return true;
    }

    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Session details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    {allowUserSelection &&
                    <Autocomplete
                        size="small"
                        freeSolo
                        onInputChange={handleUserChange}
                        options={users ? Object.keys(users) : []}
                        defaultValue={user.id}
                        getOptionLabel={(user) => user}
                        renderInput={(params) => <TextField {...params} label="User" />}
                      />
                    }
                    {!template &&
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
                    }
                    {canCustomizePoolAffinity(user) &&
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={poolAffinity}
                        onChange={handlePoolAffinityChange}
                        required
                        label="Pool affinity"
                        >
                    {pools &&
                    Object.keys(pools).map(id => (
                        <MenuItem key={id} value={id}>
                        {id}
                        </MenuItem>))
                    }
                    </TextField>
                    }
                    {canCustomizeDuration(user) &&
                    <TextField
                        style={{marginBottom: 20}}
                        value={duration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        />}
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={!valid()} onClick={() => {onCreate({template: currentTemplate || "", duration: duration, poolAffinity: poolAffinity}, currentUser); onHide();}}>CREATE</Button>
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
    }, []);

    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const duration = Number.parseInt(event.target.value);
        setDuration(Number.isNaN(duration)? 0 : duration);
    };
    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Session details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    <TextField
                        style={{marginBottom: 20}}
                        value={newDuration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        autoFocus
                        />
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={ newDuration <= 0 || duration == newDuration} onClick={() => {onUpdate(id.toLowerCase(), {duration: newDuration}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}
interface TablePaginationActionsProps {
    count: number;
    page: number;
    rowsPerPage: number;
    onPageChange: (
      event: React.MouseEvent<HTMLButtonElement>,
      newPage: number,
    ) => void;
  }

  function TablePaginationActions(props: TablePaginationActionsProps) {
    const theme = useTheme();
    const { count, page, rowsPerPage, onPageChange } = props;

    const handleFirstPageButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        onPageChange(event, 0);
    };

    const handleBackButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        onPageChange(event, page - 1);
    };

    const handleNextButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        onPageChange(event, page + 1);
    };

    const handleLastPageButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        onPageChange(event, Math.max(0, Math.ceil(count / rowsPerPage) - 1));
    };

    return (
      <div>
        <IconButton
          onClick={handleFirstPageButtonClick}
          disabled={page === 0}
          aria-label="first page"
        >
          {theme.direction === 'rtl' ? <LastPage /> : <FirstPage />}
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
          {theme.direction === 'rtl' ? <FirstPage /> : <LastPage />}
        </IconButton>
      </div>
    );
  }

export function Sessions({ client, conf, user }: { client: Client, conf: Configuration, user?: LoggedUser }): JSX.Element {
    const [selected, setSelected] = useState<Session | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isSelected = (name: string) => selected?.id == name;
    const handleClick = (session: Session) => {
        if (isSelected(session.id)) {
            setSelected(null);
        } else {
            setSelected(session);
        }
    };
    const [templates, setTemplates] = useState<Template[] | null>(null);

    useInterval(async () => {
        const templates = await client.listTemplates();
        setTemplates(templates);
    }, 5000);

    function sessionMock(conf: SessionConfiguration): Session {
        return {
            id: "",
            duration: conf.duration || 0,
            maxDuration: 0,
            template: {name: "", image: "", description: ""},
            userId: "",
            url: "",
            pod: {phase: 'Pending', reason: "", message: ""},
            node: ""
        };
    }

    async function onCreate(conf: SessionConfiguration, id: string | null | undefined, setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        try {
            if (id) {
                await client.createSession(id, conf);
                setSessions((sessions: Session[] | null) => {
                    if (sessions) {
                        sessions.concat(sessionMock(conf));
                    }
                    return sessions;
                });
            } else {
                await client.createCurrentSession(conf);
            }
        } catch (e: any) {
            setErrorMessage(`Failed to create session: ${e.toString()}`);
        }
    }

    async function onUpdate(id: string, conf: SessionUpdateConfiguration, setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        try {
            await client.updateSession(id, conf);
            setSessions((sessions: Session[] | null) => {
                if (sessions && conf.duration) {
                    const session = find(sessions, id);
                    if (session) {
                        session.duration = conf.duration;
                    }
                }
                return sessions;
            });
        } catch (e: any) {
            setErrorMessage(`Failed to update session: ${e.toString()}`);
        }
    }

    async function onDelete(setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        if (selected) {
            try {
                await client.deleteSession(selected.id);

                setSessions((sessions: Session[] | null) => {
                    if (sessions) {
                        return remove(sessions, selected.id);
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

    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(5);
    const handleChangePage = (event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
      setPage(newPage);
    };

    const handleChangeRowsPerPage = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    };

    const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

    return (
        <Resources<Session> callback={async () => await client.listSessions()}>
            {(resources: Session[], setSessions: Dispatch<SetStateAction<Session[] | null>>) => {
                const allResources = Object.entries(resources);
                const filteredResources = rowsPerPage > 0 ? allResources.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : allResources;
                return (
                    <>
                        {filteredResources.length > 0
                        ?
                        <>
                            <EnhancedTableToolbar user={user} label="Sessions" selected={selected?.id} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => onDelete(setSessions)} />
                            <TableContainer component={Paper}>
                                <Table aria-label="simple table">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell></TableCell>
                                            <TableCell>ID</TableCell>
                                            <TableCell>Template</TableCell>
                                            <TableCell>URL</TableCell>
                                            <TableCell>Duration</TableCell>
                                            <TableCell>Phase</TableCell>
                                            <TableCell>Node</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                    {filteredResources.map(([id, session]: [id: string, session: Session], index: number) => {
                                        const isItemSelected = isSelected(id);
                                        const labelId = `enhanced-table-checkbox-${index}`;
                                        return (
                                            <TableRow
                                                key={id}
                                                hover
                                                onClick={() => handleClick(session)}
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
                                                    <Link href={`https://github.com/${id}`} target="_blank" rel="noreferrer" onClick={stopPropagation}>{id}</Link>
                                                </TableCell>
                                                <TableCell>{session.template.name}</TableCell>
                                                <TableCell><Link href={`//${session.url}`} target="_blank" rel="noreferrer" onClick={stopPropagation}>Browse {session.url}</Link></TableCell>
                                                <TableCell>{session.duration}</TableCell>
                                                <TableCell>{session.pod.phase}</TableCell>
                                                <TableCell>{session.node}</TableCell>
                                            </TableRow>
                                        )})}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow>
                                            <TablePagination
                                                rowsPerPageOptions={[5, 10, 25, { label: 'All', value: -1 }]}
                                                colSpan={3}
                                                count={Object.entries(resources).length}
                                                rowsPerPage={rowsPerPage}
                                                page={page}
                                                SelectProps={{
                                                    inputProps: { 'aria-label': 'rows per page' },
                                                    native: true,
                                                }}
                                                onPageChange={handleChangePage}
                                                onRowsPerPageChange={handleChangeRowsPerPage}
                                                ActionsComponent={TablePaginationActions}
                                                />
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </TableContainer>
                        </>
                        : <NoResourcesContainer user={user} label="No sessions" action={() => setShowCreationDialog(true)} />}
                        {errorMessage &&
                        <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                        {user && showCreationDialog &&
                        <SessionCreationDialog allowUserSelection={true} client={client} conf={conf} sessions={resources} user={user} templates={templates} show={showCreationDialog} onCreate={(conf, id) => onCreate(conf, id, setSessions)} onHide={() => setShowCreationDialog(false)} />}
                        {(selected && showUpdateDialog) &&
                        <SessionUpdateDialog id={selected.id} duration={selected.duration} show={showUpdateDialog} onUpdate={(id, conf) => onUpdate(id, conf, setSessions)} onHide={() => setShowUpdateDialog(false)} />}
                    </>
                );
            }}
        </Resources>
    );
}
