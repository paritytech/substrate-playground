import React, { useEffect, useRef, useState } from "react";
import Paper from '@mui/material/Paper';
import { Client } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, Loading } from '../components';
import { fetchWithTimeout, workspaceUrl } from '../utils';

interface Error {
    reason: string,
    action: () => void,
    actionTitle?: string,
}

interface Loading {
    phase: string,
    retry: number,
}

export function TheiaPanel({ client, autoDeploy, onMissingWorkspace, onWorkspaceFailing, onWorkspaceTimeout }: { client: Client, autoDeploy: string | null, onMissingWorkspace: () => void, onWorkspaceFailing: () => void, onWorkspaceTimeout: () => void }): JSX.Element {
    const maxRetries = 5*60;
    const ref = useRef(null);
    const [error, setError] = useState<Error>();
    const [url, setUrl] = useState<string>();
    const [loading, setLoading] = useState<Loading>();

    useEffect(() => {
        function createWorkspace(id: string): void {
            client.createCurrentSession({repositoryDetails: {id: id, reference: ""}}).then(fetchData);
        }

        async function fetchData() {
            const session = await client.getCurrentSession();
            const phase = session?.state.tag;
            if (session) {
                if (phase == 'Running') {
                    // Check URL is fine
                    const url = workspaceUrl(session);
                    if (url) {
                        if ((await fetchWithTimeout(url)).ok) {
                            setUrl(url);
                            return;
                        }
                    }
                } else if (phase == 'Failed') {
                    setError({reason: session.state.reason || 'Pod crashed', action: onWorkspaceFailing});
                }
                // The repository is being deployed, nothing to do
            }

            const retry = loading?.retry ?? 0;
            if (retry < maxRetries) {
                setLoading({phase: phase || 'Unknown', retry: retry + 1});
                setTimeout(fetchData, 1000);
            } else if (retry == maxRetries) {
                setError({reason: "Couldn't access the session in time",
                          action: onWorkspaceTimeout});
            }
        }

        // Entry point.
        // If autoDeploy, first attempt to locate the associated repository and deploy it.
        // In all cases, delegates to `fetchData`
        if (autoDeploy) {
            client.getRepository(autoDeploy).then(repository => {
                if (!repository) {
                    setError({reason: `Unknown repository ${autoDeploy}`,
                              action: onMissingWorkspace});
                    return;
                }

                try {
                    client.getCurrentSession().then(workspace => {
                        if (workspace) {
                            setError({reason: "You can only have one active substrate playground workspace open at a time. \n Please close all other workspaces to open a new one",
                                      action: () => {
                                          // Trigger current workspace deletion, wait for deletion then re-create a new one
                                          return client.deleteCurrentWorkspace()
                                            .then(function() {
                                                return new Promise<void>(function(resolve) {
                                                    const id = setInterval(async function() {
                                                        const workspace = await client.getCurrentWorkspace();
                                                        if (!workspace) {
                                                            clearInterval(id);
                                                            resolve();
                                                        }
                                                    }, 1000);
                                                }
                                            )})
                                            .then(() => setError(undefined))
                                            .then(() => createWorkspace(autoDeploy));
                                      },
                                      actionTitle: "Replace existing workspace"});
                        } else {
                            createWorkspace(autoDeploy);
                        }
                    })
                } catch {
                    setError({ reason: 'Error', action: onMissingWorkspace});
                }
            });
        } else {
            fetchData();
        }
    }, []);

    if (url) {
        return <iframe ref={ref} src={url} frameBorder="0" width="100%" height="100%"></iframe>
    } else {
        return (
            <CenteredContainer>
                <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                    {error?.reason
                     ? <ErrorMessage reason={error.reason} action={error.action} actionTitle={error.actionTitle} />
                     : <Loading phase={loading?.phase} retry={loading?.retry} />}
                </Paper>
            </CenteredContainer>
        );
    }
}
