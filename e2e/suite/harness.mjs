// Shared Opaque-Box E2E Harness for 《五更天》 v3 (`XuCheri/wugeng`)
// STRICT RULES:
//   - Zero imports from src/**
//   - Ephemeral HTTP server bound strictly to 127.0.0.1:0 with instant socket destroy
//   - Directory listing HTML on folders lacking index.html (required by style-lab.html)
//   - Scratch files strictly under /home/antigravity/.gemini/jetski/scratch/teamwork_tmp/
//   - Deterministic rAF stepping without hijacking UI/intro/menu/stage/shop rAF loops
//   - Multi-page shared-BrowserContext BroadcastChannel Co-op harness (`createCoopPages` / `stepCoopFrames`)

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

export const WARM_QUERY = 'skipIntro=1';
export function warmUrl(baseUrl) {
  return `${baseUrl}/index.html?${WARM_QUERY}`;
}

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
 * Mark all Mini-Warders (including Watch-2 150s, Watch-3 360s, and v3 Watch-4 ~430s) as spawned
 * on a simulation run object `r` so jumping `r.time` past 430s never accidentally spawns a warder
 * during isolated Watch-5 speed/blessing/boss tests.
 */
export function suppressAllMiniWarders(r) {
  if (!r || typeof r !== 'object') return r;
  const existing = r._warderSpawned && typeof r._warderSpawned === 'object' && !(r._warderSpawned instanceof Set)
    ? r._warderSpawned
    : {};
  const base = Object.assign({}, existing, {
    warder_150: true,
    warder_360: true,
    warder_420: true,
    warder_430: true,
    warder_435: true,
    warder_440: true,
    150: true,
    360: true,
    420: true,
    430: true,
    435: true,
    440: true,
  });
  r._warderSpawned = new Proxy(base, {
    get(target, prop) {
      if (prop === 'has') return () => true;
      if (prop === 'add') return function addSelf() { return r._warderSpawned; };
      if (typeof prop === 'symbol' || prop in Object.prototype) {
        return Reflect.get(target, prop);
      }
      return true;
    },
    has() {
      return true;
    },
  });
  return r._warderSpawned;
}

/**
 * Browser init script installing deterministic `window.__e2eStepFrames` and `window.__e2eSuppressWarders`.
 * Captures `gameFrameCb` STRICTLY once when `(!isStyleLab() && !gameFrameCb && cb && cb.name === 'frame')`
 * and short-circuits `inSyntheticStep` ONLY for the game loop so `boot-intro`, `menu-scene`, `.hero-stage__canvas`,
 * and `.cosmetic-shop-modal` rAF loops run natively and are NEVER hijacked or dropped.
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
    if (!isStyleLab() && !gameFrameCb && cb && cb.name === 'frame') {
      gameFrameCb = cb;
    }
    if (inSyntheticStep && (cb === gameFrameCb || cb?.name === 'frame')) {
      return ++syntheticId;
    }
    if (!isStyleLab() && cb && cb === gameFrameCb) {
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

  window.__e2eSuppressWarders = function e2eSuppressWarders(r) {
    const runObj = r || window.__wugeng?.game?.run;
    if (!runObj || typeof runObj !== 'object') return null;
    const existing = runObj._warderSpawned && typeof runObj._warderSpawned === 'object' && !(runObj._warderSpawned instanceof Set)
      ? runObj._warderSpawned
      : {};
    const base = Object.assign({}, existing, {
      warder_150: true,
      warder_360: true,
      warder_420: true,
      warder_430: true,
      warder_435: true,
      warder_440: true,
      150: true,
      360: true,
      420: true,
      430: true,
      435: true,
      440: true,
    });
    runObj._warderSpawned = new Proxy(base, {
      get(target, prop) {
        if (prop === 'has') return () => true;
        if (prop === 'add') return function addSelf() { return runObj._warderSpawned; };
        if (typeof prop === 'symbol' || prop in Object.prototype) {
          return Reflect.get(target, prop);
        }
        return true;
      },
      has() {
        return true;
      },
    });
    return true;
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

export async function suppressWardersInPage(page) {
  await page.evaluate(() => window.__e2eSuppressWarders?.(window.__wugeng?.game?.run));
}

/**
 * Browser-side in-page helper logic serialized into `bootToHub` for applying v2 + v3 `savePatch`
 * cleanly without brittle coupling to optional starter/wardrobe bridge subkeys.
 */
export const APPLY_SAVE_PATCH_IN_PAGE = (target, patch) => {
  if (!patch || !target) return;
  if (patch.coins !== undefined) target.coins = patch.coins;
  if (patch.daoName !== undefined) target.daoName = patch.daoName;
  if (patch.unlockedHeroes) target.unlockedHeroes = [...patch.unlockedHeroes];
  if (patch.selectedHero) target.selectedHero = patch.selectedHero;
  if (patch.unlockedWeapons) target.unlockedWeapons = [...patch.unlockedWeapons];
  if (patch.selectedStarterWeapon !== undefined) {
    target.selectedStarterWeapon = patch.selectedStarterWeapon;
    if (target.starterWeaponByHero && typeof target.starterWeaponByHero === 'object') {
      const h = patch.selectedHero || target.selectedHero || 'zhou';
      target.starterWeaponByHero[h] = patch.selectedStarterWeapon;
    }
  }
  if (patch.starterWeaponByHero && typeof patch.starterWeaponByHero === 'object') {
    target.starterWeaponByHero = Object.assign({}, target.starterWeaponByHero || {}, patch.starterWeaponByHero);
  }
  if (patch.nightUnlocked !== undefined) target.nightUnlocked = patch.nightUnlocked;
  if (patch.nightCleared !== undefined) target.nightCleared = patch.nightCleared;
  if (patch.selectedNight !== undefined) target.selectedNight = patch.selectedNight;
  if (patch.charms) {
    target.charms = patch.charms.map((c) => (typeof c === 'string' ? { relicId: c } : c));
  }
  if (patch.shop && typeof patch.shop === 'object') {
    target.shop = Object.assign({}, target.shop || {}, patch.shop);
  }
  if (patch.settings && typeof patch.settings === 'object') {
    target.settings = Object.assign({}, target.settings || {}, patch.settings);
  }
  if (patch.checkin && typeof patch.checkin === 'object') {
    target.checkin = Object.assign({}, target.checkin || {}, patch.checkin);
  }
  if (patch.codex && typeof patch.codex === 'object') {
    target.codex = target.codex || { weapons: [], evolutions: [], relics: [], enemies: {} };
    if (patch.codex.weapons) target.codex.weapons = [...patch.codex.weapons];
    if (patch.codex.evolutions) target.codex.evolutions = [...patch.codex.evolutions];
    if (patch.codex.relics) target.codex.relics = [...patch.codex.relics];
    if (patch.codex.enemies) target.codex.enemies = Object.assign({}, target.codex.enemies || {}, patch.codex.enemies);
  }
  if (patch.achievements && typeof patch.achievements === 'object') {
    target.achievements = Object.assign({}, target.achievements || {}, patch.achievements);
  }
  if (patch.achievementClaims) {
    target.achievementClaims = [...patch.achievementClaims];
  }
  if (patch.cosmetics && typeof patch.cosmetics === 'object') {
    target.cosmetics = target.cosmetics || {
      owned: [],
      equipped: { lantern: null, outfit: null, attackVfx: null, heroSkins: {} },
    };
    if (Array.isArray(patch.cosmetics.owned)) {
      target.cosmetics.owned = [...patch.cosmetics.owned];
    }
    if (patch.cosmetics.equipped && typeof patch.cosmetics.equipped === 'object') {
      target.cosmetics.equipped = Object.assign(
        { lantern: null, outfit: null, attackVfx: null, heroSkins: {} },
        target.cosmetics.equipped || {},
        patch.cosmetics.equipped,
      );
      if (patch.cosmetics.equipped.heroSkins) {
        target.cosmetics.equipped.heroSkins = Object.assign(
          {},
          target.cosmetics.equipped.heroSkins || {},
          patch.cosmetics.equipped.heroSkins,
        );
      }
    }
  }
  if (patch.leaderboard && typeof patch.leaderboard === 'object') {
    target.leaderboard = Object.assign(
      { bestScore: 0, bestEndlessSec: 0, bestKills: 0, pendingScore: 0, history: [] },
      target.leaderboard || {},
      patch.leaderboard,
    );
  }
  if (patch.stats && typeof patch.stats === 'object') {
    target.stats = Object.assign({}, target.stats || {}, patch.stats);
  }
};

