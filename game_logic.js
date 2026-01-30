import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as Visuals from './visuals.js';

// 請替換為你的 Firebase 設定
const firebaseConfig = {
    apiKey: "AIzaSyCxPppnUG864v3E2j1OzykzFmhLpsEJCSE",
    authDomain: "chess-1885a.firebaseapp.com",
    databaseURL: "https://chess-1885a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chess-1885a",
    storageBucket: "chess-1885a.firebasestorage.app",
    messagingSenderId: "824383572856",
    appId: "1:824383572856:web:7c663d6bf0f970f6acd68d"
};

let app, db, auth;
let currentUser = null;
let gameId = null;
let playerColor = 'w'; // 'w' or 'b'
let isOnline = false;
let isProcessing = false;
let game = null;
let selectedSquare = null;
let isGuestLoginIntent = false;

// 初始化遊戲
export function initGame() {
    console.log("System Initializing...");
    
    // 檢查 chess.js 是否載入
    if (window.Chess) { game = new window.Chess(); } 
    else { alert("Critical Error: Chess Engine not found."); return; }

    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
    } catch(e) { console.error("Firebase Init Error:", e); }

    // 初始化 3D 場景
    Visuals.init3D(null, handleSquareClick, handleCameraUpdate);
    Visuals.setLoginMode(true);

    setupUIListeners();
    
    onAuthStateChanged(auth, (user) => {
        document.getElementById('loading').style.display = 'none';
        
        if (user) {
            // 安全機制：防止重新整理自動登入訪客
            if (user.isAnonymous && !isGuestLoginIntent) {
                signOut(auth);
                return;
            }
            currentUser = user;
            document.getElementById('auth-modal').style.display = 'none';
            document.getElementById('menu-panel').style.display = 'flex'; // 顯示左側選單
            Visuals.setLoginMode(false);
            checkAndCreateUserProfile(user);
        } else {
            currentUser = null;
            document.getElementById('auth-modal').style.display = 'flex';
            // document.getElementById('menu-panel').style.display = 'none'; // 保持選單隱藏直到登入
            Visuals.setLoginMode(true);
            isGuestLoginIntent = false;
        }
    });
}

// UI 事件綁定
function setupUIListeners() {
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if(el) el.onclick = fn;
    };

    bind('btn-create', createRoom);
    bind('btn-join', joinRoom);
    bind('btn-leave', leaveRoom);
    bind('auth-action-btn', handleLogin);
    bind('btn-logout', handleLogout);

    const guestBtn = document.getElementById('guest-btn');
    if(guestBtn) {
        guestBtn.onclick = () => {
            isGuestLoginIntent = true;
            signInAnonymously(auth).catch(err => {
                isGuestLoginIntent = false;
                alert("Login Failed: " + err.message);
            });
        };
    }
}

// 處理棋盤點擊 (核心規則邏輯)
function handleSquareClick(sq) {
    if(isProcessing) return;
    if(isOnline && game.turn() !== playerColor) return;

    // 1. 取得點擊格子的棋子
    const piece = game.get(sq);

    // 2. 如果之前沒選棋子，或者點選了自己的棋子 -> 進行選取
    if (!selectedSquare || (piece && piece.color === game.turn())) {
        if (piece && piece.color === game.turn()) {
            selectedSquare = sq;
            // 獲取合法走法 (包含特殊規則如入堡)
            const moves = game.moves({ square: sq, verbose: true });
            Visuals.highlightSquare(sq, moves);
        }
        return;
    }

    // 3. 嘗試移動 (從 selectedSquare 到 sq)
    // 注意：promotion: 'q' 代表兵到底線自動變皇后 (簡化流程)
    const move = game.move({
        from: selectedSquare,
        to: sq,
        promotion: 'q' 
    });

    if (move) {
        // 移動成功
        isProcessing = true;
        Visuals.animateMove(move, () => {
            Visuals.syncBoardVisuals(game); // 確保 3D 狀態與邏輯一致
            updateStatusUI();
            
            if (isOnline) sendMove(move);
            else {
                // 單機測試用 AI
                if(!game.game_over()) setTimeout(makeRandomAI, 500);
                else isProcessing = false;
            }
        });
        selectedSquare = null;
        Visuals.clearHighlights();
    } else {
        // 移動不合法
        selectedSquare = null;
        Visuals.clearHighlights();
    }
}

// 傳送移動到 Firebase
function sendMove(move) {
    if (!isOnline) return;
    
    let updateData = {
        fen: game.fen(), // FEN 包含所有盤面資訊 (含入堡權限、過路兵)
        turn: game.turn(),
        lastMove: move,
        timestamp: Date.now()
    };

    if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'b' : 'w';
        updateData.winner = winner;
        updateData.status = 'finished';
        alert("Checkmate! " + (winner === 'w' ? "White" : "Black") + " wins!");
    } else if (game.in_draw()) {
        updateData.winner = 'draw';
        updateData.status = 'finished';
        alert("Draw!");
    }

    update(ref(db, 'games/' + gameId), updateData)
        .then(() => { isProcessing = false; })
        .catch(err => console.error("Send Move Error", err));
}

