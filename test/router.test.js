// Router pure logic (Task 4): hash parsing, pattern matching, static-beats-param, view of path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchPattern, matchRoute, viewOfPath } from '../src/core/router.js';

test('test_parseHash', () => {
  assert.deepEqual(parseHash('#/m/accounts/ac_1?tab=audit&x=a%20b'), { hash: '#/m/accounts/ac_1?tab=audit&x=a%20b', path: '/m/accounts/ac_1', query: { tab: 'audit', x: 'a b' } });
  assert.equal(parseHash('').path, '/');
  assert.equal(parseHash('#').path, '/');
  assert.equal(parseHash('#/m/dashboard/').path, '/m/dashboard');
});

test('test_matchPattern', () => {
  assert.deepEqual(matchPattern('/m/accounts/:id', '/m/accounts/ac_juan'), { id: 'ac_juan' });
  assert.equal(matchPattern('/m/accounts/:id', '/m/accounts'), null);
  assert.deepEqual(matchPattern('/b/t/:token', '/b/t/hT7q%2B'), { token: 'hT7q+' });
});

test('test_static_beats_param', () => {
  const routes = [
    { pattern: '/m/arrangements/:id', handler: 'detail' },
    { pattern: '/m/arrangements/new', handler: 'new' },
    { pattern: '/m/arrangements', handler: 'list' },
  ];
  assert.equal(matchRoute(routes, '/m/arrangements/new').handler, 'new');
  assert.equal(matchRoute(routes, '/m/arrangements/ar_1').handler, 'detail');
  assert.equal(matchRoute(routes, '/m/arrangements').handler, 'list');
  assert.equal(matchRoute(routes, '/m/nope'), null);
});

test('test_viewOfPath', () => {
  assert.equal(viewOfPath('/b'), 'borrower');
  assert.equal(viewOfPath('/b/t/x'), 'borrower');
  assert.equal(viewOfPath('/m/dashboard'), 'mba');
  assert.equal(viewOfPath('/bx'), null);
  assert.equal(viewOfPath('/'), null);
});
