// Simula exactamente lo que hará el Chrome headless de la Mac de Marc:
// imprimir el HTML de la guía a PDF respetando @page (720x1020px).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///home/z/my-project/download/PreuReal_Guia_V23.html', {
    waitUntil: 'networkidle',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: '/tmp/guia_sim.pdf',
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log('SIM PDF OK -> /tmp/guia_sim.pdf');
})().catch((e) => { console.error(e); process.exit(1); });
