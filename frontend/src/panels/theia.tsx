import React, { useEffect, useRef, useState } from "react";
import Paper from '@material-ui/core/Paper';
import { Client, Template } from '@substrate/playground-client';
import { CenteredContainer, ErrorMessage, Loading } from '../components';
import { fetchWithTimeout } from '../utils';

export function TheiaPanel({ client, autoDeploy, templates, onMissingSession, onSessionFailing, onSessionTimeout }: { client: Client, autoDeploy?: string, templates: Record<string, Template>, onMissingSession: () => void, onSessionFailing: () => void, onSessionTimeout: () => void }): JSX.Element {
    const maxRetries = 5*60;
    const ref = useRef(null);
    const [data, setData] = useState({ type: "LOADING", phase: "Preparing", retry: 0, value: "", url: "" });

    useEffect(() => {
        async function fetchData() {
            const session = await client.getCurrentSession();
            if (!session) {
                // No session exist, this state shouldn't be reached
                setData({ type: "ERROR", value: "Couldn't locate the theia session", action: onMissingSession});
                return;
            }

            const phase = session.pod.phase;
            if (phase == 'Running' || phase == 'Pending') {
                const reason = session.pod.reason;
                if (reason === "CrashLoopBackOff" || reason === "ErrImagePull" || reason === "ImagePullBackOff" || reason === "InvalidImageName") {
                    setData({ type: "ERROR", value: session.pod.message, action: onSessionFailing });
                    return;
                }
                // Check URL is fine
                const url = `//${session.url}`;
                if ((await fetchWithTimeout(url)).ok) {
                    setData({ type: "SUCCESS", url: url });
                    return;
                }
            }

            const retry = data.retry ?? 0;
            if (retry < maxRetries) {
                setTimeout(() => setData({ type: "LOADING", phase: phase, retry: retry + 1 }), 1000);
            } else if (retry == maxRetries) {
                setData({ type: "ERROR", value: "Couldn't access the theia session in time", action: onSessionTimeout });
            }
        }

        if (data.type != "ERROR" && data.type != "SUCCESS") {
            if (autoDeploy) {
                if (!templates[autoDeploy]) {
                    setData({ type: "ERROR", value: `Unknown template ${autoDeploy}`, action: onMissingSession});
                    return;
                }

                try {
                    client.getCurrentSession().then((session) => {
                        if (session) {
                            setData({ type: "ERROR", value: "A session is still active", action: onMissingSession});
                        } else {
                            client.createCurrentSession({template: autoDeploy}).then(fetchData);
                        }
                    })
                } catch {
                    setData({ type: "ERROR", value: `Error`, action: onMissingSession});
                }
            } else {
                fetchData();
            }
        }
    }, [data]);

    if (data.type == "SUCCESS") {
        return <iframe ref={ref} src={data.url} frameBorder="0" width="100%" height="100%"></iframe>
    } else {
        return (
            <CenteredContainer>
                <Paper style={{ display: "flex", flexDirection: "column", height: "60vh", width: "60vw", justifyContent: "center"}} elevation={3}>
                    {data.type == 'ERROR'
                     ? <ErrorMessage reason={data.value} action={data.action} />
                     : <Loading phase={data.phase} retry={data.retry} />}
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
