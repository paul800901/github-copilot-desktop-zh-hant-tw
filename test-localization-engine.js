'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { normalizeText, injectionId, buildInjectedSource } = require('./localization_engine');

test('字典內容一改，注入識別就跟著變', () => {
  const before = { Settings: '設定' };
  const after = { Settings: '設定', Quit: '結束' };
  assert.equal(injectionId(before), injectionId({ Settings: '設定' }));
  assert.notEqual(injectionId(before), injectionId(after));
});

test('同一份字典不重複注入；字典改了就重新注入', () => {
  const dictionary = { Settings: '設定' };
  const sameWindow = { GITHUB_COPILOT_ZH_HANT_TW: { version: injectionId(dictionary) } };
  // Same identity: returns before touching the page, so a context without document is fine.
  vm.runInNewContext(buildInjectedSource(dictionary), { window: sameWindow });

  const staleWindow = { GITHUB_COPILOT_ZH_HANT_TW: { version: '0.2.8', dispose() {} } };
  // New dictionary: it goes on to rebuild the page hooks, which need browser globals this context lacks.
  assert.throws(
    () => vm.runInNewContext(buildInjectedSource({ Settings: '設定', Quit: '結束' }), { window: staleWindow }),
    { name: 'ReferenceError' }
  );
});

test('驗證與執行時使用相同的正規化（彎引號視為同一鍵）', () => {
  assert.equal(normalizeText('Don’t  save'), normalizeText("Don't save"));
});
