/** Internal API requests may queue during operational bursts. Keep one configurable budget. */
export function apiRequestTimeoutMs(value = process.env.API_REQUEST_TIMEOUT_SECONDS) {
  const seconds = Number(value);
  return Math.round((Number.isFinite(seconds) && seconds >= 30 ? Math.min(seconds, 600) : 120) * 1000);
}

export function apiRequestSignal(request: Request, minimumTimeoutMs = 0) {
  return AbortSignal.any([request.signal, AbortSignal.timeout(Math.max(apiRequestTimeoutMs(), minimumTimeoutMs))]);
}
