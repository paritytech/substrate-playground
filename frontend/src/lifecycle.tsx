import { assign, Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { Client } from '@substrate/playground-api';
import { navigateToHomepage, navigateToInstance } from './utils';

export interface Context {
  details?: object,
  instance?: string;
  template?: string;
  templates?: Array<string>;
  phase?: string;
  error?: string
}

export const setup = "@state/SETUP";
export const logged = "@state/LOGGED";
export const unlogged = "@state/UNLOGGED";
export const deploying = "@state/DEPLOYING";
export const stopping = "@state/STOPPING";
export const failed = "@state/FAILED";

export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const check = "@action/CHECK";
export const deploy = "@action/DEPLOY";
export const stop = "@action/STOP";
export const restart = "@action/RESTART";
export const logout = "@action/LOGOUT";

function lifecycle(history, location, client: Client) {
  const pathParam = 'path';
  const deployParam = 'deploy';
  let template = new URLSearchParams(location.search).get(deployParam);
  if (location.state?.freshLog) {
    // Restore query params
    const query = localStorage.getItem(pathParam);
    if (query && query != "") {
      const params = new URLSearchParams(query);
      template = params.get(deployParam);
      history.replace(`/?${params.toString()}`);
    }
  }
  return Machine<Context>({
  id: 'lifecycle',
  initial: setup,
  context: {
    template: template,
  },
  states: {
      [setup]: {
        invoke: {
          src: (context, _event) => async (callback) =>  {
            // Retrieve initial data
            const response = (await client.getDetails());
            if (response.error) {
              throw response;
            }

            const res = response.result;
            if (!res.user) {
              // Keep track of query params while unlogged. Will be restored after login.
              const query = new URLSearchParams(window.location.search).toString();
              localStorage.setItem(pathParam, query);
            }

            // If an existing template is provided as part of the URL, directly deploy it
            // Otherwise advance to `logged` state
            if (res) {
              const templates = res.templates;
              const user = res.user;
              const template = context.template;
              const indexedTemplates = Object.entries(templates).map(([k, v]) => {v["id"] = k; return v;});
              const indexedUsers = Object.entries(res.users).map(([k, v]) => {v["id"] = k; return v;});
              const data = {details: { ...res, ...{templates: indexedTemplates, users: indexedUsers } }};
              if (user && template) {
                if (templates[template]) {
                  const instance = res.instance;
                  if (instance) {
                    throw {error: `Instance running`, data: {instance: instance}};
                  } else {
                    callback({type: deploy, template: template, data: data});
                  }
                } else {
                  throw {error: `Unknown template ${template}`, data: data};
                }
              }
  
              callback({type: check, data: data});
            } else {
              callback({type: check});
            }
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error, data: (_context, event) => event.data.data, details: (_context, event) => event.data?.details})
          }
        },
        on: {
          [deploy]: { target: deploying,
                      actions: assign({template: (_context, event) => event.template, details: (_context, event) => event.data?.details}) },
          [check]: { target: logged,
                     actions: assign({details: (_context, event) => event.data?.details}) }
        }
      },
      [logged]: {
        on: {[restart]: setup,
             [logout]: unlogged,
             [stop]: {target: stopping},
             [deploy]: {target: deploying,
                        actions: assign({ template: (_, event) => event.template})}}
      },
      [unlogged]: {
        invoke: {
          src: async (ctx, event) => {
            await client.logout();
            navigateToHomepage(history);
          },
          onDone: {target: setup}
        }
      },
      [stopping]: {
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
            actions: assign({ error: (_context, event) => event.data.error})
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
            actions: assign({ error: (_context, event) => event.data.error})
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
      }
  }
})}

export function useLifecycle(history, location, client: Client) {
    return useMachine(lifecycle(history, location, client), { devTools: true });
}