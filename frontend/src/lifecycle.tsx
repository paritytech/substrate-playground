import { useMachine } from '@xstate/react';
import { v4 as uuidv4 } from 'uuid';
import { assign, Machine } from 'xstate';
import { deployInstance, getDetails, getInstanceDetails, getTemplates, getUserDetails, stopInstance } from './api';

const key = "userUUID";
const userUUID = localStorage.getItem(key) || uuidv4();
localStorage.setItem(key, userUUID);

export interface Context {
  details?: object,
  userUUID: string;
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
export const initial = "@state/INITIAL";
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
  const template = new URLSearchParams(location.search).get("deploy");
  return Machine<Context>({
  id: 'lifecycle',
  initial: setup,
  context: {
    userUUID: userUUID,
    checkOccurences: 0,
    template: template,
  },
  states: {
      [setup]: {
        invoke: {
          src: (context, _event) => async (callback) =>  {
            const response = (await getUserDetails(context.userUUID));
            if (response.error) {
              throw response;
            }

            const response2 = (await getTemplates());
            if (response2.error) {
              throw response2;
            }

            const response3 = (await getDetails());
            if (response3.error) {
              throw response3;
            }

            const instances = response.result;
            const templates = response2.result;
            if (context.template && instances?.length === 0) {
              if (templates[context.template]) {
                callback({type: deploy, template: context.template});
              } else {
                throw {error: `Unknown template ${context.template}`}
              }
            }

            callback({type: check, data: {details: response3.result, instances: instances, templates: Object.entries(templates).map(([k, v]) => {v["id"] = k; return v;})}});
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error})
          }
        },
        on: {
          [deploy]: { target: deploying,
                      actions: assign({template: (_context, event) => event.template}) },
          [check]: { target: initial,
                     actions: assign({instances: (_context, event) => event.data.instances,
                                      templates: (_context, event) => event.data.templates,
                                      details: (_context, event) => event.data.details}) }
        }
      },
      [initial]: {
        on: {[restart]: setup,
             [stop]: {target: stopping,
                      actions: assign({ instanceUUID: (_, event) => event.instance.instance_uuid})},
             [deploy]: {target: deploying,
                        actions: assign({ template: (_, event) => event.template})}}
      },
      [stopping]: {
        invoke: {
          src: (context, event) => async (callback) => {
            await stopInstance(context.userUUID, context.instanceUUID);
            // Ignore failures, consider that this call is idempotent

            async function waitForRemoval(count: number) {
              if (count > 30) {
                callback({type: failure, error: "Failed to stop instance in time"});
              }

              const { error } = await getInstanceDetails(context.userUUID, context.instanceUUID);
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
            const {result, error} = await deployInstance(context.userUUID, context.template);
            if (error != undefined) {
              callback({type: failure, error: error});
            } else {
              const params = new URLSearchParams(location.search);
              params.delete("deploy");
              history.push(`/${result}?${params.toString()}`);
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
})};

export function useLifecycle(history, location) {
    return useMachine(lifecycle(history, location), { devTools: true });
}