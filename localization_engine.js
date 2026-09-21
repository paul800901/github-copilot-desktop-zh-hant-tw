'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const PROJECT_NAME = 'GitHub Copilot Desktop 繁體中文（台灣）';
const ENGINE_VERSION = '0.2.3';
const SIGNATURE = 'GITHUB_COPILOT_ZH_HANT_TW';
const DEFAULT_EXE = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'GitHub Copilot',
  'github.exe'
);
const DEVTOOLS_PORT_FILE = path.join(
  process.env.LOCALAPPDATA || '',
  'com.github.githubapp',
  'EBWebView',
  'DevToolsActivePort'
);
const WATCHER_LOCK_FILE = path.join(
  process.env.LOCALAPPDATA || __dirname,
  'GitHub Copilot繁中化',
  'watcher.pid'
);
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadDictionary() {
  const dictsDir = path.join(__dirname, 'dicts');
  const dictionary = {};

  if (!fs.existsSync(dictsDir)) {
    throw new Error(`找不到字典目錄：${dictsDir}`);
  }

  const files = fs.readdirSync(dictsDir).filter(file => file.endsWith('.json')).sort();
  if (!files.length) throw new Error('字典目錄中沒有 JSON 字典。');

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dictsDir, file), 'utf8'));
    for (const [source, translation] of Object.entries(data)) {
      const key = normalizeText(source);
      if (key) dictionary[key] = translation;
    }
  }

  return dictionary;
}

