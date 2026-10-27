const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const Dexie = require('../vendor/dexie.min.js');

const ROOT = path.join(__dirname, '..');
const CHILD = 'test-child';
const DATE = '2026-10-27';
const plain = value => JSON.parse(JSON.stringify(value));

// Run the shipped browser scripts and vendored Dexie, not mocked DB helpers.
function loadRuntime(indexedDB = new IDBFactory()) {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  const globals = { Dexie, console: { log() {}, warn() {}, error() {} } };
  for (const [file, name] of [['utils', 'Utils'], ['db', 'DB'], ['rules', 'Rules'], ['engine', 'Engine']]) {
    const source = readFileSync(path.join(ROOT, 'src', `${file}.js`), 'utf8');
    globals[name] = new Function(...Object.keys(globals), `${source}\nreturn ${name};`)(...Object.values(globals));
  }
  return { ...globals, indexedDB };
}

async function fixture(t, { milestone = true, generate = true } = {}) {
  const runtime = loadRuntime();
  const { DB, Utils } = runtime;
  await DB.db.open();
  t.after(() => DB.db.close());
  const rules = plain(DB.DEFAULT_RULES_CONFIG);
  rules.basicStudyTasks = ['chineseMain', 'mathMain'];
  const specs = [
    ['chineseMain', 'study', 'checkbox', 10],
    ['mathMain', 'study', 'checkbox', 10],
    ['englishListening', 'study', 'duration', 0],
    ['basketball', 'bigSport', 'checkbox', 8],
    ['rejected', 'study', 'checkbox', 4]
  ];
  await DB.db.rulesConfig.add(rules);
  await DB.db.appConfig.add({ id: 'singleton', dayCutoffHour: 4 });
  await DB.db.child.add({ id: CHILD, currentBalance: 100, lifetimeEarnedPoints: 100 });
  await DB.db.pointRecords.add({
    id: 'opening-history', childId: CHILD, date: '2026-10-01',
    time: '2026-10-01T12:00:00+08:00', type: 'taskEarn', points: 100, balance: 100
  });
  await DB.db.taskTemplates.bulkAdd(specs.map(([id, category, taskType, defaultPoints]) => ({
    id, name: id, category, taskType, defaultPoints, active: 1,
    weekdays: [1, 2, 3, 4, 5, 6, 7]
  })));
  if (generate) {
    await DB.generateDailyTasks(CHILD, DATE, Utils.getDayOfWeek(DATE));
    await DB.db.dailyTasks.update(`${DATE}-englishListening-${CHILD}`, { durationMinutes: 240 });
    await DB.db.dailyTasks.add({
      id: 'inactive-task', childId: CHILD, date: DATE, taskTemplateId: 'inactive',
      taskType: 'checkbox', category: 'study', plannedPoints: 100,
      inactiveToday: true, settled: false, parentStatus: 'unreviewed'
    });
  }
  if (milestone) {
    await DB.upsertStreak({
      childId: CHILD, current: 6, longest: 6, lastEffectiveDate: '2026-10-26',
      streakPeriodStart: '2026-10-21', grantedMilestones: [3]
    });
  }
  const decisions = Object.fromEntries(specs.map(([id]) => [id, id === 'rejected' ? 'rejected' : 'approved']));
  decisions.inactive = 'approved';
  return { ...runtime, decisions };
}

async function snapshot(DB) {
  const result = {};
  for (const table of DB.db.tables) result[table.name] = await table.orderBy(':id').toArray();
  return plain(result);
}

