// Card 9: ebike-007 came back fair with 18,400 km. The workbench ranks the waiting list and
// refurbishing it puts it back for its next life.
export default async function secondLife(page, check) {
  await page.open('/en/admin/second-life/ebike-007');
  const text = await page.text();
  check('the workbench opens for ebike-007', text.includes('ebike-007'), text.slice(0, 200));
  const ranking = await page.js(
    `[...document.querySelectorAll('main li')].map((li) => li.innerText.match(/wait-\\d+/)?.[0]).filter(Boolean)`
  );
  check(
    'card 9: wait-02 and wait-13 are both on the list',
    ranking.includes('wait-02') && ranking.includes('wait-13'),
    ranking.join(', ')
  );
  // Refurbished to good, wait-13's 24-month rent fits its 90 € budget; wait-02's 12-month
  // rent doesn't, so wait-13 comes first even though wait-02 would accept "fair".
  check('card 9: wait-13 gets it', ranking[0] === 'wait-13', ranking.join(', '));

  const done = await page.post('/api/admin/second-life/ebike-007', {
    conditionFound: 'fair',
    usageFound: 18_400,
    conditionAfter: 'good',
    presetIds: [],
    customRepairs: [],
    priceCents: 172_700,
    notes: null,
  });
  check('refurbishing it works', done.success === true, JSON.stringify(done.error));
  await page.open('/en/assets/ebike-007');
  const item = await page.text();
  check(
    'the item is back with its second-life price',
    item.includes('€1,727.00'),
    item.slice(0, 300)
  );
}
