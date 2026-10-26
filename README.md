# 長沙灣食店目錄

靜態網站，收錄 OpenRice 標示為長沙灣的食店（396 間）。可以按種類、價錢、街道篩選，搜尋店名、地址或菜式，標記食開同唔鐘意，隨機抽一間，並開啟該店的 OpenRice 頁面。

資料檔是 `public/csw_categorized.json`。頁面只顯示這份資料，不會自行加店。

## 篩選同標記

- 種類、價錢、街道可以一齊用。價錢可以同時選多個範圍（例如 `$50以下` 同 `$51-100`），「不限」會清除價錢。街道由地址歸納，主要包括青山道、元州街、順寧道、保安道、東京街等出現較多的街道。
- 「食開」同「唔鐘意」存在瀏覽器的 localStorage（`csw-foodlist.marks`），只在這部裝置，不會上傳。舊有的「鐘意」會在第一次開啟時併入「食開」。
- 按「唔鐘意」之後，該店留在同一個名單，收成一行店名同「解除」，並移到目前結果最底。按「解除」會還原完整卡片同原本排序位置。
- 「隨機一間」可以從全部食店、目前篩選，或者「食開」入面抽。預設範圍唔包括「唔鐘意」。再抽一次會避開剛抽中的那間。

## 本地開發

```bash
npm install
npm run dev
```

開發伺服器會開在 `http://localhost:5173/csw-foodlist/`。

## 建置

```bash
npm run build
```

靜態檔輸出到 `dist/`。`vite.config.ts` 的 `base` 是 `/csw-foodlist/`，讓 GitHub Project Pages 在 [https://axelau.github.io/csw-foodlist/](https://axelau.github.io/csw-foodlist/) 正確載入腳本、樣式同 JSON。

本地預覽建置結果：

```bash
npm run preview
```

## GitHub Pages

這個 repo 用 **GitHub Actions** 建置並部署 `dist/`（見 `.github/workflows/pages.yml`）。推上 `main` 之後，workflow 會執行 `npm ci` 同 `npm run build`，再把 `dist/` 發佈到 GitHub Pages。

請在 GitHub：**Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。

啟用後，網站網址是 [https://axelau.github.io/csw-foodlist/](https://axelau.github.io/csw-foodlist/)。

不是用 `/docs` 資料夾，也不是 `gh-pages` 分支。如果 Pages 尚未啟用，推上 `main` 時 workflow 會在 Setup Pages 這步失敗。選好 GitHub Actions 之後，到 Actions 重新執行「Deploy GitHub Pages」。

## 資料

- 截取日期：2026年10月27日
- 範圍：OpenRice 標示為長沙灣、狀態為營業中或裝修中的食店（396 間）。今次更新從上一版 451 間移除 55 間 OpenRice 標為已搬遷的店，沒有另外標結業。
- 分類按主要菜式歸入；同一店名如果有多個舖位，會分開列出
