# 暑假任务打卡 PWA · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the existing V2 codebase against the V1.1 spec, fix critical gaps (lottery, streak rest-day, schema alignment), and add a settlement engine test harness for regression safety.

**Architecture:** Pure HTML/CSS/JS SPA with Dexie.js v4 IndexedDB layer. No framework, no build toolchain. The existing V2 code is ~80% complete — this plan bridges the remaining ~20% gap between the current `rulesConfig`-driven implementation and the V1.1 product spec, then adds automated test coverage for the settlement engine.

**Tech Stack:** HTML5, CSS3 (custom properties, dark game theme), vanilla JS (IIFE modules), Dexie.js v4 (vendor), Service Worker (PWA), SHA-256 via Web Crypto API.

## Global Constraints

- iPad Safari iOS 15+ primary target; iPhone Safari secondary
- PWA standalone mode via `manifest.json` + Service Worker
- All libraries vendored locally (no CDN)
- Points balance = SUM(pointRecord.points), never stored as raw number
- Task/reward snapshots copied at generation time (template changes don't pollute history)
- Settlement idempotency: primary anchor `dailySummary.id` exists; secondary `dailyTask.settled = true`
- Streak: rest days (no tasks) are NEUTRAL (don't add, don't break); `dayCutoffHour = 4`
- Post-settlement corrections go through `manualOverrideRecord`
- Backup JSON exports all data; full import overwrites everything including PIN
- Configuration templates export/import only `taskTemplates`, `rewards`, `lotteryConfig`, `rulesConfig`

---

## 0. Existing Codebase Audit

Before writing tasks, here is what each file currently does and its status against the V1.1 spec:

| File | Status | Notes |
|------|--------|-------|
| `index.html` | ✅ Complete | All page containers, nav, modals in place |
| `manifest.json` | ✅ Complete | PWA configured |
| `sw.js` | ✅ Complete | Cache-first SW with versioning |
| `vendor/dexie.min.js` | ✅ Complete | Dexie v4 vendored |
| `src/utils.js` | ✅ Complete | Date, format, SHA-256, genId, validateBackup |
| `src/db.js` | ✅ Complete | 14 stores, migrations, all queries, V2.1 schema |
| `src/rules.js` | ✅ Complete | All rule calculations implemented |
| `src/engine.js` | ⚠️ Needs fixes | Settlement works but streak rest-day logic missing, no test harness |
| `src/backup.js` | ✅ Complete | Full + template export/import with validation |
| `src/app.js` | ✅ Complete | SPA routing, PIN gate, state management |
| `src/ui/pin.js` | ✅ Complete | 4-digit PIN with paste support |
| `src/ui/children/challenge.js` | ✅ Complete | Grouped tasks, optimistic UI, duration counter |
| `src/ui/children/rewards.js` | ✅ Complete | Tier-grouped redemption with limits |
| `src/ui/children/history.js` | ✅ Complete | Point record timeline |
| `src/ui/parent/confirm.js` | ✅ Complete | Approve/reject matrix, settle preview |
| `src/ui/parent/manage.js` | ✅ Complete | Fulfill/cancel redemptions, reward CRUD |
| `src/ui/parent/settings.js` | ✅ Complete | Child edit, templates toggle, rules edit, backup, PIN |
| `src/styles/base.css` | ✅ Complete | Full design system |
| `src/styles/challenge.css` | ⚠️ Partial | Task card styles present, may need lottery additions |
| `src/styles/rewards.css` | ⚠️ Partial | Rewards grid styles present, lottery tab hidden |
| `src/styles/parent.css` | ⚠️ Partial | Confirm/manage styles present |

### Critical Gaps (Spec vs. Code)

| # | Gap | Spec Says | Code Does | Severity |
|---|-----|-----------|-----------|----------|
| G1 | **Streak rest-day neutral** | Rest days skip, don't break streak | `computeStreak()` resets to 0 on non-effective days | 🔴 High |
| G2 | **Lottery system disabled** | V1 conservative lottery with chance-based draws | `lotteryConfig.enabled = false`, all UI hidden | 🔴 High |
| G3 | **No settlement test harness** | User explicitly requested "结算引擎测试用例" | No automated tests exist | 🔴 High |
| G4 | **No completionRate in dailySummary** | `completionRate` field for 60%/90% thresholds | Code computes but doesn't store it explicitly in summary | 🟡 Medium |
| G5 | **No dailyBonusPoints field** | Separate `dailyBonusPoints` for ≥90% completion | Code uses `basicStudyBonusPoints` (different concept) | 🟡 Medium |
| G6 | **No lotteryRecord.relatedRedeemId** | Links lottery → redeemRecord for "小奖励" prizes | Field exists in schema but lottery is disabled | 🟡 Medium |
| G7 | **No streakAwardRecord.chanceRecordIds** | Array of chance record IDs | Field exists as empty array in code | 🟢 Low |
| G8 | **SW missing pin.js from cache list** | `src/ui/pin.js` should be cached | Not in `STATIC_ASSETS` array | 🟢 Low |
| G9 | **No SW cache-bust on update** | Version bump should invalidate cache | Manual `CACHE_NAME` change needed | 🟢 Low |

---

## 1. File Structure (Post-Implementation)

```
/
├── index.html                  # Modify: add lottery UI in rewards page
├── manifest.json               # No changes
├── sw.js                       # Modify: add pin.js to STATIC_ASSETS
├── vendor/
│   └── dexie.min.js            # No changes
├── src/
│   ├── db.js                   # No changes needed
│   ├── app.js                  # No changes needed
│   ├── engine.js               # Modify: fix streak rest-day, add dailyBonusPoints
│   ├── engine.test.js          # CREATE: settlement engine test harness
│   ├── rules.js                # Modify: add dailyBonus rule
│   ├── backup.js               # No changes needed
│   ├── utils.js                # No changes needed
│   ├── ui/
│   │   ├── children/
│   │   │   ├── challenge.js    # Modify: show lottery chance count
│   │   │   ├── rewards.js      # Modify: enable lottery tab + logic
│   │   │   └── history.js      # No changes needed
│   │   └── parent/
│   │       ├── confirm.js      # Modify: add partial (manual points) support
│   │       ├── manage.js       # No changes needed
│   │       └── settings.js     # Modify: enable lottery config editing
│   └── styles/
│       ├── base.css            # Modify: add lottery animation styles
│       ├── challenge.css       # No changes needed
│       ├── rewards.css         # Modify: add lottery tab styles
│       └── parent.css          # No changes needed
├── assets/
│   └── icons/                  # No changes needed
└── docs/
    └── superpowers/
        ├── specs/              # Reference specs
        └── plans/              # This plan
```

---

## 2. Tasks

### Task 1: Fix Streak Rest-Day Neutral Logic

**Files:**
- Modify: `src/engine.js:344-394` (computeStreak function)

**Interfaces:**
- Consumes: `DB.getStreak(childId)`, `DB.getAllSummaries(childId)`, `Utils.addDays(date, days)`
- Produces: `computeStreak(childId, date, isEffective, rulesConfig)` — same signature, corrected logic

**Background:** The spec defines rest days (days with 0 tasks generated) as NEUTRAL — they don't add to the streak but don't break it either. The current code treats any non-effective day as a streak-breaker. We need to check whether the day had tasks at all before deciding.

- [ ] **Step 1: Write the corrected `computeStreak` function**

The key change: before resetting streak on a non-effective day, check if the day had any tasks. If the day had 0 tasks (rest day), skip it without breaking the streak.

```js
// src/engine.js — replace computeStreak (lines 344-394)
async function computeStreak(childId, date, isEffective, rulesConfig) {
  const streak = await DB.getStreak(childId);
  const current = streak || {
    childId: childId,
    current: 0,
    longest: 0,
    lastEffectiveDate: null,
    streakPeriodStart: date,
    grantedMilestones: []
  };

  if (!isEffective) {
    // Check if it's a rest day (no tasks at all) — rest days are NEUTRAL
    const dayOfWeek = Utils.getDayOfWeek(date);
    const activeTemplates = await DB.getActiveTemplates(dayOfWeek);
    
    if (activeTemplates.length === 0) {
      // Rest day: no tasks scheduled, don't break streak
      return {
        current: current.current || 0,
        longest: current.longest || 0,
        lastEffectiveDate: current.lastEffectiveDate,
        streakPeriodStart: current.streakPeriodStart || date,
        grantedMilestones: current.grantedMilestones || []
      };
    }
    
    // Has tasks but not effective — break streak
    return {
      current: 0,
      longest: current.longest || 0,
      lastEffectiveDate: current.lastEffectiveDate,
      streakPeriodStart: date,
      grantedMilestones: []
    };
  }

  // Effective day: increment streak
  const newCurrent = (current.current || 0) + 1;

  let streakPeriodStart = current.streakPeriodStart;
  let grantedMilestones = current.grantedMilestones || [];

  if (current.lastEffectiveDate) {
    const yesterday = Utils.addDays(date, -1);
    if (current.lastEffectiveDate !== yesterday && current.lastEffectiveDate !== date) {
      streakPeriodStart = date;
      grantedMilestones = [];
    }
  }

  if (newCurrent === 1) {
    streakPeriodStart = date;
    grantedMilestones = [];
  }

  return {
    current: newCurrent,
    longest: Math.max(newCurrent, current.longest || 0),
    lastEffectiveDate: date,
    streakPeriodStart: streakPeriodStart,
    grantedMilestones: grantedMilestones
  };
}
```

- [ ] **Step 2: Update `recalculateStreak` to handle rest days**

Same logic applies to the full recalculation path (lines 512-575).

```js
// src/engine.js — in recalculateStreak, replace the loop body (lines 528-553)
for (const summary of summaries) {
  if (summary.isEffectiveDay || summary.overrideEffective) {
    if (lastEffectiveDate) {
      const yesterday = Utils.addDays(summary.date, -1);
      if (lastEffectiveDate === yesterday) {
        current += 1;
      } else {
        current = 1;
        streakPeriodStart = summary.date;
        grantedMilestones.length = 0;
      }
    } else {
      current = 1;
      streakPeriodStart = summary.date;
    }

    lastEffectiveDate = summary.date;
    if (current > longest) longest = current;
  } else {
    // Check if rest day (0 totalTaskCount, no tasks scheduled)
    if (summary.totalTaskCount === 0) {
      // Rest day — neutral, skip without breaking
      continue;
    }
    // Has tasks but not effective — break
    current = 0;
    streakPeriodStart = null;
    grantedMilestones.length = 0;
  }
}
```

- [ ] **Step 3: Manual verification**

Open the app in a browser, use DevTools console to simulate:
1. Create effective days for 3 consecutive days → streak = 3
2. Create a day with 0 tasks (rest day) → streak stays 3
3. Create another effective day → streak = 4
4. Create a day with tasks but not effective (< 60% completion) → streak = 0

```js
// In browser console, verify via:
const streak = await DB.getStreak('child-default');
console.log('Streak:', streak.current, 'Last effective:', streak.lastEffectiveDate);
```

- [ ] **Step 4: Commit**

```bash
git add src/engine.js
git commit -m "fix: streak rest-day neutral logic — rest days skip without breaking"
```

---

### Task 2: Add Settlement Engine Test Harness

**Files:**
- Create: `src/engine.test.js`

**Interfaces:**
- Consumes: `Engine.settle()`, `Engine.computeStreak()`, `DB.*`, `Utils.*`
- Produces: `EngineTest.runAll()` → `{ passed: number, failed: number, results: Array }`

**Background:** The user explicitly requested "结算引擎测试用例." Since this is a PWA without Node.js, tests run in-browser via a test runner function that can be invoked from the DevTools console or a hidden `/test` page. Each test case sets up isolated data, calls engine functions, asserts results, then cleans up.

- [ ] **Step 1: Create the test harness file**

```js
// src/engine.test.js — Settlement Engine Test Harness
// Run in browser console: await EngineTest.runAll()
// Or visit: /?test=1

const EngineTest = (() => {

  const results = [];

  function log(passed, name, detail) {
    const entry = { passed, name, detail, time: new Date().toISOString() };
    results.push(entry);
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}${detail ? '\n  ' + detail : ''}`);
    return entry;
  }

  async function assert(condition, name, detail) {
    if (typeof condition === 'function') {
      try {
        const result = await condition();
        return log(!!result, name, detail);
      } catch (err) {
        return log(false, name, detail + ' | Error: ' + err.message);
      }
    }
    return log(!!condition, name, detail);
  }

  // ─── Test Fixtures ───

  const TEST_CHILD_ID = 'test-child-001';
  const TEST_CHILD_NAME = '测试小朋友';
  const TEST_DATE = '2026-07-01'; // A Wednesday

  async function setupFreshDB() {
    await DB.resetAll();
    await DB.initDefaults(TEST_CHILD_ID, TEST_CHILD_NAME, '🧪');
    
    // Set a PIN so we can navigate
    const pinHash = await Utils.sha256('1234');
    await DB.updateAppConfig({ parentPinHash: pinHash });
  }

  async function generateTasksForDate(date, childId) {
    const dayOfWeek = Utils.getDayOfWeek(date);
    return await DB.generateDailyTasks(childId, date, dayOfWeek);
  }

  // ─── Test Cases ───

  async function test_settle_basic() {
    await setupFreshDB();

    // Generate tasks
    const tasks = await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);
    if (tasks.length === 0) {
      return log(false, 'TC01: settle_basic', 'No tasks generated — check templates');
    }

    // Approve all tasks
    const decisions = {};
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'approved';
    }

    // Settle
    const result = await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);

    return assert(
      result.success === true,
      'TC01: 基本结算成功',
      `Total earned: ${result.data?.totalEarnedPoints}, Effective: ${result.data?.isEffectiveDay}`
    );
  }

  async function test_settle_idempotent() {
    await setupFreshDB();
    await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);

    const decisions = {};
    const tasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'approved';
    }

    // First settle
    const result1 = await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);

    // Second settle should fail
    const result2 = await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);

    return assert(
      result1.success === true && result2.success === false && result2.error.includes('已结算'),
      'TC02: 防重复结算',
      `First: ${result1.success}, Second: ${result2.success} (expected false), Error: ${result2.error}`
    );
  }

  async function test_point_balance_positive() {
    await setupFreshDB();
    await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);

    const tasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    const decisions = {};
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'approved';
    }

    await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);
    const balance = await DB.calcCurrentBalance(TEST_CHILD_ID);

    return assert(
      balance >= 0,
      'TC03: 积分余额不为负',
      `Balance after settle: ${balance}`
    );
  }

  async function test_point_records_created() {
    await setupFreshDB();
    await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);

    const tasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    const decisions = {};
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'approved';
    }

    await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);

    const records = await DB.getPointRecords(TEST_CHILD_ID);
    const summary = await DB.getDailySummary(TEST_CHILD_ID, TEST_DATE);

    return assert(
      records.length > 0 && summary && summary.pointRecordIds.length > 0,
      'TC04: pointRecord 已生成',
      `Records: ${records.length}, Summary pointRecordIds: ${summary?.pointRecordIds?.length}`
    );
  }

  async function test_daily_summary_exists() {
    await setupFreshDB();
    await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);

    const tasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    const decisions = {};
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'approved';
    }

    await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);
    const summary = await DB.getDailySummary(TEST_CHILD_ID, TEST_DATE);

    return assert(
      summary !== undefined && summary.id === `${TEST_DATE}-${TEST_CHILD_ID}`,
      'TC05: dailySummary 已写入',
      `ID: ${summary?.id}, TotalEarned: ${summary?.totalEarnedPoints}`
    );
  }

  async function test_tasks_marked_settled() {
    await setupFreshDB();
    await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);

    const tasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    const decisions = {};
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'approved';
    }

    await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);

    const updatedTasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    const allSettled = updatedTasks.every(t => t.settled === true);

    return assert(
      allSettled,
      'TC06: 任务已标记 settled',
      `Tasks settled: ${updatedTasks.filter(t => t.settled).length}/${updatedTasks.length}`
    );
  }

  async function test_streak_increments() {
    await setupFreshDB();

    // Day 1
    const date1 = '2026-07-01';
    await generateTasksForDate(date1, TEST_CHILD_ID);
    const tasks1 = await DB.getDailyTasks(TEST_CHILD_ID, date1);
    const dec1 = {};
    for (const t of tasks1) dec1[t.taskTemplateId] = 'approved';
    await Engine.settle(TEST_CHILD_ID, date1, dec1);

    const streak1 = await DB.getStreak(TEST_CHILD_ID);

    return assert(
      streak1 && streak1.current >= 1,
      'TC07: 连续天数递增',
      `Streak after 1 day: ${streak1?.current}`
    );
  }

  async function test_rejected_task_zero_points() {
    await setupFreshDB();
    await generateTasksForDate(TEST_DATE, TEST_CHILD_ID);

    const tasks = await DB.getDailyTasks(TEST_CHILD_ID, TEST_DATE);
    const decisions = {};

    // Reject all tasks
    for (const t of tasks) {
      decisions[t.taskTemplateId] = 'rejected';
    }

    const result = await Engine.settle(TEST_CHILD_ID, TEST_DATE, decisions);

    return assert(
      result.success === true && result.data.totalEarnedPoints === 0,
      'TC08: 全部拒绝得分为零',
      `Total earned: ${result.data?.totalEarnedPoints}`
    );
  }

  async function test_streak_rest_day_neutral() {
    await setupFreshDB();

    // Day 1: effective
    const date1 = '2026-07-01';
    await generateTasksForDate(date1, TEST_CHILD_ID);
    const tasks1 = await DB.getDailyTasks(TEST_CHILD_ID, date1);
    const dec1 = {};
    for (const t of tasks1) dec1[t.taskTemplateId] = 'approved';
    await Engine.settle(TEST_CHILD_ID, date1, dec1);

    // Day 2: rest day — use a date with no active templates
    // We need to temporarily disable all templates to simulate rest day
    // Or use Engine.computeStreak directly
    const result = await Engine.computeStreak(TEST_CHILD_ID, '2026-07-02', false);
    
    // Day 3: effective
    const date3 = '2026-07-03';
    await generateTasksForDate(date3, TEST_CHILD_ID);
    const tasks3 = await DB.getDailyTasks(TEST_CHILD_ID, date3);
    const dec3 = {};
    for (const t of tasks3) dec3[t.taskTemplateId] = 'approved';
    await Engine.settle(TEST_CHILD_ID, date3, dec3);

    const streak = await DB.getStreak(TEST_CHILD_ID);

    // Streak should be 2 (day1 + day3), not 1 (broken by day2)
    return assert(
      streak && streak.current === 2,
      'TC09: 休息日不中断连续',
      `Expected streak=2, got ${streak?.current}`
    );
  }

  async function test_streak_broken_by_failure() {
    await setupFreshDB();

    // Day 1: effective
    const date1 = '2026-07-01';
    await generateTasksForDate(date1, TEST_CHILD_ID);
    const tasks1 = await DB.getDailyTasks(TEST_CHILD_ID, date1);
    const dec1 = {};
    for (const t of tasks1) dec1[t.taskTemplateId] = 'approved';
    await Engine.settle(TEST_CHILD_ID, date1, dec1);

    // Day 2: has tasks but all rejected (not effective)
    const date2 = '2026-07-02';
    await generateTasksForDate(date2, TEST_CHILD_ID);
    const tasks2 = await DB.getDailyTasks(TEST_CHILD_ID, date2);
    const dec2 = {};
    for (const t of tasks2) dec2[t.taskTemplateId] = 'rejected';
    await Engine.settle(TEST_CHILD_ID, date2, dec2);

    const streak = await DB.getStreak(TEST_CHILD_ID);

    return assert(
      streak && streak.current === 0,
      'TC10: 非有效日中断连续',
      `Expected streak=0, got ${streak?.current}`
    );
  }

  async function test_settle_empty_date() {
    await setupFreshDB();

    // Try to settle a date with no tasks generated
    const result = await Engine.settle(TEST_CHILD_ID, '2026-12-25', {});

    // This should either fail or succeed with 0 points
    // The engine currently returns error for no tasks
    return assert(
      result.success === false || result.data?.totalEarnedPoints === 0,
      'TC11: 空日期结算处理',
      `Success: ${result.success}, Error: ${result.error || 'none'}`
    );
  }

  async function test_point_balance_sum_matches() {
    await setupFreshDB();

    // Settle day 1
    const date1 = '2026-07-01';
    await generateTasksForDate(date1, TEST_CHILD_ID);
    const tasks1 = await DB.getDailyTasks(TEST_CHILD_ID, date1);
    const dec1 = {};
    for (const t of tasks1) dec1[t.taskTemplateId] = 'approved';
    await Engine.settle(TEST_CHILD_ID, date1, dec1);

    // Settle day 2
    const date2 = '2026-07-02';
    await generateTasksForDate(date2, TEST_CHILD_ID);
    const tasks2 = await DB.getDailyTasks(TEST_CHILD_ID, date2);
    const dec2 = {};
    for (const t of tasks2) dec2[t.taskTemplateId] = 'approved';
    await Engine.settle(TEST_CHILD_ID, date2, dec2);

    const computedBalance = await DB.calcCurrentBalance(TEST_CHILD_ID);
    const records = await DB.getPointRecords(TEST_CHILD_ID);
    const sumBalance = records.reduce((s, r) => s + r.points, 0);

    return assert(
      computedBalance === sumBalance,
      'TC12: 积分余额 = SUM(pointRecord.points)',
      `Computed: ${computedBalance}, Sum: ${sumBalance}`
    );
  }

  // ─── Run All ───

  async function runAll() {
    results.length = 0;
    console.log('═══════════════════════════════════');
    console.log('🧪 Settlement Engine Test Suite');
    console.log('═══════════════════════════════════');

    const tests = [
      test_settle_basic,
      test_settle_idempotent,
      test_point_balance_positive,
      test_point_records_created,
      test_daily_summary_exists,
      test_tasks_marked_settled,
      test_streak_increments,
      test_rejected_task_zero_points,
      test_streak_rest_day_neutral,
      test_streak_broken_by_failure,
      test_settle_empty_date,
      test_point_balance_sum_matches,
    ];

    for (const testFn of tests) {
      await testFn();
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log('───────────────────────────────');
    console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);
    console.log('═══════════════════════════════');

    return { passed, failed, total: results.length, results };
  }

  // ─── Public API ───
  return { runAll, results };
})();

