import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
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
import { Client, Configuration, Session, SessionConfiguration, Pool, User, SessionUpdateConfiguration, Repository, ResourceType, RepositoryVersion, mainSessionId, SessionState } from '@substrate/playground-client';
import { Checkbox, Dialog, DialogContent, DialogTitle, IconButton, Link, TableFooter, TablePagination, TextField } from "@mui/material";
import { FirstPage, KeyboardArrowLeft, KeyboardArrowRight, LastPage } from "@mui/icons-material";
import { EnhancedTableToolbar, NoResourcesContainer, Resources } from ".";
import { useTheme } from "@mui/styles";
import { ErrorSnackbar } from "../../components";
import { useInterval } from "../../hooks";
import { canCustomizeSessionDuration, canCustomizeSessionPoolAffinity, find, formatDuration, remove } from "../../utils";
import { fetchRepositoriesWithLatestVersions } from "../session";

export function SessionCreationDialog({ client, conf, user, repository, repositories, show, onCreate, onHide }: { client: Client, conf: Configuration, user: User, repository?: string, repositories: [Repository, RepositoryVersion][] | undefined, show: boolean, onCreate: (id: string, userId: string, conf: SessionConfiguration ) => void, onHide: () => void }): JSX.Element {
    const [selection, setSelection] = React.useState<number | null>(null);
    const [canCustomizeDuration, setCanCustomizeDuration] = React.useState(false);
    const [duration, setDuration] = React.useState(conf.session.duration);
    const [canCustomizePoolAffinity, setCanCustomizePoolAffinity] = React.useState(false);
    const [poolAffinity, setPoolAffinity] = React.useState(conf.session.poolAffinity);
    const [pools, setPools] = useState<Pool[] | null>(null);

    useInterval(async () => {
        setPools(await client.listPools());
    }, 5000);

    useEffect(() => {
        async function fetchData() {
            setCanCustomizeDuration(await canCustomizeSessionDuration(client, user));
            setCanCustomizePoolAffinity(await canCustomizeSessionPoolAffinity(client, user));
        }

        fetchData();
    }, []);

    const handleRepositoryChange = (event: React.ChangeEvent<HTMLInputElement>) => setSelection(Number.parseInt(event.target.value));
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const duration = Number.parseInt(event.target.value);
        setDuration(Number.isNaN(duration)? 0 : duration);
    };
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);

    function valid(): boolean {
        if (!selection) {
            return false;
        }
        return true;
    }

    function onCreateClick() {
        const repositoryWithVersion = selection && repositories?.at(selection);
        if (repositoryWithVersion) {
            const repositorySource = {repositoryId: repositoryWithVersion[0].id, repositoryVersionId: repositoryWithVersion[1].id};
            const sessionConfiguration = {repositorySource: repositorySource, duration: duration, poolAffinity: poolAffinity};
            onCreate(user.id, mainSessionId(user), sessionConfiguration);
            onHide();
        }
    }

    return (
        <Dialog open={show} onClose={onHide} maxWidth="md">
            <DialogTitle>Session details</DialogTitle>
            <DialogContent>
                <Container style={{display: "flex", flexDirection: "column"}}>
                    {!repository &&
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={repository}
                        onChange={handleRepositoryChange}
                        required
                        label="Repository"
                        >
                    {repositories &&
                      repositories.map((repository, index) => {
                        const id = repository[0].id;
                        return (
                          <MenuItem key={index} value={index}>
                          {id}
                          </MenuItem>
                        );
                      })
                    }
                    </TextField>
                    }
                    {(pools && canCustomizePoolAffinity) &&
                    <TextField
                        style={{marginBottom: 20}}
                        select
                        value={poolAffinity}
                        onChange={handlePoolAffinityChange}
                        required
                        label="Pool affinity"
                        >
                    {pools?.map(pool => (
                        <MenuItem key={pool.id} value={pool.id}>
                        {pool.id}
                        </MenuItem>))
                    }
                    </TextField>
                    }
                    {canCustomizeDuration &&
                    <TextField
                        style={{marginBottom: 20}}
                        value={duration}
                        onChange={handleDurationChange}
                        required
                        type="number"
                        label="Duration"
                        />}
                    <ButtonGroup style={{alignSelf: "flex-end", marginTop: 20}} size="small">
                        <Button disabled={!valid()} onClick={onCreateClick}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </ButtonGroup>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function SessionUpdateDialog({ session, duration, show, onUpdate, onHide }: { session: Session, duration: number, show: boolean, onUpdate: (session: Session, conf: SessionUpdateConfiguration) => void, onHide: () => void }): JSX.Element {
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
                        <Button disabled={ newDuration <= 0 || duration == newDuration} onClick={() => {onUpdate(session, {duration: newDuration}); onHide();}}>UPDATE</Button>
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

function SessionStateElement({ state }: { state: SessionState }): JSX.Element {
    switch (state.type) {
        case "Deploying":
            return <div>Deploying</div>;
        case "Failed":
            return <div>Failed: {state.message}</div>;
        case "Running":
            return <div>Running since ${formatDuration(state.startTime)}</div>;
    }
}

export function Sessions({ client, conf, user }: { client: Client, conf: Configuration, user: User }): JSX.Element {
    const [selected, setSelected] = useState<Session | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [repositories, setRepositories] = useState<[Repository, RepositoryVersion][]>();
    const isSelected = (name: string) => selected?.id == name;
    const handleClick = (session: Session) => {
        if (isSelected(session.id)) {
            setSelected(null);
        } else {
            setSelected(session);
        }
    };

    useInterval(async () => {
        setRepositories(await fetchRepositoriesWithLatestVersions(client));
    }, 5000);

    function sessionMock(conf: SessionConfiguration): Session {
        return {
            id: "",
            maxDuration: conf.duration || 0,
            userId: "",
            state: {type: 'Deploying'}
        };
    }

    async function createSession(userId: string, sessionId: string, conf: SessionConfiguration, setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        try {
            await client.createUserSession(userId, sessionId, conf);
            setSessions((sessions: Session[] | null) => {
                if (sessions) {
                    sessions.concat(sessionMock(conf));
                }
                return sessions;
            });
        } catch (e: any) {
            setErrorMessage(`Failed to create session: ${e.toString()}`);
        }
    }

    async function updateSession(session: Session, conf: SessionUpdateConfiguration, setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        try {
            await client.updateUserSession(session.userId, session.id, conf);
            setSessions((sessions: Session[] | null) => {
                if (sessions && conf.duration) {
                    const existingSession = find(sessions, session.id);
                    if (existingSession) {
                        existingSession.maxDuration = conf.duration;
                    }
                }
                return sessions;
            });
        } catch (e: any) {
            setErrorMessage(`Failed to update session: ${e.toString()}`);
        }
    }

    async function deleteSession(setSessions: Dispatch<SetStateAction<Session[] | null>>, userId?: string, sessionId?: string): Promise<void> {
        if (userId && sessionId) {
            try {
                await client.deleteUserSession(userId, sessionId);

                setSessions((sessions: Session[] | null) => {
                    if (sessions) {
                        return remove(sessions, userId);
                    }
                    return sessions;
                });
                setSelected(null);
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to delete session");
            }
        } else {
            // Can't happen
        }
    }

    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(5);
    const handleChangePage = (_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
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
        <Resources<Session> callback={async () => await client.listAllSessions()}>
            {(resources: Session[], setSessions: Dispatch<SetStateAction<Session[] | null>>) => {
                const allResources = Object.entries(resources);
                const filteredResources = rowsPerPage > 0 ? allResources.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : allResources;
                return (
                    <>
                        {filteredResources.length > 0
                        ?
                        <>
                            <EnhancedTableToolbar client={client} user={user} label="Sessions" selected={selected?.id} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => deleteSession(setSessions, selected?.userId, selected?.id)} resourceType={ResourceType.Session} />
                            <TableContainer component={Paper}>
                                <Table aria-label="simple table">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell></TableCell>
                                            <TableCell>User ID</TableCell>
                                            <TableCell>ID</TableCell>
                                            <TableCell>Max duration</TableCell>
                                            <TableCell>State</TableCell>
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
                                                    <Link href={`https://github.com/${session.userId}`} target="_blank" rel="noreferrer" onClick={stopPropagation}>{session.userId}</Link>
                                                </TableCell>
                                                <TableCell>{session.id}</TableCell>
                                                <TableCell>{session.maxDuration}</TableCell>
                                                <TableCell><SessionStateElement state={session.state} /></TableCell>
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
                        : <NoResourcesContainer client={client} user={user} label="No sessions" action={() => setShowCreationDialog(true)} resourceType={ResourceType.Session} />}
                        {errorMessage &&
                        <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                        {showCreationDialog &&
                        <SessionCreationDialog client={client} conf={conf} user={user} repositories={repositories} show={showCreationDialog} onCreate={(userId, sessionId, conf) => createSession(userId, sessionId, conf, setSessions)} onHide={() => setShowCreationDialog(false)} />}
                        {(selected && showUpdateDialog) &&
                        <SessionUpdateDialog session={selected} duration={selected.maxDuration} show={showUpdateDialog} onUpdate={(session, conf) => updateSession(session, conf, setSessions)} onHide={() => setShowUpdateDialog(false)} />}
                    </>
                );
            }}
        </Resources>
    );
}
