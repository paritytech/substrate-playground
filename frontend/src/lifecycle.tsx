import { useMachine } from '@xstate/react';
import { v4 as uuidv4 } from 'uuid';
import { assign, Machine } from 'xstate';
import { deployImage, getInstanceDetails, getUserDetails } from './api';
import { fetchWithTimeout } from './utils';

const key = "userUUID";
const userUUID = localStorage.getItem(key) || uuidv4();
localStorage.setItem(key, userUUID);

export interface Context {
  userUUID: string;
  template?: string;
  instanceUUID?: string;
  instanceURL?: string;
  instances?: Array<string>;
  phase?: string;
  checkOccurences: number;
  error?: string
}

export const setup = "@state/SETUP";
export const initial = "@state/INITIAL";
export const deploying = "@state/DEPLOYING";
export const checking = "@state/CHECKING";
export const deployed = "@state/DEPLOYED";
export const failed = "@state/FAILED";

export const progress = "@event/PROGESS";
export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const show = "@action/SHOW";
export const deploy = "@action/DEPLOY";
export const restart = "@action/RESTART";
const loading = "@activity/LOADING";

const lifecycle = Machine<Context>({
  id: 'lifecycle',
  initial: setup,
  context: {
    userUUID: userUUID,
    checkOccurences: 0,
    template: "template",
  },
  states: {
      [setup]: {
        invoke: {
          src: async (context, _event) => {
            const response = (await getUserDetails(context.userUUID));
            if (response.error) {
              throw response
            }
            return response;
          },
          onDone: {
            target: initial,
            actions: assign({instances: (_context, event) => event.data.result})
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.error})
          }
        }
      },
      [initial]: {
        on: {[show]: {target: checking,
                      actions: assign({ instanceUUID: (context, _event) => context.instances[0]})},
             [deploy]: {target: deploying}}
      },
      [deploying]: {
        invoke: {
          src: (context, _event) => async (callback, _onReceive) => {
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
          [restart]: initial,
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
            const {result, error} = await getInstanceDetails(context.userUUID, context.instanceUUID);
            const {phase, url} = result;
            if (phase == "Running") {
              if ((await fetchWithTimeout(url).catch((err) => err)).ok) {
                callback({type: success, url: url});
                return;
              }
            }

            if (phase && context.checkOccurences < 60 * 10) {
              setTimeout(() => callback({type: progress, phase: phase}), 1000);
            } else {
              callback({type: failure, error: error || "Too long to deploy"});
            }
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.message}),
          },
        },
        on: {
          [restart]: initial,
          [progress]: { target: checking,
                        actions: assign({ checkOccurences: (context, _event) => context.checkOccurences + 1,
                                          phase: (_context, event) => event.phase }) },
          [success]: { target: deployed,
                       actions: assign({ instanceURL: (_context, event) => event.url })},
          [failure]: { target: failed,
                       actions: assign({ error: (_context, event) => event.error }) }
        }
      },
      [deployed]: {
        on: { [restart]: initial }
      },
      [failed]: {
        on: { [restart]: initial }
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
});

export function useLifecycle() {
    return useMachine(lifecycle);
}