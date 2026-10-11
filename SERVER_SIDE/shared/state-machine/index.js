/**
 * Generic state machine helper.
 * Usage:
 *   const machine = defineMachine('Order', transitions, guards);
 *   machine.assertTransition(fromStatus, toStatus, ctx);  // throws AppError on invalid
 *   machine.can(fromStatus, toStatus);                     // returns boolean
 */
import { AppError } from '../errors/codes.js';

/**
 * @param {string} name - display name for error messages
 * @param {Record<string, string[]>} transitions - { FROM: [TO, ...], ... }
 * @param {Record<string, (ctx) => string|null>} guards - { 'FROM->TO': (ctx) => null|reason }
 */
export function defineMachine(name, transitions, guards = {}) {
  return {
    can(from, to) {
      return (transitions[from] ?? []).includes(to);
    },

    assertTransition(from, to, ctx = {}) {
      if (!(transitions[from] ?? []).includes(to)) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          `${name}: transition ${from} → ${to} is not allowed.`
        );
      }
      const guardKey = `${from}->${to}`;
      const guard = guards[guardKey];
      if (guard) {
        const reason = guard(ctx);
        if (reason) {
          throw new AppError('INVALID_STATE_TRANSITION', reason);
        }
      }
    },

    allTransitions() {
      return transitions;
    },
  };
}