async function assertSettlement(DB, { milestone = true } = {}) {
  const summary = await DB.getDailySummary(CHILD, DATE);
  const tasks = await DB.getDailyTasks(CHILD, DATE);
  const points = await DB.db.pointRecords.where('[childId+date]').equals([CHILD, DATE]).toArray();
  const earned = milestone ? 51 : 36;
  assert.equal(summary.taskEarnedPoints, 33); // 10 + 10 + capped listening 5 + sport 8
  assert.equal(summary.basicStudyBonusPoints, 3);
  assert.equal(summary.streakBonusPoints, milestone ? 15 : 0);
  assert.equal(summary.totalEarnedPoints, earned);
  assert.equal(points.reduce((sum, r) => sum + r.points, 0), earned);
  assert.equal(points.length, milestone ? 6 : 5);
  assert.deepEqual(new Set(summary.pointRecordIds), new Set(points.map(r => r.id)));
  let runningBalance = 100;
  for (const id of summary.pointRecordIds) {
    const record = points.find(r => r.id === id);
    runningBalance += record.points;
    assert.equal(record.balance, runningBalance);
  }
  for (const task of tasks) {
    if (task.inactiveToday) {
      assert.equal(task.settled, false);
      continue;
    }
    assert.equal(task.settled, true);
    if (task.taskTemplateId === 'rejected') {
      assert.equal(task.parentPoints, 0);
      assert.equal(task.pointRecordId, null);
    } else {
      const record = points.find(r => r.id === task.pointRecordId);
      assert.ok(record);
      assert.equal(record.relatedDailyTaskId, task.id);
      assert.equal(record.points, task.parentPoints);
    }
  }
  const child = await DB.getChild(CHILD);
  assert.equal(child.currentBalance, 100 + earned);
  assert.equal(child.lifetimeEarnedPoints, 100 + earned);
  assert.equal(await DB.calcCurrentBalance(CHILD), child.currentBalance);
  const awards = await DB.db.streakAwardRecords.toArray();
  const cards = await DB.db.protectionCardRecords.toArray();
  assert.equal(awards.length, milestone ? 1 : 0);
  assert.equal(cards.length, milestone ? 1 : 0);
  assert.equal(await DB.getProtectionCardBalance(CHILD), milestone ? 1 : 0);
  if (milestone) {
    const bonus = points.find(r => r.type === 'streakBonus');
    assert.equal(awards[0].pointRecordId, bonus.id);
    assert.equal(cards[0].relatedStreakAwardId, awards[0].id);
    assert.equal(cards[0].balance, 1);
  }
  const streak = await DB.getStreak(CHILD);
  assert.equal(streak.current, milestone ? 7 : 1);
  assert.deepEqual(plain(streak.grantedMilestones), milestone ? [3, 7] : []);
  assert.deepEqual(await DB.db.pointRecords.get('opening-history'), {
    id: 'opening-history', childId: CHILD, date: '2026-10-01',
    time: '2026-10-01T12:00:00+08:00', type: 'taskEarn', points: 100, balance: 100
  });
}

test('normal settlement preserves history, task scoring, listening cap and basic bonus', async t => {
  const { DB, Engine, decisions } = await fixture(t, { milestone: false });
  const schemaVersion = DB.db.verno;
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, true);
  await assertSettlement(DB, { milestone: false });
  assert.equal(DB.db.verno, schemaVersion); // no schema migration/reset
});

test('seven-day milestone atomically awards points and a protection card', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, true);
  await assertSettlement(DB);
});

test('repeated settlement leaves every table unchanged', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  await Engine.settle(CHILD, DATE, decisions);
  const before = await snapshot(DB);
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, false);
  assert.deepEqual(await snapshot(DB), before);
});

test('concurrent clicks produce exactly one settlement', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 5 }, () => Engine.settle(CHILD, DATE, decisions)));
  assert.equal(results.filter(r => r.success).length, 1);
  await assertSettlement(DB);
});

test('independent database connections serialize settlement checks and writes', async t => {
  const first = await fixture(t);
  const second = loadRuntime(first.indexedDB);
  await second.DB.db.open();
  t.after(() => second.DB.db.close());
  const results = await Promise.all([
    first.Engine.settle(CHILD, DATE, first.decisions),
    second.Engine.settle(CHILD, DATE, first.decisions)
  ]);
  assert.equal(results.filter(r => r.success).length, 1);
  await assertSettlement(first.DB);
});

