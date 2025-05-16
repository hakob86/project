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

function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

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
  let browser;
  const jobs = [];
  try {
    logger.info(`🚀 freelancer.com | тема: "${topic}", мин. бюджет: $${minPrice}`);
    browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)...');

    // --- Cookies --- //
    const cookiesPath = path.resolve(__dirname, '../cookies/freelancer_cookies.json');
    if (await fs.access(cookiesPath).then(() => true).catch(() => false)) {
      const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf-8'));
      await page.setCookie(...cookies);
      logger.info('✅ Cookies загружены');
    } else {
      logger.warn('⚠️ Cookies не найдены');
    }

    await page.goto('https://www.freelancer.com/search/projects', { waitUntil: 'networkidle2', timeout: 90000 });
    await wait(randomDelay(1200, 2200), '🌐 Главная freelancer.com открыта');

    // --- Имитация поиска --- //
    const searchSelector = 'input[type="search"][placeholder*="Search for projects"]';
    await page.waitForSelector(searchSelector, { timeout: 20000 });

    // Наводим мышь и кликаем
    const searchBox = await page.$(searchSelector);
    const box = await searchBox.boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 14 });
    await wait(randomDelay(200, 700), '🖱 Навели мышь на поиск');
    await page.mouse.click(box.x + box.width/2, box.y + box.height/2, { delay: randomDelay(60, 170) });
    await wait(randomDelay(100, 300), '🔎 Клик по полю поиска');

    // Посимвольный ввод
    for (let char of topic) {
      await page.keyboard.type(char, { delay: randomDelay(90, 260) });
    }
    await wait(randomDelay(400, 1200), '⌨️ Тема введена');
    await page.keyboard.press('Enter');
    await wait(randomDelay(1800, 3500), '⌛ Ждём результаты поиска');

    // Прокрутка вниз с паузами
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight/1.3));
      await wait(randomDelay(1000, 1800), `📜 Скролл #${i + 1}`);
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    // Сбор ссылок на карточки (по h2)
    const cardH2Selector = 'h2[data-color][data-weight][class*="ng-star-inserted"]';
    await page.waitForSelector(cardH2Selector, { timeout: 20000 });
    const jobLinks = await page.$$eval(cardH2Selector, hs =>
      hs.map(h => {
        let el = h;
        while (el && el.tagName !== 'A') el = el.parentElement;
        return el ? el.href : null;
      }).filter(Boolean)
    );
    logger.info(`🔗 Найдено ${jobLinks.length} задач (по заголовкам h2)`);

    // Ограничим до первых 10, чтобы не палиться
    const linksToOpen = jobLinks.slice(0, 10);

    for (const [i, link] of linksToOpen.entries()) {
      try {
        logger.info(`➡️ Открываем вкладку #${i + 1}: ${link}`);
        const cardPage = await browser.newPage();
        await cardPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)...');
        await cardPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 80000 });

        // Имитация mousemove и scroll в карточке
        await cardPage.mouse.move(400 + Math.random()*200, 250 + Math.random()*150, { steps: 13 });
        await wait(randomDelay(200, 700), '🖱 MouseMove в карточке');
        await cardPage.evaluate(() => window.scrollBy(0, window.innerHeight/3));
        await wait(randomDelay(300, 900), '📜 Скролл карточки');
        await wait(randomDelay(9000, 17000), '👀 Чтение карточки');

        // --- Парсинг данных ---
        const title = await cardPage.$eval(
          'div.ProjectViewDetails-title', el => el.textContent.trim()
        ).catch(() => '');

        const budget = await cardPage.$eval(
          'div.ProjectViewDetails-budget .NativeElement', el => el.textContent.trim()
        ).catch(() => '');

        const description = await cardPage.$eval(
          'div.ProjectDescription .NativeElement', el => el.textContent.trim()
        ).catch(() => '');

        const skills = await cardPage.$$eval(
          '.ProjectViewDetailsSkills .Content', nodes => nodes.map(n => n.textContent.trim())
        ).catch(() => []);

        const location = await cardPage.$eval(
          'img.FlagImage', el => el.title || el.alt || ''
        ).catch(() => '');

        const rating = await cardPage.$eval(
          '.RatingContainer .ValueBlock', el => el.textContent.trim()
        ).catch(() => '');

        const projectId = await cardPage.$$eval(
          'div.ProjectDetailsFooter .NativeElement', nodes => {
            const idNode = nodes.find(n => n.textContent.includes('Project ID:'));
            return idNode ? idNode.textContent.replace('Project ID:', '').trim() : '';
          }
        ).catch(() => '');

        const verifications = await cardPage.$$eval(
          '.BitsListItemContent [aria-label]', els => els.map(e => e.getAttribute('aria-label'))
        ).catch(() => []);

        const linkData = link;
        const client = {}; // Можно потом добавить расширенный парсинг

        // Логгируем отсутствие ключевых полей
        if (!title) logger.warn(`Не найден title для ${link}`);
        if (!budget) logger.warn(`Не найден budget для ${link}`);
        if (!description) logger.warn(`Не найден description для ${link}`);
        if (!skills.length) logger.warn(`Не найдены skills для ${link}`);
        if (!location) logger.warn(`Не найден location для ${link}`);
        if (!projectId) logger.warn(`Не найден projectId для ${link}`);

        const parsedPrice = parseBudget(budget);

        if (parsedPrice >= minPrice) {
          jobs.push({
            title,
            budget,
            description,
            skills,
            location,
            rating,
            projectId,
            verifications,
            link: linkData,
            client
          });
          logger.info(`✅ Добавлено: "${title}" ($${parsedPrice})`);
        } else {
          logger.info(`⛔ Пропущено: "${title}" ($${parsedPrice}) < $${minPrice}`);
        }

        await cardPage.close();
        await wait(randomDelay(800, 2200), '⏳ Пауза между карточками');

      } catch (err) {
        logger.warn(`⚠️ Ошибка при обработке карточки: ${err.message}`);
      }
    }

    // --- Сохраняем результат --- //
    const outputPath = path.resolve(__dirname, '../results/freelancer.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    logger.info(`📦 Результаты сохранены: ${outputPath}`);
    console.log(JSON.stringify(jobs, null, 2));

  } catch (e) {
    logger.error(`❌ Глобальная ошибка: ${e.message}`);
  } finally {
    if (browser) {
      await wait(5000, '📴 Закрытие браузера');
      await browser.close();
    }
  }
})();
