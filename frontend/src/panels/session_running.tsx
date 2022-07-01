import React, { useEffect, useRef, useState } from "react";
import Paper from '@mui/material/Paper';
import { Client, Repository, User } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, Loading } from '../components';
import { fetchWithTimeout, find, mainSessionId, sessionUrl } from '../utils';

interface Error {
    reason: string,
    action: () => void,
    actionTitle?: string,
}

interface Loading {
    phase: string,
    retry: number,
}

export function RunningSessionPanel({ client, user, autoDeployRepository, onMissingSession, onSessionFailing, onSessionTimeout }: { client: Client, user: User, autoDeployRepository: string | null, onMissingSession: () => void, onSessionFailing: () => void, onSessionTimeout: () => void }): JSX.Element {
    const maxRetries = 5*60;
    const sessionId = mainSessionId(user.id);
    const ref = useRef(null);
    const [error, setError] = useState<Error>();
    const [url, setUrl] = useState<string>();
    const [loading, setLoading] = useState<Loading>();

    useEffect(() => {
        async function createSession(repository: Repository): Promise<void> {
            const repositoryVersionId = repository.currentVersion;
            if (repositoryVersionId) {
                client.createSession(sessionId, {repositorySource: {repositoryId: repository.id, repositoryVersionId: repositoryVersionId}}).then(fetchData);
            } else {
                setError({reason: 'No current version defined', action: onSessionFailing});
            }
        }

        async function fetchData() {
            const session = await client.getSession(sessionId);
            if (session) {
                const { type }  = session.state;
                if (type == 'Running') {
                    // Check URL is fine
                    const url = sessionUrl(session);
                    if (url) {
                        if ((await fetchWithTimeout(url)).ok) {
                            setUrl(url);
                            return;
                        }
                    }
                } else if (type == 'Failed') {
                    setError({reason: session.state.reason || 'Session failed', action: onSessionFailing});
                }
                // The session is being deployed, nothing to do
            }

            const retry = loading?.retry ?? 0;
            if (retry < maxRetries) {
                setLoading({phase: session?.state.type || 'Unknown', retry: retry + 1});
                setTimeout(fetchData, 1000);
            } else if (retry == maxRetries) {
                setError({reason: "Couldn't access the session in time",
                          action: onSessionTimeout});
            }
        }

        // Entry point.
        // If autoDeploy, first attempt to locate the associated template and deploy it.
        // In all cases, delegates to `fetchData`
        if (autoDeployRepository) {
            client.listRepositories().then(repositories => {
                const repository = find(repositories, autoDeployRepository);
                if (!repository) {
                    setError({reason: `Unknown repository ${autoDeployRepository}`,
                              action: onMissingSession});
                    return;
                }

                try {
                    client.getSession(sessionId).then(session => {
                        if (session) {
                            setError({reason: "You can only have one active substrate playground session open at a time. \n Please close all other sessions to open a new one",
                                      action: () => {
                                          // Trigger current session deletion, wait for deletion then re-create a new one
                                          return client.deleteSession(sessionId)
                                            .then(function() {
                                                return new Promise<void>(function(resolve) {
                                                    const id = setInterval(async function() {
                                                        const session = await client.getSession(sessionId);
                                                        if (!session) {
                                                            clearInterval(id);
                                                            resolve();
                                                        }
                                                    }, 1000);
                                                }
                                            )})
                                            .then(() => setError(undefined))
                                            .then(() => createSession(repository));
                                      },
                                      actionTitle: "Replace existing session"});
                        } else {
                            createSession(repository);
                        }
                    })
                } catch {
                    setError({ reason: 'Error', action: onMissingSession});
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
