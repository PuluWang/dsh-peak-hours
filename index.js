/**
 * dsh-peak-hours — host half.
 *
 * The plugin is entirely client-side: it only needs a Loader entry so that
 * dsh-client-modules can scan the package, compose `window.__DSH_BOOT__` and
 * serve `client.js` from /plugins/dsh-peak-hours/client.js.
 *
 * This host half therefore intentionally does nothing: no services, no tools,
 * no routes, no timers. That keeps the plugin platform-neutral and free of
 * side effects on the agent side.
 */

export const name = 'dsh-peak-hours'

export function apply() {}
