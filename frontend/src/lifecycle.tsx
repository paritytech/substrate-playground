import { useMachine } from '@xstate/react';
import { assign, Machine } from 'xstate';
import { deployInstance, getDetails, getInstanceDetails, stopInstance } from './api';
import { navigateToInstance } from './utils';

export interface Context {
  details?: object,
  authToken?: string,
  instanceUUID?: string;
  instanceURL?: string;
  instances?: Array<string>;
  template?: string;
  templates?: Array<string>;
  phase?: string;
  checkOccurences: number;
  error?: string
}

export const setup = "@state/SETUP";
export const logged = "@state/LOGGED";
export const deploying = "@state/DEPLOYING";
export const stopping = "@state/STOPPING";
export const failed = "@state/FAILED";

export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const check = "@action/CHECK";
export const deploy = "@action/DEPLOY";
export const stop = "@action/STOP";
export const restart = "@action/RESTART";

function lifecycle(history, location) {
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
    checkOccurences: 0,
    template: template,
  },
  states: {
      [setup]: {
        invoke: {
          src: (context, _event) => async (callback) =>  {
            const response = (await getDetails());
            if (response.error) {
              throw response;
            }

            const res = response.result;
            if (!res.user) {
              // Keep track of query params while unlogged. Will be restored after login.
              const query = new URLSearchParams(window.location.search).toString();
              localStorage.setItem(pathParam, query);
            }

            if (res) {
              const templates = res.templates;
              const user = res.user;
              const template = context.template;
              const indexedTemplates = Object.entries(templates).map(([k, v]) => {v["id"] = k; return v;});
              const data = {details: { ...res, ...{templates: indexedTemplates } }};
              if (user && template) {
                if (templates[template]) {
                  const instances = res.instances;
                  if (instances?.length > 0) {
                    throw {error: `Instance running`, data: {instances: instances}};
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
             [stop]: {target: stopping,
                      actions: assign({ instanceUUID: (_, event) => event.instance.instance_uuid})},
             [deploy]: {target: deploying,
                        actions: assign({ template: (_, event) => event.template})}}
      },
      [stopping]: {
        invoke: {
          src: (context, event) => async (callback) => {
            await stopInstance(context.instanceUUID);
            // Ignore failures, consider that this call is idempotent

            async function waitForRemoval(count: number) {
              if (count > 30) {
                callback({type: failure, error: "Failed to stop instance in time"});
              }

              const { error } = await getInstanceDetails(context.instanceUUID);
              if (error) {
                // The instance doesn't exist anymore, stopping is done
                callback({type: success});
              } else {
                setTimeout(() => waitForRemoval(count + 1), 1000);
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
            const {result, error} = await deployInstance(context.template);
            if (error != undefined) {
              callback({type: failure, error: error});
            } else {
              navigateToInstance(history, result);
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
        on: { [restart]: setup }
      }
  }
})}

export function useLifecycle(history, location) {
    return useMachine(lifecycle(history, location), { devTools: true });
}