# Focoria

Focoria 是以 Three.js 製作的通用瀏覽器三維模型檢視器。使用者可以選取或拖放本機檔案；場景清單由本次選取的模型動態建立，不預設沙崙或其他場域。支援 FBX、GLB、glTF、自包含的 ASCII USD／USDA 與相容的 USDZ。模型與貼圖只在瀏覽器記憶體內處理，不上傳至伺服器。

> 本儲存庫未提供開放原始碼授權。公開存取不代表授予複製、修改、散布或商業使用
> 的權利；詳見 [COPYRIGHT.md](COPYRIGHT.md)。

精簡介面依[UX 原圖與補充規格](docs/ux/README.md)實作；場景與材質載入的驗收邊界見 [Issue #5 規格](docs/spec/issue-5-user-selected-scenes-and-materials.md)。

`.blend` 直接載入尚未完成，另由 [Issue #2](https://github.com/wicanr2/focoria/issues/2) 追蹤；介面不會把它列為目前支援格式。

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

- 透過網址參數 `?model=<模型 URL>` 載入 `.fbx`、`.glb`、`.gltf`、自包含 ASCII `.usd/.usda` 與相容 `.usdz`；介面不另設網址輸入欄。
- 從本機選取或拖放模型；多個模型會出現在「本次選取的場景」清單，再次選檔則取代舊批次。
- 同批選取相依資源，例如 `.gltf + .bin + 貼圖`；缺少外部素材時顯示警告，不把純色備援說成貼圖已載入。
- 保留單一 GLB／glTF 與可唯一對應的 USDA 材質舞台覆蓋能力；多模型時不猜測對應關係。
- 滑鼠左鍵旋轉、右鍵平移、滾輪縮放。
- 六軸小球旋鈕可拖曳旋轉，點選軸端切換視角；控制盤與鍵盤方向鍵可平移鏡頭。
- `360° 展示` 依當前俯仰角和距離繞場景旋轉一圈，按鈕可中途停止。
- `Shift + 方向鍵` 加速移動。

## 開發與建置

本機工作區可執行 `../start-focoria.sh`，以 Docker 建置並預覽於 `http://127.0.0.1:5174/`；可用 `FOCORIA_PORT` 改埠號。舊入口 `../start-fbx-glb-viewer.sh` 轉呼叫同一個通用服務，不再預載沙崙模型。兩支腳本位於本機 `workplace/`，不屬於此儲存庫。

需要 Node.js 22。依本機共用主機規則，下列專案命令須在受限 Docker 容器內執行：

```bash
npm ci
npm run dev
npm run build
```

正式輸出位於 `dist/`。此專案不附帶任何第三方或場域模型。

## 使用者選檔與材質

按「載入模型」可以一次選取一個或多個主模型，以及它們需要的 `.bin`、PNG、JPG 等相依檔；拖放也使用相同規則。清單只列可直接開啟的主模型，不列相依檔。選到新的一批主模型時，舊清單和素材一起被取代；若這次只有貼圖或不支援的格式，保留目前場景並顯示提示。

載入器會顯示模型內的材質與貼圖。外部資源只有在同批選取、且能唯一對應時才會使用；瀏覽器無權自行掃描其他本機目錄。材質提示會區分已載入貼圖、只有純色材質、缺少外部素材與解析失敗。`.gltf` 引用的外部 `.bin` 與貼圖會先檢查是否在同批檔案中，避免缺件後仍誤報為完整載入。

網址參數 `?model=` 仍可直接載入有跨來源存取許可的模型，但不會預先塞進本機選檔清單。部署端的舊 `manifest.json` 清單與沙崙專用檔案路由已移除。

## 沙崙私有素材覆蓋

新版沙崙 GLB 已內嵌 UV 與色彩貼圖，直接以本機選檔載入即可，不需預設樓層清單。舊 GLB 或需比較 USDA 材質時，仍可使用同一個「載入模型」按鈕：

1. 在檔案選擇器中同時選取一個 GLB／glTF、對應的 ASCII `.usda` 材質舞台，以及它引用的 JPG／PNG 貼圖檔。
2. 檢視器辨識出材質覆蓋舞台且配對唯一時才自動套用；若缺貼圖、網格沒有 UV 或無對應節點，會顯示警告。多個幾何模型同批選取時不猜測哪個應套用該舞台。

瀏覽器不會因選到一個 USDA 就自動取得磁碟上其他目錄的檔案；需要的外部貼圖必須在同次選檔中提供。大量素材庫不必整份選入檢視器，選取實際相依檔即可。

驗證與修正歷程見 [WORKLOG.md](WORKLOG.md)。

套用器以 USD `over` 的材質綁定，對應 GLB 匯出節點名稱中的 `__Geometry` 後綴。這些素材不會複製到此公開程式碼儲存庫。

## 發布狀態

GitHub 儲存庫已更名為 [wicanr2/focoria](https://github.com/wicanr2/focoria)。本輪只重建並部署本機預覽，沒有發布 GitHub Pages；既有 `gh-pages` 設定與舊網站路徑不代表新版已公開上線。公開程式碼不內嵌場域模型。

## 安全與資料邊界

- 模型解析完全在使用者瀏覽器內進行；選檔不會將模型上傳、保存或加入 Git。
- 載入遠端模型時，來源伺服器必須允許跨來源資源共用（CORS）。本機沙崙素材覆蓋不使用遠端請求。
- 節點名稱只供追溯，不自動代表門、電梯、樓層或其他業務語意。
- 公開部署前，應自行確認模型、貼圖與衍生資料的授權及機密邊界。

## English summary

Focoria is a browser-based Three.js model inspector for FBX, GLB, glTF,
self-contained ASCII USDA, and compatible USDZ files. Binary USDC and composed OpenUSD stages
are explicitly rejected instead of being reported as an empty successful scene.
Its scene list follows the current local file selection and replaces the previous batch. It supports URL loading, local file selection, drag and drop, orbit controls, a six-axis view gizmo,
keyboard and on-screen camera panning, wheel zoom, and a horizontal 360-degree presentation orbit. Local files
are parsed in browser memory and are not uploaded or persisted by the application.

FBX is commonly used as a rich interchange format between digital content creation tools.
glTF is an open runtime delivery format, while GLB packages glTF data and embedded resources
into one binary file suitable for web delivery.

For Shalun, a single local GLB or glTF model can receive a uniquely paired ASCII USDA material overlay when the stage and its
referenced textures are selected together; the viewer never uploads or bundles those assets. No models or site-specific datasets
are included. This repository currently provides no open-source license. Public access does not grant
permission to copy, modify, redistribute, or use the project commercially.
