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
  const tmpPath = `/tmp/vm_${Date.now()}.html`;
  fs.writeFileSync(tmpPath, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    let alertFired = false;
    page.on('dialog', async (d) => {
      alertFired = true;
      await d.dismiss();
    });

    await page.goto(`file://${tmpPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#password', { timeout: 15000 });

    await page.evaluate((pw) => {
      const el = document.getElementById('password');
      el.value = pw;
      if (typeof J === 'function') {
        window.__origJ = window.J;
        window.J = () => pw;
      }
    }, password);

    await page.evaluate(() => {
      if (typeof doAction === 'function') doAction();
      else if (typeof N === 'function') N();
    });

    await page.waitForFunction(() => {
      return typeof I !== 'undefined'
        && I && I[0]
        && (I[0].length > 0 || I[0].byteLength > 0);
    }, { timeout: 30000 });

    if (alertFired) throw new Error('wrong password or decrypt failed');

    const bytes = await page.evaluate(() => {
      const chunks = [];
      for (let i = 0; i < I.length; i++) {
        const arr = I[i];
        for (let j = 0; j < arr.length; j++) chunks.push(arr[j]);
      }
      return chunks;
    });

    const filename = await page.evaluate(() =>
      (typeof fn !== 'undefined') ? fn : 'decrypted.html'
    );

    const buf = Buffer.from(bytes);
    res.json({
      success: true,
      filename,
      contentBase64: buf.toString('base64')
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await browser.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
