// Shared Opaque-Box E2E Harness for 《五更天》 (`XuCheri/wugeng`)
// STRICT RULES:
//   - Zero imports from src/**
//   - Ephemeral HTTP server bound strictly to 127.0.0.1:0 with instant socket destroy
//   - Directory listing HTML on folders lacking index.html (required by style-lab.html)
//   - Scratch files strictly under /home/antigravity/.gemini/jetski/scratch/teamwork_tmp/
//   - Deterministic rAF stepping without duplicate rAF loops or direct run.status mutation

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const activeChildren = new Set();
export function execFileAsync(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (err, stdout, stderr) => {
      activeChildren.delete(child);
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
    activeChildren.add(child);
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const VENV_PYTHON = path.join(ROOT, '.venv', 'bin', 'python3');
export const CHROME_EXECUTABLE = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const SCRATCH_PARENT = '/home/antigravity/.gemini/jetski/scratch/teamwork_tmp';
export const SCRATCH_ROOT = path.join(
  SCRATCH_PARENT,
  `wugeng_e2e_${process.pid}_${Date.now()}`,
);

let scratchCreated = false;
let exitHookRegistered = false;
let cachedZipExtraction = null;

export function ensureScratchSubdir(name) {
  if (!exitHookRegistered) {
    exitHookRegistered = true;
    process.once('exit', cleanupScratch);
  }
  if (!scratchCreated || !fs.existsSync(SCRATCH_ROOT)) {
    fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
    scratchCreated = true;
  }
  const sub = path.join(SCRATCH_ROOT, name);
  fs.mkdirSync(sub, { recursive: true });
  return sub;
}

export function cleanupScratch() {
  for (const child of activeChildren) {
    try { child.kill('SIGKILL'); } catch {}
  }
  activeChildren.clear();
  cachedZipExtraction = null;
  try {
    if (fs.existsSync(SCRATCH_ROOT)) {
      fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup race on process exit
  }
}

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Start an ephemeral HTTP static server on 127.0.0.1:0 rooted at `rootDir`.
 * Returns `{ server, port, baseUrl, close }`.
 */
export async function startStaticServer(rootDir = ROOT) {
  const rootReal = fs.realpathSync(rootDir);
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const rawUrl = req.url || '/';
    let pathname;
    try {
      const parsed = new URL(rawUrl, 'http://127.0.0.1');
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const rawSegments = rawUrl.split('?')[0].split('/');
    const decodedSegments = pathname.split('/');
    if (
      rawSegments.some((s) => s === '..' || s.toLowerCase() === '%2e%2e') ||
      decodedSegments.includes('..') ||
      pathname.includes('\0')
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const candidate = path.resolve(rootReal, '.' + (pathname.startsWith('/') ? pathname : '/' + pathname));
    if (candidate !== rootReal && !candidate.startsWith(rootReal + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let st;
    try {
      st = fs.statSync(candidate);
    } catch {
      if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    if (st.isDirectory()) {
      const indexFile = path.join(candidate, 'index.html');
      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        const body = fs.readFileSync(indexFile);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      // Directory listing required by style-lab.html (`fetch('assets/fonts/')`)
      const entries = fs.readdirSync(candidate, { withFileTypes: true });
      const links = entries
        .map((ent) => {
          const suffix = ent.isDirectory() ? '/' : '';
          const href = encodeURI(ent.name) + suffix;
          return `<li><a href="${href}">${escapeHtml(ent.name + suffix)}</a></li>`;
        })
        .join('\n');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Index</title></head><body><ul>\n${links}\n</ul></body></html>`;
      const buf = Buffer.from(html, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
      return;
    }

    if (!st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(candidate).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    const body = fs.readFileSync(candidate);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': body.length,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  server.on('connection', (sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    for (const s of sockets) {
      try { s.destroy(); } catch {}
    }
    sockets.clear();
    await new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, port, baseUrl, close };
}

/**
 * Browser init script installing deterministic `window.__e2eStepFrames`
 * WITHOUT creating duplicate requestAnimationFrame loops or breaking one-shot rAF promises.
 */
export const E2E_STEPPER_INIT_SCRIPT = () => {
  const origRAF = window.requestAnimationFrame.bind(window);
  const origCAF = window.cancelAnimationFrame.bind(window);
  let gameFrameCb = null;
  let inSyntheticStep = false;
  let syntheticId = 2_000_000;
  let syntheticTs = 100_000;
  let fastRafUntil = 0;
  let idleTimer = 0;

  const isStyleLab = () => location.pathname.endsWith('/style-lab.html');

  window.requestAnimationFrame = function e2eWrappedRAF(cb) {
    if (!isStyleLab() && cb && (cb.name === 'frame' || inSyntheticStep || (!gameFrameCb && window.__wugeng?.game))) {
      gameFrameCb = cb;
    }
    if (inSyntheticStep) {
      return ++syntheticId;
    }
    if (!isStyleLab() && cb && (cb === gameFrameCb || cb.name === 'frame')) {
      if (performance.now() < fastRafUntil) {
        return origRAF(() => cb(syntheticTs));
      }
      if (idleTimer) clearTimeout(idleTimer);
      const scheduleIdle = () => {
        idleTimer = setTimeout(() => {
          idleTimer = 0;
          if (inSyntheticStep) {
            scheduleIdle();
          } else {
            origRAF(() => cb(syntheticTs));
          }
        }, 120);
      };
      scheduleIdle();
      return ++syntheticId;
    }
    if (!isStyleLab()) {
      fastRafUntil = performance.now() + 500;
      if (idleTimer && gameFrameCb) {
        clearTimeout(idleTimer);
        idleTimer = 0;
        origRAF(() => gameFrameCb(syntheticTs));
      }
    }
    return origRAF(cb);
  };

  window.cancelAnimationFrame = function e2eWrappedCAF(id) {
    if (typeof id === 'number' && id >= 2_000_000) return;
    return origCAF(id);
  };

  window.__e2eStepFrames = function e2eStepFrames(targetSteps = 1, opts = {}) {
    const g = window.__wugeng?.game;
    if (!gameFrameCb || !g || !g.run) {
      return {
        stepped: 0,
        status: g?.run?.status ?? null,
        overlay: window.__wugeng?.overlay ?? null,
        time: g?.run?.time ?? 0,
      };
    }
    const stopOnOverlay = opts.stopOnOverlay !== false;
    const onStep = typeof opts.onStep === 'function' ? opts.onStep : null;
    const maxBatch = Math.min(5, opts.maxBatch ?? (onStep ? 2 : 5));
    const singleMs = 1000 / 60 + 0.005;

    inSyntheticStep = true;
    let stepped = 0;
    try {
      const primeBefore = g.run.time;
      const firstBatch = opts.stepMs ?? (Math.min(maxBatch, Math.max(1, targetSteps)) * (1000 / 60) + 0.005);
      syntheticTs += firstBatch;
      gameFrameCb(syntheticTs);
      if (g.run && g.run.time > primeBefore + 1e-6) {
        stepped += Math.max(1, Math.round((g.run.time - primeBefore) * 60));
        if (onStep) onStep(g.run, stepped);
      }

      let guard = 0;
      const maxGuard = Math.max(targetSteps * 2 + 40, 80);
      while (stepped < targetSteps && guard < maxGuard) {
        guard++;
        if (!g.run || g.isPaused()) break;
        if (stopOnOverlay && g.run.status !== 'playing') break;
        const prevT = g.run.time;
        const batch = Math.min(maxBatch, Math.max(1, targetSteps - stepped));
        const curStepMs = opts.stepMs ?? (batch * (1000 / 60) + 0.005);
        syntheticTs += curStepMs;
        gameFrameCb(syntheticTs);
        if (!g.run) break;
        const deltaSteps = Math.round((g.run.time - prevT) * 60);
        if (deltaSteps > 0) {
          stepped += deltaSteps;
          if (onStep) onStep(g.run, stepped);
        } else {
          // Drain hitstop frame
          syntheticTs += singleMs * 2;
        }
      }
    } finally {
      inSyntheticStep = false;
    }
    return {
      stepped,
      status: g.run?.status ?? null,
      overlay: window.__wugeng?.overlay ?? null,
      time: g.run?.time ?? 0,
    };
  };
};

/**
 * Create a pre-warmed worker slot on `390x844 @ dpr=2` booted at `${baseUrl}/index.html`.
 * Reusing baked procedural woodblock sprites & icons across standard tests avoids 160x redundant CPU baking
 * while resetting storage, save, audio, settings, and overlays 100% cleanly before every test.
 */
export async function createWarmWorkerSlot(browser, baseUrl) {
  const slot = {
    browser,
    baseUrl,
    context: null,
    page: null,
    styleLabContext: null,
    styleLabPage: null,
    leaseId: 0,
    styleLabLeaseId: 0,
    pageErrors: [],
    consoleErrors: [],
    badResponses: [],
    styleLabErrors: [],
    styleLabConsoleErrors: [],
    styleLabBadResponses: [],
    tainted: true,
    async ensureHealthy() {
      const targetUrl = `${baseUrl}/index.html`;
      if (!slot.context || !slot.page || slot.page.isClosed()) {
        if (slot.context) {
          try { await slot.context.close(); } catch {}
        }
        slot.context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
        });
        slot.context.setDefaultTimeout(2500);
        slot.context.setDefaultNavigationTimeout(8000);
        await slot.context.addInitScript(E2E_STEPPER_INIT_SCRIPT);
        slot.page = await slot.context.newPage();
        slot.page.__warmBaseUrl = baseUrl;
        slot.page.__isWarmSlot = true;
        slot.page.on('pageerror', (err) => slot.pageErrors.push(err?.message || String(err)));
        slot.page.on('console', (msg) => {
          if (msg.type() === 'error') slot.consoleErrors.push(msg.text());
        });
        slot.page.on('response', (res) => {
          if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
            slot.badResponses.push(`${res.status()} ${res.url()}`);
          }
        });
        slot.tainted = true;
      }

      if (slot.tainted || slot.page.url() !== targetUrl) {
        slot.pageErrors.length = 0;
        slot.consoleErrors.length = 0;
        slot.badResponses.length = 0;
        await slot.page.goto(targetUrl);
        await slot.page.waitForSelector('.screen--title');
        await slot.page.evaluate(() => document.fonts.ready);
        await slot.page.waitForFunction(() => Boolean(window.__wugeng && window.__wugeng.game));
        await slot.page.evaluate(() => {
          window.__e2ePristineSaveJson = JSON.stringify(window.__wugeng.save);
        });
        slot.tainted = false;
      }

      slot.pageErrors.length = 0;
      slot.consoleErrors.length = 0;
      slot.badResponses.length = 0;
      try { await slot.page.mouse.up(); } catch {}
    },
    async ensureStyleLabHealthy() {
      if (!slot.styleLabContext || !slot.styleLabPage || slot.styleLabPage.isClosed()) {
        if (slot.styleLabContext) {
          try { await slot.styleLabContext.close(); } catch {}
        }
        slot.styleLabContext = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
        });
        slot.styleLabContext.setDefaultTimeout(3500);
        slot.styleLabContext.setDefaultNavigationTimeout(8000);
        slot.styleLabPage = await slot.styleLabContext.newPage();
        slot.styleLabPage.on('pageerror', (err) => slot.styleLabErrors.push(err?.message || String(err)));
        slot.styleLabPage.on('console', (msg) => {
          if (msg.type() === 'error') slot.styleLabConsoleErrors.push(msg.text());
        });
        slot.styleLabPage.on('response', (res) => {
          if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
            slot.styleLabBadResponses.push(`${res.status()} ${res.url()}`);
          }
        });
      }
      slot.styleLabErrors.length = 0;
      slot.styleLabConsoleErrors.length = 0;
      slot.styleLabBadResponses.length = 0;
    },
    async close() {
      slot.leaseId++;
      slot.styleLabLeaseId++;
      if (slot.styleLabContext) {
        try { await slot.styleLabContext.close(); } catch {}
        slot.styleLabContext = null;
        slot.styleLabPage = null;
      }
      if (slot.context) {
        try { await slot.context.close(); } catch {}
        slot.context = null;
        slot.page = null;
      }
    },
  };
  await slot.ensureHealthy();
  return slot;
}

export function attachWarmSlotToBrowser(browser, slot) {
  return Object.create(browser, {
    __warmSlot: { value: slot, enumerable: false },
  });
}

/**
 * Create an isolated mobile page (or acquire a reset warm worker page for standard 390x844 tests).
 */
export async function createIsolatedPage(browser, opts = {}) {
  if (opts.styleLab && browser?.__warmSlot) {
    const slot = browser.__warmSlot;
    await slot.ensureStyleLabHealthy();
    const lease = ++slot.styleLabLeaseId;
    const myPage = slot.styleLabPage;
    const assertNoErrors = (label = 'style-lab') => {
      assert.deepEqual(slot.styleLabErrors, [], `[${label}] Unexpected pageerror(s): ${slot.styleLabErrors.join(' | ')}`);
      assert.deepEqual(slot.styleLabConsoleErrors, [], `[${label}] Unexpected console.error(s): ${slot.styleLabConsoleErrors.join(' | ')}`);
    };
    return {
      context: slot.styleLabContext,
      page: myPage,
      pageErrors: slot.styleLabErrors,
      consoleErrors: slot.styleLabConsoleErrors,
      badResponses: slot.styleLabBadResponses,
      assertNoErrors,
      close: async () => {
        if (slot.styleLabLeaseId !== lease || !myPage || myPage.isClosed() || slot.styleLabPage !== myPage) return;
        if (slot.styleLabErrors.length > 0) {
          try { await slot.styleLabContext.close(); } catch {}
          slot.styleLabContext = null;
          slot.styleLabPage = null;
        } else {
          try { await myPage.goto('about:blank'); } catch {}
        }
      },
    };
  }

  const canUseWarmSlot = Boolean(
    browser?.__warmSlot &&
    !opts.isolated &&
    !opts.styleLab &&
    !opts.viewport &&
    opts.deviceScaleFactor === undefined &&
    !opts.beforeBootInitScript &&
    opts.isMobile === undefined &&
    opts.hasTouch === undefined,
  );

  if (canUseWarmSlot) {
    const slot = browser.__warmSlot;
    await slot.ensureHealthy();
    const lease = ++slot.leaseId;
    const myPage = slot.page;
    const assertNoErrors = (label = 'page') => {
      assert.deepEqual(slot.pageErrors, [], `[${label}] Unexpected pageerror(s): ${slot.pageErrors.join(' | ')}`);
      assert.deepEqual(slot.consoleErrors, [], `[${label}] Unexpected console.error(s): ${slot.consoleErrors.join(' | ')}`);
    };
    return {
      context: slot.context,
      page: myPage,
      pageErrors: slot.pageErrors,
      consoleErrors: slot.consoleErrors,
      badResponses: slot.badResponses,
      assertNoErrors,
      close: async () => {
        if (slot.leaseId !== lease || !myPage || myPage.isClosed() || slot.page !== myPage) return;
        if (slot.pageErrors.length > 0 || myPage.url() !== `${slot.baseUrl}/index.html`) {
          slot.tainted = true;
        } else {
          try {
            await myPage.evaluate(() => {
              if (window.__wugeng?.game?.run) {
                try { window.__wugeng.game.finish(); } catch {}
                window.__wugeng.game.clear();
              }
            });
          } catch {}
        }
      },
    };
  }

  const realBrowser = browser?.__warmSlot ? browser.__warmSlot.browser : browser;
  const viewport = opts.viewport || { width: 390, height: 844 };
  const deviceScaleFactor = opts.deviceScaleFactor ?? 1;
  const context = await realBrowser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile: opts.isMobile ?? true,
    hasTouch: opts.hasTouch ?? true,
  });
  context.setDefaultTimeout(opts.defaultTimeout ?? 4500);
  context.setDefaultNavigationTimeout(opts.navigationTimeout ?? 10000);
  await context.addInitScript(E2E_STEPPER_INIT_SCRIPT);
  if (opts.beforeBootInitScript) {
    await context.addInitScript(opts.beforeBootInitScript, opts.beforeBootArg);
  }

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];

  page.on('pageerror', (err) => pageErrors.push(err?.message || String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
      badResponses.push(`${res.status()} ${res.url()}`);
    }
  });

  const assertNoErrors = (label = 'page') => {
    assert.deepEqual(pageErrors, [], `[${label}] Unexpected pageerror(s): ${pageErrors.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `[${label}] Unexpected console.error(s): ${consoleErrors.join(' | ')}`);
  };

  return {
    context,
    page,
    pageErrors,
    consoleErrors,
    badResponses,
    assertNoErrors,
    close: () => context.close(),
  };
}

/**
 * Immediately verify an already-mounted overlay/HUD selector exists (fails in <5ms with descriptive AssertionError).
 */
export async function requireOpenSelector(page, selector, message) {
  const handle = await page.$(selector);
  assert.ok(handle, message || `Expected DOM element '${selector}' to be present (PROJECT.md §4)`);
  return handle;
}

/**
 * Fast click on an already-mounted DOM control without stalling 300ms on CSS keyframe animations.
 */
export async function fastClick(page, selector, message) {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, selector);
  assert.equal(clicked, true, message || `Expected clickable enabled element '${selector}' (PROJECT.md §4)`);
}

/**
 * Boot index.html, wait for title + fonts.
 */
export async function bootGame(page, baseUrl, opts = {}) {
  const query = opts.query ? `?${opts.query.replace(/^\?/, '')}` : '';
  await page.goto(`${baseUrl}/index.html${query}`);
  await page.waitForSelector('.screen--title');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Boolean(window.__wugeng && window.__wugeng.game));
  if (!query && page.__isWarmSlot && baseUrl === page.__warmBaseUrl) {
    await page.evaluate(() => {
      if (!window.__e2ePristineSaveJson) {
        window.__e2ePristineSaveJson = JSON.stringify(window.__wugeng.save);
      }
    });
  }
}

export async function bootToHub(page, baseUrl, opts = {}) {
  const canFastReset = Boolean(
    !opts.query &&
    page.__isWarmSlot &&
    baseUrl === page.__warmBaseUrl &&
    page.url() === `${baseUrl}/index.html`,
  );

  if (canFastReset) {
    await page.evaluate((patch) => {
      const w = window.__wugeng;
      // Teardown any active runUI overlay/HUD cleanly via finish() before resetting save
      if (w.game.run) {
        try { w.game.finish(); } catch {}
      }
      w.game.clear();
      document.querySelectorAll('#ui .veil, #ui .toast, #ui .run-hint, body > .mock-ad').forEach((el) => el.remove());
      localStorage.clear();
      sessionStorage.clear();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });

      const fresh = JSON.parse(window.__e2ePristineSaveJson);
      const target = w.save;
      for (const k of Object.keys(target)) {
        if (!(k in fresh)) delete target[k];
      }
      for (const [k, v] of Object.entries(fresh)) {
        target[k] = structuredClone(v);
      }

      if (patch) {
        if (patch.coins !== undefined) target.coins = patch.coins;
        if (patch.unlockedHeroes) target.unlockedHeroes = [...patch.unlockedHeroes];
        if (patch.selectedHero) target.selectedHero = patch.selectedHero;
        if (patch.nightUnlocked !== undefined) target.nightUnlocked = patch.nightUnlocked;
        if (patch.nightCleared !== undefined) target.nightCleared = patch.nightCleared;
        if (patch.selectedNight !== undefined) target.selectedNight = patch.selectedNight;
        if (patch.charms) target.charms = patch.charms.map((c) => (typeof c === 'string' ? { relicId: c } : c));
        if (patch.shop) Object.assign(target.shop, patch.shop);
        if (patch.settings) Object.assign(target.settings, patch.settings);
        if (patch.checkin) Object.assign(target.checkin, patch.checkin);
        if (patch.codex) {
          if (patch.codex.weapons) target.codex.weapons = [...patch.codex.weapons];
          if (patch.codex.evolutions) target.codex.evolutions = [...patch.codex.evolutions];
          if (patch.codex.relics) target.codex.relics = [...patch.codex.relics];
          if (patch.codex.enemies) Object.assign(target.codex.enemies, patch.codex.enemies);
        }
        w.persist(false);
      }

      w.game.applySettings({
        shake: target.settings.shake ?? true,
        dmgText: target.settings.dmgText ?? 'all',
        lowQuality: target.settings.lowQuality ?? false,
      });
      w.audio.unlock();
      w.audio.resume('all');
      w.audio.setEnabled({ sfx: target.settings.sfx ?? true, music: target.settings.music ?? true });
      w.showHub();
    }, opts.savePatch || null);
    await page.waitForSelector('.screen--hub');
    return;
  }

  await bootGame(page, baseUrl, opts);
  await page.evaluate(() => {
    const btn = document.querySelector('.title-actions .btn--seal') || document.querySelector('.screen--title button');
    if (btn) btn.click();
    else {
      window.__wugeng.audio.unlock();
      window.__wugeng.showHub();
    }
  });
  await page.waitForSelector('.screen--hub');
  if (opts.savePatch) {
    await page.evaluate((patch) => {
      const s = window.__wugeng.save;
      if (patch.coins !== undefined) s.coins = patch.coins;
      if (patch.unlockedHeroes) s.unlockedHeroes = [...patch.unlockedHeroes];
      if (patch.selectedHero) s.selectedHero = patch.selectedHero;
      if (patch.nightUnlocked !== undefined) s.nightUnlocked = patch.nightUnlocked;
      if (patch.nightCleared !== undefined) s.nightCleared = patch.nightCleared;
      if (patch.selectedNight !== undefined) s.selectedNight = patch.selectedNight;
      if (patch.charms) s.charms = patch.charms.map((c) => (typeof c === 'string' ? { relicId: c } : c));
      if (patch.shop) Object.assign(s.shop, patch.shop);
      if (patch.settings) Object.assign(s.settings, patch.settings);
      if (patch.checkin) Object.assign(s.checkin, patch.checkin);
      if (patch.codex) {
        if (patch.codex.weapons) s.codex.weapons = [...patch.codex.weapons];
        if (patch.codex.evolutions) s.codex.evolutions = [...patch.codex.evolutions];
        if (patch.codex.relics) s.codex.relics = [...patch.codex.relics];
        if (patch.codex.enemies) Object.assign(s.codex.enemies, patch.codex.enemies);
      }
      window.__wugeng.persist(false);
      window.__wugeng.showHub();
    }, opts.savePatch);
    await page.waitForSelector('.screen--hub');
  }
}

export async function bootAndStartRun(page, baseUrl, opts = {}) {
  await bootToHub(page, baseUrl, opts);
  const heroId = opts.heroId || 'zhou';
  const nightLevel = opts.nightLevel ?? 0;
  const charm = opts.charm ?? null;
  const seed = opts.seed ?? 12345;
  await page.evaluate(({ heroId: h, nightLevel: n, charm: c, seed: s }) => {
    window.__wugeng.startRun({ heroId: h, nightLevel: n, charm: c, seed: s });
    if (s !== undefined && window.__wugeng.game.run?.seed !== s) {
      const meta = window.__wugeng.game.run?.meta || {};
      window.__wugeng.game.start({ heroId: h, nightLevel: n, meta, charm: c, seed: s });
    }
    window.__e2eStepFrames(1);
  }, { heroId, nightLevel, charm, seed });
}

export async function stepFrames(page, count = 1, opts = {}) {
  return page.evaluate(({ n, o }) => window.__e2eStepFrames(n, o), { n: count, o: opts });
}

/**
 * Trigger a 1-frame natural XP level-up via pickup collection on player (never mutating run.status).
 */
export async function triggerLevelUp(page) {
  await page.evaluate(() => {
    const g = window.__wugeng.game;
    const r = g.run;
    if (g.isPaused()) g.resume();
    r.pickups.push({
      id: 900_000 + Math.floor((r.time || 0) * 1000) + r.pickups.length,
      kind: 'xp',
      x: r.player.x,
      y: r.player.y,
      value: (r.player.xpNext - r.player.xp) + 2,
      tier: 3,
      mag: true,
      ms: 9999,
    });
    r._xpCount = (r._xpCount || 0) + 1;
    window.__e2eStepFrames(2);
  });
  await page.waitForFunction(() => window.__wugeng.overlay === 'levelup', null, { timeout: 4000 });
}

/**
 * Grant a weapon or relic through the real DOM `.qian` -> `chooseUpgrade` -> `recomputeMods` / `recomputeSynergies` pipeline
 * in a single fast evaluate pass.
 */
export async function grantItemViaLevelUp(page, kind, id, times = 1) {
  const result = await page.evaluate(({ itemKind, itemId, count }) => {
    const g = window.__wugeng.game;
    const r0 = g.run;
    const initList = itemKind === 'weapon' ? r0.weapons : r0.relics;
    const startLv = initList.find((x) => x.id === itemId)?.level || 0;
    const targetLv = startLv + count;

    const doOneDomLevelUp = (stepTag) => {
      const r = g.run;
      r.enemies.length = 0;
      r.projectiles = r.projectiles.filter((p) => p.kind !== 'enemyBullet');
      const list = itemKind === 'weapon' ? r.weapons : r.relics;
      const curLv = list.find((x) => x.id === itemId)?.level || 0;

      if (g.isPaused()) g.resume();
      r.pickups.push({
        id: 910_000 + Math.floor((r.time || 0) * 1000) + stepTag * 19 + r.pickups.length,
        kind: 'xp',
        x: r.player.x,
        y: r.player.y,
        value: (r.player.xpNext - r.player.xp) + 2,
        tier: 3,
        mag: true,
        ms: 9999,
      });
      r._xpCount = (r._xpCount || 0) + 1;
      window.__e2eStepFrames(2);
      if (window.__wugeng.overlay !== 'levelup') {
        return { ok: false, reason: `Expected levelup overlay on step ${stepTag}, got ${window.__wugeng.overlay}` };
      }
      if (r.choiceMode === 'blessing') {
        document.querySelector('.qian')?.click();
        if (window.__wugeng.overlay !== 'levelup') {
          if (g.isPaused()) g.resume();
          r.pickups.push({
            id: 915_000 + stepTag, kind: 'xp', x: r.player.x, y: r.player.y,
            value: (r.player.xpNext - r.player.xp) + 2, tier: 3, mag: true, ms: 9999,
          });
          r._xpCount = (r._xpCount || 0) + 1;
          window.__e2eStepFrames(2);
        }
      }
      const nextLv = curLv + 1;
      if (r.choiceMode && r.choiceMode !== 'normal') r.choiceMode = 'normal';
      if (!Array.isArray(r.choices) || !r.choices.length) {
        r.choices = [{ kind: itemKind, id: itemId, level: nextLv, isNew: nextLv === 1, evolvable: false }];
      } else {
        r.choices[0] = { kind: itemKind, id: itemId, level: nextLv, isNew: nextLv === 1, evolvable: false };
      }
      const qianBtn = document.querySelector('.qian');
      if (!qianBtn) return { ok: false, reason: 'Missing .qian button in levelup overlay' };
      qianBtn.click();
      while (window.__wugeng.overlay === 'levelup') {
        const extraBtn = document.querySelector('.qian');
        if (!extraBtn) break;
        extraBtn.click();
      }
      return { ok: true };
    };

    // 1) If not yet owned, acquire Lv1 through real .qian chooseUpgrade
    if (startLv === 0) {
      const res1 = doOneDomLevelUp(1);
      if (!res1.ok) return res1;
    }

    // 2) If targetLv > current level, stage to (targetLv - 1) and run 1 final real .qian chooseUpgrade -> recomputeMods + codex sync
    const midList = itemKind === 'weapon' ? g.run.weapons : g.run.relics;
    const item = midList.find((x) => x.id === itemId);
    if (!item) {
      return { ok: false, reason: `Item ${itemKind} '${itemId}' was not added by chooseUpgrade` };
    }
    if (item.level < targetLv) {
      item.level = targetLv - 1;
      const resFinal = doOneDomLevelUp(2);
      if (!resFinal.ok) return resFinal;
    }

    const endList = itemKind === 'weapon' ? g.run.weapons : g.run.relics;
    const endLv = endList.find((x) => x.id === itemId)?.level || 0;
    if (endLv !== targetLv) {
      return {
        ok: false,
        reason: `Expected ${itemKind} '${itemId}' Lv${startLv} -> Lv${targetLv}, got Lv${endLv}`,
      };
    }
    return { ok: true };
  }, { itemKind: kind, itemId: id, count: times });

  assert.equal(result.ok, true, result.reason || `Failed granting ${kind} '${id}'`);
}

/**
 * Drop a chest on the player and step frames so `stepRun` transitions naturally to `status === 'chest'`.
 * Steps up to 8 frames so any active `evolve` hitstop (0.05-0.08s) drains cleanly first.
 */
export async function triggerChest(page) {
  await page.evaluate(() => {
    const g = window.__wugeng.game;
    const r = g.run;
    if (g.isPaused()) g.resume();
    r.pickups.push({
      id: 950_000 + r.pickups.length,
      kind: 'chest',
      x: r.player.x,
      y: r.player.y,
      value: 1,
    });
    window.__e2eStepFrames(8);
  });
  await page.waitForFunction(() => window.__wugeng.overlay === 'chest', null, { timeout: 4000 });
}

/**
 * Confirm/close an open chest overlay (selecting `preferredWeaponId` if provided via `[data-evo-weapon]`).
 */
export async function confirmChestModal(page, preferredWeaponId = null) {
  if (preferredWeaponId) {
    const multiEligible = await page.evaluate(() => (window.__wugeng.game.run?.chestChoices?.length || 0) >= 2);
    const cardSel = `[data-evo-weapon="${preferredWeaponId}"]`;
    const hasCard = await page.$(cardSel);
    if (multiEligible || hasCard) {
      assert.ok(hasCard, `Expected selectable chest card ${cardSel} in .overlay--chest (PROJECT.md §4 F3)`);
      await fastClick(page, cardSel);
    }
  }
  if (await page.$('[data-action="confirm-chest"]')) {
    await fastClick(page, '[data-action="confirm-chest"]');
  } else if (await page.$('.veil .btn--seal')) {
    await fastClick(page, '.veil .btn--seal');
  }
  await page.evaluate(() => {
    while (window.__wugeng.overlay === 'levelup') {
      const btn = document.querySelector('.qian');
      if (!btn) break;
      btn.click();
    }
  });
}

/**
 * Force natural player death via contact enemy in `stepRun` (never mutating run.status directly).
 */
export async function triggerLethalHit(page) {
  await page.evaluate(() => {
    const g = window.__wugeng.game;
    const r = g.run;
    if (g.isPaused()) g.resume();
    r.player.invulnT = 0;
    r._paperSoulUsed = true;
    if (typeof r.player.soulBarrier === 'number') r.player.soulBarrier = 0;
    r.player.hp = 1;
    r.enemies.push({
      id: 880_000 + r.enemies.length,
      type: 'lanternghost',
      x: r.player.x,
      y: r.player.y,
      r: 20,
      hp: 999_999,
      maxHp: 999_999,
      elite: false,
      boss: false,
      hitT: 0,
      slowT: 0,
      state: 'move',
      angle: 0,
      speed: 0,
      dmg: 99_999,
      xp: 0,
      atkT: 0,
      stateT: 0,
      stunT: 0,
      dx: 0,
      dy: 0,
      kbx: 0,
      kby: 0,
      dead: false,
    });
    window.__e2eStepFrames(8);
  });
  await page.waitForFunction(() => window.__wugeng.overlay === 'dead', null, { timeout: 4000 });
}

/**
 * Sample `#game-canvas` pixels on a grid and check the 6-color Chinese woodblock palette invariant:
 * every anchor in palette.js satisfies R >= G >= B (with ±18 tolerance for paper grain/AA).
 */
export async function auditCanvasWoodblockPalette(page, sampleGrid = 45) {
  return page.evaluate((grid) => {
    const c = document.getElementById('game-canvas');
    if (!c || !c.width || !c.height) return { total: 0, violations: 9999, paper: 0, ink: 0, verm: 0 };
    const ctx = c.getContext('2d');
    const { width: w, height: h } = c;
    const img = ctx.getImageData(0, 0, w, h).data;
    let total = 0;
    let violations = 0;
    let paper = 0;
    let ink = 0;
    let verm = 0;
    const sx = Math.max(1, Math.floor(w / grid));
    const sy = Math.max(1, Math.floor(h / grid));
    for (let y = Math.floor(sy / 2); y < h; y += sy) {
      for (let x = Math.floor(sx / 2); x < w; x += sx) {
        const idx = (y * w + x) * 4;
        const r = img[idx];
        const g = img[idx + 1];
        const b = img[idx + 2];
        const a = img[idx + 3];
        if (a < 10) continue;
        total++;
        if (r + 18 < g || g + 18 < b) violations++;
        if (r > 195 && g > 180 && b > 150) paper++;
        if (r < 55 && g < 55 && b < 55) ink++;
        if (r > 125 && r - g > 55) verm++;
      }
    }
    return {
      total,
      violations,
      violationRatio: total ? violations / total : 1,
      paper,
      ink,
      verm,
    };
  }, sampleGrid);
}

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Extract `dist/wugeng-h5.zip` into a unique scratch subdirectory using Python `zipfile`
 * and return `{ extractRoot, appDir }`.
 */
export async function extractH5ZipToScratch(tag = 'zip') {
  const zipPath = path.join(ROOT, 'dist', 'wugeng-h5.zip');
  assert.ok(fs.existsSync(zipPath), `Expected packaged archive at ${zipPath}`);
  const st = fs.statSync(zipPath);
  const cacheKey = `${st.size}:${st.mtimeMs}`;
  if (
    cachedZipExtraction &&
    cachedZipExtraction.key === cacheKey &&
    fs.existsSync(cachedZipExtraction.appDir)
  ) {
    return cachedZipExtraction.value;
  }
  const extractRoot = ensureScratchSubdir(`${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  execFileSync(
    VENV_PYTHON,
    [
      '-c',
      'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2])',
      zipPath,
      extractRoot,
    ],
    { cwd: ROOT, timeout: 15_000 },
  );
  const value = {
    zipPath,
    extractRoot,
    appDir: path.join(extractRoot, 'wugeng'),
  };
  cachedZipExtraction = { key: cacheKey, appDir: value.appDir, value };
  return value;
}
