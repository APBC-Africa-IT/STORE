import { AppError } from '../errors/app-error';

/**
 * A tiny state machine: lists which status changes are allowed.
 * Every status change in the system goes through `assertTransition` — no exceptions.
 */
export function defineMachine<S extends string>(name: string, transitions: Record<S, readonly S[]>) {
  return {
    name,
    canTransition(from: S, to: S) {
      return transitions[from]?.includes(to) ?? false;
    },
    assertTransition(from: S, to: S) {
      if (!transitions[from]?.includes(to)) {
        throw new AppError('INVALID_STATE_TRANSITION', `${name}: cannot go from ${from} to ${to}`, { from, to });
      }
    },
  };
}