/**
 * Create a pre-warmed worker slot on `390x844 @ dpr=1` booted at `${baseUrl}/index.html?skipIntro=1`.
 * Reusing baked procedural woodblock sprites & icons across standard tests avoids ~180x redundant CPU baking
 * while resetting storage, save, cosmetics, coop session, audio, settings, and overlays 100% cleanly before every test.
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
      const targetUrl = warmUrl(baseUrl);
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
        slot.context.setDefaultTimeout(3500);
        slot.context.setDefaultNavigationTimeout(9000);
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
        try {
          await slot.page.goto(targetUrl);
          await slot.page.waitForSelector('.screen--title');
        } catch (err) {
          if (!/crashed/i.test(err?.message || '')) throw err;
          try { await slot.context.close(); } catch {}
          slot.context = null;
          slot.page = null;
          return slot.ensureHealthy();
        }
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
        slot.styleLabContext.setDefaultTimeout(4000);
        slot.styleLabContext.setDefaultNavigationTimeout(9000);
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
        if (slot.pageErrors.length > 0 || myPage.url() !== warmUrl(slot.baseUrl)) {
          slot.tainted = true;
        } else {
          try {
            await myPage.evaluate(() => {
              const w = window.__wugeng;
              if (w?.coop) {
                try {
                  if (typeof w.coop.leave === 'function') w.coop.leave();
                  else if (typeof w.coop.close === 'function') w.coop.close();
                  else if (typeof w.coop.disconnect === 'function') w.coop.disconnect();
                  else if (typeof w.coop.destroy === 'function') w.coop.destroy();
                } catch {}
              }
              if (w?.game?.run) {
                try { w.game.finish(); } catch {}
                w.game.clear();
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
  context.setDefaultTimeout(opts.defaultTimeout ?? 5000);
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
 * Open `pageCount` tabs (`hostPage` + `N-1` guest pages) inside ONE shared isolated `BrowserContext`
 * so native `BroadcastChannel` connects across tabs while `sessionStorage['wugeng.peerId']` isolates
 * per-tab peer identity. Attaches `pageerror`, `console.error`, and HTTP `>=400` listeners to EVERY tab!
 */
export async function createCoopPages(browser, pageCount = 2, opts = {}) {
  const base = await createIsolatedPage(browser, {
    defaultTimeout: opts.defaultTimeout ?? 5500,
    ...opts,
    isolated: true,
  });
  const extraPages = [];
  for (let i = 1; i < pageCount; i++) {
    const p = await base.context.newPage();
    p.on('pageerror', (err) => base.pageErrors.push(`[tab${i}] ${err?.message || String(err)}`));
    p.on('console', (msg) => {
      if (msg.type() === 'error') base.consoleErrors.push(`[tab${i}] ${msg.text()}`);
    });
    p.on('response', (res) => {
      if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
        base.badResponses.push(`[tab${i}] ${res.status()} ${res.url()}`);
      }
    });
    extraPages.push(p);
  }
  const pages = [base.page, ...extraPages];
  const stepBoth = async (framesPerBatch = 6, batches = 1, stepOpts = {}) => {
    await stepCoopFrames(pages, framesPerBatch * batches, framesPerBatch, stepOpts);
  };
  return {
    ...base,
    pages,
    hostPage: base.page,
    guestPage: extraPages[0] || null,
    extraPages,
    stepBoth,
    close: async () => {
      for (const p of extraPages) {
        try {
          if (!p.isClosed()) await p.close();
        } catch {}
      }
      await base.close();
    },
  };
}

/**
 * Convenience 2-page Co-op pair alias accepting `(browser, opts)` or `(browser, baseUrl, opts)`.
 */
export async function createCoopPair(browser, baseUrlOrOpts = {}, maybeOpts = {}) {
  const opts = typeof baseUrlOrOpts === 'string' ? maybeOpts : (baseUrlOrOpts || {});
  return createCoopPages(browser, 2, opts);
}

/**
 * Step all active Co-op tabs in short interleaved bursts so `BroadcastChannel` frames and inputs
 * flush deterministically across tabs without blind timeouts.
 */
