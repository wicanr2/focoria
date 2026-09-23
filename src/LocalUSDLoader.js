import { USDLoader } from 'three/addons/loaders/USDLoader.js';

const decoder = new TextDecoder();

function readUSDA(buffer) {
  if (typeof buffer === 'string') return buffer;
  if (!(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer))) return null;

  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const header = decoder.decode(bytes.subarray(0, 32));

  return /^\s*#usda\b/.test(header) ? decoder.decode(bytes) : null;
}

function isUSDC(buffer) {
  if (!(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer))) return false;
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8))
    : new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(buffer.byteLength, 8));
  return String.fromCharCode(...bytes) === 'PXR-USDC';
}

/**
 * Three.js receives local files as ArrayBuffers. USDLoader only recognizes an
 * ASCII USDA file when it is already a string, so it otherwise attempts to
 * unzip it as USDZ. Decode the ASCII variant before delegating to Three.js.
 *
 * This intentionally does not claim USDC composition support. The optional
 * legacy material overlay is handled separately by shalunUsdMaterials.js.
 */
class LocalUSDLoader extends USDLoader {
  parse(buffer) {
    const usda = readUSDA(buffer);
    if (usda) {
      if (/\b(?:prepend\s+)?(?:references|payload|subLayers)\s*=/.test(usda)) {
        throw new Error('目前不支援含 references、payload 或 subLayers 的 USD 組合舞台；請改用可直接檢視的模型檔。');
      }
      return super.parse(usda);
    }
    if (isUSDC(buffer)) {
      throw new Error('目前不支援二進位 USDC；請改用可直接檢視的模型檔。');
    }
    return super.parse(buffer);
  }
}

export { LocalUSDLoader, isUSDC, readUSDA };
