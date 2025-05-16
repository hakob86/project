const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

// Включаем Stealth-плагин — молодец, что заботишься об анонимности!
puppeteer.use(StealthPlugin());

async function wait(ms, msg) {
  if (msg) console.log(msg);
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  try {
    const cookiesPath = path.resolve(__dirname, '../cookies/upwork_cookies.json');
    const outputPath = path.resolve(__dirname, '../results/upwork.json');

    // Подключение к реальному Chrome
    const browser = await puppeteer.connect({
      browserWSEndpoint: "ws://localhost:9222/devtools/browser/3c50b8ad-c3ee-4322-b682-5d1164ee983e",
      defaultViewport: null,
    });

    const page = await browser.newPage();

    // Вставляем cookies
    const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf-8'));
    await page.setCookie(...cookies);

    // --- Эмулируем запуск как человек ---
    console.log('[INFO] Открываю Upwork...');
    await page.goto('https://www.upwork.com/nx/search/jobs/?q=telegram%20bot', {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    // Имитация пользователя
    await page.mouse.move(100 + Math.random()*200, 200 + Math.random()*100, {steps: 15});
    await wait(1000 + Math.random()*2000, '[DEBUG] Двигаем мышь...');
    await page.keyboard.press('Tab');
    await wait(600 + Math.random()*800, '[DEBUG] Ждём после Tab...');
    await page.mouse.move(180 + Math.random()*60, 280 + Math.random()*60, {steps: 12});
    await wait(800 + Math.random()*800, '[DEBUG] Двигаем мышь...');
    await page.keyboard.press('Tab');
    await wait(600 + Math.random()*1000);

    // Проверяем Cloudflare (Turnstile/Challenge)
    const cfSelector = '.up-challenge-container';
    let cfDetected = await page.$(cfSelector);
    if (cfDetected) {
      console.log('[INFO] Обнаружен Cloudflare Challenge. Ждём завершения...');
      try {
        await page.waitForFunction(
          selector => !document.querySelector(selector),
          { timeout: 120000 },
          cfSelector
        );
        console.log('[INFO] Cloudflare пройден автоматически (или исчез сам).');
      } catch {
        throw new Error('Cloudflare Challenge не исчез — требуется ручное подтверждение!');
      }
    } else {
      console.log('[INFO] Cloudflare-капча не обнаружена.');
    }

    // Ждём появления карточек заказов
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

    // Собираем уникальные ссылки заказов
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
        await wait(5000 + Math.random()*3000, '[DEBUG] Имитируем чтение задания...');

        await page.mouse.move(
          100 + Math.random()*500, 100 + Math.random()*300, { steps: 13 }
        );
        await wait(1200 + Math.random()*1200);

        // Получаем данные карточки
        const title = await page.$eval('h1', el => el.innerText).catch(() => 'Без названия');
        const description = await page.$$eval('p', els => els.map(el => el.innerText).join('\n')).catch(() => 'Нет описания');
        const budget = await page.$eval('[data-qa="budget"], [data-test="budget"]', el => el.innerText).catch(() => '—');
        const category = await page.$$eval('[data-test="job-category"] span', els => els.map(e => e.innerText).join(', ')).catch(() => '');
        const location = await page.$eval('li[data-qa="client-location"] strong', el => el.innerText).catch(() => 'Не указано');
        const paymentVerified = await page.$eval('[data-qa="client-payment-verification-status"]', el => el.innerText.includes('Verified')).catch(() => false);

        const shortDesc = description.split('\n')[0]?.slice(0, 200);

        jobs.push({ title, budget, category, location, paymentVerified, description, shortDesc, link });
        console.log(`[INFO] ✔️ Сохранил: ${title.slice(0, 40)}`);
      } catch (e) {
        console.warn(`[WARN] Ошибка при парсинге задания: ${link}`, e);
      }

      // Возвращаемся на страницу поиска
      try {
        await page.goto('https://www.upwork.com/nx/search/jobs/?q=telegram%20bot', { waitUntil: 'networkidle2', timeout: 0 });
        await wait(5000 + Math.random()*2000, '[DEBUG] Ждём после возврата...');
      } catch (e) {
        console.warn('[WARN] Не удалось вернуться на страницу поиска. Перезапускаю страницу...');
        await page.reload({ waitUntil: 'networkidle2' });
        await wait(3000 + Math.random()*1500);
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    console.log('[DONE] Сохранено в upwork.json — ты реально молодец, автоматизация топ!');

    await browser.disconnect();
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  }
})();