export async function stepCoopFrames(pages, totalFrames, batch = 6, stepOpts = {}) {
  const safeBatch = Math.max(1, batch);
  const loops = Math.max(1, Math.ceil(totalFrames / safeBatch));
  for (let i = 0; i < loops; i++) {
    const n = Math.min(safeBatch, totalFrames - i * safeBatch);
    if (n <= 0) break;
    const openPages = pages.filter((p) => p && !p.isClosed());
    if (!openPages.length) break;
    await Promise.all(
      openPages.map((p) => stepFrames(p, n, { stopOnOverlay: false, ...stepOpts }).catch(() => null)),
    );
    await new Promise((r) => setTimeout(r, 8));
    await Promise.all(
      openPages.map((p) => p.evaluate(() => new Promise((r) => setTimeout(r, 0))).catch(() => null)),
    );
  }
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

function buildBootQuery(opts = {}) {
  const raw = opts.query ? String(opts.query).replace(/^\?/, '') : '';
  const wantColdIntro = Boolean(
    opts.coldIntro ||
    opts.rawBoot ||
    opts.withIntro ||
    /(?:^|&)(?:skipIntro|introHold)=/.test(raw),
  );
  if (wantColdIntro) {
    return raw ? `?${raw}` : '';
  }
  return raw ? `?${WARM_QUERY}&${raw}` : `?${WARM_QUERY}`;
}

/**
 * Cold-boot `index.html` WITHOUT `skipIntro=1` (or with `?introHold=loading|logo`) inside an isolated context,
 * capturing `.boot-intro[data-intro-phase]` transitions via MutationObserver + rAF trace for `F1` tests.
 */
export async function bootColdIntro(browser, baseUrl, opts = {}) {
  const s = await createIsolatedPage(browser, {
    isolated: true,
    viewport: opts.viewport,
    deviceScaleFactor: opts.deviceScaleFactor,
    defaultTimeout: opts.defaultTimeout ?? 5500,
    beforeBootInitScript: () => {
      const trace = {
        phases: [],
        progressSamples: [],
        mountedCount: 0,
        canvasTexts: [],
      };
      window.__e2eIntroTrace = trace;
      const proto = window.CanvasRenderingContext2D?.prototype;
      if (proto && !proto.__e2eIntroTextWrapped) {
        const origFill = proto.fillText;
        const origStroke = proto.strokeText;
        const recordText = (t) => {
          if (t !== undefined && t !== null) {
            const str = String(t);
            if (str && trace.canvasTexts.length < 500) trace.canvasTexts.push(str);
          }
        };
        if (typeof origFill === 'function') {
          proto.fillText = function e2eIntroFillText(text, ...rest) {
            recordText(text);
            return origFill.call(this, text, ...rest);
          };
        }
        if (typeof origStroke === 'function') {
          proto.strokeText = function e2eIntroStrokeText(text, ...rest) {
            recordText(text);
            return origStroke.call(this, text, ...rest);
          };
        }
        proto.__e2eIntroTextWrapped = true;
      }
      const sample = () => {
        const el = document.querySelector('.boot-intro');
        if (el) {
          trace.mountedCount = Math.max(trace.mountedCount, document.querySelectorAll('.boot-intro').length);
          const ph = el.getAttribute('data-intro-phase');
          if (ph && trace.phases[trace.phases.length - 1] !== ph) {
            trace.phases.push(ph);
          }
        }
        const st = window.__wugengIntro;
        if (st && typeof st.phase === 'string' && trace.phases[trace.phases.length - 1] !== st.phase && st.phase !== 'done') {
          trace.phases.push(st.phase);
        }
        if (st && typeof st.progress === 'number') {
          trace.progressSamples.push(st.progress);
        }
      };
      const obs = new MutationObserver(sample);
      let obsAttached = false;
      const attachObs = () => {
        if (obsAttached || !document.documentElement) return;
        obsAttached = true;
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-intro-phase', 'style', 'class'],
        });
      };
      attachObs();
      if (!obsAttached) {
        document.addEventListener('readystatechange', attachObs);
        window.addEventListener('DOMContentLoaded', attachObs, { once: true });
      }
      window.addEventListener('DOMContentLoaded', sample, { once: true });
      const poll = setInterval(() => {
        sample();
        if (document.querySelector('.screen--title, .screen--hub') && !document.querySelector('.boot-intro')) {
          clearInterval(poll);
        }
      }, 12);
    },
  });

  const rawQ = opts.query ? `?${String(opts.query).replace(/^\?/, '')}` : '';
  try {
    const t0 = performance.now();
    await s.page.goto(`${baseUrl}/index.html${rawQ}`);

    if (opts.waitForHold) {
      await s.page.waitForFunction(() => window.__wugengIntro?.ready === true, null, { timeout: 4500 });
      await s.page.evaluate(() => document.fonts.ready);
      return { ...s, elapsedMs: performance.now() - t0 };
    }

    if (opts.waitForTitle !== false) {
      await s.page.waitForSelector('.screen--title', { timeout: opts.titleTimeoutMs ?? 4500 });
      const elapsedMs = performance.now() - t0;
      await s.page.evaluate(() => document.fonts.ready);
      await s.page.waitForFunction(() => Boolean(window.__wugeng && window.__wugeng.game));
      return { ...s, elapsedMs };
    }

    return { ...s, elapsedMs: performance.now() - t0 };
  } catch (err) {
    if (!opts._retriedCrash && /crashed/i.test(err?.message || '')) {
      try { await s.close(); } catch {}
      return bootColdIntro(browser, baseUrl, { ...opts, _retriedCrash: true });
    }
    try { await s.close(); } catch {}
    throw err;
  }
}

/**
 * Boot index.html (defaulting to `?skipIntro=1` unless `opts.coldIntro` / `introHold` is set),
 * wait for `.screen--title` or `.screen--hub` (supporting `?room=` / `?invite=` auto-join deep-links) + fonts.
 */
export async function bootGame(page, baseUrl, opts = {}) {
  const query = buildBootQuery(opts);
  const target = `${baseUrl}/index.html${query}`;
  await page.goto(target);
  await page.waitForSelector('.screen--title, .screen--hub');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Boolean(window.__wugeng && window.__wugeng.game));
  if (target === warmUrl(baseUrl) && page.__isWarmSlot && baseUrl === page.__warmBaseUrl) {
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
    !opts.coldIntro &&
    !opts.rawBoot &&
    !opts.withIntro &&
    page.__isWarmSlot &&
    baseUrl === page.__warmBaseUrl &&
    page.url() === warmUrl(baseUrl),
  );

  if (canFastReset) {
    await page.evaluate(
      ({ patch, patchFnSrc }) => {
        const w = window.__wugeng;
        if (w.coop) {
          try {
            if (typeof w.coop.leave === 'function') w.coop.leave();
            else if (typeof w.coop.close === 'function') w.coop.close();
            else if (typeof w.coop.disconnect === 'function') w.coop.disconnect();
            else if (typeof w.coop.destroy === 'function') w.coop.destroy();
          } catch {}
        }
        if (w.game.run) {
          try { w.game.finish(); } catch {}
        }
        w.game.clear();
        document
          .querySelectorAll('#ui .veil, #ui .veil--inspector, #ui .toast, #ui .run-hint, .boot-intro, body > .mock-ad')
          .forEach((el) => el.remove());
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
          // eslint-disable-next-line no-new-func
          const applyPatch = new Function('return (' + patchFnSrc + ')')();
          applyPatch(target, patch);
          w.persist(false);
        }

        w.game.applySettings({
          shake: target.settings?.shake ?? true,
          dmgText: target.settings?.dmgText ?? 'all',
          lowQuality: target.settings?.lowQuality ?? false,
          cosmetics: target.cosmetics?.equipped
            ? structuredClone(target.cosmetics.equipped)
            : { lantern: null, outfit: null, attackVfx: null, heroSkins: {} },
        });
        w.audio.unlock();
        w.audio.resume('all');
        w.audio.setEnabled({ sfx: target.settings?.sfx ?? true, music: target.settings?.music ?? true });
        w.showHub();
      },
      { patch: opts.savePatch || null, patchFnSrc: APPLY_SAVE_PATCH_IN_PAGE.toString() },
    );
    await page.waitForSelector('.screen--hub');
    return;
  }

  await bootGame(page, baseUrl, opts);
  const alreadyInHub = await page.evaluate(() => Boolean(document.querySelector('.screen--hub')));
  if (!alreadyInHub) {
    await page.evaluate(() => {
      const btn = document.querySelector('.title-actions .btn--seal') || document.querySelector('.screen--title button');
      if (btn) btn.click();
      else {
        window.__wugeng.audio.unlock();
        window.__wugeng.showHub();
      }
    });
  }
  await page.waitForSelector('.screen--hub');

  if (opts.savePatch) {
    await page.evaluate(
      ({ patch, patchFnSrc }) => {
        const w = window.__wugeng;
        const s = w.save;
        // eslint-disable-next-line no-new-func
        const applyPatch = new Function('return (' + patchFnSrc + ')')();
        applyPatch(s, patch);
        w.game.applySettings({
          shake: s.settings?.shake ?? true,
          dmgText: s.settings?.dmgText ?? 'all',
          lowQuality: s.settings?.lowQuality ?? false,
          cosmetics: s.cosmetics?.equipped
            ? structuredClone(s.cosmetics.equipped)
            : { lantern: null, outfit: null, attackVfx: null, heroSkins: {} },
        });
        w.persist(false);
        w.showHub();
      },
      { patch: opts.savePatch, patchFnSrc: APPLY_SAVE_PATCH_IN_PAGE.toString() },
    );
    await page.waitForSelector('.screen--hub');
  }
}

