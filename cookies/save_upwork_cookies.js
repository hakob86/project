require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

puppeteer.use(StealthPlugin());

const cookiesPath = path.resolve(__dirname, '../cookies/upwork_cookies.json');
const port = process.env.DEBUG_PORT || 9222;

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

    const page = (await browser.pages())[0] || await browser.newPage();
    await page.goto('https://www.upwork.com/', { waitUntil: 'networkidle2' });

    logger.info('⏳ Войди в аккаунт вручную и нажми Enter...');
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    const cookies = await page.cookies();
    await fs.mkdir(path.dirname(cookiesPath), { recursive: true });
    await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
    logger.info(`✅ Cookies сохранены в ${cookiesPath}`);
    process.exit(0);
  } catch (err) {
    logger.error(`❌ Ошибка: ${err.message}`);
    process.exit(1);
  }
})();
