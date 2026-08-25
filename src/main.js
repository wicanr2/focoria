import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const fileInput = document.querySelector('#file-input');
const urlForm = document.querySelector('#url-form');
const urlInput = document.querySelector('#model-url');
const selection = document.querySelector('#selection');
const sceneInfo = document.querySelector('#scene-info');
const floorSelect = document.querySelector('#floor-select');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071014);
scene.fog = new THREE.FogExp2(0x071014, 0.00045);

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
let objectUrl = null;
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
  setStatus('載入完成', 100);
}

function loadSource(source, name = source) {
  const format = extensionOf(name);
  setStatus('準備載入', 1);
  const onError = (error) => {
    console.error(error);
    setStatus(`載入失敗：${error.message ?? error}`, 0);
  };
  if (format === 'fbx') {
    new FBXLoader().load(source, (root) => acceptModel(root, format), onProgress, onError);
  } else if (format === 'glb' || format === 'gltf') {
    new GLTFLoader().load(source, (asset) => acceptModel(asset.scene, format), onProgress, onError);
  } else {
    setStatus(`不支援 .${format || '未知'} 格式`, 0);
  }
}

function loadFile(file) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  loadSource(objectUrl, file.name);
}

fileInput.addEventListener('change', () => fileInput.files[0] && loadFile(fileInput.files[0]));
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
viewport.addEventListener('drop', (event) => event.dataTransfer.files[0] && loadFile(event.dataTransfer.files[0]));

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

fetch('/models/manifest.json')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((manifest) => {
    for (const item of manifest.models ?? []) {
      const option = document.createElement('option');
      option.value = `/models/${item.file}`;
      option.textContent = item.label ?? item.file;
      floorSelect.append(option);
    }
  })
  .catch((error) => console.warn('未載入模型清單', error));