function browserLocalization(dictionary, engineVersion) {
  'use strict';

  const signature = 'GITHUB_COPILOT_ZH_HANT_TW';
  if (window[signature]?.version === engineVersion) return;
  window[signature]?.dispose?.();

  const map = new Map(Object.entries(dictionary));
  const nativeMenuMap = new Map([
    ['No active sessions', '目前沒有工作階段'],
    ['Create Session…', '建立工作階段…'],
    ['New Chat', '新增聊天'],
    ['Open GitHub Copilot', '開啟 GitHub Copilot'],
    ['Settings…', '設定…'],
    ['Quit', '結束']
  ]);
  const BLOCKED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'INPUT', 'TEXTAREA',
    'SVG', 'CANVAS', 'PATH', 'SYMBOL'
  ]);
  const BLOCKED_HINT = /(assistant-message|user-message|message-content|conversation-turn|chat-turn|rendered-markdown|markdown-body|\bprose\b|monaco|code-editor|xterm|terminal-(?:view|pane|output|content|emulator)|diff-view|patch-view|transcript)/i;
  const ATTRIBUTES = ['aria-label', 'placeholder', 'title'];

  function normalize(value) {
    return value
      .normalize('NFKC')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function translateCore(value) {
    const key = normalize(value);
    if (!key) return value;
    if (map.has(key)) return map.get(key);

    let match = key.match(/^Open user menu for (.+)$/);
    if (match) return `開啟 ${match[1]} 的使用者選單`;

    match = key.match(/^Downloading update — (.+)$/);
    if (match) return `正在下載更新 — ${match[1]}`;

    match = key.match(/^Reasoning effort: (.+)$/);
    if (match) return `推理強度：${map.get(normalize(match[1])) || match[1]}`;

    match = key.match(/^Mode: (.+), (Ctrl|Control) \+ Shift \+ M$/);
    if (match) return `模式：${map.get(normalize(match[1])) || match[1]}，${match[2]} + Shift + M`;

    match = key.match(/^(.+) \(not available\)$/);
    if (match) return `${match[1]}（無法使用）`;

    match = key.match(/^SCORE (\d+)$/);
    if (match) return `分數 ${match[1]}`;

    match = key.match(/^Chat messages used: (\d+)%$/);
    if (match) return `已使用的聊天訊息：${match[1]}%`;

    match = key.match(/^(\d+)% quota used$/);
    if (match) return `已使用配額：${match[1]}%`;

    match = key.match(/^(.+), add provider$/);
    if (match) return `${map.get(normalize(match[1])) || match[1]}，新增供應商`;

    match = key.match(/^Actions for (.+) marketplace$/);
    if (match) return `${match[1]} 市集操作`;

    match = key.match(/^Install: (.+)$/);
    if (match) return `安裝：${map.get(normalize(match[1])) || match[1]}`;

    match = key.match(/^(.+), view details$/);
    if (match) return `檢視 ${map.get(normalize(match[1])) || match[1]} 的詳細資料`;

    match = key.match(/^(.+), open user menu$/);
    if (match) return `開啟 ${match[1]} 的使用者選單`;

    match = key.match(/^Edit shortcut for (.+)$/);
    if (match) return `編輯「${map.get(normalize(match[1])) || match[1]}」的快速鍵`;

    match = key.match(/^Assign shortcut for (.+)$/);
    if (match) return `指定「${map.get(normalize(match[1])) || match[1]}」的快速鍵`;

    match = key.match(/^(.+), edit shortcut for (.+)$/);
    if (match) return `${match[1]}，編輯「${map.get(normalize(match[2])) || match[2]}」的快速鍵`;

    match = key.match(/^(Mode|Font|New sessions remote access|Show Copilot CLI Session), (.+)$/);
    if (match) {
      const label = map.get(normalize(match[1])) || match[1];
      const value = map.get(normalize(match[2])) || match[2];
      return `${label}：${value}`;
    }

    match = key.match(/^Zoom, (.+)$/);
    if (match) return `縮放：${match[1]}`;

    match = key.match(/^Extra time after a session goes idle, (.+)$/);
    if (match) return `工作階段閒置後的額外喚醒時間：${map.get(normalize(match[1])) || match[1]}`;

    match = key.match(/^Preview: (.+)$/);
    if (match) return `預覽：${match[1]}`;

    match = key.match(/^(.+) \[Preview\]$/);
    if (match) return `${match[1]} [預覽]`;

    return value;
  }

  function translate(value) {
    if (typeof value !== 'string' || !value.trim()) return value;
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    const core = value.slice(leading.length, value.length - trailing.length || undefined);
    const translated = translateCore(core);
    return translated === core ? value : `${leading}${translated}${trailing}`;
  }

  function translateNativeMenu(value) {
    if (nativeMenuMap.has(value)) return nativeMenuMap.get(value);
    return value
      .replace(/ \(Setting up…\)$/, '（正在設定…）')
      .replace(/ · Needs input$/, ' · 需要輸入')
      .replace(/ · Merge conflicts$/, ' · 合併衝突')
      .replace(/ · Merge ready$/, ' · 可合併')
      .replace(/ · Working$/, ' · 執行中');
  }

  async function patchNativeMenuModule() {
    const menuUrl = Array.from(document.querySelectorAll('link[rel="modulepreload"]'))
      .map(link => link.href)
      .find(url => /\/assets\/menu-[^/]+\.js(?:\?|$)/.test(url));
    if (!menuUrl) return false;

    const menuModule = await import(menuUrl);
    for (const className of ['MenuItem', 'IconMenuItem', 'CheckMenuItem', 'Submenu']) {
      const MenuClass = menuModule[className];
      if (!MenuClass || MenuClass.__ZH_HANT_TW_PATCHED__) continue;
      const originalNew = MenuClass.new;
      MenuClass.new = function localizedMenuItem(options) {
        const localized = options && typeof options === 'object'
          ? { ...options, text: translateNativeMenu(options.text) }
          : options;
        return originalNew.call(this, localized);
      };
      Object.defineProperty(MenuClass, '__ZH_HANT_TW_PATCHED__', { value: true });
    }
    window.__GITHUB_COPILOT_ZH_HANT_TW_NATIVE_MENU__ = true;
    return true;
  }

  function watchForNativeMenuModule() {
    let stopped = false;
    const tryPatch = () => {
      if (stopped || window.__GITHUB_COPILOT_ZH_HANT_TW_NATIVE_MENU__) return;
      patchNativeMenuModule().then(patched => {
        if (patched) {
          stopped = true;
          observer.disconnect();
        }
      }).catch(() => {});
    };
    const observer = new MutationObserver(tryPatch);
    observer.observe(document, { childList: true, subtree: true });
    tryPatch();
    setTimeout(tryPatch, 0);
    setTimeout(tryPatch, 100);
    setTimeout(tryPatch, 500);
  }

  watchForNativeMenuModule();

  function isBlocked(node, allowDirectFormAttribute = false) {
    let element = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    let depth = 0;

    while (element && depth < 16) {
      if (element.nodeType === Node.ELEMENT_NODE) {
        const tag = element.tagName.toUpperCase();
        if (allowDirectFormAttribute && depth === 0 && (tag === 'INPUT' || tag === 'TEXTAREA')) {
          return false;
        }
        if (BLOCKED_TAGS.has(tag) || element.isContentEditable) return true;
        if (element.hasAttribute('data-message-id')) return true;

        const hints = [
          typeof element.className === 'string' ? element.className : '',
          element.getAttribute('data-testid') || '',
          element.getAttribute('data-role') || '',
          element.getAttribute('aria-roledescription') || ''
        ].join(' ');
        if (BLOCKED_HINT.test(hints)) return true;
      }

      element = element.parentElement || (element.parentNode && element.parentNode.host);
      depth += 1;
    }
    return false;
  }

  function translateAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || isBlocked(element, true)) return;
    for (const attribute of ATTRIBUTES) {
      const original = element.getAttribute(attribute);
      if (!original) continue;
      const translated = translate(original);
      if (translated !== original) element.setAttribute(attribute, translated);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (isBlocked(root)) return;
      const original = root.nodeValue;
      if (original.trim() === '.' && root.parentElement?.textContent.includes('/reset-allowed-tools')) {
        root.nodeValue = original.replace('.', '。');
        return;
      }
      const translated = translate(original);
      if (translated !== original) root.nodeValue = translated;
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      translateAttributes(root);
      if (isBlocked(root)) return;
      if (root.childElementCount === 0 && root.childNodes.length > 1) {
        const original = root.textContent;
        const translated = translate(original);
        if (translated !== original) {
          root.textContent = translated;
          return;
        }
      }
    }

    for (const child of root.childNodes) translateTree(child);
    if (root.shadowRoot) translateTree(root.shadowRoot);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) translateTree(node);
      } else if (mutation.type === 'characterData') {
        translateTree(mutation.target);
      } else if (mutation.type === 'attributes') {
        translateAttributes(mutation.target);
      }
    }
  });

  const observerOptions = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES
  };

  const originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachShadowWithLocalization() {
    const shadowRoot = originalAttachShadow.apply(this, arguments);
    try {
      observer.observe(shadowRoot, observerOptions);
      translateTree(shadowRoot);
    } catch (_) {}
    return shadowRoot;
  };

  function start() {
    const root = document.body || document.documentElement;
    if (!root) return;
    document.documentElement.lang = 'zh-TW';
    observer.observe(root, observerOptions);
    translateTree(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  window.addEventListener('load', start, { once: true });
  setTimeout(start, 100);
  setTimeout(start, 500);
  setTimeout(start, 1500);
  window[signature] = {
    version: engineVersion,
    installedAt: new Date().toISOString(),
    dispose() {
      observer.disconnect();
      if (Element.prototype.attachShadow === this.attachShadow) {
        Element.prototype.attachShadow = originalAttachShadow;
      }
    },
    attachShadow: Element.prototype.attachShadow
  };
}

function buildInjectedSource(dictionary) {
  return `(${browserLocalization.toString()})(${JSON.stringify(dictionary)}, ${JSON.stringify(ENGINE_VERSION)});`;
}

function isCopilotRunning() {
  try {
    const output = execFileSync(
      'tasklist.exe',
      ['/FI', 'IMAGENAME eq github.exe', '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true }
    );
    return output.toLowerCase().includes('"github.exe"');
  } catch (_) {
    return false;
  }
}

async function readDebugTarget(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      if (!fs.existsSync(DEVTOOLS_PORT_FILE)) {
        await sleep(200);
        continue;
      }

      const [portText] = fs.readFileSync(DEVTOOLS_PORT_FILE, 'utf8').split(/\r?\n/);
      const port = Number(portText);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        await sleep(200);
        continue;
      }

      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
      const targets = await response.json();
      const target = targets.find(item =>
        item.type === 'page' &&
        typeof item.url === 'string' &&
        item.url.startsWith('http://tauri.localhost') &&
        item.webSocketDebuggerUrl
      );
      if (target) return { target, port };
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  const detail = lastError ? `：${lastError.message}` : '';
  throw new Error(`無法在 ${timeoutMs / 1000} 秒內連線到 GitHub Copilot 介面${detail}`);
}

function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    const eventHandlers = new Map();
    let nextId = 1;

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('DevTools WebSocket 連線逾時。'));
    }, 10000);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve({
        send(method, params = {}) {
          return new Promise((sendResolve, sendReject) => {
            const id = nextId++;
            const requestTimeout = setTimeout(() => {
              pending.delete(id);
              sendReject(new Error(`${method} 等待回應逾時。`));
            }, 10000);
            pending.set(id, { resolve: sendResolve, reject: sendReject, timeout: requestTimeout });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
        onEvent(method, handler) {
          if (!eventHandlers.has(method)) eventHandlers.set(method, new Set());
          eventHandlers.get(method).add(handler);
          return () => eventHandlers.get(method)?.delete(handler);
        }
      });
    });

    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        const handlers = eventHandlers.get(message.method);
        if (handlers) {
          for (const handler of handlers) {
            Promise.resolve(handler(message.params || {})).catch(() => {});
          }
        }
        return;
      }
      if (!pending.has(message.id)) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });

    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('DevTools WebSocket 連線失敗。'));
    });
  });
}

