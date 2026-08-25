# FBX / GLB Viewer

以 Three.js 製作的瀏覽器三維模型檢視器，支援從網址、本機檔案選擇器或拖放載入
FBX、GLB 與 glTF。介面提供軌道旋轉、方向平移、滾輪縮放、模型統計，以及點選
表面的世界座標與來源節點名稱。

> 本儲存庫未提供開放原始碼授權。公開存取不代表授予複製、修改、散布或商業使用
> 的權利；詳見 [COPYRIGHT.md](COPYRIGHT.md)。

## 格式是什麼

### FBX

FBX（Filmbox）是常見的三維交換格式，現由 Autodesk 維護。它可以保存網格、材質、
物件階層、骨架與動畫，適合在數位內容製作工具之間交換資料。FBX 規格與實作較複雜，
大型檔案在瀏覽器端需要較多解析時間與記憶體；本專案使用 Three.js `FBXLoader` 載入。

### glTF

glTF（GL Transmission Format）是 Khronos Group 制定、為即時顯示與網路傳輸設計的
開放三維格式。`.gltf` 通常是 JSON 場景描述，並可搭配外部 `.bin` 網格資料與貼圖。

### GLB

GLB 是 glTF 的單一二進位封裝，可以把場景描述、網格與可內嵌資源放在一個檔案中。
它較容易部署、下載與拖放，因此是本檢視器建議的網頁交付格式。本專案使用 Three.js
`GLTFLoader` 載入 GLB 與 glTF。

FBX 適合保存或檢查來源交換資料；GLB 適合瀏覽器展示。格式轉換可能改變材質、座標軸、
單位、物件階層或動畫，所以轉換結果不應在未驗證時被當成來源檔的完全等價副本。

## 功能

- 載入 `.fbx`、`.glb`、`.gltf` 網址。
- 從本機選取或拖放 FBX／GLB。
- 滑鼠左鍵旋轉、右鍵平移、滾輪縮放。
- 畫面方向控制盤與鍵盤方向鍵平移鏡頭。
- `Shift + 方向鍵` 加速移動。
- 點選模型，顯示實際命中表面的世界座標。
- 顯示格式、物件數與三角面數。
- 透過可選的模型清單載入部署端 GLB。

## 開發與建置

需要 Node.js 22：

```bash
npm ci
npm run dev
npm run build
```

正式輸出位於 `dist/`。此專案不附帶任何第三方或場域模型。

## 可選模型清單

若部署端需要下拉式模型清單，將
`public/models/manifest.example.json` 複製成 `public/models/manifest.json`，再把模型放進
同一個 `/models/` URL 路徑。模型檔已由 `.gitignore` 排除，避免誤提交大型或機密資產。

```json
{
  "schema_version": 1,
  "models": [
    { "label": "範例模型", "file": "example.glb" }
  ]
}
```

沒有 `manifest.json` 時，網址載入、本機選取與拖放仍可正常使用。

## 安全與資料邊界

- 模型解析完全在使用者瀏覽器內進行，本專案不提供上傳伺服器。
- 載入遠端模型時，來源伺服器必須允許跨來源資源共用（CORS）。
- 節點名稱只供追溯，不自動代表門、電梯、樓層或其他業務語意。
- 公開部署前，應自行確認模型、貼圖與衍生資料的授權及機密邊界。

## English summary

FBX / GLB Viewer is a browser-based Three.js model inspector for FBX, GLB, and glTF files.
It supports URL loading, local file selection, drag and drop, orbit controls, keyboard and
on-screen camera panning, wheel zoom, scene statistics, and surface hit coordinates.

FBX is commonly used as a rich interchange format between digital content creation tools.
glTF is an open runtime delivery format, while GLB packages glTF data and embedded resources
into one binary file suitable for web delivery.

No models or site-specific datasets are included. This repository currently provides no
open-source license. Public access does not grant permission to copy, modify, redistribute,
or use the project commercially.
