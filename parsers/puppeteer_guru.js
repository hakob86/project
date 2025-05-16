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
  if (rangeMatch) return parseFloat(rangeMatch[1].replace(/[^\d.]/g, '').replace(/k/i, '000'));

  const fixedMatch = text.match(/\$\s*([\d.,kK]+)/);
  if (fixedMatch) return parseFloat(fixedMatch[1].replace(/[^\d.]/g, ''));

  return 0;
}

(async () => {

  const MAX_RUNTIME_MS = 2 * 60 * 1000; // 2 минуты

// Глобальный "убийца"
setTimeout(() => {
  logger.error('⏰ Парсер принудительно завершён по таймауту 2 минуты');
  process.exit(0); // или process.exit(1) для ошибки
}, MAX_RUNTIME_MS);

  let browser;
  const jobs = [];

  try {
    logger.info(`🚀 Запуск парсера с темой: "${topic}", мин. бюджет: $${minPrice}`);
    browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)...');

    const cookiesPath = path.resolve(__dirname, '../cookies/guru_cookies.json');
    if (await fs.access(cookiesPath).then(() => true).catch(() => false)) {
      const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf-8'));
      await page.setCookie(...cookies);
      logger.info('✅ Cookies загружены');
    } else {
      logger.warn('⚠️ Файл cookies не найден');
    }

    await page.goto('https://www.guru.com/work/', { waitUntil: 'networkidle2', timeout: 60000 });
    logger.info('🌐 Открыта страница поиска');

    const input = await page.$('input[aria-label="Search freelance jobs"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.type(topic, { delay: 50 });
      logger.info(`⌨️ Введена тема поиска: "${topic}"`);
    } else {
      logger.warn('❌ Поле поиска не найдено');
    }

    const button = await page.$('[id="13_searchBtnTop"]');
    if (button) {
      logger.info('🔘 Клик по кнопке поиска');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 80000 })
          .catch(() => logger.warn('⚠️ Навигация не сработала')),
        button.click()
      ]);
    } else {
      logger.warn('❌ Кнопка поиска не найдена');
    }

    await wait(3000, '📥 Ждём загрузку результатов');

    let lastHeight = await page.evaluate('document.body.scrollHeight');
    for (let i = 0; i < 5; i++) {
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await wait(2000, `📜 Прокрутка #${i + 1}`);
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === lastHeight) {
        logger.info('✅ Достигнут конец страницы');
        break;
      }
      lastHeight = newHeight;
    }

    // Новый универсальный селектор для карточек (обнови по фактической структуре Guru, если нужно)
    const jobLinks = await page.$$eval('a', links => 
      [...new Set(
        links
          .filter(a => a.getAttribute('href') && /^\/work\/detail\//.test(a.getAttribute('href')))
          .map(a => "https://www.guru.com" + a.getAttribute('href'))
      )]
    );

    logger.info(`🔎 Найдено ссылок на задачи: ${jobLinks.length}`);

    for (const link of jobLinks) {
      try {
        logger.info(`➡️ Переход к задаче: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await wait(30000, '⌛ Ждём загрузку карточки');

        // Ждём появления категории
        await page.waitForSelector('div.jobDetails__category p.rhythmMargin1', {timeout: 10000});
        const rawBudgetBlock = await page.$eval('.jobHeading__budget', el => el.innerText).catch(() => '');
        const [rateType, budgetRange, hoursPerWeek, duration] = rawBudgetBlock.split('|').map(s => s.trim());

        const categoryInfo = await page.$eval('div.jobDetails__category p.rhythmMargin1', el => {
          const category = el.querySelector('strong')?.innerText.trim() || '';
          let subcategory = '';
          const svg = el.querySelector('svg');
          if (svg) {
            let node = svg.nextSibling;
            while (node) {
              if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent.trim();
                if (t) subcategory += t;
              }
              node = node.nextSibling;
            }
            subcategory = subcategory.trim();
          }
          return { category, subcategory };
        }).catch(() => ({ category: '', subcategory: '' }));

        const job = {
          title: await page.$eval('h1.jobHeading__title', el => el.innerText).catch(() => ''),
          description: await page.$eval('div[style*="Open Sans"]', el => el.innerText).catch(() => ''),
          budget: budgetRange || '',
          posted: await page.$eval('.jobHeading__meta', el => {
            const match = el.innerText.match(/Posted on ([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
            return match ? match[1] : '';
          }).catch(() => ''),
          type: rateType || '',
          category: categoryInfo.category,
          subcategory: categoryInfo.subcategory,
          skills: await page.$$eval('.skillsList li', els => els.map(el => el.innerText)).catch(() => []),
          location: await page.$eval('.avatarinfo span strong', el => el.innerText).catch(() => ''),
          link
        };

        const parsedPrice = parseBudget(job.budget);
        if (parsedPrice >= minPrice) {
          job.budget = `$${parsedPrice}`;
          jobs.push(job);
          logger.info(`✅ Добавлено: ${job.title} ($${parsedPrice})`);
        } else {
          logger.info(`⛔ Пропущено: ${job.title} ($${parsedPrice}) < $${minPrice}`);
        }

      } catch (err) {
        logger.warn(`⚠️ Ошибка при обработке: ${link} — ${err.message}`);
      }
    }

    const outputPath = path.resolve(__dirname, '../results/guru.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    logger.info(`📦 Результаты сохранены: ${outputPath}`);
    console.log(JSON.stringify(jobs));

  } catch (e) {
    logger.error(`❌ Глобальная ошибка: ${e.message}`);
  } finally {
    if (browser) {
      await wait(10000, '📴 Закрытие браузера');
      await browser.close();
    }
  }
})();
