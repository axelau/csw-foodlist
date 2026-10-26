# 長沙灣食店目錄

靜態網站，收錄 OpenRice 標示為長沙灣的食店（451 間）。可以按種類篩選、搜尋店名、地址或菜式，並開啟該店的 OpenRice 頁面。

資料檔是 `public/csw_categorized.json`。頁面只顯示這份資料，不會自行加店。

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

- 截取日期：2026年10月26日
- 範圍：OpenRice 標示為長沙灣的食店
- 分類按主要菜式歸入；同一店名如果有多個舖位，會分開列出
