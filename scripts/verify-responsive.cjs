// Uses installed Chromium browsers; no test dependencies or downloads required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'verification');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browsers = [
  ['Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'],
  ['Edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
].filter(([, executable]) => fs.existsSync(executable));
const widths = [280, 320, 360, 375, 390, 420, 480, 568, 600, 640, 700, 768, 820, 900, 901, 1024, 1100, 1280, 1366, 1440, 1920, 2560];

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (!message.id) return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
  };
  return {
    errors,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 20000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filename = path.resolve(root, 'dist', pathname === '/' ? 'index.html' : '.' + pathname);
  if (!filename.startsWith(path.join(root, 'dist') + path.sep)) { response.writeHead(403); response.end(); return; }
  try {
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    response.end(fs.readFileSync(filename));
  } catch { response.writeHead(404); response.end('Not found'); }
});

async function verifyBrowser(name, executable, origin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-browser-'));
  const browser = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let cdp;
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch { await sleep(100); }
    }
    if (!port) throw new Error(name + ' failed to start');
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    cdp = await connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.send('Page.navigate', { url: origin });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('document.querySelectorAll(".project").length === 6')) { ready = true; break; }
      await sleep(100);
    }
    if (!ready) throw new Error('Application did not render');
    await evaluate('Promise.race([document.fonts.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 5000))])');
    const results = [];
    for (const width of widths) {
      const height = [568, 820].includes(width) ? 360 : width < 700 ? 844 : 900;
      const mobile = width <= 900;
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: width < 700 ? 2 : 1 });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
      await evaluate('window.scrollTo(0,0)');
      await sleep(80);
      const failures = await evaluate(`(() => {
        const failures = [];
        const width = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > width + 1) failures.push('Horizontal overflow: ' + document.documentElement.scrollWidth);
        const outside = [...document.querySelectorAll('main *,header *,footer *')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && (r.right > width + 1 || r.left < -1);
        }).map(el => el.className?.baseVal ?? el.className);
        if (outside.length) failures.push('Outside viewport: ' + outside.slice(0, 8).join(', '));
        const smallTargets = [...document.querySelectorAll('.button,.filters button,.menu-button,nav a,.project-footer a')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && r.height < 43;
        }).map(el => el.textContent.trim());
        if (smallTargets.length) failures.push('Small touch targets: ' + smallTargets.join(', '));
        const menuVisible = getComputedStyle(document.querySelector('.menu-button')).display !== 'none';
        if (menuVisible !== ${mobile}) failures.push('Incorrect navigation breakpoint');
        return failures;
      })()`);
      for (const [filter, count] of [['AI & ML', 3], ['Full stack', 2], ['Backend', 1], ['All projects', 6]]) {
        await evaluate(`[...document.querySelectorAll('.filters button')].find(b => b.textContent === ${JSON.stringify(filter)}).click()`);
        await sleep(30);
        if (await evaluate('document.querySelectorAll(".project").length') !== count) failures.push('Filter failed: ' + filter);
      }
      if (mobile) {
        const point = await evaluate(`(() => {const r=document.querySelector('.menu-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(60);
        if (!await evaluate('document.querySelector(".menu-button").getAttribute("aria-expanded") === "true"')) failures.push('Touch menu failed to open');
        const navBounds = await evaluate(`(() => {const n=document.querySelector('nav');const r=n.getBoundingClientRect();return r.bottom <= innerHeight+1 && getComputedStyle(n).overflowY==='auto'})()`);
        if (!navBounds) failures.push('Landscape menu exceeds viewport');
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(40);
        if (!await evaluate('document.querySelector(".menu-button").getAttribute("aria-expanded") === "false" && document.activeElement === document.querySelector(".menu-button")')) failures.push('Escape dismissal/focus failed');
        await evaluate('document.querySelector(".menu-button").click()');
        await sleep(40);
        await evaluate('document.querySelector("nav a[href=\\"#contact\\"]").click()');
        await sleep(40);
        if (!await evaluate('document.querySelector(".menu-button").getAttribute("aria-expanded") === "false"')) failures.push('Menu failed to close after navigation');
      }
      results.push({ width, height, touchEmulation: mobile, failures });
      if ([390, 820, 1440].includes(width)) {
        await evaluate('window.scrollTo(0,0);document.activeElement.blur()');
        const layout = await cdp.send('Page.getLayoutMetrics');
        const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: layout.cssContentSize.height, scale: 1 } });
        fs.writeFileSync(path.join(output, name.toLowerCase() + '-' + width + '.png'), Buffer.from(png.data, 'base64'));
      }
    }
    const links = await evaluate(`(async () => {
      const failures=[];
      for (const img of document.querySelectorAll('.technology-logo')) { img.loading='eager'; try { await img.decode(); } catch { failures.push('Technology icon failed: '+img.src); } }
      if(document.querySelectorAll('.technology-chip').length !== 17) failures.push('Missing toolkit items');
      if(!document.querySelector('.hero-name')?.textContent.includes('Vanaja Sudha')) failures.push('Missing prominent name');
      if(document.querySelector('.email-contact').getAttribute('href') !== 'mailto:24bds059@iiitdwd.ac.in') failures.push('Contact email');
      for(const a of document.querySelectorAll('a[href^="#"]')) if(!document.getElementById(a.hash.slice(1))) failures.push('Missing anchor: '+a.hash);
      const link=document.querySelector('a[download]');
      const res=await fetch(link.href); const bytes=new Uint8Array(await res.arrayBuffer());
      if(!res.ok || bytes[0]!==80 || bytes[1]!==75 || bytes.length<1000) failures.push('Invalid resume download');
      return {failures,resumeBytes:bytes.length,fontsLoaded:document.fonts.check('16px Manrope')};
    })()`);
    const version = await cdp.send('Browser.getVersion');
    return { browser: name, version: version.product, results, links, runtimeErrors: cdp.errors };
  } finally {
    if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.close(); }
    browser.kill();
    // Temporary browser profiles remain in the system temporary directory.
  }
}

(async () => {
  if (!browsers.length) throw new Error('No supported installed browser found');
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const report = { checkedAt: new Date().toISOString(), browsers: [], limitations: ['No Safari or Firefox installed', 'Touch and viewport emulation are not physical-device testing', 'External linked applications and email delivery are not tested'] };
  try {
    for (const [name, executable] of browsers) {
      const result = await verifyBrowser(name, executable, 'http://127.0.0.1:' + server.address().port);
      report.browsers.push(result);
      console.log(name + ': ' + result.results.length + ' viewport checks, ' + result.results.reduce((n, item) => n + item.failures.length, 0) + ' layout/interaction failures; ' + result.links.failures.length + ' link failures; ' + result.runtimeErrors.length + ' runtime errors');
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (report.browsers.some(b => b.results.some(r => r.failures.length) || b.links.failures.length || b.runtimeErrors.length)) process.exitCode = 1;
  } finally { server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