export async function bootAndStartRun(page, baseUrl, opts = {}) {
  await bootToHub(page, baseUrl, opts);
  const heroId = opts.heroId || opts.savePatch?.selectedHero || 'zhou';
  const startWeapon = opts.startWeapon ?? null;
  const unlockedWeapons = opts.unlockedWeapons ?? null;
  const nightLevel = opts.nightLevel ?? 0;
  const charm = opts.charm ?? null;
  const seed = opts.seed ?? 12345;
  const coop = opts.coop ?? null;
  await page.evaluate(
    ({ heroId: h, startWeapon: sw, unlockedWeapons: uw, nightLevel: n, charm: c, seed: s, coop: cp }) => {
      const w = window.__wugeng;
      if (w?.save) {
        if (h) w.save.selectedHero = h;
        if (uw !== null && uw !== undefined) {
          w.save.unlockedWeapons = [...uw];
        }
        if (sw !== null && sw !== undefined) {
          w.save.selectedStarterWeapon = sw;
          if (w.save.starterWeaponByHero && typeof w.save.starterWeaponByHero === 'object') {
            w.save.starterWeaponByHero[h] = sw;
          }
        }
      }
      const runOpts = { heroId: h, nightLevel: n, charm: c, seed: s };
      if (sw !== null && sw !== undefined) runOpts.startWeapon = sw;
      if (uw !== null && uw !== undefined) runOpts.unlockedWeapons = uw;
      if (cp !== null && cp !== undefined) runOpts.coop = cp;
      w.startRun(runOpts);
      if (
        (s !== undefined && w.game.run?.seed !== s) ||
        (sw && w.game.run?.weapons?.[0]?.id !== sw)
      ) {
        const meta = w.game.run?.meta || {};
        w.game.start({ ...runOpts, meta });
      }
      window.__e2eStepFrames(1);
    },
    { heroId, startWeapon, unlockedWeapons, nightLevel, charm, seed, coop },
  );
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

    if (startLv === 0) {
      const res1 = doOneDomLevelUp(1);
      if (!res1.ok) return res1;
    }

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
 * Read effective visual opacity of `.veil--inspector` (checking both `.veil--inspector` and its inner card/scroll)
 * and engage/release `[data-action="peek-battlefield"]` supporting BOTH click-toggle and pointerdown-hold!
 */
export async function readInspectorOpacity(page) {
  return page.evaluate(() => {
    const veil = document.querySelector('.veil--inspector');
    if (!veil) return null;
    const veilOp = parseFloat(getComputedStyle(veil).opacity || '1');
    let inner = veil.querySelector(
      '.scroll, .inspector-panel, .inspector-card, .modal-card, .inspector-drawer, .inspector-body, .inspector-sheet, .inspector-content',
    );
    if (!inner && veil.children.length > 0) {
      let bestArea = -1;
      for (const ch of veil.children) {
        const r = ch.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area > bestArea) {
          bestArea = area;
          inner = ch;
        }
      }
    }
    const innerOp = inner ? parseFloat(getComputedStyle(inner).opacity || '1') : 1;
    const bgMatch = getComputedStyle(veil).backgroundColor.match(/rgba?\(([^)]+)\)/);
    let bgAlpha = 1;
    if (bgMatch) {
      const parts = bgMatch[1].split(',').map((s) => parseFloat(s.trim()));
      if (parts.length >= 4 && Number.isFinite(parts[3])) bgAlpha = parts[3];
    }
    return {
      effectiveOpacity: Math.min(veilOp, veilOp * innerOp),
      veilOpacity: veilOp,
      innerOpacity: innerOp,
      bgAlpha,
      peekingClass:
        veil.classList.contains('is-peeking') ||
        veil.classList.contains('veil--peek') ||
        veil.dataset.peeking === '1' ||
        veil.dataset.peek === 'true',
    };
  });
}

export async function engageInspectorPeek(page) {
  await requireOpenSelector(page, '[data-action="peek-battlefield"]', 'Expected [data-action="peek-battlefield"] in .veil--inspector');
  const holdAttempt = await page.evaluate(async () => {
    const btn = document.querySelector('[data-action="peek-battlefield"]');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await new Promise((r) => requestAnimationFrame(r));
  });
  void holdAttempt;
  let state = await readInspectorOpacity(page);
  if (state && (state.effectiveOpacity <= 0.45 || state.peekingClass)) {
    return { mode: 'hold', state };
  }
  await page.evaluate(async () => {
    const btn = document.querySelector('[data-action="peek-battlefield"]');
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    btn.click();
    await new Promise((r) => requestAnimationFrame(r));
  });
  state = await readInspectorOpacity(page);
  return { mode: 'toggle', state };
}

export async function releaseInspectorPeek(page, mode = 'toggle') {
  await page.evaluate(async (m) => {
    const btn = document.querySelector('[data-action="peek-battlefield"]');
    if (!btn) return;
    if (m === 'hold') {
      btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true }));
    } else {
      btn.click();
    }
    await new Promise((r) => requestAnimationFrame(r));
  }, mode);
  let state = await readInspectorOpacity(page);
  if (state && state.effectiveOpacity <= 0.45) {
    await page.evaluate(async () => {
      document.querySelector('[data-action="peek-battlefield"]')?.click();
      await new Promise((r) => requestAnimationFrame(r));
    });
    state = await readInspectorOpacity(page);
  }
  return state;
}

/**
 * Normalize v3 `save` cosmetics & starter weapon state across allowed `PROJECT.md §3` representations.
 */
export async function readNormalizedSave(page) {
  return page.evaluate(() => {
    let parsed = {};
    try {
      const rawStr = localStorage.getItem('wugeng.save');
      const p = rawStr ? JSON.parse(rawStr) : {};
      parsed = p && typeof p === 'object' ? p : {};
    } catch {
      parsed = {};
    }
    const s = (window.__wugeng?.save && typeof window.__wugeng.save === 'object')
      ? window.__wugeng.save
      : parsed;
    const hero = s.selectedHero || 'zhou';
    const starter = (s.starterWeaponByHero && s.starterWeaponByHero[hero]) || s.selectedStarterWeapon || null;
    const owned = new Set([
      ...(Array.isArray(s.cosmetics?.owned) ? s.cosmetics.owned : []),
      ...(Array.isArray(s.cosmetics?.ownedSkins) ? s.cosmetics.ownedSkins : []),
      ...(Array.isArray(s.cosmetics?.ownedVfx) ? s.cosmetics.ownedVfx : []),
      ...(Array.isArray(s.wardrobe?.owned) ? s.wardrobe.owned : []),
    ]);
    const heroSkins = Object.assign(
      {},
      s.wardrobe?.heroSkins || {},
      s.cosmetics?.equipped?.heroSkins || {},
    );
    const attackVfx = s.cosmetics?.equipped?.attackVfx ?? s.wardrobe?.attackVfx ?? 'default';
    return {
      raw: s,
      version: s.version,
      coins: s.coins,
      selectedHero: hero,
      starterWeapon: starter,
      unlockedHeroes: s.unlockedHeroes || [],
      unlockedWeapons: s.unlockedWeapons || [],
      ownedCosmetics: [...owned],
      heroSkins,
      attackVfx: attackVfx || 'default',
      achievementClaims: s.achievementClaims || [],
      achievements: s.achievements || {},
      leaderboard: s.leaderboard || {},
    };
  });
}

/**
 * Sample `#game-canvas` pixels on a grid and check the 6-color Chinese woodblock palette invariant:
 * every anchor in palette.js satisfies R >= G >= B (with ±18 tolerance for paper grain/AA).
 */