// 建立房間
function createRoom() {
    if (!currentUser) return;
    game.reset();
    Visuals.syncBoardVisuals(game);
    
    gameId = Math.floor(1000 + Math.random() * 9000).toString();
    
    const gameData = {
        fen: game.fen(),
        turn: 'w',
        white: { uid: currentUser.uid, name: "Commander" },
        status: 'waiting'
    };

    set(ref(db, 'games/' + gameId), gameData).then(() => {
        playerColor = 'w';
        isOnline = true;
        setupGameListeners();
        updateRoomUI(true);
        Visuals.moveCamera({x: 0, y: 50, z: 60}, {x:0, y:0, z:0}); // 白方視角
    });
}

// 加入房間
function joinRoom() {
    const inputId = prompt("請輸入 4 位數房間號碼:");
    if (!inputId) return;

    get(ref(db, 'games/' + inputId)).then(snap => {
        if(snap.exists() && snap.val().status === 'waiting') {
            gameId = inputId;
            game.reset();
            
            update(ref(db, 'games/' + gameId), {
                black: { uid: currentUser.uid, name: "Challenger" },
                status: 'playing'
            }).then(() => {
                playerColor = 'b';
                isOnline = true;
                setupGameListeners();
                updateRoomUI(true);
                game.load(snap.val().fen); // 載入當前盤面
                Visuals.syncBoardVisuals(game);
                Visuals.moveCamera({x: 0, y: 50, z: -60}, {x:0, y:0, z:0}); // 黑方視角
            });
        } else {
            alert("房間不存在或已滿");
        }
    });
}

// 監聽遊戲狀態
function setupGameListeners() {
    const gameRef = ref(db, 'games/' + gameId);
    
    onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // 1. 同步盤面
        if (data.fen !== game.fen()) {
            game.load(data.fen);
            Visuals.syncBoardVisuals(game);
            updateStatusUI();
            // 如果輪到我，解除鎖定
            if (game.turn() === playerColor) isProcessing = false;
        }

        // 2. 顯示對手資訊
        if (data.white && data.black) {
            const oppName = playerColor === 'w' ? data.black.name : data.white.name;
            document.getElementById('opponent-info').innerText = `VS: ${oppName}`;
        }
    });

    // 監聽對手相機 (Ghost)
    const opponentColor = playerColor === 'w' ? 'b' : 'w';
    onValue(ref(db, `games/${gameId}/${opponentColor}/camera`), (snap) => {
        const pos = snap.val();
        if(pos) Visuals.updateOpponentGhost(pos);
    });
}

// 相機位置上傳
function handleCameraUpdate(pos) {
    if(!isOnline || !gameId) return;
    update(ref(db, `games/${gameId}/${playerColor}/camera`), {
        x: pos.x, y: pos.y, z: pos.z
    });
}

function updateRoomUI(inGame) {
    document.getElementById('lobby-buttons').style.display = inGame ? 'none' : 'block';
    document.getElementById('btn-leave').style.display = inGame ? 'block' : 'none';
    document.getElementById('room-display').innerHTML = inGame 
        ? `房間: <span style="color:#00e5ff">${gameId}</span>` 
        : "狀態: 閒置中";
}

function updateStatusUI() {
    const turn = game.turn() === 'w' ? "白方回合" : "黑方回合";
    document.getElementById('turn-txt').innerText = turn;
    document.getElementById('turn-txt').style.color = game.turn() === 'w' ? "#fff" : "#ff0055";
}

function checkAndCreateUserProfile(user) {
    // 簡單建立用戶資料
    const userRef = ref(db, 'users/' + user.uid);
    get(userRef).then(snap => {
        if(!snap.exists()) {
            set(userRef, { name: "Player" + user.uid.substring(0,4), elo: 1000 });
        }
    });
}

function leaveRoom() {
    if(confirm("確定退出?")) {
        gameId = null; isOnline = false;
        game.reset();
        Visuals.syncBoardVisuals(game);
        updateRoomUI(false);
        off(ref(db)); // 移除監聽
    }
}

function handleLogin() { /* ... 登入邏輯同前，略以節省篇幅 ... */ }
function handleLogout() { signOut(auth); window.location.reload(); }
function makeRandomAI() {
    const moves = game.moves();
    if(moves.length === 0) return;
    const m = moves[Math.floor(Math.random() * moves.length)];
    game.move(m);
    Visuals.animateMove(game.history({verbose:true}).pop(), () => {
        Visuals.syncBoardVisuals(game);
        updateStatusUI();
        isProcessing = false;
    });
}