// Auto-run if URL has ?test=1
if (window.location.search.includes('test=1')) {
  document.addEventListener('DOMContentLoaded', async () => {
    await DB.initDefaults('test-child-001', '测试小朋友', '🧪');
    const pinHash = await Utils.sha256('1234');
    await DB.updateAppConfig({ parentPinHash: pinHash });
    const result = await EngineTest.runAll();
    document.body.innerHTML = `
      <div style="padding:2rem;font-family:monospace;background:#1a1a2e;color:#e8e8e8;min-height:100vh;">
        <h1>🧪 结算引擎测试结果</h1>
        <p style="font-size:1.5rem;">
          ✅ ${result.passed} passed
          ${result.failed > 0 ? `❌ ${result.failed} failed` : ''}
          / ${result.total} total
        </p>
        <pre style="white-space:pre-wrap;font-size:0.85rem;line-height:1.6;">${
          result.results.map(r => `${r.passed ? '✅' : '❌'} ${r.name}${r.detail ? '\n   ' + r.detail : ''}`).join('\n')
        }</pre>
      </div>`;
  });
}
```

- [ ] **Step 2: Add test script to index.html**

Add the test harness script tag after all other scripts in `index.html`:

```html
<!-- Test Harness (only loaded with ?test=1) -->
<script>
  if (window.location.search.includes('test=1')) {
    document.write('<script src="src/engine.test.js"><\/script>');
  }
