// Demo/session state that the shell changes (role switcher, view toggle, demo tools). No audit rows.
import { ROLES } from '../permissions.js';
import { ok, fail } from './util.js';

export function setRole(store, role) {
  if (!ROLES.includes(role)) return fail('bad_role', 'Unknown role.');
  store.set((d) => { d.role = role; });
  return ok();
}
export function setView(store, view) {
  if (!['borrower', 'mba'].includes(view)) return fail('bad_view', 'Unknown view.');
  store.set((d) => { d.view = view; });
  return ok();
}
export function setLastRoute(store, view, hash) {
  if (!['borrower', 'mba'].includes(view)) return fail('bad_view', 'Unknown view.');
  if (store.get().lastRoute[view] === hash) return ok();
  store.set((d) => { d.lastRoute[view] = hash; });
  return ok();
}
export function setPendingDelay(store, value) {
  if (!['auto', 'manual'].includes(value)) return fail('bad_value', 'Use auto or manual.');
  store.set((d) => { d.demo.pendingDelay = value; });
  return ok();
}
export function markNotificationsRead(store) {
  if (store.get().notifications.every((n) => n.read)) return ok();
  store.set((d) => { for (const n of d.notifications) n.read = true; });
  return ok();
}
