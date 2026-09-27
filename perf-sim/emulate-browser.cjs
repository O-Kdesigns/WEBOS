// Otevře Brave nad běžícím dev serverem a přes CDP vnutí mobilní viewport/UA
// a volitelně zpomalení výkonu. Dva režimy (--mode):
//
//   hw          - hardwarová GPU akcelerace ZAPNUTÁ, jen viewport/DPR/UA/CPU throttle.
//                 Fps zůstane blízko desktopu, protože render je u téhle scény GPU-bound
//                 (změřeno: CPU throttle 4x samo o sobě nezmění nic, 165 -> 165 fps).
//                 Užitečné pro rychlou vizuální/layoutovou kontrolu na mobilním viewportu,
//                 NE pro odhad reálného mobilního fps.
//
//   swiftshader - GPU akcelerace VYPNUTÁ (--use-gl=swiftshader), WebGL běží softwarově
//                 na CPU. Zpomalení je skutečné a scéně úměrné (víc particlů/passů =
//                 pomalejší, žádný fixní strop) - změřeno 1.6 fps na aktuální scéně
//                 (desktop), tedy MNOHEM hůř než reálný telefon (47 fps). Dobré na
//                 relativní A/B srovnání (vypnu efekt X -> o kolik % rychlejší), ŠPATNÉ
//                 na odhad absolutního fps na reálném zařízení.
//
// Žádný z režimů nesimuluje skutečný výkon konkrétního GPU - Chrome/Brave neumí
// "částečné" zpomalení grafiky, jen zapnuto/vypnuto. Pro reálná čísla viz real-device.bat
// (remote debugging na skutečný telefon přes USB).
//
// Použití: node emulate-browser.cjs --mode=hw|swiftshader <url> [cpuThrottle]
// Okno tohoto skriptu MUSÍ zůstat otevřené - Chrome/Brave zruší throttling a device
// override v momentě, kdy se CDP WebSocket odpojí.

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const DEBUG_PORT = 9333;

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const MODE = modeArg ? modeArg.split('=')[1] : 'hw';
const rest = args.filter((a) => !a.startsWith('--mode='));
const TARGET_URL = rest[0] || 'http://localhost:5173/';
const CPU_THROTTLE = Number(rest[1] || 4);

if (MODE !== 'hw' && MODE !== 'swiftshader') {
  console.error(`[emulate-browser] Neznámý --mode=${MODE} (povolené: hw, swiftshader)`);
  process.exit(1);
}

// Oficiální Lighthouse/PageSpeed "mid-tier mobile" profil (moto g power),
// viz lighthouse-core/config/constants.js.
const DEVICE = {
  width: 412,
  height: 823,
  deviceScaleFactor: 1.75,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
};

const profileDir = path.join(os.tmpdir(), `webos-perf-sim-profile-${MODE}`);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (res.ok) return;
    } catch {
      // Brave ještě nenaběhlo, zkusíme znovu
    }
    await wait(500);
  }
  throw new Error('Brave CDP se nespustilo včas (port 9333 neodpovídá)');
}

async function waitForDevServer() {
  const base = new URL(TARGET_URL).origin;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(base);
      if (res.ok || res.status === 404) return;
    } catch {
      // server ještě neběží
    }
    await wait(1000);
  }
  console.warn(`[emulate-browser] Dev server na ${base} neodpověděl do 30 s, zkouším navigovat i tak.`);
}

function send(ws, pending, idRef, method, params = {}) {
  return new Promise((resolve) => {
    const thisId = ++idRef.value;
    pending.set(thisId, resolve);
    ws.send(JSON.stringify({ id: thisId, method, params }));
  });
}

async function main() {
  const gpuNote = MODE === 'swiftshader' ? 'GPU VYPNUTÁ (SwiftShader, worst-case)' : 'GPU zapnutá (hardware)';
  console.log(`[emulate-browser] mode=${MODE} -> ${TARGET_URL}`);
  console.log(`[emulate-browser] viewport ${DEVICE.width}x${DEVICE.height} @DPR${DEVICE.deviceScaleFactor}, CPU throttle ${CPU_THROTTLE}x, ${gpuNote}`);

  const gpuArgs = MODE === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--disable-gpu-compositing']
    : [];

  spawn(BRAVE, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--touch-events=enabled',
    ...gpuArgs,
    '--new-window',
    'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();

  await waitForCdp();
  await waitForDevServer();

  const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('V Brave nebyla nalezena žádná stránka (target)');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const idRef = { value: 0 };

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  await send(ws, pending, idRef, 'Page.enable');
  await send(ws, pending, idRef, 'Emulation.setDeviceMetricsOverride', {
    width: DEVICE.width,
    height: DEVICE.height,
    deviceScaleFactor: DEVICE.deviceScaleFactor,
    mobile: true,
  });
  await send(ws, pending, idRef, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send(ws, pending, idRef, 'Emulation.setUserAgentOverride', {
    userAgent: DEVICE.userAgent,
    userAgentMetadata: {
      platform: 'Android',
      platformVersion: '11',
      architecture: '',
      model: 'moto g power (2022)',
      mobile: true,
    },
  });
  await send(ws, pending, idRef, 'Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await send(ws, pending, idRef, 'Page.navigate', { url: TARGET_URL });

  console.log(`[emulate-browser] Hotovo. Okno Brave běží jako Moto G Power (mode=${MODE}).`);
  console.log('[emulate-browser] NENECHÁVEJ zavřít tohle okno skriptu, dokud testuješ - throttling a viewport override zmizí, jakmile se CDP spojení přeruší.');
  console.log('[emulate-browser] Ukonči Ctrl+C, až budeš hotový.');

  ws.addEventListener('close', () => {
    console.log('[emulate-browser] Brave okno bylo zavřeno, končím.');
    process.exit(0);
  });

  // Drž proces (a tím CDP spojení) naživu, dokud uživatel nezavře okno nebo neukončí Ctrl+C
  process.stdin.resume();
}

main().catch((err) => {
  console.error('[emulate-browser] Chyba:', err.message);
  process.exit(1);
});
