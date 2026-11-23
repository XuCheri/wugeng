#!/usr/bin/env node
// Requirement-Driven 4-Tier Opaque-Box E2E Test Runner for 《五更天》 (`XuCheri/wugeng`)
// Usage:
//   node e2e/run-all.mjs
//   node e2e/run-all.mjs --tier <1|2|3|4>
//   node e2e/run-all.mjs --feature <F1..F13>
//   node e2e/run-all.mjs --json

import { createRequire } from 'node:module';
import path from 'node:path';
import { FEATURE_IDS, FEATURE_TITLES } from './suite/contracts.mjs';
import {
  CHROME_EXECUTABLE,
  ROOT,
  attachWarmSlotToBrowser,
  cleanupScratch,
  createWarmWorkerSlot,
  startStaticServer,
} from './suite/harness.mjs';
import { TIER1_TESTS } from './suite/tier1-features.mjs';
import { TIER2_TESTS } from './suite/tier2-boundaries.mjs';
import { TIER3_TESTS } from './suite/tier3-combinations.mjs';
import { TIER4_TESTS } from './suite/tier4-scenarios.mjs';

const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');

const ALL_TESTS = [
  ...TIER1_TESTS,
  ...TIER2_TESTS,
  ...TIER3_TESTS,
  ...TIER4_TESTS,
];

const TIER_LABELS = {
  1: 'Tier 1 — Feature Happy-Path Coverage',
  2: 'Tier 2 — Boundary, Edge & Negative Cases',
  3: 'Tier 3 — Cross-Feature Combinations',
  4: 'Tier 4 — Real-World End-User Scenarios',
};

