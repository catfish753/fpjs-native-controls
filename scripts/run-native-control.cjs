const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const browser = process.env.FIREFOX_BROWSER;
const output = path.resolve(process.env.OUTPUT || 'native-control.json');
const screenshot = path.resolve(process.env.SCREENSHOT || 'native-control.png');
const port = process.env.PORT || '8766';
if (!browser) throw new Error('FIREFOX_BROWSER is required');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'firefox-native-control-'));
if (process.env.FIREFOX_PREFS_JSON) {
  const prefs = JSON.parse(process.env.FIREFOX_PREFS_JSON);
  const lines = Object.entries(prefs).map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`);
  fs.writeFileSync(path.join(profile, 'user.js'), lines.join('\n') + '\n');
}
const server = spawn(process.execPath, [path.join(__dirname, 'native-control-server.cjs'), output], {
  env: {...process.env, PORT: port, OUTPUT: output},
  stdio: 'inherit',
});
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

(async () => {
  await sleep(1000);
  const firefox = spawn(browser, [
    '--headless', '--no-remote', '--profile', profile,
    '--screenshot', screenshot, `http://127.0.0.1:${port}/`,
  ], {stdio: 'inherit'});
  const deadline = Date.now() + Number(process.env.TIMEOUT_MS || 120000);
  while (!fs.existsSync(output) && Date.now() < deadline) await sleep(250);
  firefox.kill('SIGKILL');
  server.kill('SIGTERM');
  if (!fs.existsSync(output)) throw new Error('native control timed out');
  const result = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (result.error) throw new Error(result.error);
  console.log(`native control collected: ${result.custom.navigator.userAgent}`);
})().catch(error => {
  server.kill('SIGKILL');
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); } catch {}
});
