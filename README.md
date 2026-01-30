# Neon Chess Online (DTZ Edition)

這是一個基於 Web 的 3D 多人連線西洋棋遊戲，具備即時 Firebase 連線、霓虹視覺風格以及完整的西洋棋規則判定。

## 特色
* **完整規則**：支援入堡 (Castling)、吃過路兵 (En Passant)、兵升變 (Promotion)。
* **即時連線**：使用 Firebase Realtime Database 同步棋局。
* **視覺互動**：能看到對手的視角位置（橘色幽靈球）。
* **RWD 設計**：電腦版為左側選單，手機版為底部抽屜。

## 安裝與執行
1.  將所有檔案 (`index.html`, `style.css`, `game_logic.js`, `visuals.js`) 放在同一個資料夾。
2.  使用 **Live Server** (VS Code 套件) 或任何 Web Server 開啟 `index.html`。
    * *注意：由於模組安全性限制，直接雙擊 html 檔案可能無法運作。*

## 設定 Firebase
目前 `game_logic.js` 中使用了一組公開測試用的 Firebase Config。
若要長期營運，請在 Firebase Console 建立自己的專案，並替換 `firebaseConfig` 變數。
