// Forwards uncaught errors to MQTT `app/logs/<app>` (where the log-server/dev dashboard
// already listen), and reloads the page as a last resort if the app is clearly broken.
// Reloads are capped so a persistent fault can't cause a reload loop.
const RELOAD_HISTORY_KEY = 'pong.autoReloads';
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 10 * 60 * 1000;
const ERROR_BURST = 20; // this many uncaught errors within ERROR_BURST_MS means "broken"
const ERROR_BURST_MS = 10 * 1000;

export function installErrorReporter({ api, app, reloadDelayMs = 5000 }) {
  const topic = `app/logs/${app}`;
  let windowStart = 0;
  let sentInWindow = 0;
  let recentErrors = [];
  let reloadScheduled = false;

  function report(level, message, extra = {}) {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      sentInWindow = 0;
    }
    sentInWindow += 1;
    if (sentInWindow > 5) return; // don't flood the broker with a per-frame error
    try {
      api.update(topic, {
        level,
        app,
        message: String(message).slice(0, 2000),
        time: new Date(now).toISOString(),
        ...extra,
      });
    } catch (err) {
      // Reporting must never throw.
    }
  }

  function scheduleReload(reason) {
    if (reloadScheduled) return;
    let history = [];
    try {
      history = JSON.parse(sessionStorage.getItem(RELOAD_HISTORY_KEY) || '[]');
    } catch (err) {
      history = [];
    }
    history = history.filter((t) => Date.now() - t < RELOAD_WINDOW_MS);
    if (history.length >= MAX_RELOADS) {
      report('error', `not reloading again (${history.length} reloads in 10 min): ${reason}`);
      return;
    }
    reloadScheduled = true;
    report('warn', `reloading in ${reloadDelayMs} ms: ${reason}`);
    setTimeout(() => {
      history.push(Date.now());
      try {
        sessionStorage.setItem(RELOAD_HISTORY_KEY, JSON.stringify(history));
      } catch (err) {
        // ignore
      }
      window.location.reload();
    }, reloadDelayMs);
  }

  function noteError() {
    const now = Date.now();
    recentErrors = recentErrors.filter((t) => now - t < ERROR_BURST_MS);
    recentErrors.push(now);
    if (recentErrors.length >= ERROR_BURST) scheduleReload(`${recentErrors.length} errors in 10 s`);
  }

  window.addEventListener('error', (event) => {
    report('error', event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error && event.error.stack,
    });
    noteError();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report('error', reason && reason.message ? reason.message : String(reason), {
      kind: 'unhandledrejection',
      stack: reason && reason.stack,
    });
    noteError();
  });

  return { report, scheduleReload };
}
