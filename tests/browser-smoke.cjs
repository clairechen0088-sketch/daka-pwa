const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CHILD = 'browser-test';
const DATE = '2026-10-20';
const decisions = { chineseMain: 'approved', mathMain: 'approved' };
let server, browser, origin;

before(async () => {
  server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname;
    const relative = urlPath.replace(/^\/daka-pwa\//, '') || 'index.html';
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.webmanifest': 'application/manifest+json',
        '.png': 'image/png', '.svg': 'image/svg+xml' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}/daka-pwa/`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.DAKA_CHROMIUM_PATH || undefined,
    args: ['--disable-dev-shm-usage']
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function fixture(t) {
  // Every test uses a new browser profile; no user data is opened or cleared.
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.goto(origin);
  await page.waitForFunction(() => typeof App !== 'undefined' && navigator.serviceWorker.controller && App.getCurrentChild());
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.getCurrentChild());
  await page.evaluate(async ({ childId, date }) => {
    await DB.db.child.add({ id: childId, name: '测试孩子', avatar: 'football', currentBalance: 100, lifetimeEarnedPoints: 100 });
    await DB.db.appConfig.update('singleton', { boundChildId: childId });
    await DB.updateRulesConfig({ basicStudyTasks: ['chineseMain', 'mathMain'] });
    await DB.db.taskTemplates.toCollection().modify({ active: 0 });
    for (const id of ['chineseMain', 'mathMain']) {
      await DB.db.taskTemplates.put({
        id, name: id, taskType: 'checkbox', defaultPoints: 10, active: 1,
        category: 'study', subCategory: 'main', section: 'today_required',
        weekdays: [1, 2, 3, 4, 5, 6, 7]
      });
    }
    await DB.generateDailyTasks(childId, date);
    await DB.db.pointRecords.add({
      id: 'browser-history', childId, date: '2026-10-01', type: 'taskEarn', points: 100, balance: 100
    });
    await DB.upsertStreak({
      childId, current: 6, longest: 6, lastEffectiveDate: Utils.addDays(date, -1),
      streakPeriodStart: Utils.addDays(date, -6), grantedMilestones: [3]
    });
    await App.refreshState();
  }, { childId: CHILD, date: DATE });
  return { context, page, dialogs };
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const result = {};
    for (const table of DB.db.tables) result[table.name] = await table.orderBy(':id').toArray();
    return result;
  });
}

async function assertSettled(page) {
  const data = await page.evaluate(async ({ childId, date }) => ({
    summary: await DB.getDailySummary(childId, date), tasks: await DB.getDailyTasks(childId, date),
    points: await DB.db.pointRecords.where('[childId+date]').equals([childId, date]).toArray(),
    child: await DB.getChild(childId), balance: await DB.calcCurrentBalance(childId),
    cards: await DB.getProtectionCardBalance(childId),
    awards: await DB.db.streakAwardRecords.where('childId').equals(childId).toArray(),
    history: await DB.db.pointRecords.get('browser-history')
  }), { childId: CHILD, date: DATE });
  assert.equal(data.summary.totalEarnedPoints, 38); // task 20 + basic 3 + milestone 15
  assert.equal(data.points.length, 4);
  assert.equal(data.points.reduce((sum, p) => sum + p.points, 0), 38);
  assert.deepEqual(new Set(data.summary.pointRecordIds), new Set(data.points.map(p => p.id)));
  assert.equal(data.tasks.length, 2);
  for (const task of data.tasks) {
    assert.equal(task.settled, true);
    assert.ok(data.points.some(p => p.id === task.pointRecordId && p.relatedDailyTaskId === task.id));
  }
  assert.equal(data.child.currentBalance, 138);
  assert.equal(data.child.lifetimeEarnedPoints, 138);
  assert.equal(data.balance, 138);
  assert.equal(data.cards, 1);
  assert.equal(data.awards.length, 1);
  assert.equal(data.history.points, 100);
}

async function openConfirm(page) {
  await page.evaluate(async date => {
    App.enterParentMode();
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById('page-confirm').classList.add('active');
    await ConfirmPage.render(date);
  }, DATE);
  await page.locator('#confirm-approve-all').click();
  await page.waitForFunction(() => document.querySelectorAll('.confirm-btn-approve.selected').length >= 2);
}

test('native IndexedDB: two tabs settle once, including milestone points and card', async t => {
  const { context, page } = await fixture(t);
  const second = await context.newPage();
  await second.goto(origin);
  await second.waitForFunction(() => typeof App !== 'undefined' && App.getCurrentChild());
  const args = { childId: CHILD, date: DATE, decisions };
  const settle = args => Engine.settle(args.childId, args.date, args.decisions);
  const results = await Promise.all([page.evaluate(settle, args), second.evaluate(settle, args)]);
  assert.equal(results.filter(r => r.success).length, 1);
  await assertSettled(page);
});

test('native IndexedDB: a late write failure rolls back and can be retried', async t => {
  const { page } = await fixture(t);
  const before = await snapshot(page);
  const result = await page.evaluate(async ({ childId, date, decisions }) => {
    const original = DB.db.child.update;
    DB.db.child.update = async function (...args) {
      await original.apply(this, args);
      throw new Error('native late failure');
    };
    try { await Engine.settle(childId, date, decisions); return 'unexpected success'; }
    catch (err) { return err.message; }
    finally { DB.db.child.update = original; }
  }, { childId: CHILD, date: DATE, decisions });
  assert.match(result, /native late failure/);
  assert.deepEqual(await snapshot(page), before);
  assert.equal((await page.evaluate(({ childId, date, decisions }) => Engine.settle(childId, date, decisions),
    { childId: CHILD, date: DATE, decisions })).success, true);
  await assertSettled(page);
});

test('parent UI: double invocation submits once and freezes the date until completion', async t => {
  const { page } = await fixture(t);
  await openConfirm(page);
  await page.evaluate(() => {
    const original = Engine.settle;
    window.settleCalls = 0;
    Engine.settle = async (...args) => {
      window.settleCalls++;
      await new Promise(resolve => { window.releaseSettle = resolve; });
      return original(...args);
    };
    const btn = document.getElementById('confirm-settle-btn');
    window.inFlight = btn.onclick();
    btn.onclick(); // Exercise the handler directly even though the button is disabled.
  });
  await page.evaluate(() => document.getElementById('confirm-date-prev').onclick());
  assert.equal(await page.locator('#confirm-date-display').textContent(), DATE);
  assert.equal(await page.locator('#confirm-settle-btn').isDisabled(), true);
  await page.evaluate(async () => { window.releaseSettle(); await window.inFlight; });
  assert.equal(await page.evaluate(() => window.settleCalls), 1);
  assert.equal(await page.locator('#confirm-settle-btn').textContent(), '✅ 已结算');
  assert.equal(await page.locator('#confirm-settle-btn').isDisabled(), true);
  await assertSettled(page);
});

test('parent UI: failed settlement restores the button and retry succeeds', async t => {
  const { page, dialogs } = await fixture(t);
  await openConfirm(page);
  const before = await snapshot(page);
  await page.evaluate(async () => {
    const reject = () => { throw new Error('UI write failure'); };
    DB.db.dailySummaries.hook('creating', reject);
    try { await document.getElementById('confirm-settle-btn').onclick(); }
    finally { DB.db.dailySummaries.hook('creating').unsubscribe(reject); }
  });
  assert.deepEqual(await snapshot(page), before);
  assert.equal(await page.locator('#confirm-settle-btn').isDisabled(), false);
  assert.ok(dialogs.some(message => message.includes('本次结算未保存')));
  await page.evaluate(() => document.getElementById('confirm-settle-btn').onclick());
  await assertSettled(page);
});

test('parent UI: display failure after commit reports completion and stays locked', async t => {
  const { page, dialogs } = await fixture(t);
  await openConfirm(page);
  await page.evaluate(async () => {
    const original = App.refreshState;
    App.refreshState = async () => { throw new Error('UI refresh failure'); };
    try { await document.getElementById('confirm-settle-btn').onclick(); }
    finally { App.refreshState = original; }
  });
  assert.ok(dialogs.some(message => message.includes('结算已完成，页面刷新失败')));
  assert.equal(await page.locator('#confirm-settle-btn').isDisabled(), true);
  await assertSettled(page);
});

test('PWA reload and settlement work offline with native IndexedDB history intact', async t => {
  const { context, page } = await fixture(t);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.getCurrentChild());
  const result = await page.evaluate(({ childId, date, decisions }) => Engine.settle(childId, date, decisions),
    { childId: CHILD, date: DATE, decisions });
  assert.equal(result.success, true);
  await assertSettled(page);
  await page.reload();
  await page.waitForFunction(() => typeof App !== 'undefined' && App.getCurrentChild());
  await assertSettled(page);
  const duplicate = await page.evaluate(({ childId, date, decisions }) => Engine.settle(childId, date, decisions),
    { childId: CHILD, date: DATE, decisions });
  assert.equal(duplicate.success, false);
});
