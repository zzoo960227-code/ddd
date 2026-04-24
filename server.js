const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));

const AUTH_TOKEN = process.env.AUTH_TOKEN;

app.get('/', (req, res) => res.send('alive'));

app.post('/decrypt', async (req, res) => {
  if (req.headers['x-auth'] !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { html, password } = req.body;
  if (!html || !password) {
    return res.status(400).json({ success: false, error: 'missing html or password' });
  }

  const tmpPath = `/tmp/vm_${Date.now()}.html`;
  fs.writeFileSync(tmpPath, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });

  const debugLog = [];

  try {
    const page = await browser.newPage();

    // 크롬 콘솔 로그 수집
    page.on('console', msg => debugLog.push('[console] ' + msg.text()));
    page.on('pageerror', err => debugLog.push('[pageerror] ' + err.message));

    // 복호화 실패 alert 감지
    let alertFired = false;
    let alertMessage = '';
    page.on('dialog', async (d) => {
      alertFired = true;
      alertMessage = d.message();
      debugLog.push('[dialog] ' + alertMessage);
      await d.dismiss();
    });

    await page.goto(`file://${tmpPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    debugLog.push('[goto] page loaded');

    // 비번 입력창 찾기 (여러 후보 시도)
    let passwordSelector = null;
    const candidates = ['#password', 'input[type="password"]', 'input[name="password"]'];

    for (const sel of candidates) {
      try {
        await page.waitForSelector(sel, { timeout: 20000 });
        passwordSelector = sel;
        debugLog.push('[selector] found: ' + sel);
        break;
      } catch (e) {
        debugLog.push('[selector] not found: ' + sel);
      }
    }

    if (!passwordSelector) {
      throw new Error('password input not found. logs: ' + debugLog.join(' | '));
    }

    // 비번 주입 (value 세팅 + J 함수 오버라이드 병행)
    await page.evaluate((pw, sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.value = pw;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof J === 'function') {
        window.__origJ = window.J;
        window.J = () => pw;
      }
    }, password, passwordSelector);

    debugLog.push('[inject] password injected');

    // 복호화 실행
    await page.evaluate(() => {
      if (typeof doAction === 'function') doAction();
      else if (typeof N === 'function') N();
      else if (typeof window.doAction === 'function') window.doAction();
    });

    debugLog.push('[action] doAction called');

    // 복호화 결과 대기
    await page.waitForFunction(() => {
      if (typeof I === 'undefined' || !I) return false;
      if (!I[0]) return false;
      return I[0].length > 0 || I[0].byteLength > 0;
    }, { timeout: 60000 });

    if (alertFired) {
      throw new Error('decrypt alert: ' + alertMessage);
    }

    // 결과 바이트 추출
    const bytes = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < I.length; i++) {
        const arr = I[i];
        for (let j = 0; j < arr.length; j++) out.push(arr[j]);
      }
      return out;
    });

    const filename = await page.evaluate(() =>
      (typeof fn !== 'undefined') ? fn : 'decrypted.html'
    );

    const buf = Buffer.from(bytes);
    res.json({
      success: true,
      filename,
      contentBase64: buf.toString('base64'),
      size: buf.length
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      debug: debugLog.slice(-20)  // 최근 20개 로그
    });
  } finally {
    try { await browser.close(); } catch (_) {}
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