function parseCliArgs(argv) {
  let tier = null;
  let feature = null;
  let json = false;
  let concurrency = Math.max(1, Math.min(12, Number(process.env.E2E_JOBS || 3) || 3));

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node e2e/run-all.mjs [--tier 1|2|3|4] [--feature F1..F13] [--jobs N] [--json]',
      );
      process.exit(0);
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--tier' || arg.startsWith('--tier=')) {
      const val = arg.includes('=') ? arg.slice('--tier='.length) : argv[++i];
      if (!val || !['1', '2', '3', '4'].includes(val)) {
        console.error(`Invalid --tier value '${val ?? ''}'. Expected one of: 1, 2, 3, 4.`);
        process.exit(2);
      }
      tier = Number(val);
    } else if (arg === '--feature' || arg.startsWith('--feature=')) {
      const rawVal = arg.includes('=') ? arg.slice('--feature='.length) : argv[++i];
      const norm = (rawVal || '').toUpperCase();
      if (!FEATURE_IDS.includes(norm)) {
        console.error(`Invalid --feature value '${rawVal ?? ''}'. Expected one of: ${FEATURE_IDS.join(', ')}.`);
        process.exit(2);
      }
      feature = norm;
    } else if (arg === '--jobs' || arg.startsWith('--jobs=')) {
      const rawVal = arg.includes('=') ? arg.slice('--jobs='.length) : argv[++i];
      const n = Number(rawVal);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        console.error(`Invalid --jobs value '${rawVal ?? ''}'. Expected integer 1..12.`);
        process.exit(2);
      }
      concurrency = n;
    } else {
      console.error(`Unknown CLI flag '${arg}'. Run with --help for usage.`);
      process.exit(2);
    }
  }
  return { tier, feature, json, concurrency };
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Timed out after ${ms}ms in ${label}`);
      err.isTimeout = true;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function testTouchesFeature(test, featureId) {
  if (test.feature === featureId) return true;
  return Array.isArray(test.features) && test.features.includes(featureId);
}

async function runPoolWithSlots(items, workerBrowsers, workerFn) {
  const results = new Array(items.length);
  let cursor = 0;
  const count = Math.min(workerBrowsers.length, items.length);
  const workers = Array.from({ length: count }, async (_, workerIdx) => {
    const workerBrowser = workerBrowsers[workerIdx];
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await workerFn(items[idx], idx, workerBrowser);
    }
  });
  await Promise.all(workers);
  return results;
}

process.on('exit', cleanupScratch);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    cleanupScratch();
    process.exit(130);
  });
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const log = (...args) => {
    if (!opts.json) console.log(...args);
  };

  const selected = ALL_TESTS.filter((t) => {
    if (opts.tier !== null && t.tier !== opts.tier) return false;
    if (opts.feature !== null && !testTouchesFeature(t, opts.feature)) return false;
    return true;
  });

  if (selected.length === 0) {
    console.error('No E2E tests matched the given CLI filter.');
    process.exit(2);
  }

  const suiteStart = performance.now();
  let server = null;
  let browser = null;
  const warmSlots = [];

  try {
    server = await startStaticServer(ROOT);
    browser = await chromium.launch({
      executablePath: CHROME_EXECUTABLE,
      args: [
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const poolSize = Math.min(opts.concurrency, selected.length);
    warmSlots.push(
      ...(await Promise.all(Array.from({ length: poolSize }, () => createWarmWorkerSlot(browser, server.baseUrl)))),
    );
    const workerBrowsers = warmSlots.map((slot) => attachWarmSlotToBrowser(browser, slot));

    log(`╔══════════════════════════════════════════════════════════════════════╗`);
    log(`║ 《五更天》 4-Tier Opaque-Box E2E Suite (${selected.length} tests, jobs=${poolSize})      ║`);
    log(`║ Server: ${server.baseUrl.padEnd(28)} Chrome: ${path.basename(CHROME_EXECUTABLE).padEnd(18)} ║`);
    log(`╚══════════════════════════════════════════════════════════════════════╝`);

    const tiersToRun = opts.tier !== null ? [opts.tier] : [1, 2, 3, 4];
    const orderedTests = tiersToRun.flatMap((tierNum) => selected.filter((t) => t.tier === tierNum));
    const tierStartMs = new Map();
    const tierEndMs = new Map();

    const allResults = await runPoolWithSlots(orderedTests, workerBrowsers, async (test, _idx, workerBrowser) => {
      const start = performance.now();
      if (!tierStartMs.has(test.tier)) {
        tierStartMs.set(test.tier, start);
        const countInTier = orderedTests.filter((t) => t.tier === test.tier).length;
        log(`\n▶ ${TIER_LABELS[test.tier]} (${countInTier} tests)`);
      }
      const timeoutMs = test.timeoutMs || 12_000;
      try {
        await withTimeout(
          test.run({ browser: workerBrowser, baseUrl: server.baseUrl }),
          timeoutMs,
          `${test.id} (${test.name})`,
        );
        const end = performance.now();
        tierEndMs.set(test.tier, end);
        const durationMs = Math.round(end - start);
        log(`  ✓ ${test.id} [${test.feature}] ${test.name} (${durationMs}ms)`);
        return {
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          features: test.features || [test.feature],
          name: test.name,
          passed: true,
          durationMs,
          error: null,
        };
      } catch (err) {
        if (err?.isTimeout && workerBrowser?.__warmSlot) {
          workerBrowser.__warmSlot.tainted = true;
          try { await workerBrowser.__warmSlot.close(); } catch {}
        }
        const end = performance.now();
        tierEndMs.set(test.tier, end);
        const durationMs = Math.round(end - start);
        const cleanMsg = (err?.message || String(err)).replace(/\s*\n\s*/g, ' | ').slice(0, 240);
        log(`  ✗ ${test.id} [${test.feature}] ${test.name} (${durationMs}ms)\n      ↳ ${cleanMsg}`);
        return {
          id: test.id,
          tier: test.tier,
          feature: test.feature,
          features: test.features || [test.feature],
          name: test.name,
          passed: false,
          durationMs,
          error: cleanMsg,
        };
      }
    });

    for (const tierNum of tiersToRun) {
      const tierResults = allResults.filter((r) => r.tier === tierNum);
      if (!tierResults.length) continue;
      const elapsed = ((tierEndMs.get(tierNum) - tierStartMs.get(tierNum)) / 1000).toFixed(2);
      const tierPassed = tierResults.filter((r) => r.passed).length;
      const tierFailed = tierResults.length - tierPassed;
      log(`  ── Tier ${tierNum} Summary: ${tierPassed}/${tierResults.length} passed, ${tierFailed} failed (${elapsed}s)`);
    }

    const totalMs = Math.round(performance.now() - suiteStart);
    const passed = allResults.filter((r) => r.passed).length;
    const failed = allResults.length - passed;

    const byTier = {};
    for (const t of [1, 2, 3, 4]) {
      const sub = allResults.filter((r) => r.tier === t);
      if (!sub.length) continue;
      byTier[t] = {
        total: sub.length,
        passed: sub.filter((r) => r.passed).length,
        failed: sub.filter((r) => !r.passed).length,
      };
    }

    const byFeature = {};
    for (const fid of FEATURE_IDS) {
      const touching = allResults.filter((r) => r.features.includes(fid));
      const t1 = ALL_TESTS.filter((t) => t.tier === 1 && t.feature === fid).length;
      const t2 = ALL_TESTS.filter((t) => t.tier === 2 && t.feature === fid).length;
      byFeature[fid] = {
        title: FEATURE_TITLES[fid],
        definedTier1: t1,
        definedTier2: t2,
        executed: touching.length,
        executedTier1: touching.filter((r) => r.tier === 1 && r.feature === fid).length,
        executedTier2: touching.filter((r) => r.tier === 2 && r.feature === fid).length,
        passed: touching.filter((r) => r.passed).length,
        failed: touching.filter((r) => !r.passed).length,
      };
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: failed === 0,
            total: allResults.length,
            passed,
            failed,
            durationMs: totalMs,
            byTier,
            byFeature,
            failures: allResults.filter((r) => !r.passed),
          },
          null,
          2,
        ),
      );
    } else {
      log(`\n════════════════════════════════════════════════════════════════════════`);
      log(`Feature Coverage Breakdown (Defined T1 / T2 | Executed Pass / Total):`);
      for (const fid of FEATURE_IDS) {
        const f = byFeature[fid];
        if (opts.feature && opts.feature !== fid && f.executed === 0) continue;
        log(
          `  ${fid.padEnd(4)} T1=${String(f.definedTier1).padStart(2)} T2=${String(f.definedTier2).padStart(2)} | ${String(f.passed).padStart(2)}/${String(f.executed).padEnd(2)} passed — ${f.title}`,
        );
      }
      log(`────────────────────────────────────────────────────────────────────────`);
      log(
        `TOTAL: ${passed}/${allResults.length} passed, ${failed} failed in ${(totalMs / 1000).toFixed(2)}s`,
      );
      log(`════════════════════════════════════════════════════════════════════════`);
    }

    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    for (const slot of warmSlots) {
      await slot.close();
    }
    if (browser) {
      try { await browser.close(); } catch {}
    }
    if (server) {
      try { await server.close(); } catch {}
    }
    cleanupScratch();
  }
}

await main();