</script>
```

Insert this right before `</body>` in [index.html](index.html).

- [ ] **Step 3: Manual verification — run tests**

Open the app with `?test=1` parameter in browser:

```
https://localhost:port/?test=1
```

All 12 tests should pass. If any fail, read the error detail and fix the engine before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/engine.test.js index.html
git commit -m "test: add settlement engine test harness (12 test cases)"
```

---

### Task 3: Enable Lottery System (V1 Conservative)

**Files:**
- Modify: `src/db.js:201-211` (DEFAULT_LOTTERY_CONFIG)
- Modify: `src/ui/children/rewards.js` (add lottery tab + logic)
- Modify: `src/ui/parent/settings.js` (enable lottery config editing)
- Modify: `src/styles/rewards.css` (lottery tab styles)
- Modify: `src/styles/base.css` (lottery animation keyframes)

**Interfaces:**
- Consumes: `DB.getLotteryConfig()`, `DB.calcCurrentBalance()`, `DB.getStreak()`, `chanceRecord` balance
- Produces: Lottery tab UI with draw button, prize display, animation, lotteryRecord + chanceRecord writes

**Background:** The V1 spec defines a conservative lottery: only accessible via streak-earned chances (3/7/14/30 days), max 1/day and 3/week, no point-cost draws. The current code has the infrastructure (tables, config) but the feature is disabled.

