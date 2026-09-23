import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LocalUSDLoader } from './LocalUSDLoader.js';
import { applyShalunUsdMaterialStage } from './shalunUsdMaterials.js';
import './style.css';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const fileInput = document.querySelector('#file-input');
const openFileButton = document.querySelector('#open-file-button');
const usdStageInput = document.querySelector('#usd-stage-input');
const openUsdStageButton = document.querySelector('#open-usd-stage-button');
const usdTextureFolderInput = document.querySelector('#usd-texture-folder-input');
const openUsdTextureFolderButton = document.querySelector('#open-usd-texture-folder-button');
const usdStageSelect = document.querySelector('#usd-stage-select');
const applyUsdMaterialButton = document.querySelector('#apply-usd-material-button');
const usdMaterialSummary = document.querySelector('#usd-material-summary');
const urlForm = document.querySelector('#url-form');
const urlInput = document.querySelector('#model-url');
const selection = document.querySelector('#selection');
const sceneInfo = document.querySelector('#scene-info');
const floorSelect = document.querySelector('#floor-select');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.FogExp2(0xffffff, 0.00045);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100000);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;

scene.add(new THREE.HemisphereLight(0xddeeff, 0x263238, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(15, -20, 35);
scene.add(sun);

const grid = new THREE.GridHelper(100, 100, 0x356875, 0x18353d);
grid.rotation.x = Math.PI / 2;
scene.add(grid);

let model = null;
let selected = null;
let modelObjectUrls = [];
let materialObjectUrls = [];
let usdMaterialFiles = [];
let usdMaterialCatalog = null;
let usdStageFiles = [];
let usdTextureFiles = [];
let heldMove = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setStatus(message, value = 0) {
  status.textContent = message;
  progress.value = value;
}

function extensionOf(source) {
  const clean = source.split(/[?#]/)[0];
  return clean.slice(clean.lastIndexOf('.') + 1).toLowerCase();
}

function clearModel() {
  if (!model) return;
  scene.remove(model);
  model.traverse((node) => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).filter((value) => value?.isTexture).forEach((texture) => texture.dispose());
      material.dispose();
    });
  });
  model = null;
  selected = null;
}

function frameModel() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const distance = Math.max(sphere.radius * 2.4, 1);
  const direction = new THREE.Vector3(1, -1, 0.75).normalize();
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 10000, 0.01);
  camera.far = Math.max(distance * 20, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.update();
  grid.position.z = box.min.z;
  grid.scale.setScalar(Math.max(sphere.radius / 50, 1));
}

function updateInfo(format) {
  let objects = 0;
  let triangles = 0;
  model.traverse((node) => {
    objects += 1;
    if (!node.geometry) return;
    triangles += node.geometry.index
      ? node.geometry.index.count / 3
      : (node.geometry.attributes.position?.count ?? 0) / 3;
  });
  const values = sceneInfo.querySelectorAll('dd');
  values[0].textContent = format.toUpperCase();
  values[1].textContent = objects.toLocaleString('zh-TW');
  values[2].textContent = Math.round(triangles).toLocaleString('zh-TW');
}

function onProgress(event) {
  const value = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
  setStatus(`載入中 ${value || '…'}%`, value);
}

function acceptModel(root, format) {
  clearModel();
  model = root;
  scene.add(model);
  frameModel();
  updateInfo(format);
  let embeddedMaps = 0;
  model.traverse((node) => {
    if (node.isMesh && (Array.isArray(node.material) ? node.material : [node.material]).some((material) => material?.map)) embeddedMaps++;
  });
  if (embeddedMaps && (format === 'glb' || format === 'gltf')) {
    usdMaterialSummary.textContent = `模型已含 ${embeddedMaps.toLocaleString()} 個貼圖網格，可直接觀看，無需再套用 USD 材質。`;
  }
  setStatus('載入完成', 100);
  applyUsdMaterialButton.disabled = !usdStageSelect.value;
}

function loadSource(source, name = source, manager = THREE.DefaultLoadingManager) {
  const format = extensionOf(name);
  setStatus('準備載入', 1);
  const onError = (error) => {
    console.error(error);
    setStatus(`載入失敗：${error.message ?? error}`, 0);
  };
  if (format === 'fbx') {
    new FBXLoader(manager).load(source, (root) => acceptModel(root, format), onProgress, onError);
  } else if (format === 'glb' || format === 'gltf') {
    new GLTFLoader(manager).load(source, (asset) => acceptModel(asset.scene, format), onProgress, onError);
  } else if (['usd', 'usda', 'usdc', 'usdz'].includes(format)) {
    new LocalUSDLoader(manager).load(source, (root) => acceptModel(root, format), onProgress, onError);
  } else {
    setStatus(`不支援 .${format || '未知'} 格式`, 0);
  }
}

