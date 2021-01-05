import crypto from 'crypto';
import { assign, Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { Client } from '@substrate/playground-client';
import { PanelId } from './index';
import terms from 'bundle-text:./terms.md';

const termsHash = crypto.createHash('md5').update(terms).digest('hex');

export interface Context {
  terms: string,
  panel: PanelId,
  details?: object,
  instance?: string;
  template?: string;
  templates?: Array<string>;
  error?: string
}

export const termsUnapproved = "@state/TERMS_UNAPPROVED";
export const setup = "@state/SETUP";
export const logged = "@state/LOGGED";
export const unlogged = "@state/UNLOGGED";
//export const deploying = "@state/DEPLOYING";
//export const stopping = "@state/STOPPING";
//export const failed = "@state/FAILED";

export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const termsApproval = "@action/TERMS_APPROVAL";
export const check = "@action/CHECK";
export const deploy = "@action/DEPLOY";
export const stop = "@action/STOP";
export const select = "@action/SELECT";
export const restart = "@action/RESTART";
export const logout = "@action/LOGOUT";

const termsApprovedKey = 'termsApproved';

function termsApproved(): boolean {
  const approvedTermsHash = localStorage.getItem(termsApprovedKey);
  return termsHash == approvedTermsHash;
}

function lifecycle(client: Client) {
  const pathParam = 'path';
  const deployParam = 'deploy';
  /*let template = new URLSearchParams(location.search).get(deployParam);
  if (location.state?.freshLog) {
    // Restore query params
    const query = localStorage.getItem(pathParam);
    if (query && query != "") {
      const params = new URLSearchParams(query);
      template = params.get(deployParam);
      history.replace(`/?${params.toString()}`);
    }
  }*/
  return Machine<Context>({
  id: 'lifecycle',
  initial: termsApproved() ? setup: termsUnapproved,
  context: {
    terms: terms,
    panel: PanelId.Session,
   // template: template,
  },
  states: {
      [termsUnapproved]: {
        on: {
          [termsApproval]: { target: setup,
                             actions: ['storeTermsHash']},
        }
      },
      [setup]: {
        invoke: {
          src: (context, _event) => async (callback) => {
            // Retrieve initial data
            const { templates, user, session } = (await client.get());
            if (!user) {
              // Keep track of query params while unlogged. Will be restored after login.
              const query = new URLSearchParams(window.location.search).toString();
              localStorage.setItem(pathParam, query);
            }

            // If an existing template is provided as part of the URL, directly deploy it
            // Otherwise advance to `logged` state
            const template = context.template;
            const data = {details: {templates: templates }};
            if (user && template) {
            if (templates[template]) {
                if (session) {
                throw {error: `Session running`, data: {session: session}};
                } else {
                callback({type: deploy, template: template, data: data});
                }
            } else {
                throw {error: `Unknown template ${template}`, data: data};
            }
            }

            callback({type: check, data: data});
          },
          /*onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error || event.data, data: (_context, event) => event.data.data})
          }*/
        },
        on: {
          //[deploy]: { target: deploying,
          //            actions: assign({template: (_context, event) => event.template, details: (_context, event) => event.data?.details}) },
          [check]: { target: logged,
                     actions: assign({details: (_context, event) => event.data?.details}) }
        }
      },
      [logged]: {
        on: {[restart]: setup,
             [logout]: unlogged,
             //[stop]: {target: stopping},
             [select]: {actions: assign({ panel: (_, event) => event.panel})},
             /*[deploy]: {target: deploying,
             actions: assign({ template: (_, event) => event.template})*/}
      },
      [unlogged]: {
        invoke: {
          src: async () => {
            await client.logout();
          },
          onDone: {target: setup}
        }
      },
      /*[stopping]: {
        invoke: {
          src: (context, event) => async (callback) => {
            await client.stopInstance();
            // Ignore failures, consider that this call is idempotent

            async function waitForRemoval(count: number) {
              const { result } = await client.getDetails();
              if (!result.instance) {
                // The instance doesn't exist anymore
                callback({type: success});
              } else {
                // Instance is still running
                if (count > 30) {
                  // Too long, don't check anymore
                  callback({type: failure, error: "Failed to stop instance in time"});
                } else {
                  // Check once more
                  setTimeout(() => waitForRemoval(count + 1), 1000);
                }
              }
            }

            await waitForRemoval(0);
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error || event})
          }
        },
        on: {
          [restart]: setup,
          [success]: { target: setup},
          [failure]: { target: failed,
                       actions: assign({ error: (_context, event) => event.error }) }
        }
      },
      [deploying]: {
        invoke: {
          src: (context, _) => async (callback) => {
            const { error } = await client.deployInstance(context.template);
            if (error != undefined) {
              callback({type: failure, error: error});
            } else {
              navigateToInstance(history);
            }
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error || event})
          }
        },
        on: {
          [restart]: setup,
          [failure]: { target: failed,
                       actions: assign({ error: (_context, event) => event.error }) }
        }
      },
      [failed]: {
        on: { [stop]: {target: stopping},
              [restart]: setup }
      }*/
  }},
  {
    actions: {
      storeTermsHash: () => {
        localStorage.setItem(termsApprovedKey, termsHash);
      },
    }
  })}

export function useLifecycle(client: Client) {
    return useMachine(lifecycle(client), { devTools: true });
}
