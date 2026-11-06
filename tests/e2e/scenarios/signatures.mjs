// Card 6, finished: Norvi's applicant may not sign, so the application waits for the person
// they name. On Admin → Signatures, staff act as that person: one request is signed (the
// contract and its invoices go to Norvi), another is declined (Norvi sees who and why).
const SIGNATORY = 'ceo@norvi.example.com';

/** Norvi applies for `assetId` through the form, naming the signatory; returns the application id. */
async function applyAsNorvi(page, assetId) {
  await page.open(`/en/apply?asset=${assetId}&term=36&down=0`);
  await page.waitFor(`!!document.querySelector('#field-q_signatory_email')`, 5000);
  await page.set('#field-q_signatory_email', SIGNATORY, 'input');
  await page.js(`document.querySelector('input[name=q_usage_purpose][value=business]')?.click()`);
  await page.waitFor(
    `document.querySelector('form [aria-live=polite]').innerText.includes('person will check')`,
    5000
  );
  await page.click('form button[type=submit]');
  await page.waitFor(`!!document.querySelector('[role=status] a[href*="/applications/"]')`);
  const href = await page.js(
    `document.querySelector('[role=status] a[href*="/applications/"]').getAttribute('href')`
  );
  return href.split('/').pop();
}

export default async function signatures(page, check) {
  await page.actAs('cust-norvi');
  const first = await applyAsNorvi(page, 'ebike-004');

  await page.open(`/en/applications/${first}`);
  const waiting = await page.text();
  check(
    'card 6: Norvi sees it waiting for the signatory, by email',
    waiting.includes('Waiting for signature') && waiting.includes(SIGNATORY),
    waiting.slice(0, 400)
  );
  check(
    'card 6: Norvi cannot sign it themselves',
    !(await page.js(`!!document.querySelector('main form button[type=submit]')`))
  );
  check(
    'card 6: nothing is invoiced while it waits',
    waiting.includes('Nothing is signed or invoiced')
  );

  await page.open('/en/admin/signatures');
  const list = await page.text();
  check('admin: the request is listed', list.includes(`Open as ${SIGNATORY}`), list.slice(0, 400));

  // Sign as the signatory.
  await page.open(`/en/admin/signatures/${first}`);
  check(
    'the request page acts as the signatory',
    (await page.text()).includes(`you are acting as ${SIGNATORY}`)
  );
  await page.js(
    `document.querySelector('#signatory-sign-heading').closest('form').querySelector('input[type=checkbox]').click()`
  );
  await page.set('form input[autocomplete=name]', 'Noora Norvi', 'input');
  await page.click('form button[type=submit]', 'Sign the lease');
  const signed = await page.waitFor(
    `document.querySelector('main').innerText.includes('Signed on')`
  );
  check('the signatory signs: the contract is active', signed);
  const contractHref = await page.js(
    `document.querySelector('main a[href*="/contracts/"]')?.getAttribute('href') ?? ''`
  );

  await page.open(contractHref);
  const contract = await page.text();
  check(
    'the contract is Norvi’s, signed by the signatory',
    contract.includes('Norvi Logistics') && contract.includes('Noora Norvi'),
    contract.slice(0, 300)
  );
  await page.open('/en/contracts');
  check(
    'it is in Norvi’s contracts, so the invoices go to them',
    await page.js(`!!document.querySelector('main a[href="${contractHref}"]')`),
    contractHref
  );

  // A second request, declined with a note.
  const second = await applyAsNorvi(page, 'ebike-005');
  await page.open(`/en/admin/signatures/${second}`);
  await page.set('textarea', 'We lease our bikes elsewhere.', 'input');
  await page.click('form button[type=submit]', 'Decline the lease');
  check(
    'the signatory declines',
    await page.waitFor(`document.querySelector('main').innerText.includes('declined on')`)
  );
  await page.open(`/en/applications/${second}`);
  const declined = await page.text();
  check(
    'Norvi sees who declined and why',
    declined.includes('Declined') && declined.includes('We lease our bikes elsewhere.'),
    declined.slice(0, 400)
  );
}