function normaliseLocalPath(path) {
  const parts = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function filePath(file) {
  return normaliseLocalPath(file.webkitRelativePath || file.name);
}

function fileBasename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function fileDirectory(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function createLocalCatalog(files, urls) {
  const byPath = new Map();
  const byBasename = new Map();

  for (const file of files) {
    const path = filePath(file);
    const url = URL.createObjectURL(file);
    urls.push(url);
    byPath.set(path, url);

    const basename = fileBasename(path);
    if (byBasename.has(basename)) {
      byBasename.set(basename, null);
    } else {
      byBasename.set(basename, url);
    }
  }

  return {
    urlFor(file) {
      return byPath.get(filePath(file));
    },
    resolve(requested, baseFile) {
      const clean = decodeURIComponent(requested.split(/[?#]/)[0]);
      const path = normaliseLocalPath(`${fileDirectory(filePath(baseFile))}/${clean}`);
      return byPath.get(path) ?? byBasename.get(fileBasename(path)) ?? null;
    },
  };
}

function revokeUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.length = 0;
}

function loadFiles(filesLike) {
  revokeUrls(modelObjectUrls);
  const files = [...filesLike];
  const modelExtensions = new Set(['fbx', 'glb', 'gltf', 'usd', 'usda', 'usdc', 'usdz']);
  const mainFile = files.find((file) => ['glb', 'gltf', 'fbx'].includes(extensionOf(file.name)))
    ?? files.find((file) => modelExtensions.has(extensionOf(file.name)));
  if (!mainFile) {
    setStatus('沒有找到可載入的主模型', 0);
    return;
  }
  const manager = new THREE.LoadingManager();
  const catalog = createLocalCatalog(files, modelObjectUrls);
  manager.setURLModifier((requested) => {
    return catalog.resolve(requested, mainFile) ?? requested;
  });
  setStatus(`已選取 ${files.length} 個檔案，正在載入 ${mainFile.name}`, 1);
  loadSource(catalog.urlFor(mainFile), mainFile.name, manager);
}

openFileButton.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

fileInput.addEventListener('change', () => fileInput.files.length && loadFiles(fileInput.files));

function updateUsdStageChoices(files) {
  usdMaterialFiles = files
    .filter((file) => ['usd', 'usda'].includes(extensionOf(file.name)))
    .sort((left, right) => filePath(left).localeCompare(filePath(right), 'zh-Hant'));
  usdStageSelect.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = usdMaterialFiles.length ? '選擇材質 stage' : '資料夾內沒有 .usda/.usd';
  usdStageSelect.append(placeholder);

  usdMaterialFiles.forEach((file, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = filePath(file);
    usdStageSelect.append(option);
  });

  usdStageSelect.disabled = usdMaterialFiles.length === 0;
  applyUsdMaterialButton.disabled = !model || !usdStageSelect.value;
}

function rebuildUsdMaterialCatalog() {
  revokeUrls(materialObjectUrls);
  const files = [...usdStageFiles, ...usdTextureFiles];
  usdMaterialCatalog = createLocalCatalog(files, materialObjectUrls);
  updateUsdStageChoices(files);
  if (usdMaterialFiles.length === 1) usdStageSelect.value = '0';
  applyUsdMaterialButton.disabled = !model || !usdStageSelect.value;
  if (usdStageFiles.length) {
    usdMaterialSummary.textContent = `已選取 1 個 USD stage，並加入 ${usdTextureFiles.length.toLocaleString('zh-TW')} 個貼圖檔。`;
  } else {
    usdMaterialSummary.textContent = `已加入 ${usdTextureFiles.length.toLocaleString('zh-TW')} 個貼圖檔；請直接選取 USD stage。`;
  }
}

openUsdStageButton.addEventListener('click', () => {
  usdStageInput.value = '';
  usdStageInput.click();
});

usdStageInput.addEventListener('change', () => {
  if (!usdStageInput.files.length) return;
  usdStageFiles = [usdStageInput.files[0]];
  usdTextureFiles = [];
  rebuildUsdMaterialCatalog();
});

openUsdTextureFolderButton.addEventListener('click', () => {
  usdTextureFolderInput.value = '';
  usdTextureFolderInput.click();
});

usdTextureFolderInput.addEventListener('change', () => {
  if (!usdTextureFolderInput.files.length) return;
  usdTextureFiles = [...usdTextureFiles, ...usdTextureFolderInput.files];
  rebuildUsdMaterialCatalog();
});

usdStageSelect.addEventListener('change', () => {
  applyUsdMaterialButton.disabled = !model || !usdStageSelect.value;
});

applyUsdMaterialButton.addEventListener('click', async () => {
  const stageFile = usdMaterialFiles[Number.parseInt(usdStageSelect.value, 10)];
  if (!model || !stageFile || !usdMaterialCatalog) {
    setStatus('請先開啟 GLB、選取素材資料夾與材質 stage', 0);
    return;
  }

  try {
    applyUsdMaterialButton.disabled = true;
    setStatus(`正在套用 ${stageFile.name} 的 USD 材質`, 15);
    const result = await applyShalunUsdMaterialStage({
      root: model,
      stageText: await stageFile.text(),
      resolveFile: (requested) => usdMaterialCatalog.resolve(requested, stageFile),
    });
    const textureWarning = result.missingTextures.length
      ? `；${result.missingTextures.length} 個貼圖未選取，已使用色彩備援`
      : '';
    const uvWarning = result.textureFallbackNodes
      ? `；${result.textureFallbackNodes.toLocaleString('zh-TW')} 個網格沒有 UV，已使用 USD 色彩備援`
      : '';
    usdMaterialSummary.textContent = `已套用 ${result.applied.toLocaleString('zh-TW')} 個 GLB 節點、${result.materials} 種 USD 材質${textureWarning}${uvWarning}。`;
    setStatus(result.applied ? 'USD 素材套用完成' : '未找到可對應的 GLB 節點', result.applied ? 100 : 0);
  } catch (error) {
    console.error(error);
    usdMaterialSummary.textContent = `USD 素材套用失敗：${error.message ?? error}`;
    setStatus(`USD 素材套用失敗：${error.message ?? error}`, 0);
  } finally {
    applyUsdMaterialButton.disabled = !model || !usdStageSelect.value;
  }
});
urlForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (urlInput.value.trim()) loadSource(urlInput.value.trim());
});
floorSelect.addEventListener('change', () => {
  if (floorSelect.value) loadSource(floorSelect.value);
});
document.querySelector('#reset-camera').addEventListener('click', frameModel);

function moveCamera(direction, scale = 1) {
  const distance = Math.max(camera.position.distanceTo(controls.target), 1);
  const step = distance * 0.025 * scale;
  const forward = controls.target.clone().sub(camera.position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const vector = direction === 'left'
    ? right.multiplyScalar(-step)
    : direction === 'right'
      ? right.multiplyScalar(step)
      : direction === 'up'
        ? screenUp.multiplyScalar(step)
        : screenUp.multiplyScalar(-step);
  camera.position.add(vector);
  controls.target.add(vector);
  controls.update();
}

const keyDirections = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
window.addEventListener('keydown', (event) => {
  const direction = keyDirections[event.key];
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
  if (!direction || editing) return;
  event.preventDefault();
  moveCamera(direction, event.shiftKey ? 3 : 1);
});

for (const button of document.querySelectorAll('[data-camera-move]')) {
  const stop = () => {
    if (heldMove) cancelAnimationFrame(heldMove);
    heldMove = null;
  };
  const repeat = () => {
    moveCamera(button.dataset.cameraMove, 0.45);
    heldMove = requestAnimationFrame(repeat);
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    stop();
    button.setPointerCapture(event.pointerId);
    moveCamera(button.dataset.cameraMove);
    heldMove = requestAnimationFrame(repeat);
  });
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
}

for (const eventName of ['dragenter', 'dragover']) {
  viewport.addEventListener(eventName, (event) => {
    event.preventDefault();
    viewport.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  viewport.addEventListener(eventName, (event) => {
    event.preventDefault();
    viewport.classList.remove('dragging');
  });
}
viewport.addEventListener('drop', (event) => event.dataTransfer.files.length && loadFiles(event.dataTransfer.files));

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!model) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(model, true)[0];
  if (!hit) return;
  selected = hit.object;
  const values = selection.querySelectorAll('dd');
  values[0].textContent = selected.name || '(未命名)';
  values[1].textContent = selected.type;
  values[2].textContent = hit.point.toArray().map((value) => value.toFixed(3)).join(', ');
});

function resize() {
  const { clientWidth, clientHeight } = viewport;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

const defaultModel = new URLSearchParams(location.search).get('model');
if (defaultModel) {
  urlInput.value = defaultModel;
  loadSource(defaultModel);
}

const modelsBase = new URL('models/', document.baseURI);
fetch(new URL('manifest.json', modelsBase))
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((manifest) => {
    for (const item of manifest.models ?? manifest.floors ?? []) {
      const option = document.createElement('option');
      option.value = new URL(item.file, modelsBase).href;
      option.textContent = item.label ?? item.file;
      floorSelect.append(option);
    }
  })
  .catch((error) => console.warn('未載入模型清單', error));