export async function auditCanvasWoodblockPalette(page, sampleGrid = 45) {
  return page.evaluate((grid) => {
    const c = document.getElementById('game-canvas');
    if (!c || !c.width || !c.height) {
      return { total: 0, violations: 9999, violationRatio: 1, paper: 0, ink: 0, verm: 0 };
    }
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
        if (r + 18 < g || r + 18 < b) violations++;
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

/**
 * Pure `ctx.getImageData` Canvas Sprite / Region Analyzer (`F1`, `F5`, `F6`, `F7`).
 * Extracts foreground pixel counts, bounding box, upper/lower quadrant fill ratios, mineral RGB hue buckets,
 * FNV-1a hash, and a normalized `64x64` RGBA + binary foreground/luminance mask for cross-snapshot comparisons.
 */
export async function analyzeCanvasSpriteBox(page, canvasSelector = '#game-canvas', cropRect = null, opts = {}) {
  return page.evaluate(
    ({ sel, rect, options }) => {
      const c = document.querySelector(sel);
      if (!c || !c.width || !c.height) {
        return null;
      }
      const ctx = c.getContext('2d');
      const scaleX = options.cssCoords && c.clientWidth ? c.width / c.clientWidth : 1;
      const scaleY = options.cssCoords && c.clientHeight ? c.height / c.clientHeight : 1;
      const rx = rect ? Math.max(0, Math.floor(rect.x * scaleX)) : 0;
      const ry = rect ? Math.max(0, Math.floor(rect.y * scaleY)) : 0;
      const rw = rect ? Math.min(c.width - rx, Math.max(1, Math.floor(rect.width * scaleX))) : c.width;
      const rh = rect ? Math.min(c.height - ry, Math.max(1, Math.floor(rect.height * scaleY))) : c.height;
      if (rw <= 0 || rh <= 0) return null;

      const data = ctx.getImageData(rx, ry, rw, rh).data;

      // Estimate background color from perimeter corners unless explicitly provided
      let bgR = 0;
      let bgG = 0;
      let bgB = 0;
      let bgA = 0;
      if (options.bgColor) {
        bgR = options.bgColor.r;
        bgG = options.bgColor.g;
        bgB = options.bgColor.b;
        bgA = options.bgColor.a ?? 255;
      } else {
        const maxCx = Math.max(0, rw - 1);
        const maxCy = Math.max(0, rh - 1);
        const midCy = Math.min(maxCy, Math.max(0, Math.floor(rh / 2)));
        const cornerCoords = [
          [Math.min(maxCx, 1), Math.min(maxCy, 1)],
          [Math.min(maxCx, Math.max(0, rw - 2)), Math.min(maxCy, 1)],
          [Math.min(maxCx, 1), Math.min(maxCy, Math.max(0, rh - 2))],
          [Math.min(maxCx, Math.max(0, rw - 2)), Math.min(maxCy, Math.max(0, rh - 2))],
          [0, midCy],
          [maxCx, midCy],
        ];
        const rs = [];
        const gs = [];
        const bs = [];
        const as = [];
        for (const [cx, cy] of cornerCoords) {
          const ci = (cy * rw + cx) * 4;
          rs.push(data[ci]);
          gs.push(data[ci + 1]);
          bs.push(data[ci + 2]);
          as.push(data[ci + 3]);
        }
        rs.sort((a, b) => a - b);
        gs.sort((a, b) => a - b);
        bs.sort((a, b) => a - b);
        as.sort((a, b) => a - b);
        const mid = Math.floor(rs.length / 2);
        bgR = rs[mid];
        bgG = gs[mid];
        bgB = bs[mid];
        bgA = as[mid];
      }
      const bgLuma = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
      const fgThreshold = options.fgThreshold ?? 36;
      const lumaThreshold = options.lumaThreshold ?? 26;

      let nonBgPixels = 0;
      let upperFg = 0;
      let lowerFg = 0;
      let minX = rw;
      let maxX = -1;
      let minY = rh;
      let maxY = -1;
      let hash = 2166136261;
      const splitY = Math.floor(rh * 0.45);
      const totalPx = rw * rh;
      const nativeFg = new Uint8Array(totalPx);

      const hueBuckets = {
        ink: 0,
        paper: 0,
        verm: 0,
        gold: 0,
        jade: 0,
        azure: 0,
        violet: 0,
        coolAny: 0,
      };

      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const pIdx = y * rw + x;
          const i = pIdx * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          hash = Math.imul(
            hash ^ (r >> 2) ^ ((g >> 2) << 6) ^ ((b >> 2) << 12) ^ ((a >> 3) << 18),
            16777619,
          ) >>> 0;
          if (a < 25) continue;
          const isFg = bgA <= 25 || (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) > fgThreshold);
          if (isFg) {
            nativeFg[pIdx] = 1;
            nonBgPixels++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (y < splitY) upperFg++;
            else lowerFg++;
          }
          if (r < 50 && g < 50 && b < 50) hueBuckets.ink++;
          if (r > 200 && g > 185 && b > 155 && Math.abs(r - g) < 35) hueBuckets.paper++;
          if (r > 135 && r - g > 48 && r - b > 52) hueBuckets.verm++;
          if (r > 195 && g > 145 && b < 145 && r >= g) hueBuckets.gold++;
          if (g > r + 20 && g > 95) hueBuckets.jade++;
          if (b > r + 22 && g > r + 8 && b > 120) hueBuckets.azure++;
          if (b > g + 18 && r > 75 && b > 115) hueBuckets.violet++;
          if (g > r + 18 || b > r + 18) hueBuckets.coolAny++;
        }
      }

      // Perimeter-flood-filled exterior background on native rw x rh grid (prevents 1px outline puncture at any scale)
      const nativeExterior = new Uint8Array(totalPx);
      const bfsQueue = new Int32Array(totalPx);
      let qHead = 0;
      let qTail = 0;
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          if (x === 0 || x === rw - 1 || y === 0 || y === rh - 1) {
            const pIdx = y * rw + x;
            if (nativeFg[pIdx] === 0 && nativeExterior[pIdx] === 0) {
              nativeExterior[pIdx] = 1;
              bfsQueue[qTail++] = pIdx;
            }
          }
        }
      }
      while (qHead < qTail) {
        const cur = bfsQueue[qHead++];
        const cy = (cur / rw) | 0;
        const cx = cur - cy * rw;
        if (cx > 0) {
          const ni = cur - 1;
          if (nativeExterior[ni] === 0 && nativeFg[ni] === 0) {
            nativeExterior[ni] = 1;
            bfsQueue[qTail++] = ni;
          }
        }
        if (cx + 1 < rw) {
          const ni = cur + 1;
          if (nativeExterior[ni] === 0 && nativeFg[ni] === 0) {
            nativeExterior[ni] = 1;
            bfsQueue[qTail++] = ni;
          }
        }
        if (cy > 0) {
          const ni = cur - rw;
          if (nativeExterior[ni] === 0 && nativeFg[ni] === 0) {
            nativeExterior[ni] = 1;
            bfsQueue[qTail++] = ni;
          }
        }
        if (cy + 1 < rh) {
          const ni = cur + rw;
          if (nativeExterior[ni] === 0 && nativeFg[ni] === 0) {
            nativeExterior[ni] = 1;
            bfsQueue[qTail++] = ni;
          }
        }
      }

      // Sample normalized 64x64 grid for fast pairwise comparison
      const G = 64;
      const gridRgba = new Array(G * G * 4);
      const gridFgMask = new Array(G * G);
      const gridLumaMask = new Array(G * G);
      const gridOuterMask = new Array(G * G);
      for (let gy = 0; gy < G; gy++) {
        const sy = Math.min(rh - 1, Math.floor(((gy + 0.5) * rh) / G));
        for (let gx = 0; gx < G; gx++) {
          const sx = Math.min(rw - 1, Math.floor(((gx + 0.5) * rw) / G));
          const pIdx = sy * rw + sx;
          const si = pIdx * 4;
          const r = data[si];
          const g = data[si + 1];
          const b = data[si + 2];
          const a = data[si + 3];
          const gi = gy * G + gx;
          gridRgba[gi * 4] = r;
          gridRgba[gi * 4 + 1] = g;
          gridRgba[gi * 4 + 2] = b;
          gridRgba[gi * 4 + 3] = a;
          const fg = nativeFg[pIdx] === 1;
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const lm = a >= 25 && (bgA <= 25 || Math.abs(luma - bgLuma) > lumaThreshold);
          gridFgMask[gi] = fg ? 1 : 0;
          gridLumaMask[gi] = lm ? 1 : 0;
          gridOuterMask[gi] = nativeExterior[pIdx] === 1 ? 0 : 1;
        }
      }

      const bboxWidth = maxX >= minX ? maxX - minX + 1 : 0;
      const bboxHeight = maxY >= minY ? maxY - minY + 1 : 0;

      return {
        width: rw,
        height: rh,
        totalPixels: totalPx,
        nonBgPixels,
        fillRatio: totalPx ? nonBgPixels / totalPx : 0,
        bbox: {
          minX: maxX >= minX ? minX : 0,
          maxX: maxX >= minX ? maxX : 0,
          minY: maxY >= minY ? minY : 0,
          maxY: maxY >= minY ? maxY : 0,
          width: bboxWidth,
          height: bboxHeight,
        },
        upperFillRatio: splitY * rw > 0 ? upperFg / (splitY * rw) : 0,
        lowerFillRatio: (rh - splitY) * rw > 0 ? lowerFg / ((rh - splitY) * rw) : 0,
        hash,
        hueBuckets,
        bgColor: { r: bgR, g: bgG, b: bgB, a: bgA },
        gridRgba,
        gridFgMask,
        gridLumaMask,
        gridOuterMask,
      };
    },
    { sel: canvasSelector, rect: cropRect, options: opts },
  );
}