async function injectAndVerify(source, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let stableTargetId = null;
  let stableSince = 0;
  let verifiedPort = null;
  let lastError = null;
  let pageReloaded = false;

  while (Date.now() < deadline) {
    try {
      const remaining = Math.max(1000, deadline - Date.now());
      const { target, port } = await readDebugTarget(Math.min(remaining, 3000));
      verifiedPort = port;
      if (!target.url || target.url === 'about:blank') {
        await sleep(250);
        continue;
      }
      const cdp = await connectCdp(target.webSocketDebuggerUrl);
      try {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
        const injection = await cdp.send('Runtime.evaluate', {
          expression: source,
          returnByValue: true,
          awaitPromise: true
        });
        if (injection.exceptionDetails) {
          throw new Error(injection.exceptionDetails.text || '介面翻譯腳本執行失敗。');
        }
        if (!pageReloaded) {
          pageReloaded = true;
          await cdp.send('Page.reload', { ignoreCache: true });
          await sleep(1200);
          continue;
        }

        const verification = await cdp.send('Runtime.evaluate', {
          expression: `JSON.stringify({
            signature: window.${SIGNATURE}?.version === ${JSON.stringify(ENGINE_VERSION)},
            lang: document.documentElement.lang,
            ready: document.readyState,
            hasBody: Boolean(document.body && document.body.innerText.trim())
          })`,
          returnByValue: true
        });
        const state = JSON.parse(verification.result.value);
        const isReady = state.signature && state.lang === 'zh-TW' && state.hasBody;

        if (isReady) {
          if (stableTargetId !== target.id) {
            stableTargetId = target.id;
            stableSince = Date.now();
          } else if (Date.now() - stableSince >= 2000) {
            return { port: verifiedPort, targetId: stableTargetId };
          }
        } else {
          stableTargetId = null;
          stableSince = 0;
        }
      } finally {
        cdp.close();
      }
    } catch (error) {
      lastError = error;
      stableTargetId = null;
      stableSince = 0;
    }
    await sleep(400);
  }

  const detail = lastError ? `：${lastError.message}` : '';
  throw new Error(`翻譯注入後未能穩定讀回 zh-TW 介面${detail}`);
}

