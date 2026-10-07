import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiKeys, isAuthorized, DEV_KEY } from '../src/auth.js';

test('without configured keys the development key is the only key', () => {
  assert.deepEqual(apiKeys({}), [DEV_KEY]);
});

test('configured keys are a comma separated list', () => {
  assert.deepEqual(apiKeys({ SBX_API_KEYS: 'one, two' }), ['one', 'two']);
});

test('a request is authorized only with a known x-api-key header', () => {
  assert.equal(isAuthorized({ 'x-api-key': 'one' }, ['one']), true);
  assert.equal(isAuthorized({ 'x-api-key': 'nope' }, ['one']), false);
  assert.equal(isAuthorized({}, ['one']), false);
});
