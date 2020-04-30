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

export const progress = "@event/PROGESS";
export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const show = "@action/SHOW";
export const deploy = "@action/DEPLOY";
export const stop = "@action/STOP";
export const restart = "@action/RESTART";
const loading = "@activity/LOADING";

const lifecycle = Machine<Context>({
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
            /*const response = (await getUserDetails(context.userUUID));
            if (response.error) {
              throw response;
            }
            const response2 = (await getTemplates());
            if (response2.error) {
              throw response2;
            }
            return {instances: response.result, templates: response2.result};*/

            let description = `#frdsfd

* dsfds
* dsfdsf

dsfds dsfdsf dsf dsf dsf dsf dsf dsf dsfdsf dsf ds fds fdsf ds fds fds 
dsf dsfds fds  dsfhyrtu ytu ytuy tu tu yrtu ytu ytu ytu ytu ytu ty uyt aa aaa aa aa aa dsf dsfds fds  dsfhyrtu ytu ytuy tu tu yrtu ytu ytu ytu ytu ytu ty uyt aa aaa aa aa aa dsf dsfds fds  dsfhyrtu ytu ytuy tu tu yrtu ytu ytu ytu ytu ytu ty uyt aa aaa aa aa aa

## erez`;
            let runtime = {env: [{name: "SOME_ENV", value: "1234"}], ports: [{name: "web", protocol: "TCP", path: "/", port: 123, target: 123}]};
            let build = {base: "", extensions: [{name: "", value: ""}], repositories: [{name: "", value: ""}], commands: [{name: "", run: "", working_directory: ""}]};
            let template = {image: "gcr.io/substrateplayground-252112/jeluard/theia-substrate@sha256:0b3ec9ad567d0f5b0eed8a0fc2b1fa3fe1cca24cc02416047d71f83770b05e34", name: "workshop", description: description, runtime: runtime, build: build}
            let instance = {user_uuid: "", instance_uuid: "", template: template, phase: "starting", url: "", started_at: {secs_since_epoch: 1588254730}};
            return {instances: [], templates: [template]};
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
        on: {[show]: {target: checking,
                      actions: assign({ instanceUUID: (_, event) => event.instance.instance_uuid})},
             [stop]: {target: stopping,
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
            const {result, error} = await getInstanceDetails(context.userUUID, context.instanceUUID);
            if (result) {
              const {phase, url} = result;
              if (phase == "Running") {
                if ((await fetchWithTimeout(url).catch((err) => err)).ok) {
                  window.location.assign(`/{context.instanceUUID}`);
                  return;
                }
              }
  
              if (phase && context.checkOccurences < 60 * 10) {
                setTimeout(() => callback({type: progress, phase: phase}), 1000);
                return;
              } 
            }
            callback({type: failure, error: error || "Too long to deploy"});
          },
          onError: {
            target: failed,
            actions: assign({ error: (_context, event) => event.data.message}),
          },
        },
        on: {
          [restart]: setup,
          [progress]: { target: checking,
                        actions: assign({ checkOccurences: (context, _event) => context.checkOccurences + 1,
                                          phase: (_context, event) => event.phase}) },
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
});

export function useLifecycle() {
    return useMachine(lifecycle);
}