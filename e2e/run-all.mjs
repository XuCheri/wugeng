#!/usr/bin/env node
// Requirement-Driven 4-Tier Opaque-Box E2E Test Runner for 《五更天》 v3 (`XuCheri/wugeng`)
// Usage:
//   node e2e/run-all.mjs [--jobs 2]
//   node e2e/run-all.mjs --list [--json]
//   node e2e/run-all.mjs --dry-run [--json]
//   node e2e/run-all.mjs --tier <1|2|3|4> [--jobs 2]
//   node e2e/run-all.mjs --feature <F1..F15> [--jobs 2]
//   node e2e/run-all.mjs --id <testIdOrPrefix> [--jobs 2]

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export const ALL_TESTS = [
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

function testTouchesFeature(test, featureId) {
  if (test.feature === featureId) return true;
  return Array.isArray(test.features) && test.features.includes(featureId);
}

/**
 * Static zero-Chrome validator checking test registry uniqueness, schema, non-vacuous bodies,
 * and mandatory 4-tier coverage thresholds across `F1`–`F15`.
 */
export function validateSuiteRegistry(tests = ALL_TESTS) {
  const errors = [];
  const seenIds = new Set();

  if (FEATURE_IDS.length !== 15) {
    errors.push(`Expected 15 FEATURE_IDS (F1..F15), got ${FEATURE_IDS.length}`);
  }

  for (let idx = 0; idx < tests.length; idx++) {
    const t = tests[idx];
    if (!t || typeof t !== 'object') {
      errors.push(`Entry #${idx} is not an object`);
      continue;
    }
    if (typeof t.id !== 'string' || !t.id.trim()) {
      errors.push(`Entry #${idx} has missing/empty id`);
    } else if (seenIds.has(t.id)) {
      errors.push(`Duplicate test id '${t.id}'`);
    } else {
      seenIds.add(t.id);
    }

    if (![1, 2, 3, 4].includes(t.tier)) {
      errors.push(`Test '${t.id || idx}' has invalid tier '${t.tier}'`);
    }
    if (!FEATURE_IDS.includes(t.feature)) {
      errors.push(`Test '${t.id || idx}' has unknown primary feature '${t.feature}'`);
    }
    if (t.features !== undefined) {
      if (!Array.isArray(t.features) || t.features.length === 0) {
        errors.push(`Test '${t.id || idx}' has invalid features array`);
      } else {
        for (const f of t.features) {
          if (!FEATURE_IDS.includes(f)) {
            errors.push(`Test '${t.id || idx}' references unknown feature '${f}' in features[]`);
          }
        }
      }
    }
    if (typeof t.name !== 'string' || !t.name.trim()) {
      errors.push(`Test '${t.id || idx}' has missing/empty name`);
    }
    if (typeof t.run !== 'function') {
      errors.push(`Test '${t.id || idx}' is missing async run() function`);
    } else {
      const fnSrc = t.run.toString();
      const bodyOnly = fnSrc
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .trim();
      if (bodyOnly.length < 60) {
        errors.push(`Test '${t.id || idx}' has suspiciously short/empty run() body (${bodyOnly.length} chars)`);
      }
      if (/assert\.ok\(\s*true\s*\)|assert\.equal\(\s*true\s*,\s*true\s*\)|assert\.equal\(\s*1\s*,\s*1\s*\)/.test(bodyOnly)) {
        errors.push(`Test '${t.id || idx}' contains vacuous tautology assertion`);
      }
      if (!/(?:assert\.|requireOpenSelector|fastClick|triggerLevelUp|triggerChest|triggerLethalHit)/.test(bodyOnly)) {
        errors.push(`Test '${t.id || idx}' contains no real assertions`);
      }
    }
  }

  const tierCounts = {
    1: tests.filter((t) => t?.tier === 1).length,
    2: tests.filter((t) => t?.tier === 2).length,
    3: tests.filter((t) => t?.tier === 3).length,
    4: tests.filter((t) => t?.tier === 4).length,
  };

  const featureSummary = {};
  for (const fid of FEATURE_IDS) {
    const definedTier1 = tests.filter((t) => t?.tier === 1 && t.feature === fid).length;
    const definedTier2 = tests.filter((t) => t?.tier === 2 && t.feature === fid).length;
    const touchingTotal = tests.filter((t) => t && testTouchesFeature(t, fid)).length;
    featureSummary[fid] = {
      title: FEATURE_TITLES[fid],
      definedTier1,
      definedTier2,
      touchingTotal,
    };
    if (definedTier1 < 5) {
      errors.push(`Feature ${fid} has only ${definedTier1} Tier 1 tests (minimum >= 5 required)`);
    }
    if (definedTier2 < 5) {
      errors.push(`Feature ${fid} has only ${definedTier2} Tier 2 tests (minimum >= 5 required)`);
    }
  }

  if (tierCounts[3] < 15) {
    errors.push(`Tier 3 has only ${tierCounts[3]} tests (minimum >= 15 required)`);
  }
  if (tierCounts[4] < 8) {
    errors.push(`Tier 4 has only ${tierCounts[4]} tests (minimum >= 8 required)`);
  }
  if (tests.length < 175) {
    errors.push(`Suite total is ${tests.length} tests (minimum >= 175 required)`);
  }

  return {
    ok: errors.length === 0,
    totalDefined: tests.length,
    tierCounts,
    featureSummary,
    errors,
  };
}

function parseCliArgs(argv) {
  let tier = null;
  let feature = null;
  let idPattern = null;
  let list = false;
  let dryRun = false;
  let json = false;
  let concurrency = Math.max(1, Math.min(12, Number(process.env.E2E_JOBS || 2) || 2));

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node e2e/run-all.mjs [--list] [--dry-run] [--tier 1|2|3|4] [--feature F1..F15] [--id <idOrPrefix>] [--jobs N] [--json]',
      );
      process.exit(0);
    } else if (arg === '--list') {
      list = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
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
    } else if (arg === '--id' || arg.startsWith('--id=')) {
      const rawVal = arg.includes('=') ? arg.slice('--id='.length) : argv[++i];
      if (!rawVal || !rawVal.trim()) {
        console.error(`Invalid --id value '${rawVal ?? ''}'. Expected non-empty test ID or prefix.`);
        process.exit(2);
      }
      idPattern = rawVal.trim();
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
  return { tier, feature, idPattern, list, dryRun, json, concurrency };
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
  const staticStart = performance.now();
  const opts = parseCliArgs(process.argv.slice(2));
  const validation = validateSuiteRegistry(ALL_TESTS);

  const selected = ALL_TESTS.filter((t) => {
    if (opts.tier !== null && t.tier !== opts.tier) return false;
    if (opts.feature !== null && !testTouchesFeature(t, opts.feature)) return false;
    if (opts.idPattern !== null) {
      const patUpper = opts.idPattern.toUpperCase();
      const idUpper = t.id.toUpperCase();
      if (idUpper !== patUpper && !idUpper.startsWith(patUpper)) return false;
    }
    return true;
  });

  // Zero-Chrome Static Modes (`--list` and `--dry-run`) — < 1s, zero HTTP server, zero Chromium!
  if (opts.list || opts.dryRun) {
    const durationMs = Math.round(performance.now() - staticStart);
    const byTier = {};
    for (const tierNum of [1, 2, 3, 4]) {
      const count = selected.filter((t) => t.tier === tierNum).length;
      byTier[tierNum] = {
        defined: validation.tierCounts[tierNum],
        selected: count,
      };
    }
    const byFeature = {};
    for (const fid of FEATURE_IDS) {
      const f = validation.featureSummary[fid];
      byFeature[fid] = {
        title: f.title,
        definedTier1: f.definedTier1,
        definedTier2: f.definedTier2,
        touchingTotal: f.touchingTotal,
        selected: selected.filter((t) => testTouchesFeature(t, fid)).length,
      };
    }

    const ok = validation.ok && selected.length > 0;
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok,
            mode: opts.list ? 'list' : 'dry-run',
            durationMs,
            defaultJobs: opts.concurrency,
            totalDefined: validation.totalDefined,
            selectedCount: selected.length,
            validation: {
              ok: validation.ok,
              errors: validation.errors,
            },
            byTier,
            byFeature,
            tests: selected.map((t) => ({
              id: t.id,
              tier: t.tier,
              feature: t.feature,
              features: t.features || [t.feature],
              timeoutMs: t.timeoutMs || 12_000,
              name: t.name,
            })),
          },
          null,
          2,
        ),
      );
    } else {
      const modeLabel = opts.list ? 'STATIC LIST' : 'DRY-RUN VALIDATION';
      console.log(`╔══════════════════════════════════════════════════════════════════════╗`);
      console.log(`║ 《五更天》 v3 4-Tier E2E Suite — ${modeLabel.padEnd(35)} ║`);
      console.log(
        `║ Defined: ${String(validation.totalDefined).padEnd(5)} Selected: ${String(selected.length).padEnd(5)} Default Jobs: ${String(opts.concurrency).padEnd(4)} (${durationMs}ms) ║`,
      );
      console.log(`╚══════════════════════════════════════════════════════════════════════╝`);
      console.log(
        `  Tiers Defined: T1=${validation.tierCounts[1]}, T2=${validation.tierCounts[2]}, T3=${validation.tierCounts[3]}, T4=${validation.tierCounts[4]} (Total=${validation.totalDefined})`,
      );
      console.log(`\n  Feature Coverage Matrix (F1–F15):`);
      for (const fid of FEATURE_IDS) {
        const f = byFeature[fid];
        if (opts.feature && opts.feature !== fid && f.selected === 0) continue;
        console.log(
          `    ${fid.padEnd(4)} T1=${String(f.definedTier1).padStart(2)} T2=${String(f.definedTier2).padStart(2)} Touch=${String(f.touchingTotal).padStart(2)} Sel=${String(f.selected).padStart(2)} — ${f.title}`,
        );
      }
      if (opts.list) {
        console.log(`\n  Selected Test Cases (${selected.length}):`);
        for (const t of selected) {
          console.log(`    [T${t.tier}] ${t.id.padEnd(10)} (${(t.features || [t.feature]).join(',')}) ${t.name}`);
        }
      }
      if (!validation.ok) {
        console.error(`\n  ✗ Registry Validation Errors (${validation.errors.length}):`);
        for (const err of validation.errors) {
          console.error(`    - ${err}`);
        }
      } else if (selected.length === 0) {
        console.error(`\n  ✗ No E2E tests matched the given CLI filter.`);
      } else {
        console.log(`\n  ✓ Static 4-Tier E2E Registry & Coverage Gate PASSED (${durationMs}ms, zero Chrome spawned).`);
      }
    }
    process.exitCode = !validation.ok ? 1 : selected.length === 0 ? 2 : 0;
    return;
  }

  if (!validation.ok) {
    console.error(`Suite registry validation failed:\n  - ${validation.errors.join('\n  - ')}`);
    process.exit(1);
  }

  if (selected.length === 0) {
    console.error('No E2E tests matched the given CLI filter.');
    process.exit(2);
  }

  const { chromium } = require('playwright-core');
  const log = (...args) => {
    if (!opts.json) console.log(...args);
  };

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
    log(`║ 《五更天》 v3 4-Tier Opaque-Box E2E Suite (${String(selected.length).padStart(3)} tests, jobs=${poolSize})   ║`);
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

const selfPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (entryPath === selfPath) {
  await main();
}
