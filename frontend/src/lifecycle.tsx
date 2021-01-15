import crypto from 'crypto';
import { assign, EventObject, Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { Client, PlaygroundUser, Template } from '@substrate/playground-client';
import terms from 'bundle-text:./terms.md';


export enum PanelId {Session, Admin, Stats, Theia}

const termsHash = crypto.createHash('md5').update(terms).digest('hex');

export interface Context {
  terms: string,
  panel: PanelId,
  user?: PlaygroundUser,
  templates?: Record<string, Template>,
}

export enum States {
    TERMS_UNAPPROVED = '@state/TERMS_UNAPPROVED',
    SETUP = '@state/SETUP',
    LOGGED = '@state/LOGGED',
    UNLOGGED = '@state/UNLOGGED'
}

export enum Events {
    TERMS_APPROVAL = '@event/TERMS_APPROVAL',
    LOGIN = '@action/LOGIN',
    SELECT = '@action/SELECT',
    RESTART = '@action/RESTART',
    UNLOGIN = '@action/UNLOGIN',
    LOGOUT = '@action/LOGOUT',
}

export enum Actions {
    STORE_TERMS_HASH = '@action/STORE_TERMS_HASH',
    LOGOUT = '@action/LOGOUT',
}

const termsApprovedKey = 'termsApproved';

function termsApproved(): boolean {
  const approvedTermsHash = localStorage.getItem(termsApprovedKey);
  return termsHash == approvedTermsHash;
}

function lifecycle(client: Client) {
  return Machine<Context>({
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
                        callback({type: Events.LOGIN, templates: templates, user: user});
                    } else {
                        callback({type: Events.UNLOGIN, templates: templates});
                    }
                },
            },
            on: {[Events.LOGIN]: {target: States.LOGGED,
                                  actions: assign((_, event) => {
                                    return {
                                      templates: event.templates,
                                      user: event.user,
                                    }
                                  })},
                 [Events.UNLOGIN]: {target: States.UNLOGGED}}
        },
        [States.UNLOGGED]: {
            on: {[Events.RESTART]: States.SETUP,}
        },
        [States.LOGGED]: {
            on: {[Events.RESTART]: States.SETUP,
                 [Events.LOGOUT]: {target: States.SETUP,
                                   actions: [Actions.LOGOUT]},
                 [Events.SELECT]: {actions: assign({ panel: (_, event) => event.panel})}}
        }
    }
  },
  {
    actions: {
      [Actions.STORE_TERMS_HASH]: () => {
        localStorage.setItem(termsApprovedKey, termsHash);
      },
      [Actions.LOGOUT]: async () => {
        await client.logout();
      },
    }
  });
}

export function useLifecycle(client: Client) {
    return useMachine(lifecycle(client), { devTools: true });
}
