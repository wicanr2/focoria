# FBX / GLB / USD Viewer

以 Three.js 製作的瀏覽器三維模型檢視器，支援從網址、本機檔案選擇器或拖放載入
FBX、GLB、glTF、自包含 ASCII USDA 與相容的 USDZ。另提供沙崙用的「GLB 幾何 + USD 材質覆蓋」：私有
USD stage 與貼圖只由使用者在本機選取並於瀏覽器記憶體中處理。介面提供軌道旋轉、方向平移、滾輪縮放、模型統計，以及點選
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

### USD

USD（Universal Scene Description）是 Pixar 發展的場景描述系統。`.usda` 是可讀文字格式，
`.usdc` 是二進位格式，`.usd` 可為其中任一種，`.usdz` 則是單檔封裝。

本專案在 Three.js `USDLoader` 外加上本機 ASCII USDA 判別，避免把 `.usda` 誤解為 USDZ。
直接開啟僅支援自包含的 ASCII USDA；二進位 USDC，以及使用 `references`、`payload` 或
`subLayers` 的 OpenUSD 組合 stage 會明確顯示不支援，不會載入空場景並冒充成功。相容 USDZ
仍受 Three.js 內建解析能力限制。

沙崙完整場域的幾何位於 USDC payload，因此應以對應 GLB 載入幾何，再由 ASCII `.usda`
材質 stage 套用 UsdPreviewSurface 的色彩、金屬度、粗糙度、透明度與 JPG／PNG 基底貼圖。
這不是通用 OpenUSD 組合器，也不會執行 Isaac Sim 的 PhysX、OmniGraph、ROS 2 bridge 或 articulation 控制。

## 功能

- 載入 `.fbx`、`.glb`、`.gltf`、自包含 ASCII `.usd/.usda` 與相容 `.usdz` 網址。
- 從本機選取或拖放 FBX／GLB／USD；模型只在瀏覽器記憶體內解析。
- 一次選取主模型與同層相依資源，例如 `.gltf + .bin + 貼圖`。
- 對沙崙 GLB，直接選取一個 `.usda` stage，必要時再加入貼圖資料夾，在本機套用 USD 材質覆蓋。
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

本機可設定 `LOCAL_SCENE_DIR` 指向集中場景目錄，Vite 開發及預覽伺服器就會唯讀提供 `/models/`，不必複製素材或建立符號連結。支援 manifest 的 `models` 及沙崙 `floors` 清單；此本機路由僅允許 manifest 與沙崙樓層 GLB 檔名。未設定時維持以下靜態部署方式。

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

## 沙崙私有素材覆蓋

新版沙崙 GLB 已內嵌 UV 與色彩貼圖，直接從樓層選單或本機選檔載入即可；介面會顯示已包含貼圖的網格數。下列覆蓋流程供舊 GLB 或另行比較材質使用，日常觀看新版 GLB 不需要再做一次。

1. 以「開啟三維模型」選取一個沙崙分層 GLB。
2. 在側欄的「沙崙 USD 素材覆蓋」按「直接選取 USD stage」，選取相對應的 ASCII `.usda`。
3. GLB 若有 UV 座標，再以「加入貼圖資料夾」選取 stage 實際引用的 JPG／PNG 所在資料夾；不必選取
   整個私有素材工作樹。
4. 按「套用 USD 材質」。沒有 UV 座標的網格會改用 USD stage 宣告的 fallback 色彩與材質參數，不會套用
   需要 UV 的貼圖。更換材質會保留雙面設定；缺少法線的網格使用平面著色，避免無效法線造成黑面。

驗證與修正歷程見 [WORKLOG.md](WORKLOG.md)。

套用器以 USD `over` 的材質綁定，對應 GLB 匯出節點名稱中的 `__Geometry` 後綴；套用結果會顯示已匹配的節點數與未選取的貼圖數。這些素材不會複製到此公開程式碼儲存庫。

## GitHub Pages

網站使用獨立 `gh-pages` 分支的根目錄發布，不使用 GitHub Actions。`main` 只保存
原始碼；部署時先執行 `npm ci && npm run build`，再將 `dist/` 的內容推送到
`gh-pages` 分支。對應 wicanr2 帳號的網站是：

```text
https://wicanr2.github.io/fbx-glb-viewer/
```

公開網頁不內嵌任何模型。外部 OpenUSD reference、payload 與 subLayer 組合不在本 viewer 的
直接載入範圍；沙崙材質應透過本機選取私有素材工作樹處理。

## 安全與資料邊界

- 模型解析完全在使用者瀏覽器內進行；選檔不會將模型上傳、保存或加入 Git。
- 載入遠端模型時，來源伺服器必須允許跨來源資源共用（CORS）。本機沙崙素材覆蓋不使用遠端請求。
- 節點名稱只供追溯，不自動代表門、電梯、樓層或其他業務語意。
- 公開部署前，應自行確認模型、貼圖與衍生資料的授權及機密邊界。

## English summary

FBX / GLB / USD Viewer is a browser-based Three.js model inspector for FBX, GLB, glTF,
self-contained ASCII USDA, and compatible USDZ files. Binary USDC and composed OpenUSD stages
are explicitly rejected instead of being reported as an empty successful scene.
It supports URL loading, local file selection, drag and drop, orbit controls, keyboard and
on-screen camera panning, wheel zoom, scene statistics, and surface hit coordinates. Local files
are parsed in browser memory and are not uploaded or persisted by the application.

FBX is commonly used as a rich interchange format between digital content creation tools.
glTF is an open runtime delivery format, while GLB packages glTF data and embedded resources
into one binary file suitable for web delivery.

For Shalun, local GLB geometry can receive an ASCII USDA material overlay selected from a private
asset worktree; the viewer never uploads or bundles those assets. No models or site-specific datasets
are included. This repository currently provides no open-source license. Public access does not grant
permission to copy, modify, redistribute, or use the project commercially.
