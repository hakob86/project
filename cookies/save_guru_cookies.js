const puppeteer = require('puppeteer-extra');
const fs = require('fs').promises;
const path = require('path');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const cookiesPath = path.resolve(__dirname, 'guru_cookies.json');

(async () => {
  try {
    console.log('🚀 Получаем WebSocket-адрес Chrome...');
    const res = await fetch('http://localhost:9222/json/version');
    const data = await res.json();
    const wsEndpoint = data.webSocketDebuggerUrl;

    console.log(`🔗 Подключение к Chrome: ${wsEndpoint}`);
    const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    console.log('🌐 Открываем сайт Guru...');
    await page.goto('https://www.guru.com/', { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('⏳ Войди вручную (включая 2FA, если нужно), затем нажми Enter в терминале...');
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    const cookies = await page.cookies();
    await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log(`✅ Cookies сохранены: ${cookiesPath}`);

await browser.disconnect();
process.exit(0); // <--- добавь это
  } catch (err) {
    console.error('❌ Ошибка при получении cookies:', err.stack || err);
  }
})();