// Throw AFTER a real write has completed, so each case proves rollback of
// that write plus all previous writes, not just validation before settlement.
for (const [tableName, method, failAt] of [
  ['pointRecords', 'add', 2],
  ['protectionCardRecords', 'add', 1],
  ['streakAwardRecords', 'add', 1],
  ['dailySummaries', 'add', 1],
  ['dailyTasks', 'update', 2],
  ['streak', 'update', 1],
  ['child', 'update', 1]
]) {
  test(`failure after ${tableName}.${method} rolls back all tables; retry awards once`, async t => {
    const { DB, Engine, Dexie, decisions } = await fixture(t);
    const before = await snapshot(DB);
    const table = DB.db[tableName];
    const original = table[method];
    let calls = 0;
    table[method] = async function (...args) {
      assert.ok(Dexie.currentTransaction, 'write must be inside the settlement transaction');
      const result = await original.apply(this, args);
      if (++calls === failAt) throw new Error('injected write failure');
      return result;
    };
    try {
      await assert.rejects(Engine.settle(CHILD, DATE, decisions), /injected write failure/);
    } finally {
      table[method] = original;
    }
    assert.equal(calls, failAt);
    assert.deepEqual(await snapshot(DB), before);
    assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, true);
    await assertSettlement(DB);
  });
}

test('IndexedDB write rejection rolls back and allows a clean retry', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  const before = await snapshot(DB);
  function rejectSummary() { throw new DOMException('simulated quota failure', 'QuotaExceededError'); }
  DB.db.dailySummaries.hook('creating', rejectSummary);
  try {
    await assert.rejects(Engine.settle(CHILD, DATE, decisions), /simulated quota failure/);
  } finally {
    DB.db.dailySummaries.hook('creating').unsubscribe(rejectSummary);
  }
  assert.deepEqual(await snapshot(DB), before);
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, true);
  await assertSettlement(DB);
});

test('failure also rolls back fallback task generation and first streak creation', async t => {
  const { DB, Engine, decisions } = await fixture(t, { generate: false, milestone: false });
  const before = await snapshot(DB);
  const original = DB.db.child.update;
  DB.db.child.update = async function (...args) {
    await original.apply(this, args);
    throw new Error('late failure');
  };
  try {
    await assert.rejects(Engine.settle(CHILD, DATE, decisions), /late failure/);
  } finally {
    DB.db.child.update = original;
  }
  assert.deepEqual(await snapshot(DB), before);
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, true);
  assert.equal((await DB.getDailySummary(CHILD, DATE)).totalEarnedPoints, 31);
});

for (const residue of ['taskEarn', 'basicStudyBonus', 'streakBonus', 'award', 'card', 'taskLink', 'settledTask']) {
  test(`legacy partial settlement (${residue}) is preserved and blocks new awards`, async t => {
    const { DB, Engine, decisions } = await fixture(t);
    if (['taskEarn', 'basicStudyBonus', 'streakBonus'].includes(residue)) {
      await DB.db.pointRecords.add({ id: 'orphan', childId: CHILD, date: DATE, type: residue, points: 5 });
    } else if (residue === 'award') {
      await DB.db.streakAwardRecords.add({ id: 'orphan', childId: CHILD, date: DATE });
    } else if (residue === 'card') {
      await DB.db.protectionCardRecords.add({
        id: 'orphan', childId: CHILD, relatedDate: DATE, type: 'earn',
        cards: 1, relatedStreakAwardId: 'missing-award'
      });
    } else {
      await DB.db.dailyTasks.update(`${DATE}-chineseMain-${CHILD}`,
        residue === 'taskLink' ? { pointRecordId: 'orphan' } : { settled: true });
    }
    const before = await snapshot(DB);
    assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, false);
    assert.deepEqual(await snapshot(DB), before);
  });
}