async function readLocalizationState(timeoutMs = 3000) {
  const { target, port } = await readDebugTarget(timeoutMs);
  if (!target.url || target.url === 'about:blank') {
    return { active: false, targetId: target.id, port };
  }

  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  try {
    const response = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        signature: window.${SIGNATURE}?.version === ${JSON.stringify(ENGINE_VERSION)},
        lang: document.documentElement.lang,
        hasBody: Boolean(document.body && document.body.innerText.trim())
      })`,
      returnByValue: true
    });
    const state = JSON.parse(response.result.value);
    return {
      active: state.signature && state.lang === 'zh-TW' && state.hasBody,
      targetId: target.id,
      port
    };
  } finally {
    cdp.close();
  }
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function readWatcherLock() {
  try {
    if (!fs.existsSync(WATCHER_LOCK_FILE)) return null;
    const raw = fs.readFileSync(WATCHER_LOCK_FILE, 'utf8').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'number') return { pid: parsed, version: null };
      return {
        pid: Number.parseInt(parsed.pid, 10),
        version: typeof parsed.version === 'string' ? parsed.version : null
      };
    } catch (_) {
      return { pid: Number.parseInt(raw, 10), version: null };
    }
  } catch (_) {
    return null;
  }
}

function isLocalizationWatcherProcess(pid) {
  if (!isProcessRunning(pid)) return false;
  try {
    const command = [
      `$process = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\" -ErrorAction SilentlyContinue`,
      'if ($process) { $process.CommandLine }'
    ].join('; ');
    const commandLine = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { encoding: 'utf8', windowsHide: true }
    );
    return /localization_engine\.js/i.test(commandLine) && /--watch(?:\s|$)/i.test(commandLine);
  } catch (_) {
    return false;
  }
}