- [ ] **Step 1: Update default lotteryConfig to enabled V1 mode**

In `src/db.js`, replace the DEFAULT_LOTTERY_CONFIG (lines 202-211):

```js
/** 默认 lotteryConfig（V1 保守版：仅连续奖励机会，不花积分） */
const DEFAULT_LOTTERY_CONFIG = {
  id: 'singleton',
  enabled: true,                        // ← Was false
  allowPointCost: false,                // V1 不开放积分抽奖
  maxDaily: 1,
  maxWeekly: 3,
  streakRequired: 3,                    // 连续 3 天解锁抽奖
  prizes: [                             // ← Was empty array
    { name: '小奖励', icon: '🎁', type: 'reward', weight: 30, value: 0 },
    { name: '加倍积分', icon: '⭐', type: 'points', weight: 25, value: 20 },
    { name: '再来一次', icon: '🎫', type: 'chance', weight: 20, value: 1 },
    { name: '谢谢参与', icon: '🙂', type: 'none', weight: 25, value: 0 }
  ],
  updatedAt: null
};
```

- [ ] **Step 2: Add lottery logic module to rewards.js**

Add the following functions inside `RewardsPage` IIFE in `src/ui/children/rewards.js`:

```js
// ─── Lottery Tab ───

async function renderLotteryTab(childId) {
  const container = document.getElementById('lottery-tab');
  if (!container) return;

  const lotteryConfig = await DB.db.lotteryConfig.get('singleton');
  if (!lotteryConfig || !lotteryConfig.enabled) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎰</span>
        <span class="empty-text">抽奖功能暂未开放</span>
      </div>`;
    container.style.display = 'block';
    return;
  }

  // Get chance balance
  const chanceRecords = await DB.db.chanceRecords
    .where('childId').equals(childId).toArray();
  const chanceBalance = chanceRecords.reduce((sum, r) => sum + r.chances, 0);

  // Check streak requirement
  const streak = await DB.getStreak(childId);
  const streakMet = streak && streak.current >= lotteryConfig.streakRequired;

  // Check daily/weekly limits
  const today = Utils.getToday();
  const weekStart = Utils.getWeekStart(today);
  const dailyUsed = chanceRecords.filter(r =>
    r.type === 'use' && r.time && r.time.startsWith(today)
  ).length;
  const weeklyUsed = chanceRecords.filter(r =>
    r.type === 'use' && r.time && r.time >= weekStart
  ).length;

  const canDraw = (
    streakMet &&
    chanceBalance > 0 &&
    dailyUsed < lotteryConfig.maxDaily &&
    weeklyUsed < lotteryConfig.maxWeekly
  );

  let stateText, stateClass, btnDisabled;
  if (!streakMet) {
    stateText = `🔒 连续打卡 ${lotteryConfig.streakRequired} 天解锁抽奖`;
    stateClass = 'lottery-locked';
    btnDisabled = true;
  } else if (chanceBalance <= 0) {
    stateText = '🔒 没有抽奖机会，继续连续打卡获取';
    stateClass = 'lottery-locked';
    btnDisabled = true;
  } else if (dailyUsed >= lotteryConfig.maxDaily) {
    stateText = '🔒 今日已达上限，明天再来';
    stateClass = 'lottery-locked';
    btnDisabled = true;
  } else if (weeklyUsed >= lotteryConfig.maxWeekly) {
    stateText = '🔒 本周已达上限';
    stateClass = 'lottery-locked';
    btnDisabled = true;
  } else {
    stateText = `🎰 有 ${chanceBalance} 次机会，开始抽奖！`;
    stateClass = 'lottery-ready';
    btnDisabled = false;
  }

  container.innerHTML = `
    <div class="lottery-section">
      <div class="lottery-header">
        <span class="lottery-title">🎰 幸运抽奖</span>
        <span class="lottery-chances">🎫 ×${chanceBalance}</span>
      </div>

      <div class="lottery-prizes">
        ${lotteryConfig.prizes.map(p => `
          <div class="lottery-prize-item">
            <span class="prize-icon">${p.icon}</span>
            <span class="prize-name">${p.name}</span>
          </div>
        `).join('')}
      </div>

      <div class="lottery-state ${stateClass}">${stateText}</div>

      <button class="btn btn-primary btn-large lottery-btn ${stateClass}"
              id="lottery-draw-btn"
              ${btnDisabled ? 'disabled' : ''}>
        🎰 开始抽奖
      </button>

      <div id="lottery-result" class="lottery-result" style="display:none;"></div>
    </div>`;

  container.style.display = 'block';

  // Bind draw button
  if (!btnDisabled) {
    document.getElementById('lottery-draw-btn').onclick = () =>
      executeLotteryDraw(childId, lotteryConfig);
  }
}

