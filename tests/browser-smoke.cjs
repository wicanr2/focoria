const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const puppeteer = require('puppeteer');

const url = process.env.FOCORIA_TEST_URL || 'http://127.0.0.1:5175/';
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'focoria-browser-'));

function triangle(name, color, options = {}) {
  const geometry = Buffer.concat([
    Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer),
    Buffer.from(new Float32Array([0, 0, 1, 0, 0, 1]).buffer),
    Buffer.from(new Uint16Array([0, 1, 2]).buffer),
  ]);
  const external = options.external;
  const scene = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: options.nodeName, mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
      { buffer: 0, byteOffset: 60, byteLength: 6 },
    ],
    buffers: [{ byteLength: geometry.length, uri: external ? 'triangle.bin' : `data:application/octet-stream;base64,${geometry.toString('base64')}` }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: options.texture
      ? { baseColorTexture: { index: 0 } }
      : { baseColorFactor: color } }],
  };
  if (options.texture) {
    scene.images = [{ uri: options.texture }];
    scene.textures = [{ source: 0 }];
  }
  const scenePath = path.join(fixtureDir, name);
  fs.writeFileSync(scenePath, JSON.stringify(scene));
  if (external) fs.writeFileSync(path.join(fixtureDir, 'triangle.bin'), geometry);
  return scenePath;
}

const alpha = triangle('alpha.gltf', [1, 0, 0, 1]);
const beta = triangle('beta.gltf', [0, 0, 1, 1]);
const gamma = triangle('gamma.gltf', [0, 1, 0, 1]);
const textured = triangle('textured.gltf', [1, 1, 1, 1], { external: true, texture: 'texture.png' });
const missing = triangle('missing.gltf', [1, 1, 1, 1], { texture: 'not-selected.png' });
const blendPath = path.join(fixtureDir, 'not-supported.blend');
fs.writeFileSync(blendPath, 'BLENDER placeholder for unsupported-format test');
const overlayModel = triangle('overlay.gltf', [0.5, 0.5, 0.5, 1], { nodeName: 'Sample__Geometry' });
const overlayStage = path.join(fixtureDir, 'overlay.usda');
fs.writeFileSync(overlayStage, [
  '#usda 1.0',
  'over "Sample_" {',
  '  rel material:binding = </Looks/Red>',
  '}',
  'def Material "Red" {',
  '  def Shader "PreviewSurface" {',
  '    color3f inputs:diffuseColor = (0.2, 0.7, 0.3)',
  '  }',
  '}',
].join('\n'));
function glbFromGltf(gltfPath, name) {
  const scene = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  const geometry = Buffer.from(scene.buffers[0].uri.split(',')[1], 'base64');
  delete scene.buffers[0].uri;
  const json = Buffer.from(JSON.stringify(scene));
  const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
  const binaryPadding = Buffer.alloc((4 - geometry.length % 4) % 4);
  const jsonChunk = Buffer.concat([json, jsonPadding]);
  const binaryChunk = Buffer.concat([geometry, binaryPadding]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binaryChunk.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  const glbPath = path.join(fixtureDir, name);
  fs.writeFileSync(glbPath, Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]));
  return glbPath;
}
const alphaGlb = glbFromGltf(alpha, 'alpha.glb');
const binPath = path.join(fixtureDir, 'triangle.bin');
const pngPath = path.join(fixtureDir, 'texture.png');
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const body = Buffer.concat([typeBytes, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
const pngHeader = Buffer.alloc(13);
pngHeader.writeUInt32BE(1, 0);
pngHeader.writeUInt32BE(1, 4);
pngHeader[8] = 8;
pngHeader[9] = 6;
fs.writeFileSync(pngPath, Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  pngChunk('IHDR', pngHeader),
  pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
  pngChunk('IEND', Buffer.alloc(0)),
]));

async function choose(page, files) {
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('#open-file-button')]);
  await chooser.accept(files);
}

