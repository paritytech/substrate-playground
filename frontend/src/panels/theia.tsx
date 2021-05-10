import React, { useEffect, useRef, useState } from "react";
import Paper from '@material-ui/core/Paper';
import { Client } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, Loading } from '../components';
import { fetchWithTimeout } from '../utils';

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
        function createWorkspace(template: string) {
            client.createCurrentWorkspace({template: template}).then(fetchData);
        }

        async function fetchData() {
            const workspace = await client.getCurrentWorkspace();
            if (workspace) {
                const { pod } = workspace;
                const phase = pod.phase;
                if (phase == 'Running') {
                    // Check URL is fine
                    const url = `//${workspace.url}`;
                    if ((await fetchWithTimeout(url)).ok) {
                        setUrl(url);
                        return;
                    }
                } else if (phase == 'Pending') {
                    const { conditions, container } = pod;
                    const reason = (conditions && conditions[0].reason) || container?.reason;
                    if (reason === "Unschedulable" || reason === "CrashLoopBackOff" || reason === "ErrImagePull" || reason === "ImagePullBackOff" || reason === "InvalidImageName") {
                        setError({reason: container?.message || (conditions && conditions[0].message) || 'Pod crashed',
                                  action: onWorkspaceFailing});
                        return;
                    }
                    // The template is being deployed, nothing to do
                }
            }

            const retry = loading?.retry ?? 0;
            if (retry < maxRetries) {
                setLoading({phase: workspace?.pod.phase || 'Unknown', retry: retry + 1});
                setTimeout(fetchData, 1000);
            } else if (retry == maxRetries) {
                setError({reason: "Couldn't access the theia workspace in time",
                          action: onWorkspaceTimeout});
            }
        }

        // Entry point.
        // If autoDeploy, first attempt to locate the associated template and deploy it.
        // In all cases, delegates to `fetchData`
        if (autoDeploy) {
            client.listTemplates().then(templates => {
                if (!templates[autoDeploy]) {
                    setError({reason: `Unknown template ${autoDeploy}`,
                              action: onMissingWorkspace});
                    return;
                }

                try {
                    client.getCurrentWorkspace().then(workspace => {
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