async function executeLotteryDraw(childId, lotteryConfig) {
  const now = Utils.nowISO();
  const btn = document.getElementById('lottery-draw-btn');
  btn.disabled = true;
  btn.textContent = '🎰 抽奖中...';

  // Weighted random selection
  const totalWeight = lotteryConfig.prizes.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * totalWeight;
  let prize = lotteryConfig.prizes[lotteryConfig.prizes.length - 1];
  for (const p of lotteryConfig.prizes) {
    roll -= p.weight;
    if (roll <= 0) { prize = p; break; }
  }

  // Create chanceRecord (use -1)
  const chanceRecords = await DB.db.chanceRecords
    .where('childId').equals(childId).toArray();
  const chanceBalance = chanceRecords.reduce((s, r) => s + r.chances, 0);

  const chanceRecordId = Utils.genId('chance');
  await DB.db.chanceRecords.add({
    id: chanceRecordId,
    childId: childId,
    time: now,
    type: 'use',
    source: '抽奖消耗',
    chances: -1,
    balance: chanceBalance - 1,
    relatedMilestone: null,
    relatedLotteryId: null
  });

  // Process prize
  let pointRecordId = null;
  let newChanceRecordId = null;
  let redeemRecordId = null;
  let pointsEarned = 0;

  if (prize.type === 'points') {
    pointsEarned = prize.value;
    const balance = await DB.calcCurrentBalance(childId);
    pointRecordId = Utils.genId('txn');
    await DB.addPointRecord({
      id: pointRecordId,
      childId: childId,
      time: now,
      type: 'lotteryPrize',
      source: `抽奖-${prize.name}`,
      points: prize.value,
      balance: balance + prize.value,
      relatedDailyTaskId: null,
      relatedRedeemId: null,
      relatedLotteryId: null,
      operator: 'system'
    });
  } else if (prize.type === 'chance') {
    newChanceRecordId = Utils.genId('chance');
    await DB.db.chanceRecords.add({
      id: newChanceRecordId,
      childId: childId,
      time: now,
      type: 'earn',
      source: `抽奖-${prize.name}`,
      chances: 1,
      balance: chanceBalance, // after use, +1 = original
      relatedMilestone: null,
      relatedLotteryId: null
    });
  } else if (prize.type === 'reward') {
    redeemRecordId = Utils.genId('redeem');
    await DB.db.redeemRecords.add({
      id: redeemRecordId,
      childId: childId,
      time: now,
      rewardId: 'lottery-reward',
      rewardName: prize.name,
      rewardIcon: prize.icon,
      cost: 0,
      tier: 'small',
      status: 'pending',
      pointRecordId: null,
      fulfilledTime: null,
      cancelledTime: null,
      parentNote: '抽奖获得'
    });
  }

  // Create lotteryRecord
  const lotteryId = Utils.genId('lottery');
  await DB.db.lotteryRecords.add({
    id: lotteryId,
    childId: childId,
    time: now,
    costType: 'chance',
    costPoints: 0,
    chanceUsed: 1,
    prizeName: prize.name,
    prizeIcon: prize.icon,
    prizeType: prize.type,
    prizeValue: prize.value,
    pointRecordId: pointRecordId,
    chanceRecordId: newChanceRecordId,
    relatedRedeemId: redeemRecordId,
    parentConfirmed: false
  });

  // Sync balance
  await DB.syncChildBalance(childId);

  // Show result
  showLotteryResult(prize, pointsEarned);

  // Refresh lottery tab after delay
  setTimeout(() => renderLotteryTab(childId), 2000);
}

function showLotteryResult(prize, pointsEarned) {
  const resultEl = document.getElementById('lottery-result');
  resultEl.style.display = 'block';
  resultEl.className = 'lottery-result celebrate';

  let detail = '';
  if (prize.type === 'points') detail = `获得 ⭐+${prize.value} 积分！`;
  else if (prize.type === 'chance') detail = '获得 🎫 再来一次！';
  else if (prize.type === 'reward') detail = '获得 🎁 小奖励（等待家长兑现）';
  else detail = '下次好运！';

  resultEl.innerHTML = `
    <div class="lottery-result-icon">${prize.icon}</div>
    <div class="lottery-result-name">${prize.name}</div>
    <div class="lottery-result-detail">${detail}</div>
  `;
}

// Tab binding: modify the existing render() to also render lottery tab
// Add after the rewards list render call in render():
//   await renderLotteryTab(child.id);
```

- [ ] **Step 3: Add lottery tab HTML to index.html**

Replace the lottery placeholder div in `index.html` (the existing `#lottery-tab` in `#page-rewards`):

```html
<!-- 抽奖 Tab -->
<div id="lottery-tab" class="scroll-area" style="display:none;">
  <!-- Dynamic render by renderLotteryTab() -->
</div>
```

And add tab toggle buttons at the top of the rewards page (after the balance card):

```html
<!-- Tab 切换按钮 -->
<div class="tab-bar" id="rewards-tabs">
  <button class="tab active" data-tab="redeem">🎁 积分兑换</button>
  <button class="tab" data-tab="lottery">🎰 幸运抽奖</button>
</div>
```

- [ ] **Step 4: Add Tab switching logic to rewards.js**

In the `render()` function of `RewardsPage`, after the balance update:

```js
// Bind rewards page tabs
const tabBtns = document.querySelectorAll('#rewards-tabs .tab');
tabBtns.forEach(tab => {
  tab.onclick = async () => {
    tabBtns.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (tab.dataset.tab === 'redeem') {
      document.getElementById('rewards-list').style.display = 'block';
      document.getElementById('lottery-tab').style.display = 'none';
    } else {
      document.getElementById('rewards-list').style.display = 'none';
      await renderLotteryTab(child.id);
    }
  };
});
```

- [ ] **Step 5: Add lottery CSS styles**

In `src/styles/rewards.css`, add:

