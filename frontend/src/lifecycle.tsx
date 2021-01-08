import crypto from 'crypto';
import { assign, Machine } from 'xstate';
import { useMachine } from '@xstate/react';
import { Client, Template, User } from '@substrate/playground-client';
import { PanelId } from './index';
import terms from 'bundle-text:./terms.md';

const termsHash = crypto.createHash('md5').update(terms).digest('hex');

export interface Context {
  terms: string,
  panel: PanelId,
  user: User,
  templates: Record<string, Template>,
  instance?: string
}

export const termsUnapproved = "@state/TERMS_UNAPPROVED";
export const setup = "@state/SETUP";
export const logged = "@state/LOGGED";
export const unlogged = "@state/UNLOGGED";

export const success = "@event/SUCCESS";
export const failure = "@event/FAILURE";

export const termsApproval = "@action/TERMS_APPROVAL";
export const check = "@action/CHECK";
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
  return Machine<Context>({
    id: 'lifecycle',
    initial: termsApproved() ? setup: termsUnapproved,
    context: {
        terms: terms,
        panel: PanelId.Session,
    },
    states: {
        [termsUnapproved]: {
            on: {
            [termsApproval]: {target: setup,
                              actions: ['storeTermsHash']},
            }
        },
        [setup]: {
            invoke: {
            src: () => async (callback) => {
                const { templates, user, session } = (await client.get());
                if (user) {
                    // TODO restore auto deployment
                    callback({type: check, data: {templates: templates, user: user}});
                } else {
                    // TODO Keep track of query params while unlogged. Will be restored after login.
                    const query = new URLSearchParams(window.location.search).toString();
                    localStorage.setItem(pathParam, query);
                }
            },
            },
            on: {
            [check]: { target: logged,
                        actions: assign({templates: (_context, event) => event.data.templates, user: (_context, event) => event.data.user}) }
            }
        },
        [logged]: {
            on: {[restart]: setup,
                [logout]: unlogged,
                [select]: {actions: assign({ panel: (_, event) => event.panel})},}
        },
        [unlogged]: {
            invoke: {
            src: async () => {
                await client.logout();
            },
            onDone: {target: setup}
            }
        },
    }
  },
  {
    actions: {
      storeTermsHash: () => {
        localStorage.setItem(termsApprovedKey, termsHash);
      },
    }
  });
}

export function useLifecycle(client: Client) {
    return useMachine(lifecycle(client), { devTools: true });
}