async function stopWatcher(lock) {
  if (!lock || !isProcessRunning(lock.pid)) return;
  if (!isLocalizationWatcherProcess(lock.pid)) {
    throw new Error('背景監看鎖定檔指向其他程序，為避免誤關程式已停止啟動。');
  }
  process.kill(lock.pid);
  const deadline = Date.now() + 5000;
  while (isProcessRunning(lock.pid) && Date.now() < deadline) await sleep(100);
  if (isProcessRunning(lock.pid)) throw new Error('舊的背景翻譯監看程序無法結束。');
  try {
    if (fs.existsSync(WATCHER_LOCK_FILE)) fs.unlinkSync(WATCHER_LOCK_FILE);
  } catch (_) {}
}

async function prepareWatcher({ reuseMatching }) {
  const lock = readWatcherLock();
  if (!lock || !Number.isInteger(lock.pid) || lock.pid <= 0) return null;
  if (!isProcessRunning(lock.pid)) {
    try { fs.unlinkSync(WATCHER_LOCK_FILE); } catch (_) {}
    return null;
  }
  if (!isLocalizationWatcherProcess(lock.pid)) {
    try { fs.unlinkSync(WATCHER_LOCK_FILE); } catch (_) {}
    return null;
  }
  if (reuseMatching && lock.version === ENGINE_VERSION) return lock;
  await stopWatcher(lock);
  return null;
}

function acquireWatcherLock() {
  fs.mkdirSync(path.dirname(WATCHER_LOCK_FILE), { recursive: true });
  const existing = readWatcherLock();
  if (existing && isProcessRunning(existing.pid)) return false;
  fs.writeFileSync(WATCHER_LOCK_FILE, JSON.stringify({
    pid: process.pid,
    version: ENGINE_VERSION
  }), 'utf8');
  return true;
}

function ownsWatcherLock() {
  return readWatcherLock()?.pid === process.pid;
}

function releaseWatcherLock() {
  try {
    if (ownsWatcherLock()) fs.unlinkSync(WATCHER_LOCK_FILE);
  } catch (_) {}
}

async function watchLocalization(source) {
  if (!acquireWatcherLock()) return;
  process.on('exit', releaseWatcherLock);

  let lastAppSeenAt = Date.now();
  const updateRestartGraceMs = 5 * 60 * 1000;

  while (true) {
    if (!ownsWatcherLock()) break;
    if (isCopilotRunning()) {
      lastAppSeenAt = Date.now();
      try {
        const state = await readLocalizationState();
        if (!state.active) await injectAndVerify(source);
      } catch (_) {
        // Copilot 更新或重新建立 WebView 時可能短暫無法連線，下一輪再試。
      }
    } else if (Date.now() - lastAppSeenAt > updateRestartGraceMs) {
      break;
    }
    await sleep(2000);
  }

  releaseWatcherLock();
}

