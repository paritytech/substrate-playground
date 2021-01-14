import crypto from 'crypto';
import { assign, EventObject, Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { Client, PlaygroundUser, Session, Template } from '@substrate/playground-client';
import terms from 'bundle-text:./terms.md';


export enum PanelId {Session, Admin, Stats, Theia}

const termsHash = crypto.createHash('md5').update(terms).digest('hex');

export interface Context {
  terms: string,
  panel: PanelId,
  user: PlaygroundUser,
  templates: Record<string, Template>,
  session?: Session
}

export enum States {
    TERMS_UNAPPROVED = '@state/TERMS_UNAPPROVED',
    SETUP = '@state/SETUP',
    LOGGED = '@state/LOGGED',
    UNLOGGED = '@state/UNLOGGED'
}

interface UserDataMachineStates {
    states: {
        [States.TERMS_UNAPPROVED]: {},
        [States.SETUP]: {},
        [States.LOGGED]: {},
        [States.UNLOGGED]: {},
    }
  }

export enum Events {
    TERMS_APPROVAL = '@event/TERMS_APPROVAL',
    CHECK = '@action/CHECK',
    SELECT = '@action/SELECT',
    RESTART = '@action/RESTART',
    LOGOUT = '@action/LOGOUT',
}

type EventTypesSchema =
    | Events.TERMS_APPROVAL
    | Events.CHECK
    | Events.SELECT
    | Events.RESTART
    | Events.LOGOUT;

export interface UserDataMachineEvents extends EventObject {
    type: EventTypesSchema;
}

export enum Actions {
    STORE_TERMS_HASH = '@action/STORE_TERMS_HASH',
}

const termsApprovedKey = 'termsApproved';

function termsApproved(): boolean {
  const approvedTermsHash = localStorage.getItem(termsApprovedKey);
  return termsHash == approvedTermsHash;
}

function lifecycle(client: Client) {
  return Machine<Context, UserDataMachineStates, UserDataMachineEvents>({
    initial: termsApproved() ? States.SETUP: States.TERMS_UNAPPROVED,
    context: {
        terms: terms,
        panel: PanelId.Session,
    },
    states: {
        [States.TERMS_UNAPPROVED]: {
            on: {
                [Events.TERMS_APPROVAL]:
                    {target: States.SETUP,
                     actions: [Actions.STORE_TERMS_HASH]},
            }
        },
        [States.SETUP]: {
            invoke: {
                src: () => async (callback) => {
                    const { templates, user } = (await client.get());
                    if (user) {
                        // TODO restore auto deployment
                        callback({type: Events.CHECK, data: {templates: templates, user: user}});
                    }
                },
            },
            on: {
            [Events.CHECK]:
                {target: States.LOGGED,
                 actions: assign({templates: (_, event) => event.data.templates, user: (_, event) => event.data.user, session: (_, event) => event.data.session}) }
            }
        },
        [States.LOGGED]: {
            on: {[Events.RESTART]: States.SETUP,
                 [Events.LOGOUT]: States.UNLOGGED,
                 [Events.SELECT]: {actions: assign({ panel: (_, event) => event.panel})},}
        },
        [States.UNLOGGED]: {
            invoke: {
                src: async () => {
                    await client.logout();
                },
                onDone: {target: States.SETUP}
            }
        },
    }
  },
  {
    actions: {
      [Actions.STORE_TERMS_HASH]: () => {
        localStorage.setItem(termsApprovedKey, termsHash);
      },
    }
  });
}

export function useLifecycle(client: Client) {
    return useMachine(lifecycle(client), { devTools: true });
}
