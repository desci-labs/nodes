// import crypto from 'crypto';
// import fs from 'fs';
// import path from 'path';

// import { firefox, Page } from 'playwright';

// import { Institution, ResearchObjectMetadata } from 'controllers/nodes/index';

// const getBaseHref = (url: string) => {
//   const parts = url.split('/');
//   parts.pop();
//   return parts.join('/');
// };

// const STRATEGY: { [key in keyof typeof Institution]?: any } = {
//   ssrn: {
//     exec: async (page: Page, url: string): Promise<ResearchObjectMetadata> => {
//       await page.goto(url);
//       await page.click('#onetrust-accept-btn-handler');

//       //   let ret = await page.getAttribute('a[data-abstract-id].secondary', 'href');
//       //   console.log('GOT URL', ret);

//       //   ret = encodeURIComponent(`${[getBaseHref(page.url()), ret].join('/')}`);
//       //   console.log('GOT full URL', ret);

//       const [download] = await Promise.all([
//         page.waitForEvent('download'), // wait for download to start
//         page.click('a[data-abstract-id]'),
//       ]);
//       // wait for download to complete
//       const path = await download.path();

//       const pdf = `data:application/pdf;base64,${(await fs.promises.readFile(path)).toString('base64')}`;
//       const title = await page.textContent('.box-abstract-main h1');
//       const abstract = await page.textContent('.abstract-text p');

//       return {
//         title,
//         abstract,
//         pdf,
//       };
//     },
//   },
// };

// export const headlessDownloadPdf = async (
//   url: string,
//   strategy: keyof typeof Institution,
// ): Promise<ResearchObjectMetadata> => {
//   const browser = await firefox.launch();
//   const page = await browser.newPage();
//   let returnUrl;
//   try {
//     if (strategy) {
//       console.log('DownloadPDF; STRATEGY', strategy);
//       returnUrl = await STRATEGY[strategy].exec(page, url);
//     } else {
//       throw new Error('No download strategy selected');
//     }
//   } catch (err) {
//     console.error('downloadPdf', err);
//   } finally {
//     await browser.close();
//   }
//   return returnUrl;
// };
