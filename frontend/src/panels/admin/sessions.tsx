import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import Button from '@mui/material/Button';
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Client, Session, SessionConfiguration, Pool, User, SessionUpdateConfiguration, Repository, ResourceType, RepositoryVersion, SessionState, Preference, Preferences } from '@substrate/playground-client';
import { Checkbox, Link, TablePagination, TextField } from "@mui/material";
import { EnhancedTableToolbar, NoResourcesContainer, Resources } from ".";
import { ErrorSnackbar } from "../../components";
import { useInterval } from "../../hooks";
import { canCustomizeSessionDuration, canCustomizeSessionPoolAffinity, find, formatDuration, remove } from "../../utils";
import { fetchRepositoriesWithLatestVersions } from "../session";

export function SessionCreationDialog({ client, preferences, user, repository, repositories, show, onCreate, onHide }: { client: Client, preferences: Preference[], user: User, repository?: string, repositories: [Repository, RepositoryVersion][] | undefined, show: boolean, onCreate: (userId: string, conf: SessionConfiguration ) => void, onHide: () => void }): JSX.Element {
    const [selection, setSelection] = React.useState<string | null>(null);
    const [canCustomizeDuration, setCanCustomizeDuration] = React.useState(false);
    const [duration, setDuration] = React.useState(Number.parseInt(find(preferences, Preferences.SessionDefaultDuration)?.value || "60"));
    const [canCustomizePoolAffinity, setCanCustomizePoolAffinity] = React.useState(false);
    const [poolAffinity, setPoolAffinity] = React.useState(find(preferences, Preferences.SessionPoolAffinity)?.value);
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

    const handleRepositoryChange = (event: React.ChangeEvent<HTMLInputElement>) => setSelection(event.target.value);
    const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const duration = Number.parseInt(event.target.value);
        setDuration(Number.isNaN(duration)? 0 : duration);
    };
    const handlePoolAffinityChange = (event: React.ChangeEvent<HTMLInputElement>) => setPoolAffinity(event.target.value);

    function onCreateClick() {
        const repositoryWithVersion = selection && repositories?.find((pair) => pair[0].id == selection);
        if (repositoryWithVersion) {
            const repositorySource = {repositoryId: repositoryWithVersion[0].id, repositoryVersionId: repositoryWithVersion[1].id};
            const sessionConfiguration = {repositorySource: repositorySource, duration: duration, poolAffinity: poolAffinity};
            onCreate(user.id, sessionConfiguration);
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
                    {repositories?.map((repository, index) => {
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
                    <DialogActions>
                        <Button disabled={!selection} onClick={onCreateClick}>CREATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
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
                    <DialogActions>
                        <Button disabled={ newDuration <= 0 || duration == newDuration} onClick={() => {onUpdate(session, {duration: newDuration}); onHide();}}>UPDATE</Button>
                        <Button onClick={onHide}>CLOSE</Button>
                    </DialogActions>
                </Container>
            </DialogContent>
        </Dialog>
    );
}

function SessionStateElement({ state }: { state: SessionState }): JSX.Element {
    switch (state.type) {
        case "Deploying":
            return <div>Deploying</div>;
        case "Failed":
            return <div>Failed: {state.message}</div>;
        case "Running":
            return <div>Running since {formatDuration(state.startTime)}</div>;
    }
}

export function Sessions({ client, preferences, user }: { client: Client, preferences: Preference[], user: User }): JSX.Element {
    const [selected, setSelected] = useState<Session | null>(null);
    const [showCreationDialog, setShowCreationDialog] = useState(false);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [repositories, setRepositories] = useState<[Repository, RepositoryVersion][]>();
    const isSelected = (id: string) => selected?.id == id;
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

    async function createSession(userId: string, conf: SessionConfiguration, setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        try {
            await client.createSession(userId, conf);
            setSessions((sessions: Session[] | null) => {
                if (sessions) {
                    sessions.concat(sessionMock(conf));
                }
                return sessions;
            });
        } catch (e: any) {
            setErrorMessage(`Failed to create session: ${JSON.stringify(e.data)}`);
        }
    }

    async function updateSession(session: Session, conf: SessionUpdateConfiguration, setSessions: Dispatch<SetStateAction<Session[] | null>>): Promise<void> {
        try {
            await client.updateSession(session.userId, conf);
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
            setErrorMessage(`Failed to update session: ${JSON.stringify(e.data)}`);
        }
    }

    async function deleteSession(setSessions: Dispatch<SetStateAction<Session[] | null>>, userId?: string): Promise<void> {
        if (userId) {
            try {
                await client.deleteSession(userId);

                setSessions((sessions: Session[] | null) => {
                    if (sessions) {
                        return remove(sessions, userId);
                    }
                    return sessions;
                });
                setSelected(null);
            } catch (e: any) {
                setErrorMessage(`Failed to delete session: ${JSON.stringify(e.data)}`);
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
                const filteredResources = rowsPerPage > 0 ? resources.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : resources;
                return (
                    <>
                        {filteredResources.length > 0
                        ?
                        <>
                            <EnhancedTableToolbar client={client} user={user} label="Sessions" selected={selected?.id} onCreate={() => setShowCreationDialog(true)} onUpdate={() => setShowUpdateDialog(true)} onDelete={() => deleteSession(setSessions, selected?.userId)} resourceType={ResourceType.Session} />
                            <TableContainer component={Paper}>
                                <Table stickyHeader aria-label="sessions table">
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
                                    {filteredResources.map((session: Session, index: number) => {
                                        const isItemSelected = isSelected(session.id);
                                        const labelId = `enhanced-table-checkbox-${index}`;
                                        return (
                                            <TableRow
                                                key={session.id}
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
                                </Table>
                            </TableContainer>
                            <TablePagination
                                style={{width: "100%", float: "left"}}
                                rowsPerPageOptions={[10, 25, { label: 'All', value: -1 }]}
                                count={resources.length}
                                rowsPerPage={rowsPerPage}
                                page={page}
                                onPageChange={handleChangePage}
                                onRowsPerPageChange={handleChangeRowsPerPage}
                                />
                        </>
                        : <NoResourcesContainer client={client} user={user} label="No sessions" action={() => setShowCreationDialog(true)} resourceType={ResourceType.Session} />}
                        {errorMessage &&
                        <ErrorSnackbar open={true} message={errorMessage} onClose={() => setErrorMessage(null)} />}
                        {showCreationDialog &&
                        <SessionCreationDialog client={client} preferences={preferences} user={user} repositories={repositories} show={showCreationDialog} onCreate={(userId, conf) => createSession(userId, conf, setSessions)} onHide={() => setShowCreationDialog(false)} />}
                        {(selected && showUpdateDialog) &&
                        <SessionUpdateDialog session={selected} duration={selected.maxDuration} show={showUpdateDialog} onUpdate={(session, conf) => updateSession(session, conf, setSessions)} onHide={() => setShowUpdateDialog(false)} />}
                    </>
                );
            }}
        </Resources>
    );
}
