// Hash router (D§5.1): '#/b/...' borrower, '#/m/...' MBA. Browser Back works because every
// screen change is a real hash change. Pure matching logic is DOM-free (parseHash/matchRoute);
// createRouter() wires it to window.location.
//
// createRouter() → {on(pattern, handler), go(hash), start(onRoute), current(), resolve(hash), refresh()}
//   pattern: '/m/accounts/:id' (static segments beat ':params' when both match)
//   handler(params, query, route) → HTMLElement

/** '#/m/accounts/ac_1?tab=audit' → {hash, path:'/m/accounts/ac_1', query:{tab:'audit'}} */
export function parseHash(hash) {
  let h = String(hash ?? '');
  if (h.startsWith('#')) h = h.slice(1);
  const qi = h.indexOf('?');
  const rawPath = qi === -1 ? h : h.slice(0, qi);
  const rawQuery = qi === -1 ? '' : h.slice(qi + 1);
  let path = rawPath || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const query = {};
  if (rawQuery) {
    for (const part of rawQuery.split('&')) {
      if (!part) continue;
      const [k, v = ''] = part.split('=');
      try {
        query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch {
        query[k] = v;
      }
    }
  }
  return { hash: `#${path}${rawQuery ? `?${rawQuery}` : ''}`, path, query };
}

const segs = (p) => p.split('/').filter(Boolean);

/** Matches one pattern against a path → params object, or null. */
export function matchPattern(pattern, path) {
  const ps = segs(pattern);
  const xs = segs(path);
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) {
      try {
        params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
      } catch {
        params[ps[i].slice(1)] = xs[i];
      }
    } else if (ps[i] !== xs[i]) {
      return null;
    }
  }
  return params;
}

/** Best route for a path: most static segments wins, then registration order. */
export function matchRoute(routes, path) {
  let best = null;
  for (const r of routes) {
    const params = matchPattern(r.pattern, path);
    if (!params) continue;
    const score = segs(r.pattern).filter((s) => !s.startsWith(':')).length;
    if (!best || score > best.score) best = { ...r, params, score };
  }
  return best;
}

/** View that owns a path: 'borrower' for /b..., 'mba' for /m..., else null. */
export function viewOfPath(path) {
  if (path === '/b' || path.startsWith('/b/')) return 'borrower';
  if (path === '/m' || path.startsWith('/m/')) return 'mba';
  return null;
}

export function createRouter() {
  const routes = [];
  let onRoute = null;
  let cur = null;

  function resolve(hash) {
    const parsed = parseHash(hash);
    const m = matchRoute(routes, parsed.path);
    return {
      ...parsed,
      view: viewOfPath(parsed.path),
      pattern: m ? m.pattern : null,
      params: m ? m.params : {},
      handler: m ? m.handler : null,
    };
  }

  function fire() {
    cur = resolve(globalThis.location?.hash || '');
    if (onRoute) onRoute(cur);
  }

  return {
    on(pattern, handler) {
      routes.push({ pattern, handler });
      return this;
    },
    /** Navigates. Going to the hash you are already on re-runs the route (no hashchange fires). */
    go(hash) {
      const target = parseHash(hash).hash;
      if (globalThis.location.hash === target) fire();
      else globalThis.location.hash = target;
    },
    /** Starts listening; onRoute(route) runs for the current hash and every change. */
    start(cb) {
      onRoute = cb;
      globalThis.addEventListener('hashchange', fire);
      fire();
    },
    /** Re-runs the current route without changing the hash. */
    refresh: fire,
    current: () => cur,
    resolve,
    routes: () => routes.map((r) => r.pattern),
  };
}
