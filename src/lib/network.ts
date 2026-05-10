export const networkState = {
  isOnline: navigator.onLine,
  isReconnecting: false
};

const notify = () => window.dispatchEvent(new Event('network_status_change'));

window.addEventListener('online', () => {
  networkState.isOnline = true;
  notify();
});

window.addEventListener('offline', () => {
  networkState.isOnline = false;
  notify();
});

export const setReconnecting = (status: boolean) => {
  networkState.isReconnecting = status;
  notify();
};

export async function withRetry<T>(
  operationName: string,
  operation: () => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any }> {
  let attempt = 0;
  const maxRetries = 3;
  const startTime = performance.now();

  while (attempt <= maxRetries) {
    try {
      const result = await operation();
      
      const endTime = performance.now();
      console.log(`[Perf Audit] ${operationName} time-to-complete: ${(endTime - startTime).toFixed(2)}ms`);

      if (result.error && (result.error.message.includes('fetch') || result.error.message.includes('network') || result.error.message.includes('Failed to fetch'))) {
        throw result.error;
      }

      if (attempt > 0) setReconnecting(false);
      return result;
    } catch (err: any) {
      attempt++;
      if (attempt > maxRetries) {
        setReconnecting(false);
        const endTime = performance.now();
        console.error(`[Perf Audit] ${operationName} failed after ${(endTime - startTime).toFixed(2)}ms`);
        return { data: null, error: err };
      }
      
      setReconnecting(true);
      const delay = Math.pow(2, attempt) * 500; // exponential backoff
      console.warn(`[Network] ${operationName} failed. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { data: null, error: new Error('Max retries exceeded') };
}
