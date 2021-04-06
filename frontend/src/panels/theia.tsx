import React, { useEffect, useRef, useState } from "react";
import Paper from '@material-ui/core/Paper';
import { Client, Template } from '@substrate/playground-client';
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

export function TheiaPanel({ client, autoDeploy, templates, onMissingSession, onSessionFailing, onSessionTimeout }: { client: Client, autoDeploy: string | null, templates: Record<string, Template>, onMissingSession: () => void, onSessionFailing: () => void, onSessionTimeout: () => void }): JSX.Element {
    const maxRetries = 5*60;
    const ref = useRef(null);
    const [error, setError] = useState<Error>();
    const [url, setUrl] = useState<string>();
    const [loading, setLoading] = useState<Loading>();

    useEffect(() => {
        async function fetchData() {
            const session = await client.getCurrentSession();
            if (session) {
                const phase = session.pod.phase;
                if (phase == 'Running') {
                    // Check URL is fine
                    const url = `//${session.url}`;
                    if ((await fetchWithTimeout(url)).ok) {
                        setUrl(url);
                        return;
                    }
                } else if (phase == 'Pending') {
                    const reason = session.pod.container?.reason;
                    if (reason === "CrashLoopBackOff" || reason === "ErrImagePull" || reason === "ImagePullBackOff" || reason === "InvalidImageName") {
                        setError({reason: session.pod.container?.message || 'Pod crashed',
                                  action: onSessionFailing});
                        return;
                    }
                }
            }

            const retry = loading?.retry ?? 0;
            if (retry < maxRetries) {
                setLoading({phase: session?.pod.phase || 'Unknown', retry: retry + 1});
                setTimeout(fetchData, 1000);
            } else if (retry == maxRetries) {
                setError({reason: "Couldn't access the theia session in time",
                          action: onSessionTimeout});
            }
        }

        // Entry point.
        // If autoDeploy, first attempt to locate the associated template and deploy it.
        // In all cases, delegates to `fetchData`
        if (autoDeploy) {
            if (!templates[autoDeploy]) {
                setError({reason: `Unknown template ${autoDeploy}`,
                          action: onMissingSession});
                return;
            }

            try {
                client.getCurrentSession().then((session) => {
                    if (session) {
                        setError({reason: "You can only have one active substrate playground session open at a time. \n Please close all other sessions to open a new one",
                                  action: () => client.deleteCurrentSession().then(() => setLoading(undefined)),
                                  actionTitle: "Replace existing session"});
                    } else {
                        client.createCurrentSession({template: autoDeploy}).then(fetchData);
                    }
                })
            } catch {
                setError({ reason: 'Error', action: onMissingSession});
            }
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

    /*
    useEffect(() => {
        const responder = new Responder(user, o => {
            const el = ref.current;
            if (el) {
                el.contentWindow.postMessage(o, "*")
            } else {
                console.error("No accessible iframe session");
            }
        });

        const processMessage = o => {
            const {type, data} = o.data;
            switch (type) {
                case "extension-advertise":
                    if (data.online) {
                        responder.announce();
                    } else {
                        responder.unannounce();
                    }
                    break;
                case "extension-online":
                    responder.announce();
                    responder.setStatus(true);
                    break;
                case "extension-offline":
                    responder.setStatus(false);
                    // TODO ignore offline for now, too trigger happy
                    // setData({type: "ERROR", value: "session went offline", action: () => });
                    // responder.unannounce();
                    break;
                case "extension-answer-offline":
                case "extension-answer-error":
                    console.error("Error while processing message", o);
                case "extension-answer":
                    // Got an answer from the session, respond back
                    responder.respond(o.data);
                    break;
                default:
                    console.error(`Unknown session message type ${type}`, o);
                    break;
            }
        };
        window.addEventListener('message', processMessage, false);
        return () => {
            window.removeEventListener('message', processMessage, false);
            responder.close();
        }
    }, []);
    */
