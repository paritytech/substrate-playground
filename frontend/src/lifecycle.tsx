import { useMachine } from '@xstate/react';
import { v4 as uuidv4 } from 'uuid';
import { assign, Machine } from 'xstate';
import { deployImage, getInstanceDetails, getTemplates, getUserDetails, stopInstance } from './api';
import { fetchWithTimeout } from './utils';

const key = "userUUID";
const userUUID = localStorage.getItem(key) || uuidv4();
localStorage.setItem(key, userUUID);

export interface Context {
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
export const checking = "@state/CHECKING";
export const failed = "@state/FAILED";

export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const deploy = "@action/DEPLOY";
export const stop = "@action/STOP";
export const restart = "@action/RESTART";
const loading = "@activity/LOADING";

function lifecycle(history) {
  return Machine<Context>({
  id: 'lifecycle',
  initial: setup,
  context: {
    userUUID: userUUID,
    checkOccurences: 0,
  },
  states: {
      [setup]: {
        invoke: {
          src: async (context, _event) => {
            const response = (await getUserDetails(context.userUUID));
            if (response.error) {
              throw response;
            }
            const response2 = (await getTemplates());
            if (response2.error) {
              throw response2;
            }
            return {instances: response.result, templates: response2.result};
          },
          onDone: {
            target: initial,
            actions: assign({instances: (_context, event) => event.data.instances,
                             templates: (_context, event) => event.data.templates})
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error})
          }
        }
      },
      [initial]: {
        on: {[stop]: {target: stopping,
                      actions: assign({ instanceUUID: (_, event) => event.instance.instance_uuid})},
             [deploy]: {target: deploying,
                        actions: assign({ template: (_, event) => event.template})}}
      },
      [stopping]: {
        invoke: {
          src: (context, event) => async (callback) => {
            const {result, error} = await stopInstance(context.userUUID, context.instanceUUID);
            if (result) {
              callback({type: success, uuid: result});
            } else {
              callback({type: failure, error: error});
            }
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
            const {result, error} = await deployImage(context.userUUID, context.template);
            if (result) {
              callback({type: success, uuid: result});
            } else {
              callback({type: failure, error: error});
            }
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error})
          }
        },
        on: {
          [restart]: setup,
          [success]: { target: checking,
                       actions: assign({ instanceUUID: (_context, event) => event.uuid })},
          [failure]: { target: failed,
                       actions: assign({ error: (_context, event) => event.error }) }
        }
      },
      [checking]: {
        activities: [loading],
        invoke: {
          src: (context, _event) => async (callback, _onReceive) => {
            history.push(`/${context.instanceUUID}`);
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.message}),
          },
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
},
{
  activities: {
    [loading]: () => {
      const className = "loading";
      document.body.classList.add(className);
      return () => document.body.classList.remove(className);
    }
  },
})};

export function useLifecycle(history) {
    return useMachine(lifecycle(history), { devTools: true });
}