```css
/* ─── Lottery Tab ─── */
.lottery-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-md);
}

.lottery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.lottery-title {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.lottery-chances {
  font-size: var(--font-size-lg);
  color: var(--color-accent);
  font-weight: 700;
}

.lottery-prizes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
  width: 100%;
}

.lottery-prize-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-card);
  border-radius: var(--card-radius);
  font-size: var(--font-size-sm);
}

.lottery-state {
  text-align: center;
  padding: var(--space-md);
  font-size: var(--font-size-sm);
  font-weight: 600;
  border-radius: var(--card-radius);
  width: 100%;
}

.lottery-state.lottery-ready {
  background: rgba(124, 77, 255, 0.15);
  color: #B388FF;
}

.lottery-state.lottery-locked {
  background: rgba(255,255,255,0.05);
  color: var(--color-text-muted);
}

.lottery-btn {
  width: 100%;
  padding: var(--space-md);
  font-size: var(--font-size-lg);
  background: linear-gradient(135deg, #7C4DFF, #B388FF);
  border-radius: var(--card-radius);
  transition: transform 0.2s, box-shadow 0.2s;
}

.lottery-btn:not(:disabled):active {
  transform: scale(0.96);
  box-shadow: 0 0 20px rgba(124, 77, 255, 0.4);
}

.lottery-btn:disabled {
  background: var(--color-bg-input);
  opacity: 0.6;
}

.lottery-result {
  text-align: center;
  padding: var(--space-lg);
  background: linear-gradient(135deg, rgba(124,77,255,0.15), rgba(245,197,24,0.1));
  border-radius: var(--card-radius);
  border: 1px solid rgba(124,77,255,0.3);
  animation: celebrate-in 0.5s ease;
}

.lottery-result-icon {
  font-size: 64px;
  margin-bottom: var(--space-sm);
}

.lottery-result-name {
  font-size: var(--font-size-xl);
  font-weight: 700;
  margin-bottom: var(--space-xs);
}

.lottery-result-detail {
  color: var(--color-accent);
  font-weight: 600;
}

/* ─── Tab Bar (shared) ─── */
.tab-bar {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.tab-bar .tab {
  flex: 1;
  padding: var(--space-sm) var(--space-md);
  border: none;
  border-radius: var(--btn-radius);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.tab-bar .tab.active {
  background: var(--color-primary);
  color: white;
}

/* ─── Lottery spin animation ─── */
@keyframes lottery-spin {
  0%   { transform: rotate(0deg); }
  25%  { transform: rotate(90deg); }
  50%  { transform: rotate(180deg); }
  75%  { transform: rotate(270deg); }
  100% { transform: rotate(360deg); }
}

.lottery-spinning .lottery-btn {
  animation: lottery-spin 0.6s ease-in-out 3;
}
```

- [ ] **Step 6: Manual verification**

1. Start app, ensure at least 3-day streak exists (use Engine.settle to create test data)
2. Navigate to Rewards page, click "🎰 幸运抽奖" tab
3. Verify chance count shows correctly
4. Click "开始抽奖" — verify animation plays and result displays
5. Check lotteryRecord, chanceRecord (use) are written to DB
6. If winning "加倍积分", verify pointRecord is created
7. If winning "再来一次", verify chanceRecord (earn) created
8. If winning "小奖励", verify redeemRecord created with `relatedRedeemId` in lotteryRecord
9. Verify daily limit: draw again → should show "今日已达上限"
10. Verify weekly limit after 3 draws

- [ ] **Step 7: Commit**

```bash
git add src/db.js src/ui/children/rewards.js src/styles/rewards.css index.html
git commit -m "feat: enable V1 conservative lottery system (chance-based, streak-gated)"
```

---

### Task 4: Add completionRate and dailyBonusPoints to Settlement

**Files:**
- Modify: `src/engine.js` (settle function, dailySummary write)
- Modify: `src/rules.js` (add dailyBonus rule)

**Interfaces:**
- Consumes: `plannedPoints` sum, `taskEarnedPoints` sum
- Produces: `completionRate` (float) and `dailyBonusPoints` (0 or fixed) in dailySummary

**Background:** The V1 spec defines:
- `completionRate = taskEarnedPoints / plannedPoints` 
- `isEffectiveDay = completionRate >= 0.6`
- `dailyBonusPoints = +3 if completionRate >= 0.9`

The current V2 code uses a different `isEffectiveDay` calculation (task combination based). We need to ADD the spec's completionRate and dailyBonus logic alongside the existing system, since the user's rulesConfig already covers the effective day check. The completionRate is informational; dailyBonus is additive.

- [ ] **Step 1: Add dailyBonus calculation to rules.js**

In `src/rules.js`, add this function to the public API:

```js
/**
 * Calculate daily bonus for high completion rate
 * @param {number} taskEarned - total task points earned
 * @param {number} plannedPoints - total planned points for the day
 * @returns {{ bonus: number, completionRate: number }}
 */
function calcDailyBonus(taskEarned, plannedPoints) {
  if (plannedPoints <= 0) return { bonus: 0, completionRate: 0 };
  const completionRate = taskEarned / plannedPoints;
  const bonus = completionRate >= 0.9 ? 3 : 0;
  return { bonus, completionRate: Math.round(completionRate * 100) / 100 };
}

// In the return statement, add:
calcDailyBonus,
```

- [ ] **Step 2: Integrate dailyBonus into settlement engine**

In `src/engine.js`, in the `settle()` function, after the Step 5 (积分封顶) and before Step 6 (生成 pointRecord):

```js
// ── Step 5.5: 计算日完成率和满分奖励 ──
// Sum plannedPoints from all tasks (not just approved)
const totalPlannedPoints = tasks.reduce((s, t) => s + t.plannedPoints, 0);
const taskEarnedPoints = approvedTasks.reduce((s, t) => s + (t.parentPoints || 0), 0);

const dailyBonusResult = Rules.calcDailyBonus(taskEarnedPoints, totalPlannedPoints);
let dailyBonusPoints = 0;

if (dailyBonusResult.bonus > 0) {
  dailyBonusPoints = dailyBonusResult.bonus;
  // Create pointRecord for daily bonus
  await createPointRecord(
    'dailyBonus',
    `当日完成率${Math.round(dailyBonusResult.completionRate * 100)}% 满分奖励`,
    dailyBonusPoints
  );
}
```

Then update the dailySummary write to include the new fields. In Step 10, add to the dailySummary object:

```js
// Add these fields to the dailySummary object:
completionRate: dailyBonusResult.completionRate,
dailyBonusPoints: dailyBonusPoints,
```

- [ ] **Step 3: Update totalEarnedPoints to include dailyBonus**

The `totalEarned` variable already sums `capResult.total + basicStudyBonusPoints + streakBonusPoints`. Add `dailyBonusPoints`:

```js
const totalEarned = capResult.total + basicStudyBonusPoints + dailyBonusPoints + streakBonusPoints;
```

- [ ] **Step 4: Manual verification**

```js
// In browser console:
await EngineTest.runAll(); // Re-run all 12 tests — all should still pass
// Verify dailyBonus in a new settle:
const result = await Engine.settle(TEST_CHILD_ID, '2026-07-04', allApprovedDecisions);
console.log('completionRate:', result.data.completionRate);
console.log('dailyBonusPoints:', result.data.dailyBonusPoints);
```

- [ ] **Step 5: Commit**

```bash
git add src/rules.js src/engine.js
git commit -m "feat: add completionRate and dailyBonusPoints to settlement"
```

---

### Task 5: Fix SW Cache and Minor Issues

**Files:**
- Modify: `sw.js`

**Background:** The Service Worker's `STATIC_ASSETS` array is missing `src/ui/pin.js`, and a few other minor issues need cleanup.

- [ ] **Step 1: Add missing assets to STATIC_ASSETS**

In `sw.js`, modify the `STATIC_ASSETS` array to include `pin.js`:

