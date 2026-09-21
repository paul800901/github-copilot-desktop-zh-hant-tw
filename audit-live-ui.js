const fs = require('node:fs');
const path = require('node:path');

const DEVTOOLS_FILE = path.join(
  process.env.LOCALAPPDATA,
  'com.github.githubapp',
  'EBWebView',
  'DevToolsActivePort'
);

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener('open', () => resolve({
      send(method, params = {}) {
        return new Promise((sendResolve, sendReject) => {
          const id = nextId++;
          pending.set(id, { resolve: sendResolve, reject: sendReject });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close() {
        socket.close();
      }
    }));
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !pending.has(message.id)) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    socket.addEventListener('error', () => reject(new Error('DevTools WebSocket connection failed.')));
  });
}

async function main() {
  const requestedLabel = process.argv[2] || '';
  const [port] = fs.readFileSync(DEVTOOLS_FILE, 'utf8').trim().split(/\r?\n/);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!target) throw new Error('No GitHub Copilot page target found.');

  const cdp = await connect(target.webSocketDebuggerUrl);
  try {
    if (requestedLabel === '__invalidate__') {
      const response = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          delete window.GITHUB_COPILOT_ZH_HANT_TW;
          delete window.__GITHUB_COPILOT_ZH_HANT_TW_NATIVE_MENU__;
          document.documentElement.lang = 'en';
          return true;
        })()`,
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel === '__body__') {
      const response = await cdp.send('Runtime.evaluate', {
        expression: 'document.body.innerText',
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel === '__attrs__') {
      const response = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify([...document.querySelectorAll('[aria-label], [placeholder], [title]')]
          .filter(element => element.getClientRects().length > 0)
          .flatMap(element => ['aria-label', 'placeholder', 'title'].map(name => ({ name, value: element.getAttribute(name) })))
          .filter(item => item.value))`,
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel === '__scrollables__') {
      const response = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify([...document.querySelectorAll('*')]
          .filter(element => element.scrollHeight > element.clientHeight + 20 && element.clientHeight > 100)
          .map((element, index) => ({
            index,
            tag: element.tagName,
            className: String(element.className),
            ariaLabel: element.getAttribute('aria-label'),
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollTop: element.scrollTop
          })))`,
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel === '__collect_scroll__' || requestedLabel === '__collect_scroll_file__') {
      const response = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
          const scroller = [...document.querySelectorAll('*')].find(element =>
            element.scrollHeight > element.clientHeight + 20 && element.clientHeight > 100
          );
          if (!scroller) return JSON.stringify({ error: 'scrollable container not found' });
          const values = new Set();
          const collect = () => {
            const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              if (node.parentElement?.getClientRects().length) {
                const value = node.nodeValue.replace(/\\s+/g, ' ').trim();
                if (value) values.add(value);
              }
            }
          };
          const step = Math.max(200, Math.floor(scroller.clientHeight * 0.75));
          for (let top = 0; top <= scroller.scrollHeight; top += step) {
            scroller.scrollTop = top;
            await wait(180);
            collect();
          }
          scroller.scrollTop = 0;
          await wait(180);
          return JSON.stringify([...values]);
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (requestedLabel === '__collect_scroll_file__') {
        const outputDir = path.join(__dirname, '.local');
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'marketplace-visible-text.json');
        fs.writeFileSync(outputPath, `${JSON.stringify(JSON.parse(response.result.value), null, 2)}\n`, 'utf8');
        process.stdout.write(`${outputPath}\n`);
      } else {
        process.stdout.write(`${response.result.value}\n`);
      }
      return;
    }
    if (requestedLabel.startsWith('__click__:')) {
      const needle = requestedLabel.slice('__click__:'.length);
      const response = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
          const visible = element => element && element.getClientRects().length > 0;
          const trigger = [...document.querySelectorAll('button, a, [role="tab"], [role="button"]')].find(element =>
            visible(element) && element.innerText.trim() === ${JSON.stringify(needle)}
          );
          if (!trigger) return JSON.stringify({ error: 'trigger not found', needle: ${JSON.stringify(needle)} });
          trigger.click();
          await wait(700);
          return document.body.innerText;
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel.startsWith('__options__:')) {
      const needle = requestedLabel.slice('__options__:'.length);
      const response = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
          const visible = element => element && element.getClientRects().length > 0;
          const trigger = [...document.querySelectorAll('button')].find(element =>
            visible(element) && (element.getAttribute('aria-label') || element.innerText).includes(${JSON.stringify(needle)})
          );
          if (!trigger) return JSON.stringify({ error: 'trigger not found' });
          trigger.click();
          await wait(300);
          const options = [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"]')]
            .filter(visible)
            .map(element => ({ text: element.innerText, ariaLabel: element.getAttribute('aria-label') }));
          trigger.click();
          return JSON.stringify(options);
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel.startsWith('__find__:')) {
      const needle = requestedLabel.slice('__find__:'.length);
      const response = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify((() => {
          const matches = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (node.nodeValue.trim() === ${JSON.stringify(needle)}) matches.push(node);
          }
          return matches.map(node => {
            const chain = [];
            let element = node.parentElement;
            for (let index = 0; element && index < 8; index += 1, element = element.parentElement) {
              chain.push({ tag: element.tagName, className: String(element.className), ariaLabel: element.getAttribute('aria-label') });
            }
            return { value: node.nodeValue, chain };
          });
        })())`,
        returnByValue: true
      });
      process.stdout.write(`${response.result.value}\n`);
      return;
    }
    if (requestedLabel === '__state__') {
      const state = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          lang: document.documentElement.lang,
          signature: Boolean(window.GITHUB_COPILOT_ZH_HANT_TW),
          nativeMenuPatched: Boolean(window.__GITHUB_COPILOT_ZH_HANT_TW_NATIVE_MENU__),
          nativeMenuTranslations: window.__GITHUB_COPILOT_ZH_HANT_TW_NATIVE_MENU_TRANSLATIONS__ || []
        })`,
        returnByValue: true
      });
      process.stdout.write(`${state.result.value}\n`);
      return;
    }
    const expression = `
      (async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const visible = element => element && element.getClientRects().length > 0;
        const settingsButton = [...document.querySelectorAll('button')].find(element =>
          visible(element) && ['Settings', '設定'].some(label => {
            const ariaLabel = element.getAttribute('aria-label') || '';
            return ariaLabel === label || ariaLabel.startsWith(label + ',') || ariaLabel.startsWith(label + '，');
          })
        );
        if (settingsButton) {
          settingsButton.click();
          await wait(700);
        }

        const allLabels = ['一般', '帳號', '工作階段', '佈景主題', '無障礙', '技能', 'MCP 伺服器', '外掛程式', '模型供應商', '實驗性功能'];
        const requestedLabel = ${JSON.stringify(requestedLabel)};
        const labels = requestedLabel ? [requestedLabel] : allLabels;
        const result = {};
        for (const label of labels) {
          const item = [...document.querySelectorAll('button, a, [role="tab"]')].find(element =>
            visible(element) && element.textContent.trim() === label
          );
          if (!item) {
            result[label] = { error: 'navigation item not found' };
            continue;
          }
          item.click();
          await wait(500);
          const dialog = [...document.querySelectorAll('[role="dialog"]')]
            .filter(visible)
            .sort((left, right) => right.innerText.length - left.innerText.length)[0] || document.body;
          const attributes = [...dialog.querySelectorAll('[aria-label], [placeholder], [title]')]
            .filter(visible)
            .flatMap(element => ['aria-label', 'placeholder', 'title'].map(name => ({
              name,
              value: element.getAttribute(name)
            })))
            .filter(item => item.value);
          result[label] = {
            text: dialog.innerText,
            attributes
          };
        }
        return result;
      })()
    `;
    const response = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    process.stdout.write(`${JSON.stringify(response.result.value, null, 2)}\n`);
  } finally {
    cdp.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
