import * as THREE from 'three';

function findBlockEnd(text, openingBrace) {
  let depth = 0;
  let quote = null;

  for (let index = openingBrace; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function declarationBody(text, declarationIndex) {
  const openingBrace = text.indexOf('{', declarationIndex);
  if (openingBrace < 0) return null;
  const closingBrace = findBlockEnd(text, openingBrace);
  return closingBrace < 0 ? null : text.slice(openingBrace + 1, closingBrace);
}

function readFloat(body, name, fallback) {
  const match = body.match(new RegExp(`\\bfloat inputs:${name}\\s*=\\s*([-+0-9.eE]+)`));
  return match ? Number.parseFloat(match[1]) : fallback;
}

function readColor(body, fallback) {
  const match = body.match(/\bcolor3f inputs:diffuseColor\s*=\s*\(([^)]+)\)/);
  if (!match) return fallback;
  const values = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
  return values.length === 3 && values.every(Number.isFinite) ? values : fallback;
}

function readTextureFallback(body, fallback) {
  const match = body.match(/\bfloat4 inputs:fallback\s*=\s*\(([^)]+)\)/);
  if (!match) return fallback;
  const values = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
  return values.length >= 3 && values.slice(0, 3).every(Number.isFinite) ? values.slice(0, 3) : fallback;
}

function normaliseShalunNodeName(name) {
  // USD's `over` prims end in one underscore while the GLB exporter appends
  // `__Geometry`; retain the source underscore for a stable one-to-one match.
  return name.replace(/__Geometry$/, '_');
}

/**
 * Parse the deliberately narrow USD subset used by the Shalun material stages:
 * `over` material bindings and UsdPreviewSurface material descriptions.
 */
function parseShalunUsdMaterialStage(text) {
  if (!/^\s*#usda\b/.test(text)) {
    throw new Error('材質 stage 必須是 ASCII .usda 檔案');
  }

  const bindings = new Map();
  const overPattern = /\bover\s+"([^"]+)"/g;
  let match;
  while ((match = overPattern.exec(text))) {
    const body = declarationBody(text, match.index);
    if (!body) continue;
    const material = body.match(/\brel material:binding\s*=\s*<[^>]*\/([^/>]+)>/);
    if (material) bindings.set(match[1], material[1]);
  }

  const materials = new Map();
  const materialPattern = /\bdef\s+Material\s+"([^"]+)"/g;
  while ((match = materialPattern.exec(text))) {
    const body = declarationBody(text, match.index);
    if (!body) continue;
    const surfaceMatch = /\bdef\s+Shader\s+"PreviewSurface"/.exec(body);
    const surface = surfaceMatch ? declarationBody(body, surfaceMatch.index) : body;
    const texture = body.match(/\basset inputs:file\s*=\s*@([^@]+)@/);
    const hasTexture = Boolean(texture) && /inputs:diffuseColor\.connect/.test(surface);
    const fallback = readTextureFallback(body, [0.6, 0.6, 0.6]);

    materials.set(match[1], {
      color: readColor(surface, fallback),
      metalness: readFloat(surface, 'metallic', 0),
      opacity: readFloat(surface, 'opacity', 1),
      roughness: readFloat(surface, 'roughness', 1),
      texturePath: hasTexture ? texture[1].trim() : null,
      wrapS: /\btoken inputs:wrapS\s*=\s*"repeat"/.test(body),
      wrapT: /\btoken inputs:wrapT\s*=\s*"repeat"/.test(body),
    });
  }

  return { bindings, materials };
}

function buildMaterial(descriptor, texture) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().fromArray(descriptor.color),
    metalness: descriptor.metalness,
    opacity: descriptor.opacity,
    roughness: descriptor.roughness,
    transparent: descriptor.opacity < 1,
    depthWrite: descriptor.opacity >= 1,
  });

  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = descriptor.wrapS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapT = descriptor.wrapT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    material.map = texture;
  }

  return material;
}

/**
 * Overlay a Shalun USD material stage onto its matching GLB geometry.
 * `resolveFile(path)` must resolve paths relative to the selected stage and
 * returns a local object URL, so no model content is uploaded or fetched.
 */
async function applyShalunUsdMaterialStage({ root, stageText, resolveFile }) {
  const { bindings, materials } = parseShalunUsdMaterialStage(stageText);
  const materialCache = new Map();
  const missingTextures = new Set();
  const textureLoader = new THREE.TextureLoader();

  async function materialFor(name, supportsTexture, flatShading, side) {
    const cacheKey = `${name}:${supportsTexture}:${flatShading}:${side}`;
    if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
    const descriptor = materials.get(name);
    if (!descriptor) return null;

    const promise = (async () => {
      let texture = null;
      if (descriptor.texturePath && supportsTexture) {
        const url = resolveFile(descriptor.texturePath);
        if (!url) {
          missingTextures.add(descriptor.texturePath);
        } else {
          try {
            texture = await textureLoader.loadAsync(url);
            // GLB 的 UV 原點在左上；外加貼圖需與 GLTFLoader 的設定一致。
            texture.flipY = false;
          } catch (error) {
            console.warn(`無法載入 USD 貼圖 ${descriptor.texturePath}`, error);
            missingTextures.add(descriptor.texturePath);
          }
        }
      }
      const material = buildMaterial(descriptor, texture);
      // GLTFLoader uses derivative face normals when NORMAL is absent. A new
      // material must retain that setting as well as the source face culling.
      material.flatShading = flatShading;
      material.side = side;
      return material;
    })();

    materialCache.set(cacheKey, promise);
    return promise;
  }

  const assignments = [];
  root.traverse((node) => {
    if (!node.isMesh || !node.name) return;
    const materialName = bindings.get(normaliseShalunNodeName(node.name));
    if (materialName) {
      assignments.push({
        node,
        materialName,
        supportsTexture: Boolean(node.geometry?.getAttribute('uv')),
        flatShading: !node.geometry?.getAttribute('normal') || Boolean(node.material.flatShading),
        side: node.material.side ?? THREE.FrontSide,
      });
    }
  });

  const replacement = new Map();
  for (const { materialName, supportsTexture, flatShading, side } of assignments) {
    const cacheKey = `${materialName}:${supportsTexture}:${flatShading}:${side}`;
    if (!replacement.has(cacheKey)) replacement.set(cacheKey, await materialFor(materialName, supportsTexture, flatShading, side));
  }

  let applied = 0;
  let textureFallbackNodes = 0;
  for (const { node, materialName, supportsTexture, flatShading, side } of assignments) {
    const material = replacement.get(`${materialName}:${supportsTexture}:${flatShading}:${side}`);
    if (!material) continue;
    node.material = material;
    if (!supportsTexture && materials.get(materialName)?.texturePath) textureFallbackNodes += 1;
    applied += 1;
  }

  return {
    applied,
    bindings: bindings.size,
    materials: materials.size,
    missingTextures: [...missingTextures],
    textureFallbackNodes,
    texturedMaterials: [...replacement.values()].filter((material) => material?.map).length,
  };
}

export {
  applyShalunUsdMaterialStage,
  normaliseShalunNodeName,
  parseShalunUsdMaterialStage,
};
