require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

puppeteer.use(StealthPlugin());

const cookiesPath = path.resolve(__dirname, '../cookies/upwork_cookies.json');
const port = process.env.DEBUG_PORT || 9223;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} - ${level.toUpperCase()} - ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/app.log' }),
    new winston.transports.Console()
  ]
});

async function getWebSocketDebuggerUrl() {
  const { data } = await axios.get(`http://localhost:${port}/json/version`);
  return data.webSocketDebuggerUrl;
}

(async () => {
  try {
    logger.info('🔌 Подключение к Chrome...');
    const wsUrl = await getWebSocketDebuggerUrl();
    const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });

    // === Открываем localhost:5000 ===
    logger.info('🌐 Открываю http://localhost:9223 ...');
    const localPage = await browser.newPage();
    await localPage.goto('http://localhost:9223', { waitUntil: 'networkidle2' });

    // === Открываем Upwork в новой вкладке ===
    logger.info('🌐 Открываю https://www.upwork.com ...');
    const upworkPage = await browser.newPage();
    await upworkPage.goto('https://www.upwork.com/', { waitUntil: 'networkidle2' });

    logger.info('⏳ Войди в аккаунт вручную (во вкладке Upwork) и нажми Enter...');
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    const cookies = await upworkPage.cookies();
    await fs.mkdir(path.dirname(cookiesPath), { recursive: true });
    await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
    logger.info(`✅ Cookies сохранены в ${cookiesPath}`);
    process.exit(0);
  } catch (err) {
logger.error(`❌ Ошибка: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  }
})();
