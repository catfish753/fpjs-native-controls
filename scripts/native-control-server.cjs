const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const output = process.env.OUTPUT || process.argv[2] || 'native-control.json';
const port = Number(process.env.PORT || 8766);
const fpPath = process.env.FPJS_PATH || path.join(
  path.dirname(require.resolve('@fingerprintjs/fingerprintjs', {paths: [process.cwd()]})),
  'fp.esm.js',
);
let finished = false;
const holds = [];

const page = String.raw`<!doctype html><meta charset="utf-8"><title>native control</title>
<img hidden src="/hold"><pre id=status>collecting</pre><script type=module>
import FingerprintJS from '/fp.js';
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
const custom = async () => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  const systemFonts = {};
  for (const keyword of ['caption', 'icon', 'menu', 'message-box', 'small-caption', 'status-bar']) {
    const element = document.createElement('span');
    element.style.cssText = 'position:absolute;visibility:hidden;font:' + keyword;
    document.body.append(element);
    const style = getComputedStyle(element);
    systemFonts[keyword] = {family: style.fontFamily, size: style.fontSize, weight: style.fontWeight};
    element.remove();
  }
  const stack = (() => { try { throw new Error('native-control'); } catch (error) { return error.stack; } })();
  return {
    navigator: {
      userAgent: navigator.userAgent,
      appVersion: navigator.appVersion,
      platform: navigator.platform,
      oscpu: navigator.oscpu,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints,
      language: navigator.language,
      languages: navigator.languages,
      vendor: navigator.vendor,
      webdriver: navigator.webdriver,
      pdfViewerEnabled: navigator.pdfViewerEnabled,
    },
    screen: {
      width: screen.width, height: screen.height, availWidth: screen.availWidth,
      availHeight: screen.availHeight, availLeft: screen.availLeft, availTop: screen.availTop,
      colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth,
      devicePixelRatio, innerWidth, innerHeight, outerWidth, outerHeight, screenX, screenY,
    },
    systemFonts,
    webgl: gl ? {
      vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: debug && gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
      unmaskedRenderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      version: gl.getParameter(gl.VERSION), shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      extensions: gl.getSupportedExtensions(),
    } : null,
    stack,
    stackHash: await hash(stack || ''),
    descriptors: {
      webdriver: Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver'),
      platform: Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform'),
      userAgent: Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent'),
    },
  };
};
try {
  const started = performance.now();
  const agent = await FingerprintJS.load();
  const result = await agent.get();
  const payload = {
    schema: 1,
    collectedAt: new Date().toISOString(),
    elapsedMs: performance.now() - started,
    visitorId: result.visitorId,
    confidence: result.confidence,
    components: result.components,
    custom: await custom(),
  };
  const response = await fetch('/result', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)});
  document.querySelector('#status').textContent = response.ok ? 'done' : 'upload failed';
} catch (error) {
  await fetch('/result', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({schema: 1, error: String(error), stack: error?.stack})});
  document.querySelector('#status').textContent = String(error);
}
</script>`;

const server = http.createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    return response.end(page);
  }
  if (request.url === '/fp.js') {
    response.writeHead(200, {'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store'});
    return fs.createReadStream(fpPath).pipe(response);
  }
  if (request.url === '/hold') {
    holds.push(response);
    return;
  }
  if (request.url === '/result' && request.method === 'POST') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 5_000_000) request.destroy();
    });
    request.on('end', () => {
      const value = JSON.parse(body);
      value.collector = {platform: process.platform, arch: process.arch, node: process.version};
      fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
      fs.writeFileSync(output, JSON.stringify(value, null, 2) + '\n');
      finished = true;
      response.writeHead(204).end();
      for (const hold of holds.splice(0)) hold.writeHead(204).end();
      setTimeout(() => server.close(), 50);
    });
    return;
  }
  response.writeHead(404).end();
});

server.listen(port, '127.0.0.1', () => console.log(`native control: http://127.0.0.1:${port}/ -> ${output}`));
setTimeout(() => {
  if (!finished) {
    console.error('native control timed out');
    process.exitCode = 1;
    server.close();
  }
}, Number(process.env.TIMEOUT_MS || 120000)).unref();
