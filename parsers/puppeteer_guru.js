const fs = require('fs').promises;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const winston = require('winston');

puppeteer.use(StealthPlugin());

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

const topic = process.argv[2]?.toLowerCase() || '';
const minPrice = parseInt(process.argv[3]) || 0;

function wait(ms, msg) {
  if (msg) logger.info(msg);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseBudget(text) {
  if (!text || typeof text !== 'string') return 0;

  const underMatch = text.match(/Under\s*\$([\d.,kK]+)/i);
  if (underMatch) return parseFloat(underMatch[1].replace(/[^\d.]/g, ''));

  const rangeMatch = text.match(/\$([\d.,kK]+)[–-]\s*\$([\d.,kK]+)/);
  if (rangeMatch) {
    return parseFloat(rangeMatch[1].replace(/[^\d.]/g, '').replace(/k/i, '000'));
  }

  const fixedMatch = text.match(/\$\s*([\d.,kK]+)/);
  if (fixedMatch) return parseFloat(fixedMatch[1].replace(/[^\d.]/g, ''));

  return 0;
}


(async () => {
  let browser;
  const jobs = [];

  try {
    browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)...');

    // Загрузка cookies
    const cookiesPath = path.resolve(__dirname, '../cookies/guru_cookies.json');
    if (await fs.access(cookiesPath).then(() => true).catch(() => false)) {
      const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf-8'));
      await page.setCookie(...cookies);
      logger.info('✅ Cookies загружены');
    }

    await page.goto('https://www.guru.com/work/', { waitUntil: 'networkidle2', timeout: 60000 });

    const input = await page.$('input[aria-label="Search freelance jobs"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(topic, { delay: 50 });
    }

    const button = await page.$('[id="13_searchBtnTop"]');
    if (button) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 80000 }).catch(() => logger.warn('⚠️ Навигация не сработала')),
        button.click()
      ]);
    }

    await wait(3000, '📥 Ждём результаты');

    let lastHeight = await page.evaluate('document.body.scrollHeight');
    for (let i = 0; i < 5; i++) {
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await wait(2000, '📜 Прокрутили страницу вниз');
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    const jobLinks = await page.$$eval('a[href^="/work/detail/"]', (links, topic) =>
      [...new Set(
        links.filter(a => a.innerText.toLowerCase().includes(topic)).map(a => "https://www.guru.com" + a.getAttribute("href"))
      )], topic);

    logger.info(`🧲 Найдено карточек: ${jobLinks.length}`);

    for (const link of jobLinks) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await wait(30000, `📄 Парсим карточку: ${link}`);

        const rawBudgetBlock = await page.$eval('.jobHeading__budget', el => el.innerText).catch(() => '');
        const [rateType, budgetRange, hoursPerWeek, duration] = rawBudgetBlock.split('|').map(s => s.trim());

        const job = {
          title: await page.$eval('h1.jobHeading__title', el => el.innerText).catch(() => ''),
          description: await page.$eval('div[style*="Open Sans"]', el => el.innerText).catch(() => ''),
          budget: budgetRange || '',
          posted: await page.$eval('.jobHeading__meta', el => {
            const match = el.innerText.match(/Posted on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
            return match ? match[1] : '';
          }).catch(() => ''),
          type: rateType || '',
          category: await page.$eval('.jobCategoryBox a', el => el.innerText).catch(() => ''),
          skills: await page.$$eval('.skillList li', els => els.map(el => el.innerText)).catch(() => []),
          location: await page.$eval('.avatarinfo span strong', el => el.innerText).catch(() => ''),
          client_since: await page.$eval('.memberSince span', el => el.innerText.replace('Member Since: ', '')).catch(() => ''),
          rehire: await page.$eval('.rehireRateText', el => el.innerText).catch(() => null),
          hours_per_week: hoursPerWeek || '',
          duration: duration || '',
          link
        };

        const parsedPrice = parseBudget(job.budget);
        if (parsedPrice >= minPrice) {
          job.budget = `$${parsedPrice}`;
          jobs.push(job);
          logger.info(`✅ Добавлено: ${job.title} ($${parsedPrice})`);
        } else {
          logger.info(`⛔ Пропущено: $${parsedPrice} < $${minPrice}`);
        }

      } catch (err) {
        logger.warn(`⚠️ Ошибка карточки: ${link} — ${err.message}`);
      }
    }

    const outputPath = path.resolve(__dirname, '../results/guru.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    logger.info('📦 Результаты сохранены');
    console.log(JSON.stringify(jobs));

  } catch (e) {
    logger.error(`❌ Ошибка: ${e.message}`);
  } finally {
    if (browser) {
      await wait(10000, '📴 Закрытие браузера');
      await browser.close();
    }
  }
})();
