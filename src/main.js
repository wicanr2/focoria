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
const loadFeedback = document.querySelector('#load-feedback');
const materialState = document.querySelector('.material-state');
const fileInput = document.querySelector('#file-input');
const openFileButton = document.querySelector('#open-file-button');
const usdMaterialSummary = document.querySelector('#usd-material-summary');
const sceneSelect = document.querySelector('#scene-select');
const openedFileName = document.querySelector('#opened-file-name');
const orbitGizmo = document.querySelector('#orbit-gizmo');
const orbitTrackball = document.querySelector('#orbit-trackball');
const orbitAnimationButton = document.querySelector('#orbit-animation');
const axisDirections = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
  '-x': new THREE.Vector3(-1, 0, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '-z': new THREE.Vector3(0, 0, -1),
};
const axisBalls = [...orbitGizmo.querySelectorAll('.axis-ball')];
const axisSpokes = [...orbitGizmo.querySelectorAll('.axis-spoke')];

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

const grid = new THREE.GridHelper(100, 40, 0xb4bec4, 0xd3dade);
grid.rotation.x = Math.PI / 2;
grid.material.transparent = true;
grid.material.opacity = 0.42;
grid.material.depthWrite = false;
scene.add(grid);

let model = null;
let modelObjectUrls = [];
let selectedScenes = [];
let selectedCatalog = null;
let selectedOverlayStage = null;
let selectedMissingAssets = new Map();
let selectionRevision = 0;
let heldMove = null;
let activeLoad = 0;
let orbitAnimationFrame = null;

function setStatus(message, value = 0, state = 'loading') {
  status.textContent = message;
  progress.value = value;
  loadFeedback.hidden = state === 'ready';
  if (state === 'error') materialState.dataset.state = 'error';
}

function showMaterialSummary(message, state = '', title = message) {
  materialState.dataset.state = state;
  usdMaterialSummary.textContent = message;
  usdMaterialSummary.title = title;
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
}

function frameModel() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const distance = Math.max(sphere.radius * 1.45, 1);
  const direction = new THREE.Vector3(1, -1, 0.75).normalize();
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 10000, 0.01);
  camera.far = Math.max(distance * 20, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.update();
  // 保留來源世界座標，讓參考網格在模型下方置中。
  grid.position.set(sphere.center.x, sphere.center.y, box.min.z);
  grid.scale.setScalar(Math.max(sphere.radius / 50, 1));
}

function setOpenedFileName(name) {
  openedFileName.textContent = name;
  openedFileName.title = name;
  openedFileName.hidden = !name;
}

function sourceName(source) {
  try {
    return decodeURIComponent(new URL(source, location.href).pathname.split('/').pop()) || source;
  } catch {
    return source;
  }
}

async function acceptModel(root, format, name, request, materialStage, catalog, missingAssets) {
  if (request !== activeLoad) return;
  stopOrbitAnimation();
  clearModel();
  model = root;
  scene.add(model);
  frameModel();
  setOpenedFileName(name);
  let texturedMeshes = 0;
  let materialMeshes = 0;
  model.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.some(Boolean)) materialMeshes++;
    if (materials.some((material) => material?.map)) texturedMeshes++;
  });
  showMaterialSummary(
    texturedMeshes
      ? `已載入貼圖（${texturedMeshes.toLocaleString('zh-TW')} 個網格）`
      : materialMeshes ? '只有純色材質，未偵測到貼圖' : '未偵測到模型材質',
    materialMeshes ? '' : 'warning',
  );

  if (materialStage && catalog && (format === 'glb' || format === 'gltf')) {
    setStatus(`正在套用 ${materialStage.name} 的材質`, 90);
    try {
      const stageText = await materialStage.text();
      if (request !== activeLoad) return;
      const result = await applyShalunUsdMaterialStage({
        root,
        stageText,
        resolveFile: (requested) => catalog.resolve(requested, materialStage),
      });
      if (request !== activeLoad) return;
      if (!result.applied || result.missingTextures.length || result.textureFallbackNodes) {
        materialState.dataset.state = 'warning';
        const warnings = [];
        if (result.missingTextures.length) warnings.push(`缺少 ${result.missingTextures.length} 個外部貼圖`);
        if (result.textureFallbackNodes) warnings.push(`${result.textureFallbackNodes.toLocaleString('zh-TW')} 個網格沒有 UV`);
        const message = !result.applied
          ? 'USD 材質未對應到模型，保留模型原有材質'
          : `${warnings.join('；')}，已使用 USD 色彩備援`;
        showMaterialSummary(message, 'warning');
        setStatus(message, 100, 'warning');
        return;
      }
      showMaterialSummary(`已套用 ${result.applied.toLocaleString('zh-TW')} 個 USD 材質節點`);
    } catch (error) {
      console.error(error);
      showMaterialSummary('USD 材質套用失敗，模型仍可檢視', 'error');
      setStatus(`USD 材質套用失敗：${error.message ?? error}`, 100, 'error');
      return;
    }
  }
  if (missingAssets.size) {
    const message = `缺少 ${missingAssets.size} 個外部素材，材質可能不完整`;
    showMaterialSummary(message, 'warning', [...missingAssets].join('、'));
    setStatus(message, 100, 'warning');
    return;
  }
  setStatus('載入完成', 100, 'ready');
}