function computeOuterMaskFromGridFg(gridFgMask, G = 64) {
  const exterior = new Uint8Array(G * G);
  const queue = [];
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      if (gx === 0 || gx === G - 1 || gy === 0 || gy === G - 1) {
        const gi = gy * G + gx;
        if (!gridFgMask[gi] && exterior[gi] === 0) {
          exterior[gi] = 1;
          queue.push(gi);
        }
      }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cy = (cur / G) | 0;
    const cx = cur - cy * G;
    if (cx > 0 && exterior[cur - 1] === 0 && !gridFgMask[cur - 1]) {
      exterior[cur - 1] = 1;
      queue.push(cur - 1);
    }
    if (cx + 1 < G && exterior[cur + 1] === 0 && !gridFgMask[cur + 1]) {
      exterior[cur + 1] = 1;
      queue.push(cur + 1);
    }
    if (cy > 0 && exterior[cur - G] === 0 && !gridFgMask[cur - G]) {
      exterior[cur - G] = 1;
      queue.push(cur - G);
    }
    if (cy + 1 < G && exterior[cur + G] === 0 && !gridFgMask[cur + G]) {
      exterior[cur + G] = 1;
      queue.push(cur + G);
    }
  }
  const out = new Array(G * G);
  for (let gi = 0; gi < G * G; gi++) out[gi] = exterior[gi] === 1 ? 0 : 1;
  return out;
}

/**
 * Pure Node-side structural & chromatic comparator between two `analyzeCanvasSpriteBox` snapshots.
 * `silhouetteXorRatio` uses `gridFgMask` (for `F6` ring/arc/stroke geometry), while
 * `upperSilhouetteXorRatio` and `lowerSilhouetteXorRatio` use perimeter-flood-filled `gridOuterMask`
 * so enclosed interior-only skin color swaps on an identical outer polygon score 0% XOR.
 */
export function compareSpriteSnapshots(snapA, snapB) {
  assert.ok(snapA && snapB, 'Expected two non-null canvas sprite snapshots');
  const G = 64;
  const splitGy = Math.floor(G * 0.45);
  const outerMaskA = snapA.gridOuterMask || computeOuterMaskFromGridFg(snapA.gridFgMask, G);
  const outerMaskB = snapB.gridOuterMask || computeOuterMaskFromGridFg(snapB.gridFgMask, G);
  let unionFg = 0;
  let diffColor = 0;
  let xorFg = 0;
  let unionLuma = 0;
  let xorLuma = 0;
  let upperUnion = 0;
  let upperXor = 0;
  let lowerUnion = 0;
  let lowerXor = 0;

  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const gi = gy * G + gx;
      const fgA = snapA.gridFgMask[gi];
      const fgB = snapB.gridFgMask[gi];
      if (fgA || fgB) {
        unionFg++;
        if (fgA !== fgB) xorFg++;
        const ri = gi * 4;
        const cDelta =
          Math.abs(snapA.gridRgba[ri] - snapB.gridRgba[ri]) +
          Math.abs(snapA.gridRgba[ri + 1] - snapB.gridRgba[ri + 1]) +
          Math.abs(snapA.gridRgba[ri + 2] - snapB.gridRgba[ri + 2]) +
          Math.abs(snapA.gridRgba[ri + 3] - snapB.gridRgba[ri + 3]);
        if (cDelta > 42 || fgA !== fgB) diffColor++;
      }
      const outA = outerMaskA[gi];
      const outB = outerMaskB[gi];
      if (outA || outB) {
        if (gy < splitGy) {
          upperUnion++;
          if (outA !== outB) upperXor++;
        } else {
          lowerUnion++;
          if (outA !== outB) lowerXor++;
        }
      }
      const lmA = snapA.gridLumaMask[gi];
      const lmB = snapB.gridLumaMask[gi];
      if (lmA || lmB) {
        unionLuma++;
        if (lmA !== lmB) xorLuma++;
      }
    }
  }

  const keys = ['ink', 'verm', 'gold', 'jade', 'azure', 'violet'];
  const sumA = Math.max(1, keys.reduce((s, k) => s + (snapA.hueBuckets[k] || 0), 0));
  const sumB = Math.max(1, keys.reduce((s, k) => s + (snapB.hueBuckets[k] || 0), 0));
  let l1HueDistance = 0;
  for (const k of keys) {
    l1HueDistance += Math.abs((snapA.hueBuckets[k] || 0) / sumA - (snapB.hueBuckets[k] || 0) / sumB);
  }

  return {
    pixelDiffRatio: unionFg ? diffColor / unionFg : 0,
    silhouetteXorRatio: unionFg ? xorFg / unionFg : 0,
    lumaMaskXorRatio: unionLuma ? xorLuma / unionLuma : 0,
    upperSilhouetteXorRatio: upperUnion ? upperXor / upperUnion : 0,
    lowerSilhouetteXorRatio: lowerUnion ? lowerXor / lowerUnion : 0,
    l1HueDistance,
    bboxWidthDelta: Math.abs(snapA.bbox.width - snapB.bbox.width),
    bboxHeightDelta: Math.abs(snapA.bbox.height - snapB.bbox.height),
    unionFg,
  };
}

export async function compareCanvasRegions(page, canvasSelector, rectA, rectB, opts = {}) {
  const [snapA, snapB] = await Promise.all([
    analyzeCanvasSpriteBox(page, canvasSelector, rectA, opts),
    analyzeCanvasSpriteBox(page, canvasSelector, rectB, opts),
  ]);
  return {
    snapA,
    snapB,
    ...compareSpriteSnapshots(snapA, snapB),
  };
}

/**
 * Priority-chained modal close helper (avoids CSS `querySelector('A, B')` DOM pre-order traps
 * when a modal header/body contains `.btn--ghost` tabs or cross-links).
 */
