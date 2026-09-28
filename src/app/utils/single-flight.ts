// Shares one in-flight call of an async function across concurrent callers.
// While a call is running, any further calls get back the SAME promise
// instead of starting a second run — so two triggers for "the same work"
// (e.g. a manual sync tap and a background sync probe) can't both fire the
// underlying request. Once the call settles (resolve or reject), the next
// call starts a fresh run.
//
// Used by app-context.tsx to keep "Sync Now" and the background change-probe
// from ever running two `syncSelf` actions for the same user at once.

export interface SingleFlightFn<Args extends unknown[], T> {
  (...args: Args): Promise<T>;
  /** True while a call is in flight and has not yet settled. */
  isInFlight: () => boolean;
}

export function singleFlight<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>
): SingleFlightFn<Args, T> {
  let inFlight: Promise<T> | null = null;

  const wrapped = ((...args: Args): Promise<T> => {
    if (inFlight) return inFlight;
    const promise = fn(...args).finally(() => {
      // Only clear if this call is still the current one — defensive against
      // pathological reentrancy, though fn() here is never reentrant in
      // practice since inFlight is set synchronously before fn() can resolve.
      if (inFlight === promise) inFlight = null;
    });
    inFlight = promise;
    return promise;
  }) as SingleFlightFn<Args, T>;

  wrapped.isInFlight = () => inFlight !== null;

  return wrapped;
}