async function waitForLocalizationActive(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (!isCopilotRunning()) throw new Error('GitHub Copilot 在翻譯完成前已退出。');
    try {
      const state = await readLocalizationState(1500);
      if (state.active) return state;
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  const detail = lastError ? `：${lastError.message}` : '';
  throw new Error(`背景監看程序未能套用翻譯${detail}`);
}

function startBackgroundWatcher(exe) {
  const watcher = spawn(process.execPath, [__filename, '--watch', '--exe', exe], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env
  });
  watcher.unref();
}

function parseArgs(argv) {
  const options = { exe: DEFAULT_EXE, dryRun: false, watch: false, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--exe') {
      options.exe = path.resolve(argv[++index] || '');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--version') {
      options.version = true;
    } else if (arg === '--watch') {
      options.watch = true;
    } else if (arg === '--apply') {
      options.apply = true;
    } else {
      throw new Error(`不支援的參數：${arg}`);
    }
  }
  return options;
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('目前僅支援 Windows 版 GitHub Copilot Desktop。');
  }

  const options = parseArgs(process.argv.slice(2));
  if (options.version) {
    console.log(`${PROJECT_NAME} v${ENGINE_VERSION}`);
    return;
  }

  const dictionary = loadDictionary();
  const source = buildInjectedSource(dictionary);
  new Function(source);

  if (!fs.existsSync(options.exe)) {
    throw new Error(`找不到 GitHub Copilot Desktop：${options.exe}`);
  }

  if (options.dryRun) {
    console.log(`[完成] 環境與 ${Object.keys(dictionary).length} 筆譯文檢查通過。`);
    console.log(`[目標] ${options.exe}`);
    return;
  }

  if (options.watch) {
    await watchLocalization(source);
    return;
  }

  if (options.apply) {
    if (!isCopilotRunning()) {
      throw new Error('GitHub Copilot 尚未執行，請改用 start-win.bat 啟動繁中版。');
    }
    await prepareWatcher({ reuseMatching: false });
    const { port } = await injectAndVerify(source);
    startBackgroundWatcher(options.exe);
    console.log(`[完成] 已將 ${Object.keys(dictionary).length} 筆最新譯文套用到執行中的介面。`);
    console.log(`[驗證] WebView 語言已設為 zh-TW，本機除錯連線使用動態連接埠 ${port}。`);
    return;
  }

  if (isCopilotRunning()) {
    throw new Error('請先完全關閉 GitHub Copilot，再由 start-win.bat 啟動繁中版。');
  }

  let reusableWatcher = await prepareWatcher({ reuseMatching: true });

  console.log(`[啟動] ${options.exe}`);
  const child = spawn(options.exe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0'
    }
  });

  const earlyExit = new Promise((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(`GitHub Copilot 啟動後提早退出（代碼 ${code ?? '無'}，訊號 ${signal ?? '無'}）。`));
    });
  });
  child.unref();

  let result;
  if (reusableWatcher) {
    try {
      result = await Promise.race([waitForLocalizationActive(), earlyExit]);
    } catch (error) {
      if (!isCopilotRunning()) throw error;
      await stopWatcher(reusableWatcher);
      reusableWatcher = null;
      result = await Promise.race([injectAndVerify(source), earlyExit]);
      startBackgroundWatcher(options.exe);
    }
  } else {
    result = await Promise.race([injectAndVerify(source), earlyExit]);
    startBackgroundWatcher(options.exe);
  }

  console.log(`[完成] 已套用 ${Object.keys(dictionary).length} 筆繁體中文（台灣）介面譯文。`);
  console.log(`[驗證] WebView 語言已設為 zh-TW，本機除錯連線使用動態連接埠 ${result.port}。`);
  console.log('[監看] 已啟用更新與介面重新載入後的自動補回。');
}

main().catch(error => {
  console.error(`[錯誤] ${error.message}`);
  process.exitCode = 1;
});