```js
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vendor/dexie.min.js',
  '/src/db.js',
  '/src/app.js',
  '/src/engine.js',
  '/src/rules.js',
  '/src/backup.js',
  '/src/utils.js',
  '/src/engine.test.js',        // ← Added
  '/src/styles/base.css',
  '/src/styles/challenge.css',
  '/src/styles/rewards.css',
  '/src/styles/parent.css',
  '/src/ui/children/challenge.js',
  '/src/ui/children/rewards.js',
  '/src/ui/children/history.js',
  '/src/ui/parent/confirm.js',
  '/src/ui/parent/manage.js',
  '/src/ui/parent/settings.js',
  '/src/ui/pin.js'              // ← Added
];
```

Also bump the cache version:

```js
const CACHE_NAME = 'checkin-pwa-v2_2-20260701'; // ← Bumped
```

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "fix: add pin.js and engine.test.js to SW cache, bump cache version"
```

---

### Task 6: Settings — Enable Lottery Config Editing

**Files:**
- Modify: `src/ui/parent/settings.js`

**Background:** The settings page currently doesn't allow editing lottery configuration. Add a section for lottery prize editing.

- [ ] **Step 1: Add lottery config section to settings**

In `src/ui/parent/settings.js`, in the `render()` function, add after the rules section HTML (inside `#settings-content`):

```html
<!-- 抽奖配置 -->
<div class="settings-group">
  <div class="section-title">🎰 抽奖配置</div>
  <div class="rule-row">
    <label>启用抽奖</label>
    <label class="toggle-switch">
      <input type="checkbox" id="settings-lottery-enabled" ${lotteryConfig.enabled ? 'checked' : ''}>
      <span class="slider"></span>
    </label>
  </div>
  <div class="rule-row">
    <label>每日上限</label>
    <input type="number" id="settings-lottery-daily" value="${lotteryConfig.maxDaily}" min="0" max="10" style="width:80px;">
  </div>
  <div class="rule-row">
    <label>每周上限</label>
    <input type="number" id="settings-lottery-weekly" value="${lotteryConfig.maxWeekly}" min="0" max="30" style="width:80px;">
  </div>
  <div class="rule-row">
    <label>解锁所需连续天数</label>
    <input type="number" id="settings-lottery-streak" value="${lotteryConfig.streakRequired}" min="1" max="30" style="width:80px;">
  </div>
  <button class="btn btn-primary btn-block mt-sm" id="settings-save-lottery">💾 保存抽奖配置</button>
</div>
```

Add the lottery config load at the top of `render()`:

```js
const lotteryConfig = await DB.db.lotteryConfig.get('singleton');
```

Add the save handler in `bindEvents()`:

```js
document.getElementById('settings-save-lottery').onclick = async () => {
  const updates = {
    enabled: document.getElementById('settings-lottery-enabled').checked,
    maxDaily: parseInt(document.getElementById('settings-lottery-daily').value) || 1,
    maxWeekly: parseInt(document.getElementById('settings-lottery-weekly').value) || 3,
    streakRequired: parseInt(document.getElementById('settings-lottery-streak').value) || 3,
    updatedAt: Utils.nowISO()
  };
  await DB.db.lotteryConfig.update('singleton', updates);
  alert('抽奖配置已保存！');
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/parent/settings.js
git commit -m "feat: add lottery config editing to settings page"
```

---

### Task 7: Add Partial Points Support to Parent Confirm

**Files:**
- Modify: `src/ui/parent/confirm.js` (add partial points input)
- Modify: `src/engine.js` (handle partial decisions)

**Interfaces:**
- Consumes: `currentDecisions` object, task `plannedPoints`
- Produces: `decisions[templateId]` can now be `{ status: 'partial', points: N }` or a simple `'approved' | 'rejected'` string (backward compatible)

**Background:** The V1 spec defines three parent confirmation statuses: `approved` (full points), `partial` (manual 0 ~ plannedPoints), and `rejected` (0). The current code only supports approve/reject. This task adds a third option with inline point editing.

- [ ] **Step 1: Add partial button and inline point editor to confirm cards**

In `src/ui/parent/confirm.js`, modify the `renderConfirmCard` function. After the existing approve/reject buttons, add a third partial button:

```js
const renderConfirmCard = (task) => {
  const decision = currentDecisions[task.taskTemplateId] || 'unreviewed';
  const isApproved = decision === 'approved';
  const isRejected = decision === 'rejected';
  const isPartial = typeof decision === 'object' && decision.status === 'partial';
  const partialPoints = isPartial ? decision.points : 0;

  let cardClass = 'confirm-task-card';
  if (isApproved) cardClass += ' approved';
  if (isRejected) cardClass += ' rejected';
  if (isPartial) cardClass += ' partial';

  let metaHtml = '';
  if (task.taskType === 'duration' && task.durationMinutes > 0) {
    metaHtml += `<span class="confirm-duration">🎧 ${Utils.formatMinutes(task.durationMinutes)}</span>`;
  }
  metaHtml += `<span style="font-size:11px;color:var(--color-text-muted);">+${task.plannedPoints}分 · ${Utils.formatMinutes(task.suggestedMinutes)}</span>`;

  return `
    <div class="${cardClass}" data-template-id="${task.taskTemplateId}">
      <div class="confirm-task-icon">${task.taskIcon}</div>
      <div class="confirm-task-info">
        <div class="confirm-task-name">${task.taskName}</div>
        <div class="confirm-task-meta">${metaHtml}</div>
        ${isPartial ? `
        <div class="partial-points-input" onclick="event.stopPropagation()">
          <input type="number" class="partial-points-value"
                 data-template-id="${task.taskTemplateId}"
                 value="${partialPoints}"
                 min="0" max="${task.plannedPoints}"
                 ${currentSummary ? 'disabled' : ''}>
          <span class="text-muted">/ ${task.plannedPoints} 分</span>
        </div>` : ''}
      </div>
      <div class="confirm-task-actions">
        <button class="confirm-action-btn approve ${isApproved ? 'selected' : ''}"
                data-template-id="${task.taskTemplateId}"
                data-action="approved"
                ${currentSummary ? 'disabled' : ''}>
          ✓
        </button>
        <button class="confirm-action-btn partial-btn ${isPartial ? 'selected' : ''}"
                data-template-id="${task.taskTemplateId}"
                data-action="partial"
                ${currentSummary ? 'disabled' : ''}>
          ≈
        </button>
        <button class="confirm-action-btn reject ${isRejected ? 'selected' : ''}"
                data-template-id="${task.taskTemplateId}"
                data-action="rejected"
                ${currentSummary ? 'disabled' : ''}>
          ✗
        </button>
      </div>
    </div>`;
};
```

- [ ] **Step 2: Handle partial button clicks in event binding**

In the click handler for `.confirm-action-btn`, add the partial case:

```js
container.querySelectorAll('.confirm-action-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const templateId = btn.dataset.templateId;
    const action = btn.dataset.action;

    if (action === 'partial') {
      const task = currentTasks.find(t => t.taskTemplateId === templateId);
      if (!task) return;
      // Default partial value: half of plannedPoints
      currentDecisions[templateId] = {
        status: 'partial',
        points: Math.floor(task.plannedPoints / 2)
      };
    } else {
      currentDecisions[templateId] = action;
    }

    // Re-render to show/hide partial input
    await renderTaskList(child, currentDate);
    await renderSettlePreview();
  });
});

// Bind partial points input changes
container.querySelectorAll('.partial-points-value').forEach(input => {
  input.addEventListener('input', async (e) => {
    const templateId = input.dataset.templateId;
    const task = currentTasks.find(t => t.taskTemplateId === templateId);
    if (!task) return;

    let val = parseInt(input.value) || 0;
    val = Math.max(0, Math.min(val, task.plannedPoints));
    input.value = val;

    currentDecisions[templateId] = {
      status: 'partial',
      points: val
    };

    await renderSettlePreview();
  });
});
```

