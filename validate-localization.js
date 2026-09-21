'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DICTS_DIR = path.join(__dirname, 'dicts');
const REQUIRED_FILES = ['common.json', 'home.json', 'settings.json', 'zz_taiwan_terminology.json'];
const FORBIDDEN_TAIWAN_TERMS = [
  ['文件夾', '資料夾'],
  ['軟件', '軟體'],
  ['默認', '預設'],
  ['設置', '設定'],
  ['信息', '資訊'],
  ['通過', '透過'],
  ['屏幕', '螢幕'],
  ['鏈接', '連結'],
  ['質量', '品質']
];

function normalizeText(text) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function fail(message) {
  console.error(`[錯誤] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(DICTS_DIR)) {
  fail(`找不到字典目錄：${DICTS_DIR}`);
  process.exit();
}

for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(DICTS_DIR, file))) fail(`缺少必要字典：${file}`);
}

const files = fs.readdirSync(DICTS_DIR).filter(file => file.endsWith('.json')).sort();
const merged = new Map();
let entries = 0;

for (const file of files) {
  const filePath = path.join(DICTS_DIR, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${file} 不是有效的 JSON：${error.message}`);
    continue;
  }

  if (!data || Array.isArray(data) || typeof data !== 'object') {
    fail(`${file} 的最上層必須是物件。`);
    continue;
  }

  for (const [source, translation] of Object.entries(data)) {
    entries += 1;
    const key = normalizeText(source);
    if (!key) fail(`${file} 含有空白來源詞句。`);
    if (typeof translation !== 'string' || !translation.trim()) {
      fail(`${file} 的「${source}」缺少有效譯文。`);
      continue;
    }

    if (merged.has(key) && merged.get(key).translation !== translation) {
      fail(`${file} 的「${source}」與 ${merged.get(key).file} 譯文衝突。`);
    }
    merged.set(key, { translation, file });

    for (const [forbidden, preferred] of FORBIDDEN_TAIWAN_TERMS) {
      if (translation.includes(forbidden)) {
        fail(`${file} 的「${source}」含有「${forbidden}」，臺灣用語建議改為「${preferred}」。`);
      }
    }
  }
}

const engine = fs.readFileSync(path.join(__dirname, 'localization_engine.js'), 'utf8');
if (!engine.includes('GITHUB_COPILOT_ZH_HANT_TW')) fail('翻譯引擎缺少識別簽章。');

if (!process.exitCode) {
  console.log(`[完成] ${files.length} 個字典、${entries} 筆譯文已通過格式、衝突與臺灣用語檢查。`);
}