async function waitForName(page, name) {
  await page.waitForFunction((expected) => document.querySelector('#opened-file-name').textContent === expected,
    { timeout: 15000 }, name);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  try {
    const page = await browser.newPage();
    const browserWarnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') browserWarnings.push(message.text());
    });
    page.on('requestfailed', (request) => browserWarnings.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', (response) => {
      if (response.status() >= 400) browserWarnings.push(`${response.status()} ${response.url()}`);
    });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#scene-select', (node) => node.disabled), true);
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 1);
    assert.match(await page.$eval('.load-help', (node) => node.textContent), /外部貼圖.*同次選取/);
    assert.doesNotMatch(await page.$eval('#scene-select', (node) => node.textContent), /沙崙/);

    await choose(page, [alphaGlb]);
    await waitForName(page, 'alpha.glb');
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 1);
    assert.match(await page.$eval('#usd-material-summary', (node) => node.textContent), /純色材質/);

    await choose(page, [alpha, beta]);
    await waitForName(page, 'alpha.gltf');
    assert.deepEqual(await page.$$eval('#scene-select option', (nodes) => nodes.map((node) => node.textContent)),
      ['alpha.gltf', 'beta.gltf']);
    assert.match(await page.$eval('#usd-material-summary', (node) => node.textContent), /純色材質/);

    await page.select('#scene-select', '1');
    await waitForName(page, 'beta.gltf');
    await choose(page, [gamma]);
    await waitForName(page, 'gamma.gltf');
    assert.deepEqual(await page.$$eval('#scene-select option', (nodes) => nodes.map((node) => node.textContent)), ['gamma.gltf']);

    await choose(page, [pngPath]);
    await page.waitForFunction(() => /不支援.*png|沒有找到可直接載入/.test(document.querySelector('#status').textContent));
    assert.equal(await page.$eval('#opened-file-name', (node) => node.textContent), 'gamma.gltf');
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 1);

    await choose(page, [blendPath]);
    await page.waitForFunction(() => /不支援.*blend/.test(document.querySelector('#status').textContent));
    assert.equal(await page.$eval('#opened-file-name', (node) => node.textContent), 'gamma.gltf');
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 1);

    await choose(page, [textured, binPath, pngPath]);
    await waitForName(page, 'textured.gltf');
    const textureSummary = await page.$eval('#usd-material-summary', (node) => node.textContent);
    const textureStatus = await page.$eval('#status', (node) => node.textContent);
    assert.match(textureSummary, /已載入貼圖/, `材質狀態：${textureSummary}；載入狀態：${textureStatus}；瀏覽器訊息：${browserWarnings.join(' | ')}`);
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 1);

    await choose(page, [overlayModel, overlayStage]);
    await waitForName(page, 'overlay.gltf');
    await page.waitForFunction(() => document.querySelector('#usd-material-summary').textContent.includes('已套用 1 個 USD'));
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 1);

    await choose(page, [alpha, beta, overlayStage]);
    await waitForName(page, 'alpha.gltf');
    assert.equal(await page.$eval('#scene-select', (node) => node.options.length), 2);
    assert.match(await page.$eval('#usd-material-summary', (node) => node.textContent), /純色材質/);

    await choose(page, [missing]);
    try {
      await page.waitForFunction(() => /缺少.*外部素材/.test(document.querySelector('#status').textContent),
        { timeout: 15000 });
    } catch (error) {
      console.error('缺件案例狀態', await page.$eval('#status', (node) => node.textContent));
      console.error('缺件案例材質', await page.$eval('#usd-material-summary', (node) => node.textContent));
      console.error('瀏覽器訊息', browserWarnings.join(' | '));
      throw error;
    }
    assert.notEqual(await page.$eval('#status', (node) => node.textContent), '載入完成');
    console.log('通過：空清單、GLB 真實選檔、多場景切換、批次取代、無效批次保留、.blend 明確拒絕、外部貼圖、USD 覆蓋配對與缺件提示');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
