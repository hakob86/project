const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

puppeteer.use(StealthPlugin());

async function wait(ms, msg) {
  if (msg) console.log(msg);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function autoScroll(page, maxScrolls = 10) {
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await wait(1200 + Math.random() * 600, `[DEBUG] Скроллим #${i + 1}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function parseAllPages(page, topic, minBudget = 0, maxPages = 3) {
  let allJobs = [];
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    if (pageIndex > 1) {
      const nextBtnSelector = `button[data-test="pagination-item"][data-ev-page_index="${pageIndex}"]`;
      await page.waitForSelector(nextBtnSelector, { timeout: 15000 });
      await page.click(nextBtnSelector);
      await wait(4000, `[DEBUG] Перешли на страницу ${pageIndex}`);
    }

    await autoScroll(page, 8);

    await page.waitForSelector('article[data-test="JobTile"]', { timeout: 30000 });
    const jobs = await page.$$eval('article[data-test="JobTile"]', (cards, minBudget) => cards.map(card => {
      const title = card.querySelector('h2.job-tile-title, h2, h1, h3')?.innerText || 'Без названия';
      const linkEl = card.querySelector('a[data-test*="job-tile-title-link"]');
      const link = linkEl ? new URL(linkEl.getAttribute('href'), 'https://www.upwork.com').toString() : '';
      const description = card.querySelector('div[data-test="UpCLineClamp JobDescription"] p, p')?.innerText || '';
      const published = card.querySelector('[data-test="job-pubilshed-date"] span:last-child')?.innerText || '';
      const priceText = card.querySelector('li[data-test="is-fixed-price"] strong:last-child')?.innerText || '';
      const type = card.querySelector('li[data-test="job-type-label"] strong')?.innerText || '';
      const exp = card.querySelector('li[data-test="experience-level"] strong')?.innerText || '';
      const location = card.querySelector('li[data-test="location"] span:not(.sr-only)')?.innerText || '';
      const paymentVerified = !!card.querySelector('[data-test="payment-verified"]');

      // Извлекаем число из цены
      let priceNum = 0;
      if (priceText) {
        const m = priceText.replace(/[^\d]/g, '');
        priceNum = m ? parseInt(m, 10) : 0;
      }

      // Возвращаем карточку только если цена >= minBudget
      if (priceNum < minBudget) return null;

      return { title, link, description, published, price: priceText, type, exp, location, paymentVerified };
    }).filter(x => x), minBudget);

    allJobs = allJobs.concat(jobs);
    console.log(`[INFO] Страница ${pageIndex}: собрано ${jobs.length} заказов`);
  }
  return allJobs;
}

(async () => {
  let browser;
  try {
    // Получаем все параметры из командной строки
    const [, , topicRaw = 'ai', minBudgetRaw = '0'] = process.argv;
    const topic = topicRaw.trim();
    const minBudget = parseInt(minBudgetRaw, 10) || 0;
    const outputPath = path.resolve(__dirname, '../results/upwork.json');

    // 1. Подключаемся к уже открытому Chrome
    const response = await fetch('http://localhost:9223/json/version');
    const data = await response.json();
    const wsEndpoint = data.webSocketDebuggerUrl;
    browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
    });

    // 2. Ищем уже открытую вкладку с Upwork (НЕ создаём новую!)
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('upwork.com'));
    if (!page) {
      throw new Error('Нет открытой вкладки Upwork! Открой её вручную и пройди Cloudflare');
    }

    // 3. Всегда переходим на страницу поиска Upwork
    await page.goto('https://www.upwork.com/nx/search/jobs/', { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(2000, '[DEBUG] Перешли на /search/jobs');
    console.log('[DEBUG] Фактический URL:', page.url());
    if (!page.url().includes('/search/jobs')) {
      throw new Error('[FATAL] Не удалось попасть на /search/jobs. Ты на: ' + page.url());
    }

    // 4. Вводим поисковый запрос и жмём Enter (универсальный селектор)
    await page.waitForSelector('input[type="search"][placeholder]', { timeout: 25000 });
    const searchInput = await page.$('input[type="search"][placeholder]');
    await searchInput.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await wait(400, '[DEBUG] Очищаем поле поиска...');
    await searchInput.type(topic, { delay: 110 });
    await wait(400, '[DEBUG] Вводим запрос...');
    await page.keyboard.press('Enter');
    await wait(3500, '[DEBUG] Ждём появления карточек...');

    // 5. Парсим все страницы пагинации (и фильтруем по бюджету!)
    const jobs = await parseAllPages(page, topic, minBudget, 3);

    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    console.log(`[DONE] Сохранено ${jobs.length} заказов в ${outputPath}`);

    // --- ЛОГАУТ ПОСЛЕ ПАРСИНГА ---
    try {
      let userMenuBtn = await page.$('button[aria-label="Open user menu"]');
      if (!userMenuBtn) userMenuBtn = await page.$('img.nav-user-avatar');
      if (!userMenuBtn) throw new Error('Нет кнопки меню пользователя!');
      await userMenuBtn.click();
      await wait(1000, '[DEBUG] Открыл меню пользователя...');
      await page.waitForSelector(
        'button[data-cy="logout-trigger"], a[href*="logout"], button[data-ev-label="logout"]',
        { timeout: 10000 }
      );
      const logoutBtn = await page.$('button[data-cy="logout-trigger"], a[href*="logout"], button[data-ev-label="logout"]');
      if (!logoutBtn) throw new Error('Не найдена кнопка logout!');
      await logoutBtn.click();
      await wait(2000, '[INFO] Logout (Sign Out) успешно выполнен!');
      console.log('[INFO] Выполнен logout аккаунта Upwork');
    } catch (err) {
      console.warn('[WARN] Не удалось выполнить logout:', err.message);
    }

    await browser.disconnect?.();

  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  } finally {
    if (browser) {
      try { await browser.disconnect?.(); } catch {}
      try { await browser.close?.(); } catch {}
    }
  }
})();