function loadSource(source, name = sourceName(source), manager = THREE.DefaultLoadingManager, materialStage = null, catalog = null, missingAssets = new Set()) {
  const request = ++activeLoad;
  const format = extensionOf(name);
  stopOrbitAnimation();
  clearModel();
  setOpenedFileName('');
  showMaterialSummary('正在讀取模型材質');
  setStatus('準備載入', 1);
  const onError = (error) => {
    if (request !== activeLoad) return;
    console.error(error);
    const reason = missingAssets.size ? `缺少外部素材：${[...missingAssets].join('、')}` : error.message ?? error;
    showMaterialSummary('模型或材質載入失敗', 'error');
    setStatus(`載入失敗：${reason}`, 0, 'error');
  };
  const onProgress = (event) => {
    if (request !== activeLoad) return;
    const value = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
    setStatus(`載入中 ${value || '…'}%`, value);
  };
  const onLoad = (root) => acceptModel(root, format, name, request, materialStage, catalog, missingAssets).catch(onError);
  if (format === 'fbx') {
    new FBXLoader(manager).load(source, onLoad, onProgress, onError);
  } else if (format === 'glb' || format === 'gltf') {
    new GLTFLoader(manager).load(source, (asset) => onLoad(asset.scene), onProgress, onError);
  } else if (['usd', 'usda', 'usdc', 'usdz'].includes(format)) {
    new LocalUSDLoader(manager).load(source, onLoad, onProgress, onError);
  } else {
    setStatus(`不支援 .${format || '未知'} 格式`, 0, 'error');
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
  const byFile = new Map();

  for (const file of files) {
    const path = filePath(file);
    const url = URL.createObjectURL(file);
    urls.push(url);
    byFile.set(file, url);
    byPath.set(path, byPath.has(path) ? null : url);

    const basename = fileBasename(path);
    if (byBasename.has(basename)) {
      byBasename.set(basename, null);
    } else {
      byBasename.set(basename, url);
    }
  }

  return {
    urlFor(file) {
      return byFile.get(file);
    },
    resolve(requested, baseFile) {
      let clean;
      try {
        clean = decodeURIComponent(requested.split(/[?#]/)[0]);
      } catch {
        return null;
      }
      const path = normaliseLocalPath(`${fileDirectory(filePath(baseFile))}/${clean}`);
      return byPath.get(path) ?? byBasename.get(fileBasename(path)) ?? null;
    },
  };
}

function revokeUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.length = 0;
}

async function missingGltfDependencies(file, catalog) {
  if (extensionOf(file.name) !== 'gltf') return new Set();
  let gltf;
  try {
    gltf = JSON.parse(await file.text());
  } catch {
    return new Set(); // 解析錯誤交由 GLTFLoader 回報。
  }
  const missing = new Set();
  for (const resource of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    if (typeof resource.uri !== 'string' || /^data:/i.test(resource.uri)) continue;
    if (!catalog.resolve(resource.uri, file)) missing.add(fileBasename(resource.uri.split(/[?#]/)[0]));
  }
  return missing;
}

async function isMaterialOverlay(file) {
  if (!['usd', 'usda'].includes(extensionOf(file.name))) return false;
  const preview = await file.slice(0, Math.min(file.size, 1024 * 1024)).text();
  return /^\s*#usda\b/.test(preview)
    && /\bover\s+"/.test(preview)
    && /\brel material:binding\b/.test(preview);
}

function loadSelectedScene() {
  const file = selectedScenes[Number.parseInt(sceneSelect.value, 10)];
  if (!file || !selectedCatalog) return;
  const missingAssets = new Set(selectedMissingAssets.get(file) ?? []);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((requested) => {
    const local = selectedCatalog.resolve(requested, file);
    if (local) return local;
    if (requested === selectedCatalog.urlFor(file) || /^data:/i.test(requested)) return requested;
    if (/^blob:/i.test(requested) && !/\.[a-z0-9]+(?:[?#]|$)/i.test(requested)) return requested;
    missingAssets.add(fileBasename(requested.split(/[?#]/)[0]));
    // 未選取的相依檔不可從部署端取得碰巧同名的素材。
    return 'data:application/octet-stream,';
  });
  loadSource(selectedCatalog.urlFor(file), file.name, manager, selectedOverlayStage, selectedCatalog, missingAssets);
}

async function loadFiles(filesLike) {
  const revision = ++selectionRevision;
  const files = [...filesLike];
  const modelExtensions = new Set(['fbx', 'glb', 'gltf', 'usd', 'usda', 'usdz']);
  const candidates = files.filter((file) => modelExtensions.has(extensionOf(file.name)));
  const stageFlags = await Promise.all(candidates.map((file) => isMaterialOverlay(file)));
  if (revision !== selectionRevision) return;
  const overlayStages = candidates.filter((_, index) => stageFlags[index]);
  const scenes = candidates.filter((_, index) => !stageFlags[index]);
  if (!scenes.length) {
    const unsupported = files.length === 1 && !modelExtensions.has(extensionOf(files[0].name));
    const message = unsupported
      ? `目前不支援 .${extensionOf(files[0].name)} 格式`
      : '沒有找到可直接載入的主模型';
    setStatus(message, 0, 'warning');
    return;
  }
  const geometryScenes = scenes.filter((file) => ['glb', 'gltf'].includes(extensionOf(file.name)));
  const nextUrls = [];
  const nextCatalog = createLocalCatalog(files, nextUrls);
  const missingByScene = new Map(await Promise.all(scenes.map(async (file) => [file, await missingGltfDependencies(file, nextCatalog)])));
  if (revision !== selectionRevision) {
    revokeUrls(nextUrls);
    return;
  }
  activeLoad++;
  revokeUrls(modelObjectUrls);
  modelObjectUrls = nextUrls;
  selectedCatalog = nextCatalog;
  selectedScenes = scenes;
  selectedOverlayStage = geometryScenes.length === 1 && overlayStages.length === 1 ? overlayStages[0] : null;
  selectedMissingAssets = missingByScene;
  sceneSelect.replaceChildren(...scenes.map((file, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = filePath(file);
    return option;
  }));
  sceneSelect.disabled = false;
  sceneSelect.value = '0';
  loadSelectedScene();
}

openFileButton.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) loadFiles(fileInput.files).catch((error) => setStatus(`選檔失敗：${error.message ?? error}`, 0, 'error'));
});
sceneSelect.addEventListener('change', loadSelectedScene);

function stopOrbitAnimation() {
  if (orbitAnimationFrame !== null) cancelAnimationFrame(orbitAnimationFrame);
  orbitAnimationFrame = null;
  orbitAnimationButton.setAttribute('aria-pressed', 'false');
  orbitAnimationButton.textContent = '▶ 360° 展示';
}

function orbitPosition() {
  const offset = camera.position.clone().sub(controls.target);
  return {
    azimuth: Math.atan2(offset.y, offset.x),
    elevation: Math.atan2(offset.z, Math.hypot(offset.x, offset.y)),
    radius: offset.length(),
  };
}

function updateAxisGizmo() {
  const view = camera.position.clone().sub(controls.target).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  for (const ball of axisBalls) {
    const axis = axisDirections[ball.dataset.axis];
    const depth = axis.dot(view);
    const x = axis.dot(right) * 29;
    const y = -axis.dot(up) * 29;
    ball.style.left = `${42 + x}px`;
    ball.style.top = `${42 + y}px`;
    ball.style.zIndex = String(Math.round((depth + 1) * 100));
    ball.style.opacity = String(0.45 + (depth + 1) * 0.275);
    ball.style.setProperty('--depth-scale', String(0.8 + (depth + 1) * 0.14));
    const spoke = axisSpokes.find((item) => item.dataset.spoke === ball.dataset.axis);
    spoke.style.width = `${Math.hypot(x, y)}px`;
    spoke.style.transform = `rotate(${Math.atan2(y, x)}rad)`;
    spoke.style.opacity = String(0.2 + (depth + 1) * 0.15);
  }
}

controls.addEventListener('change', updateAxisGizmo);
camera.position.set(4, -4, 3);
controls.update();
updateAxisGizmo();

function setOrbitPosition(target, azimuth, elevation, radius) {
  const horizontal = radius * Math.cos(elevation);
  camera.position.set(
    target.x + horizontal * Math.cos(azimuth),
    target.y + horizontal * Math.sin(azimuth),
    target.z + radius * Math.sin(elevation),
  );
  controls.target.copy(target);
  camera.lookAt(target);
  controls.update();
}

function rotateCamera(dx, dy) {
  const { azimuth, elevation, radius } = orbitPosition();
  if (radius < 0.001) return;
  setOrbitPosition(
    controls.target.clone(),
    azimuth - dx * 0.01,
    THREE.MathUtils.clamp(elevation - dy * 0.01, -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03),
    radius,
  );
}

let lastGizmoPoint = null;
orbitTrackball.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  stopOrbitAnimation();
  orbitTrackball.setPointerCapture(event.pointerId);
  lastGizmoPoint = { x: event.clientX, y: event.clientY };
});
orbitTrackball.addEventListener('pointermove', (event) => {
  if (!lastGizmoPoint || !orbitTrackball.hasPointerCapture(event.pointerId)) return;
  rotateCamera(event.clientX - lastGizmoPoint.x, event.clientY - lastGizmoPoint.y);
  lastGizmoPoint = { x: event.clientX, y: event.clientY };
});
const endGizmoDrag = () => { lastGizmoPoint = null; };
orbitTrackball.addEventListener('pointerup', endGizmoDrag);
orbitTrackball.addEventListener('pointercancel', endGizmoDrag);
orbitTrackball.addEventListener('lostpointercapture', endGizmoDrag);
orbitTrackball.addEventListener('keydown', (event) => {
  const delta = {
    ArrowLeft: [-18, 0], ArrowRight: [18, 0], ArrowUp: [0, -18], ArrowDown: [0, 18],
  }[event.key];
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  stopOrbitAnimation();
  rotateCamera(...delta);
});

for (const ball of axisBalls) {
  ball.addEventListener('click', () => {
    stopOrbitAnimation();
    const { azimuth, radius } = orbitPosition();
    const axis = ball.dataset.axis;
    const chosen = axisDirections[axis];
    const currentView = camera.position.clone().sub(controls.target).normalize();
    // 與 Blender 一樣，再點目前正對的軸端會翻到另一側。
    const direction = currentView.dot(chosen) > 0.995 ? chosen.clone().negate() : chosen;
    const horizontalAzimuth = Math.atan2(direction.y, direction.x);
    const elevation = direction.z === 0 ? 0 : Math.sign(direction.z) * (Math.PI / 2 - 0.03);
    setOrbitPosition(controls.target.clone(), direction.z === 0 ? horizontalAzimuth : azimuth, elevation, radius);
  });
}

orbitAnimationButton.addEventListener('click', () => {
  if (orbitAnimationFrame !== null) {
    stopOrbitAnimation();
    return;
  }
  if (!model) return;
  const target = controls.target.clone();
  const { azimuth, elevation, radius } = orbitPosition();
  const start = performance.now();
  orbitAnimationButton.setAttribute('aria-pressed', 'true');
  orbitAnimationButton.textContent = '■ 停止展示';
  const step = (now) => {
    const fraction = Math.min((now - start) / 24000, 1);
    setOrbitPosition(target, azimuth + fraction * Math.PI * 2, elevation, radius);
    orbitAnimationFrame = fraction < 1 ? requestAnimationFrame(step) : null;
    if (fraction === 1) stopOrbitAnimation();
  };
  orbitAnimationFrame = requestAnimationFrame(step);
});
controls.addEventListener('start', stopOrbitAnimation);
document.querySelector('#reset-camera').addEventListener('click', () => {
  stopOrbitAnimation();
  frameModel();
});

function moveCamera(direction, scale = 1) {
  stopOrbitAnimation();
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
viewport.addEventListener('drop', (event) => {
  if (event.dataTransfer.files.length) loadFiles(event.dataTransfer.files).catch((error) => setStatus(`選檔失敗：${error.message ?? error}`, 0, 'error'));
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
if (defaultModel) loadSource(defaultModel);