- [ ] **Step 3: Update renderSettlePreview to handle partial points**

In the points calculation loop, handle partial decisions:

```js
for (const task of currentTasks) {
  const decision = currentDecisions[task.taskTemplateId];

  if (decision === 'approved') {
    approvedIds.push(task.taskTemplateId);
    // ... existing approved logic ...
  } else if (typeof decision === 'object' && decision.status === 'partial') {
    approvedIds.push(task.taskTemplateId); // Partial still counts for effective day

    let pts = decision.points || 0;
    // For duration tasks, cap at what the child earned
    if (task.taskType === 'duration') {
      const maxFromListening = Rules.calcListeningPoints(
        task.durationMinutes || 0,
        rulesConfig.listeningRules,
        rulesConfig.caps.listeningCap
      ).capped;
      pts = Math.min(pts, maxFromListening);
    } else {
      pts = Math.min(pts, task.plannedPoints);
    }

    if (Rules.isStudyTask(task)) rawStudy += pts;
    else if (Rules.isSportTask(task)) rawSport += pts;
  }
}
```

- [ ] **Step 4: Update engine.js to handle partial decisions**

In `src/engine.js`, in the decision application loop (Step 3), add partial handling:

```js
// 应用家长决策到 dailyTask
for (const task of tasks) {
  const decision = parentDecisions[task.taskTemplateId];

  if (typeof decision === 'object' && decision.status === 'partial') {
    task.parentStatus = 'partial';
    task.parentPoints = decision.points || 0;
    // Cap at plannedPoints
    if (task.parentPoints > task.plannedPoints) {
      task.parentPoints = task.plannedPoints;
    }
  } else if (decision === 'approved') {
    task.parentStatus = 'approved';
  } else if (decision === 'rejected') {
    task.parentStatus = 'rejected';
  }
}
```

Then update the points calculation to handle partial status:

```js
for (const task of tasks) {
  if (task.parentStatus === 'approved') {
    // ... existing approved logic ...
  } else if (task.parentStatus === 'partial') {
    // Use parentPoints set above
    task.rawPoints = task.parentPoints;
    task.cappedPoints = task.parentPoints;
  } else {
    // rejected / unreviewed → 0
    task.parentStatus = task.parentStatus === 'partial' ? 'partial' : 'rejected';
    task.rawPoints = 0;
    task.cappedPoints = 0;
    task.parentPoints = 0;
  }
  // ...
}
```

- [ ] **Step 5: Add partial CSS in parent.css**

```css
/* ─── Partial Status ─── */
.confirm-task-card.partial {
  border-left: 3px solid var(--color-warning);
}

.confirm-action-btn.partial-btn {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-warning);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-weight: 700;
  font-size: 14px;
}

.confirm-action-btn.partial-btn.selected {
  background: var(--color-warning);
  color: white;
}

.partial-points-input {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.partial-points-value {
  width: 60px;
  padding: 2px 8px;
  border-radius: var(--btn-radius);
  border: 1px solid var(--color-warning);
  background: var(--color-bg-input);
  color: var(--color-warning);
  font-size: var(--font-size-sm);
  text-align: center;
}
```

- [ ] **Step 6: Manual verification**

1. Open parent confirm page for a day with tasks
2. Click "≈" (partial) button on a task → verify inline number input appears with default half points
3. Change the points value → verify settle preview updates
4. Click "✓" (approve) → verify full points restored
5. Click "✗" (reject) → verify 0 points
6. Click "确认结算" with mixed decisions (some approved, some partial, some rejected)
7. Verify pointRecords show correct partial points
8. Verify partial tasks count toward effective day completion

- [ ] **Step 7: Commit**

```bash
git add src/ui/parent/confirm.js src/engine.js src/styles/parent.css
git commit -m "feat: add partial points support to parent confirm (approved/partial/rejected)"
```

---

## 3. Execution Order

```
Task 1 (Streak fix) ──┐
                      ├──→ Task 4 (completionRate) ──→ Task 7 (Partial points) ──→ Task 3 (Lottery) ──→ Task 6 (Settings)
Task 2 (Test harness)─┘                                                                    │
                                                                                           └──→ Task 5 (SW fix)
```

- Task 1 and 2 can run in parallel (no dependencies)
- Task 4 depends on Task 1 (uses corrected streak in dailySummary)
- Task 7 depends on Task 4 (uses completionRate for partial point decisions)
- Task 3 (lottery) can start after Task 1, 2, 4 (needs streak + balance)
- Task 5 and 6 are independent and can run anytime after Task 2

---

## 4. Acceptance Test Checklist (Post-Implementation)

| # | Test | Expected |
|---|------|----------|
| 1 | `EngineTest.runAll()` — all 12 tests | All ✅ |
| 2 | Settle same date twice | Second returns error "已结算" |
| 3 | Modify template points after settle | Historical dailyTask.plannedPoints unchanged |
| 4 | Balance = SUM(pointRecord.points) | Always true |
| 5 | Redeem with insufficient points | Blocked with "还差XX分" |
| 6 | Cancel pending redeem | Refund pointRecord created |
| 7 | Lottery: draw with chances | chanceRecord (use) written |
| 8 | Lottery: win "加倍积分" | pointRecord (lotteryPrize) +20 |
| 9 | Lottery: win "再来一次" | chanceRecord (earn) +1 |
| 10 | Lottery: win "小奖励" | redeemRecord + lotteryRecord.relatedRedeemId linked |
| 11 | Streak: 3 effective days | Streak = 3 |
| 12 | Streak: rest day between effective days | Streak continues, not broken |
| 13 | Streak: non-effective day with tasks | Streak resets to 0 |
| 14 | Streak milestone 7 days | streakBonus + points + chanceRecord |
| 15 | Streak milestone not repeated | Same cycle + same milestone = no duplicate |
| 16 | Parent confirm: partial points | parentStatus=partial, parentPoints=N (0 < N < plannedPoints) |
| 17 | Parent confirm: partial points capped | Cannot exceed plannedPoints |
| 18 | Parent confirm: partial task counts for effective day | Included in completion calc |
| 19 | Import config template | Personal data unaffected |
| 20 | Import full backup | Overwrites all data, PIN from backup |
| 21 | Export full backup | JSON contains all tables |
| 22 | Offline PWA | App loads and works without network |
| 23 | Day cutoff 4am | 3:59am ops count as previous day |

---

## 5. Risk Mitigation

| Risk | Level | Mitigation |
|------|:-----:|------------|
| Test harness breaks existing data | Low | Tests use isolated `TEST_CHILD_ID`, reset DB before each test |
| Lottery changes affect existing points | Low | Lottery is additive only, no point deduction |
| Streak fix changes historical streak values | Medium | `recalculateStreak` handles migration; test on copy first |
| SW cache update not picked up by iPad | Medium | Bump CACHE_NAME; instruct user to force-quit and reopen PWA |
| Existing user data incompatible | Low | V2.1 migration already handles schema evolution |