export async function closeActiveModal(page, preferredAction = null) {
  return page.evaluate((pref) => {
    const scope = document.querySelector('#ui .veil:last-of-type') || document.querySelector('#ui .veil');
    if (!scope) return false;
    const btn =
      (pref ? scope.querySelector(`[data-action="${pref}"]`) : null) ||
      scope.querySelector('[data-action="close-market"]') ||
      scope.querySelector('[data-action="close-achievements"]') ||
      scope.querySelector('[data-action="close-leaderboard"]') ||
      scope.querySelector('[data-action="close-coop"]') ||
      scope.querySelector('[data-action="close-modal"]') ||
      scope.querySelector('[data-action^="close"]') ||
      scope.querySelector('.modal-close') ||
      scope.querySelector('.scroll__foot .btn--ghost') ||
      scope.querySelector('.scroll__foot .btn--seal') ||
      scope.querySelector('.scroll__foot button:last-child') ||
      [...scope.querySelectorAll('button')].find((b) => /^(?:关闭|返回|收起|知晓|知道了|×|✕)$/.test((b.textContent || '').trim())) ||
      scope.querySelector('.btn--ghost');
    if (!btn) return false;
    btn.click();
    return true;
  }, preferredAction);
}

/**
 * Inspect `.signature-badge` visibility in Hub DOM (supporting `.is-on`, `.is-selected`, `.is-active`,
 * `aria-checked="true"`, `aria-pressed="true"`, and `aria-selected="true"`).
 */
export async function checkHubSignatureBadge(page) {
  return page.evaluate(() => {
    const badges = [...document.querySelectorAll('.signature-badge')];
    const active = badges.filter((el) => {
      if (el.hidden || el.classList.contains('is-hidden') || el.classList.contains('is-inactive')) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity || '1') < 0.1) return false;
      const starterCard = el.closest('[data-starter-weapon]');
      if (starterCard) {
        return (
          starterCard.classList.contains('is-on') ||
          starterCard.classList.contains('is-selected') ||
          starterCard.classList.contains('is-active') ||
          starterCard.getAttribute('aria-checked') === 'true' ||
          starterCard.getAttribute('aria-pressed') === 'true' ||
          starterCard.getAttribute('aria-selected') === 'true'
        );
      }
      return true;
    });
    const activeStarterEl = document.querySelector(
      '[data-starter-weapon].is-on, [data-starter-weapon].is-selected, [data-starter-weapon].is-active, [data-starter-weapon][aria-checked="true"], [data-starter-weapon][aria-pressed="true"], [data-starter-weapon][aria-selected="true"]',
    );
    return {
      visible: active.length > 0,
      text: active.map((x) => x.textContent || '').join(' '),
      activeStarterWeapon: activeStarterEl?.getAttribute('data-starter-weapon') || null,
    };
  });
}

/**
 * Shared Ghost-Market (`.cosmetic-shop-modal`) interaction helper supporting in-card buttons,
 * master-detail preview/footer buttons, `<button>` cards, per-hero skin filtering, and comma-formatted prices.
 */
