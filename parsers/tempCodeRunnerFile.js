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
      await tab.goto(link, { waitUntil: 'ne