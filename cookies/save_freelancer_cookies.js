const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

puppeteer.use(StealthPlugin());

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное отклонение промиса:', reason);
  process.exit(1);
});

(async () => {
  let browser;
  try {
    // ПОДКЛЮЧАЕМСЯ к уже ЗАПУЩЕННОМУ Chrome
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9223',
      defaultViewport: null
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.bringToFront();

    // Переход на страницу логина, если ты ещё не на ней
    await page.goto('https://www.freelancer.com/login', { waitUntil: 'networkidle2' });

    // --- Жди ручной вход ---
    console.log('➡️ Войдите вручную в аккаунт, затем нажмите Enter в этой консоли...');
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));

    // --- Сохрани cookies ---
    const cookies = await page.cookies();
    const outPath = path.resolve(__dirname, 'freelancer_cookies.json');
    await fs.writeFile(outPath, JSON.stringify(cookies, null, 2));
    console.log(`✅ Cookies сохранены в: ${outPath}`);

  } catch (err) {
    console.error('❌ Ошибка:', err);
  } finally {
    process.exit(0);
  }
})();
