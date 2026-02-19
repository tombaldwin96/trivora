/**
 * Returns a debounced function that runs after `ms` ms of no further calls.
 * Used to throttle realtime/event handlers under load.
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timeoutId != null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, ms);
  };
  return debounced as T;
}

/**
 * Returns a throttled function that runs at most once every `ms` ms.
 * For live quiz: use for applying realtime state updates so video playback isn't janked.
 */
export function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let last = 0;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (scheduled != null) {
        clearTimeout(scheduled);
        scheduled = null;
      }
      last = now;
      fn(...args);
    } else if (scheduled == null) {
      scheduled = setTimeout(() => {
        scheduled = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
  return throttled as T;
}