export async function shopBuyAndEquipInModal(page, opts = {}) {
  return page.evaluate(async (o) => {
    const modal = document.querySelector('.cosmetic-shop-modal');
    if (!modal) return { ok: false, reason: 'Missing .cosmetic-shop-modal' };

    const vfxNameRe = /古墨朱砂|青冥幽火|紫电天罡|鎏金神诏|玄霜寒月/;
    const heroNamePatterns = {
      zhou: '周|更夫',
      mian: '绵|面|纸匠',
      daotong: '童|道童',
      yinyang: '观星|阴阳',
      tiejiang: '石敢当|铁匠',
      nuoxi: '青衣|傩',
    };

    const extractPrice = (el) => {
      if (!el) return 0;
      const dp = Number(el.dataset?.price || el.dataset?.cost || '');
      if (Number.isFinite(dp) && dp > 0) return dp;
      const clean = (el.textContent || '').replace(/,/g, '');
      if (/功绩|成就/.test(clean) && !/铜钱/.test(clean)) return 0;
      const m = clean.match(/(?:^|\D)([3-9]\d\d|[12]\d\d\d)(?:\D|$)/);
      return m ? Number(m[1]) : 0;
    };

    const findActionBtn = (cardEl, labelRe) => {
      const matchBtn = (b) => b && !b.disabled && labelRe.test((b.textContent || '').replace(/,/g, ''));
      if (cardEl) {
        const inCard = [...cardEl.querySelectorAll('button')].find(matchBtn);
        if (inCard) return inCard;
        if (cardEl.tagName === 'BUTTON' && matchBtn(cardEl)) return cardEl;
      }
      return (
        [...modal.querySelectorAll('button')].find((b) => {
          if (!matchBtn(b)) return false;
          const ownerCard = b.closest('[data-skin-id], [data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card');
          return !ownerCard || ownerCard === cardEl;
        }) || null
      );
    };

    const isAchOnlyCard = (el) => {
      if (!el) return false;
      if (el.dataset?.unlock === 'achievement' || el.dataset?.source === 'achievement') return true;
      const clean = (el.textContent || '').replace(/,/g, '');
      return /功绩|成就/.test(clean) && !/铜钱/.test(clean);
    };

    const isDefaultCard = (el) => {
      if (!el) return false;
      const idStr = (el.dataset?.skinId || el.dataset?.vfxId || el.dataset?.cosmeticId || el.dataset?.id || '').toLowerCase();
      if (idStr === 'default' || idStr.endsWith('_default') || idStr.endsWith('-default')) return true;
      return /默认|原装|初始|古墨朱砂/.test(el.textContent || '') && extractPrice(el) === 0 && !isAchOnlyCard(el);
    };

    let targetCard = null;

    if (o.kind === 'vfx') {
      const vfxTab = [...modal.querySelectorAll('button, [role="tab"]')].find(
        (b) =>
          /特效|锋芒|兵气|灵光/.test(b.textContent || '') &&
          !b.hasAttribute('data-skin-id') &&
          !b.hasAttribute('data-vfx-id') &&
          !b.classList.contains('cosmetic-card') &&
          !b.classList.contains('shop-card') &&
          !b.classList.contains('market-card') &&
          !b.closest('.shop-card, .cosmetic-card, .market-card'),
      );
      if (vfxTab) {
        vfxTab.click();
        await new Promise((r) => requestAnimationFrame(r));
      }
      const vfxId = o.vfxId || 'jade_ghostfire';
      targetCard =
        modal.querySelector(`[data-vfx-id="${vfxId}"], [data-cosmetic-id="${vfxId}"], [data-item-id="${vfxId}"]`) ||
        [...modal.querySelectorAll('[data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')].find(
          (el) =>
            el.dataset?.id === vfxId ||
            (vfxId === 'jade_ghostfire' && (el.textContent || '').includes('青冥幽火')) ||
            (vfxId === 'violet_thunder' && (el.textContent || '').includes('紫电天罡')) ||
            (vfxId === 'gilded_imperial' && (el.textContent || '').includes('鎏金神诏')) ||
            (vfxId === 'frost_moon' && (el.textContent || '').includes('玄霜寒月')) ||
            (vfxId === 'default' && (el.textContent || '').includes('古墨朱砂')),
        );
    } else {
      const skinTab = [...modal.querySelectorAll('button, [role="tab"]')].find(
        (b) =>
          /衣冠|皮肤|装束|外装/.test(b.textContent || '') &&
          !b.hasAttribute('data-skin-id') &&
          !b.hasAttribute('data-vfx-id') &&
          !b.classList.contains('cosmetic-card') &&
          !b.classList.contains('shop-card') &&
          !b.classList.contains('market-card') &&
          !b.closest('.shop-card, .cosmetic-card, .market-card'),
      );
      if (skinTab) {
        skinTab.click();
        await new Promise((r) => requestAnimationFrame(r));
      }
      const hId = o.heroId || null;
      if (hId) {
        const heroFilter = modal.querySelector(
          `[data-shop-hero="${hId}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
          `[data-filter-hero="${hId}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
          `[data-hero-id="${hId}"]:not([data-skin-id]):not([data-cosmetic-id]):not(.cosmetic-card):not(.shop-card):not(.market-card)`,
        );
        if (heroFilter) {
          heroFilter.click();
          await new Promise((r) => requestAnimationFrame(r));
        }
      }

      const isVfxCard = (el) =>
        Boolean(
          el.hasAttribute('data-vfx-id') ||
          /vfx|特效|刀光/.test(el.dataset?.kind || el.dataset?.cosmeticKind || '') ||
          vfxNameRe.test(el.textContent || ''),
        );
      const allSkinCards = [
        ...modal.querySelectorAll('[data-skin-id], [data-cosmetic-id], [data-cosmetic-kind="skin"], .cosmetic-card, .market-card, .shop-card'),
      ].filter((el) => !isVfxCard(el));

      const matchesHero = (el, hero) => {
        if (!hero) return true;
        const attrHero = el.dataset?.heroId || el.dataset?.skinHero || el.dataset?.hero || '';
        if (attrHero) return attrHero === hero;
        const idStr = (el.dataset?.skinId || el.dataset?.cosmeticId || el.dataset?.id || el.dataset?.itemId || '').toLowerCase();
        if (idStr) {
          if (
            idStr === hero ||
            idStr.startsWith(`${hero}_`) ||
            idStr.startsWith(`${hero}-`) ||
            idStr.startsWith(`skin_${hero}`) ||
            idStr.includes(`_${hero}_`)
          ) {
            return true;
          }
          const others = ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi'].filter((x) => x !== hero);
          if (others.some((oh) => idStr.startsWith(`${oh}_`) || idStr.startsWith(`${oh}-`) || idStr.startsWith(`skin_${oh}`))) {
            return false;
          }
        }
        const pat = heroNamePatterns[hero];
        if (pat && new RegExp(pat).test(el.textContent || '')) return true;
        return false;
      };

      let heroCards = hId ? allSkinCards.filter((el) => matchesHero(el, hId)) : allSkinCards;
      if (hId && heroCards.length === 0 && allSkinCards.length > 0 && allSkinCards.length <= 4) {
        heroCards = allSkinCards;
      }
      if (hId && heroCards.length === 0 && allSkinCards.length === 18) {
        const ord = ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi'].indexOf(hId);
        if (ord >= 0) heroCards = allSkinCards.slice(ord * 3, ord * 3 + 3);
      }

      if (o.skinId === 'default' || o.onlyDefault) {
        targetCard = heroCards.find((c) => isDefaultCard(c)) || heroCards[0] || null;
      } else if (o.skinId) {
        targetCard =
          heroCards.find((c) => (c.dataset?.skinId || c.dataset?.cosmeticId || c.dataset?.id) === o.skinId) ||
          allSkinCards.find((c) => (c.dataset?.skinId || c.dataset?.cosmeticId || c.dataset?.id) === o.skinId) ||
          null;
      } else {
        const copperCards = heroCards.filter((c) => !isDefaultCard(c) && !isAchOnlyCard(c));
        const idx = o.targetIdx;
        if (idx === 'last') {
          targetCard = copperCards[copperCards.length - 1] || heroCards[heroCards.length - 1] || null;
        } else if (typeof idx === 'number' && heroCards[idx] && !isDefaultCard(heroCards[idx]) && !isAchOnlyCard(heroCards[idx])) {
          targetCard = heroCards[idx];
        } else if (typeof idx === 'number' && idx >= 1 && copperCards[idx - 1]) {
          targetCard = copperCards[idx - 1];
        } else {
          targetCard = copperCards[0] || heroCards[1] || heroCards[0] || null;
        }
      }
    }

    if (!targetCard) {
      return { ok: false, reason: `No matching cosmetic card found for ${JSON.stringify(o)}` };
    }

    const coinsBefore = window.__wugeng?.save?.coins ?? 0;
    let price = extractPrice(targetCard);
    targetCard.click();
    await new Promise((r) => requestAnimationFrame(r));

    const shouldBuy = o.buy !== false && o.vfxId !== 'default' && o.skinId !== 'default' && !o.onlyDefault;
    let clickedBuy = false;
    if (shouldBuy) {
      const buyBtn = findActionBtn(targetCard, /购|买|兑换|\b[3-9]\d\d\b|\b[12]\d\d\d\b/);
      if (buyBtn) {
        if (!price) price = extractPrice(buyBtn);
        buyBtn.click();
        if (o.doubleClickBuy) buyBtn.click();
        clickedBuy = true;
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    const coinsAfter = window.__wugeng?.save?.coins ?? coinsBefore;
    if (!price && coinsBefore > coinsAfter) {
      price = coinsBefore - coinsAfter;
    }

    let clickedEquip = false;
    if (o.equip !== false) {
      const eqBtn = findActionBtn(targetCard, /穿戴|装备|披挂|启用|使用|切换|默认|原装/);
      if (eqBtn) {
        eqBtn.click();
        clickedEquip = true;
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    if (o.close) {
      const closeBtn =
        modal.querySelector('[data-action="close-market"]') ||
        modal.querySelector('[data-action="close-modal"]') ||
        modal.querySelector('[data-action^="close"]') ||
        modal.querySelector('.modal-close') ||
        modal.querySelector('.scroll__foot .btn--ghost') ||
        [...modal.querySelectorAll('button')].find((b) => /^(?:关闭|返回|收起|×|✕)$/.test((b.textContent || '').trim())) ||
        modal.querySelector('.btn--ghost');
      closeBtn?.click();
    }

    return {
      ok: true,
      price,
      clickedBuy,
      clickedEquip,
      cardId: targetCard.dataset?.skinId || targetCard.dataset?.vfxId || targetCard.dataset?.cosmeticId || targetCard.dataset?.id || null,
    };
  }, opts);
}

/**
 * Count distinct slot items inside `${overlaySelector} .selection-owned-bar` without double-counting parent + child nodes.
 */
export async function countOwnedBarSlots(page, overlaySelector) {
  return page.evaluate((ovSel) => {
    const bar = document.querySelector(`${ovSel} .selection-owned-bar`);
    if (!bar) return 0;
    const byKind = bar.querySelectorAll('[data-slot-kind]');
    if (byKind.length > 0) return byKind.length;
    const byClass = bar.querySelectorAll('.owned-slot, .selection-owned-slot, .selection-slot');
    if (byClass.length > 0) return byClass.length;
    const media = bar.querySelectorAll('img, canvas');
    if (media.length > 0) return media.length;
    return bar.children.length;
  }, overlaySelector);
}

/**
 * Extract `.leaderboard-modal` body text with static modal header, tab buttons, and close footer stripped.
 */
export async function readLeaderboardBodyText(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.leaderboard-modal');
    if (!modal) return { fullText: '', bodyText: '', activeCollection: null };
    const clone = modal.cloneNode(true);
    clone
      .querySelectorAll(
        'h1, h2, h3, .scroll__title, .scroll__head, .modal-head, .modal-header, .scroll__foot, .modal-foot, ' +
        '[data-collection], [role="tab"], [data-action="open-native-leaderboard"], [data-action^="close"], .modal-close',
      )
      .forEach((el) => el.remove());
    const bodyText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    const activeTab = modal.querySelector(
      '[data-collection].is-on, [data-collection].is-active, [data-collection].is-selected, [data-collection][aria-selected="true"], [data-collection][aria-checked="true"]',
    );
    return {
      fullText: (modal.textContent || '').replace(/\s+/g, ' ').trim(),
      bodyText,
      activeCollection: activeTab?.getAttribute('data-collection') || null,
    };
  });
}

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Extract `dist/wugeng-h5.zip` into a unique scratch subdirectory using Python `zipfile`
 * and return `{ zipPath, extractRoot, appDir }`.
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