test('redemption/refund/manual points and another child do not block settlement', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  await DB.db.pointRecords.bulkAdd([
    { id: 'redeem', childId: CHILD, date: DATE, type: 'redeem', points: -2 },
    { id: 'refund', childId: CHILD, date: DATE, type: 'refund', points: 2 },
    { id: 'manual', childId: CHILD, date: DATE, type: 'manual', points: 1 },
    { id: 'other-child', childId: 'other', date: DATE, type: 'taskEarn', points: 999 }
  ]);
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, true);
  assert.equal((await DB.getChild(CHILD)).currentBalance, 152);
  assert.equal(await DB.calcCurrentBalance(CHILD), 152);
});

test('a cards-only milestone has no unrelated pointRecordId', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  await DB.updateRulesConfig({ streakMilestones: [{ days: 7, points: 0, protectionCards: 1 }] });
  const result = await Engine.settle(CHILD, DATE, decisions);
  assert.equal(result.data.streakBonusPoints, 0);
  assert.equal(result.data.protectionCardsEarned, 1);
  assert.equal((await DB.db.streakAwardRecords.toArray())[0].pointRecordId, null);
  assert.equal((await DB.getChild(CHILD)).currentBalance, 136);
});

test('existing milestone award in the same cycle is not issued again', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  const awardId = `${CHILD}-2026-10-21-7`;
  await DB.db.streakAwardRecords.add({
    id: awardId, childId: CHILD, date: '2026-10-26', milestone: 7, streakPeriodStart: '2026-10-21'
  });
  const result = await Engine.settle(CHILD, DATE, decisions);
  assert.equal(result.data.streakBonusPoints, 0);
  assert.equal(result.data.protectionCardsEarned, 0);
  assert.equal(await DB.db.streakAwardRecords.count(), 1);
  assert.equal((await DB.getChild(CHILD)).currentBalance, 136);
});

test('zero-point settlement is still idempotent', async t => {
  const { DB, Engine } = await fixture(t);
  const result = await Engine.settle(CHILD, DATE, { rejected: 'rejected' });
  assert.equal(result.data.totalEarnedPoints, 0);
  assert.equal(await DB.db.pointRecords.count(), 1);
  assert.equal((await DB.getStreak(CHILD)).current, 0);
  assert.equal((await Engine.settle(CHILD, DATE, {})).success, false);
  assert.equal((await DB.getChild(CHILD)).currentBalance, 100);
});

test('missing child prevents settlement without modifying history', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  await DB.db.child.delete(CHILD);
  const before = await snapshot(DB);
  assert.equal((await Engine.settle(CHILD, DATE, decisions)).success, false);
  assert.deepEqual(await snapshot(DB), before);
});

test('concurrent reward confirmation and settlement keep balance consistent; refund still works', async t => {
  const { DB, Engine, decisions } = await fixture(t);
  await DB.db.redeemRecords.add({
    id: 'requested-reward', childId: CHILD, status: 'requested', costSnapshot: 40,
    rewardId: null, tier: 'small', categorySnapshot: 'physical', rewardNameSnapshot: 'test reward'
  });
  const [settlement] = await Promise.all([
    Engine.settle(CHILD, DATE, decisions), DB.confirmRedeem('requested-reward')
  ]);
  assert.equal(settlement.success, true);
  assert.equal((await DB.getChild(CHILD)).currentBalance, 111);
  assert.equal(await DB.calcCurrentBalance(CHILD), 111);
  assert.equal((await DB.getChild(CHILD)).lifetimeEarnedPoints, 151);
  assert.equal((await DB.db.redeemRecords.get('requested-reward')).status, 'pending');
  await assert.rejects(DB.confirmRedeem('requested-reward'), /requested/);
  await DB.cancelRedeem('requested-reward');
  assert.equal((await DB.getChild(CHILD)).currentBalance, 151);
  assert.equal(await DB.calcCurrentBalance(CHILD), 151);
  assert.equal((await DB.getChild(CHILD)).lifetimeEarnedPoints, 151);
});
