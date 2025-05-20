const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

puppeteer.use(StealthPlugin());

async function wait(ms, msg) {
  if (msg) console.log(msg);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBrowser() {
  // Только режим connect!
  const response = await fetch('http://localhost:9223/json/version');
  const data = await response.json();
  const wsEndpoint = data.webSocketDebuggerUrl;
  return await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: null,
  });
}

function parseBudget(text) {
  if (!text || text === '—') return 0;
  const cleaned = text.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

(async () => {
  try {
    const [, , topicRaw = '', minBudgetRaw = '0'] = process.argv;
    const topic = topicRaw.trim();
    const minBudget = parseInt(minBudgetRaw, 10) || 0;

    const outputPath = path.resolve(__dirname, '../results/upwork.json');
    const startUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(topic)}`;

    const browser = await getBrowser();
    const page = await browser.newPage();

    // Переход на страницу поиска (авторизация уже выполнена руками!)
    await page.goto(startUrl, {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    let cardsLoaded = false;
    for (let i = 0; i < 7; i++) {
      try {
        await page.waitForSelector('section.air3-card-section', { timeout: 15000 });
        cardsLoaded = true;
        break;
      } catch {
        console.log('[WARN] Карточки не загрузились, обновляю страницу...');
        await page.reload({ waitUntil: 'networkidle2' });
        await wait(3000 + Math.random()*2000, '[DEBUG] Ждём после reload...');
      }
    }
    if (!cardsLoaded) throw new Error('Карточки заказов не загрузились за 7 попыток');

    const jobLinks = await page.$$eval(
      'section.air3-card-section a[href*="/jobs/"]',
      links => links.map(a => a.href).filter((v, i, a) => a.indexOf(v) === i)
    );
    console.log(`[INFO] Найдено ${jobLinks.length} заказов`);

    const jobs = [];
    for (const [idx, link] of jobLinks.entries()) {
      console.log(`[INFO] (${idx + 1}/${jobLinks.length}) Захожу в задание: ${link}`);

      try {
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 0 });
        await wait(2000 + Math.random()*2000, '[DEBUG] Имитируем чтение задания...');

        const title = await page.$eval('h1', el => el.innerText).catch(() => 'Без названия');
        const description = await page.$$eval('p', els => els.map(el => el.innerText).join('\n')).catch(() => 'Нет описания');
        const budgetText = await page.$eval('[data-qa="budget"], [data-test="budget"]', el => el.innerText).catch(() => '—');
        const budget = parseBudget(budgetText);
        const category = await page.$$eval('[data-test="job-category"] span', els => els.map(e => e.innerText).join(', ')).catch(() => '');
        const location = await page.$eval('li[data-qa="client-location"] strong', el => el.innerText).catch(() => 'Не указано');
        const paymentVerified = await page.$eval('[data-qa="client-payment-verification-status"]', el => el.innerText.includes('Verified')).catch(() => false);

        const shortDesc = description.split('\n')[0]?.slice(0, 200);

        if (
          (topic.length === 0 || title.toLowerCase().includes(topic.toLowerCase()) || description.toLowerCase().includes(topic.toLowerCase())) &&
          (budget >= minBudget)
        ) {
          jobs.push({ title, budget, category, location, paymentVerified, description, shortDesc, link });
          console.log(`[INFO] ✔️ Сохранил: ${title.slice(0, 40)}`);
        } else {
          console.log(`[SKIP] Не подходит: "${title.slice(0, 40)}" — бюджет ${budget}, фильтр: ${minBudget}`);
        }
      } catch (e) {
        console.warn(`[WARN] Ошибка при парсинге задания: ${link}`, e);
      }

      // Возвращаемся на страницу поиска
      try {
        await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 0 });
        await wait(1500 + Math.random()*1500, '[DEBUG] Ждём после возврата...');
      } catch (e) {
        console.warn('[WARN] Не удалось вернуться на страницу поиска. Перезапускаю страницу...');
        await page.reload({ waitUntil: 'networkidle2' });
        await wait(2000 + Math.random()*1500);
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    console.log(`[DONE] Сохранено в ${outputPath}!`);

    await browser.disconnect?.();
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  }
})();
