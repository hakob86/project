const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;
const path = require('path');

(async () => {
  try {
    const cookiesPath = path.resolve(__dirname, '../cookies/cookies.json');
    const outputPath = path.resolve(__dirname, '../results/upwork.json');

const browser = await puppeteer.connect({
browserWSEndpoint: 'ws://localhost:9222/devtools/browser/ea50f9a0-d272-4a8c-8499-c8078a6255c4',
  defaultViewport: null,
});


    const page = await browser.newPage();

    const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf-8'));
    await page.setCookie(...cookies);

    console.log('[INFO] Загружаем Upwork...');
    await page.goto('https://www.upwork.com/nx/search/jobs/?q=telegram%20bot', {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    await new Promise(resolve => setTimeout(resolve, 40000)); // ожидание полной загрузки

    console.log('[INFO] Ищем карточки заказов...');
    await page.waitForSelector('section.air3-card-section', { timeout: 60000 });

    const jobLinks = await page.$$eval('section.air3-card-section a[href*="/jobs/"]', links =>
      links.map(a => a.href).filter((v, i, a) => a.indexOf(v) === i)
    );

    console.log(`[INFO] Найдено ${jobLinks.length} заказов`);

    const jobs = [];

    for (const link of jobLinks) {
      const tab = await browser.newPage();
      await tab.setCookie(...cookies);

      console.log('[INFO] Загружаем задание:', link);
      await tab.goto(link, { waitUntil: 'networkidle2', timeout: 0 });
      await new Promise(resolve => setTimeout(resolve, 30000));

      const title = await tab.$eval('h1', el => el.innerText).catch(() => 'Без названия');
      const description = await tab.$$eval('p', els => els.map(el => el.innerText).join('\\n')).catch(() => 'Нет описания');
      const budget = await tab.$eval('[data-qa="budget"], [data-test="budget"]', el => el.innerText).catch(() => '—');
      const category = await tab.$$eval('[data-test="job-category"] span', els => els.map(e => e.innerText).join(', ')).catch(() => '');
      const location = await tab.$eval('li[data-qa="client-location"] strong', el => el.innerText).catch(() => 'Не указано');
      const paymentVerified = await tab.$eval('[data-qa="client-payment-verification-status"]', el => el.innerText.includes('Verified')).catch(() => false);

      const shortDesc = description.split('\\n')[0]?.slice(0, 200);

      jobs.push({ title, budget, category, location, paymentVerified, description, shortDesc, link });

      await tab.close();
    }

    await fs.writeFile(outputPath, JSON.stringify(jobs, null, 2), 'utf-8');
    console.log('[DONE] Сохранено в upwork.json');

    await browser.disconnect();
  } catch (err) {
    console.error('[ERROR]', err);
    process.exit(1);
  }
})();
