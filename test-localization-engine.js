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

function fakePage() {
  const observers = [];
  const timers = [];
  class FakeMutationObserver {
    constructor() { this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const node = { nodeType: 1, tagName: 'BODY', childNodes: [], childElementCount: 0, className: '',
    isContentEditable: false, parentElement: null, parentNode: null,
    getAttribute: () => null, hasAttribute: () => false };
  const document = { readyState: 'complete', body: node, documentElement: { lang: '' },
    querySelectorAll: () => [], addEventListener() {} };
  class Element {}
  Element.prototype.attachShadow = function () { return {}; };
  const context = {
    window: { addEventListener() {} }, document, Element,
    MutationObserver: FakeMutationObserver,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_FRAGMENT_NODE: 11 },
    performance: { getEntriesByType: () => [] },
    setTimeout: fn => timers.push(fn),
  };
  return { context, observers, timers };
}

test('換字典重新注入時，舊注入的觀察器與計時器不會再接回來', () => {
  const page = fakePage();
  vm.runInNewContext(buildInjectedSource({ Settings: '設定' }), page.context);
  const oldObservers = [...page.observers];
  assert.ok(oldObservers.some(observer => observer.active));

  vm.runInNewContext(buildInjectedSource({ Settings: '組態' }), page.context);
  for (const run of page.timers.splice(0)) run();

  assert.ok(oldObservers.every(observer => !observer.active));
  assert.ok(page.observers.filter(observer => !oldObservers.includes(observer)).some(observer => observer.active));
});
