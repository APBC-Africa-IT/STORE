/**
 * asyncWrap — wraps an async route handler so any thrown error
 * is forwarded to the Express error handler via next().
 */
export function asyncWrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncWrap;
