// Card 8: Aino ends her 36-month lease in month 7. The page explains the price; open invoices
// come first; then she returns the bike for the exit fee.
import { leaseFor } from './helpers.mjs';

export default async function earlyExit(page, check) {
  await page.actAs('cust-aino');
  await page.travelTo('2026-11-05');
  const contract = await leaseFor(page, 'ebike-003', 'Aino Virtanen', 36);

  await page.travelTo('2027-05-20');
  await page.open(`/en/contracts/${contract.id}`);
  check(
    'the contract links to ending it early',
    await page.js(`!!document.querySelector('a[href$="/exit"]')`)
  );
  await page.open(`/en/contracts/${contract.id}/exit`);
  const text = await page.text();
  check(
    'card 8: 29 of 36 rents are left',
    text.includes('Rents left: 29 of 36'),
    text.slice(0, 300)
  );
  check('card 8: still owed today 3,306.66 €', text.includes('€3,306.66'));
  check('card 8: the bike is worth 2,878.60 € today', text.includes('€2,878.60'));
  check('card 8: returning it costs 539.36 € incl. VAT', text.includes('€539.36'));
  const returnDisabled = () =>
    page.js(
      `[...document.querySelectorAll('main button')].find((b) => b.innerText.startsWith('Return it now'))?.disabled`
    );
  check('open invoices block the exit', (await returnDisabled()) === true);

  await page.click('main button', 'Pay all');
  await page.open(`/en/contracts/${contract.id}/exit`);
  check('after paying, the exit is possible', (await returnDisabled()) === false);
  await page.click('main button', 'Return it now');
  await page.waitFor(`location.pathname === '/en/contracts/${contract.id}'`);
  await page.open(`/en/contracts/${contract.id}`);
  const panel = await page.js(
    `document.querySelector('#end-of-term-heading + p')?.innerText ?? ''`
  );
  check('the contract says it was ended early', panel.includes('ended early'), panel);
}
