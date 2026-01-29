import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as Visuals from './visuals.js';
// 匯入 4P 規則
import { Chess4P } from './chess_4p_rules.js';

// ⚠️⚠️⚠️ 這裡務必換成你自己的 Firebase Config ⚠️⚠️⚠️
const firebaseConfig = {
    apiKey: "AIzaSyCxPppnUG864v3E2j1OzykzFmhLpsEJCSE",
    authDomain: "chess-1885a.firebaseapp.com",
    databaseURL: "https://chess-1885a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chess-1885a",
    storageBucket: "chess-1885a.firebasestorage.app",
    messagingSenderId: "824383572856",
    appId: "1:824383572856:web:7c663d6bf0f970f6acd68d",
    measurementId: "G-0EMJ4W2KLS"
};

let app, db, auth;
let currentUser = null;
let gameId = null;
let playerColor = 'w';
let isOnline = false;
let game = null;
let game4p = null;
let currentGameMode = '2p';
let selectedSquare = null;
let isGuestLoginIntent = false;
let userSettings = { avatarSeed: "Bot", pieceStyle: "neon", boardStyle: "neon" };
let lastCameraUpdate = 0;

// 自檢系統更新函式
function updateStatus(id, msg, type) {
    const el = document.getElementById(id);
    if(el) {
        el.innerText = msg;
        el.className = `status-item ${type}`;
    }
}

export function initGame() {
    console.log("🚀 InitGame...");
    setupUIListeners();

    // 1. 初始化引擎
    if(window.Chess) {
        game = new window.Chess();
    } else {
        console.error("Chess.js missing");
    }
    
    // 初始化 4P 引擎 (即便 import 失敗也能捕捉)
    try {
        game4p = new Chess4P();
    } catch(e) {
        console.warn("4P Engine Init Failed:", e);
    }

    // 2. 啟動 3D
    try {
        Visuals.init3D(null, handleSquareClick, handleCameraUpdate);
        Visuals.setLoginMode(true);
        updateStatus('status-3d', "✅ 3D 引擎就緒", "ok");
    } catch(e) {
        console.error("3D Error", e);
        updateStatus('status-3d', "❌ 3D 啟動失敗", "error");
    }

    // 3. 連線 Firebase
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        updateStatus('status-firebase', "✅ Firebase 連線成功", "ok");
        
        onAuthStateChanged(auth, (user) => {
            document.getElementById('loading').style.display = 'none';
            if (user) {
                if (user.isAnonymous && !isGuestLoginIntent) {
                    signOut(auth); return;
                }
                currentUser = user;
                document.getElementById('auth-modal').style.display = 'none';
                document.getElementById('ui').style.display = 'block';
                Visuals.setLoginMode(false);
                checkUserProfile(user);
            } else {
                currentUser = null;
                document.getElementById('auth-modal').style.display = 'flex';
                document.getElementById('ui').style.display = 'none';
                Visuals.setLoginMode(true);
                const btn = document.getElementById('guest-btn');
                if(btn) { btn.innerText="訪客登入"; btn.disabled=false; }
            }
        });
    } catch(e) { 
        updateStatus('status-firebase', "❌ Firebase 錯誤", "error");
        alert("Firebase 連線失敗: " + e.message); 
    }
    
    setTimeout(() => { if(game) Visuals.syncBoardVisuals(game); }, 500);
}

function setupUIListeners() {
    const click = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
    
    click('btn-create', createRoom);
    click('btn-join', joinRoom);
    click('btn-leave', leaveRoom);
    click('auth-action-btn', handleLogin);
    click('btn-logout', () => signOut(auth));
    
    click('guest-btn', () => {
        const btn = document.getElementById('guest-btn');
        btn.innerText = "連線中...";
        btn.disabled = true;
        isGuestLoginIntent = true;
        signInAnonymously(auth).catch(e => {
            alert("登入失敗: " + e.message);
            btn.innerText = "訪客登入";
            btn.disabled = false;
            isGuestLoginIntent = false;
        });
    });

    click('btn-custom', () => document.getElementById('custom-panel').classList.add('active'));
    click('btn-save-custom', saveSettings);
    click('btn-random-avatar', () => {
        const seed = Math.random().toString(36).substring(7);
        document.getElementById('avatar-seed').value = seed;
        document.getElementById('my-avatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
    });
    
    const seedInput = document.getElementById('avatar-seed');
    if(seedInput) seedInput.oninput = (e) => document.getElementById('my-avatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${e.target.value}`;
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(!email || !pass) return alert("請輸入帳密");
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) {
        if(e.code.includes('user-not-found') || e.code.includes('invalid-credential')) {
             try { await createUserWithEmailAndPassword(auth, email, pass); }
             catch(err) { alert(err.message); }
        } else {
            alert(e.message);
        }
    }
}

function checkUserProfile(user) {
    const userRef = ref(db, 'users/' + user.uid);
    get(userRef).then(snap => {
        if(!snap.exists()) {
            const name = user.isAnonymous ? "訪客" : user.email.split('@')[0];
            set(userRef, { name: name, elo: 0 });
        } else {
            const d = snap.val();
            document.getElementById('user-name').innerText = d.name;
            document.getElementById('user-elo').innerText = d.elo;
            const seed = d.avatarSeed || d.name;
            const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
            document.getElementById('hud-avatar').src = url;
            document.getElementById('my-avatar').src = url;
            if(d.pieceStyle) Visuals.updateTheme({pieceStyle: d.pieceStyle});
            if(d.boardStyle) Visuals.updateTheme({boardStyle: d.boardStyle});
        }
    });
}

function saveSettings() {
    if(!currentUser) return;
    const name = document.getElementById('edit-name').value;
    const seed = document.getElementById('avatar-seed').value;
    const updates = {};
    if(name) updates.name = name;
    if(seed) updates.avatarSeed = seed;
    update(ref(db, 'users/'+currentUser.uid), updates).then(() => {
        alert("已保存");
        checkUserProfile(currentUser);
        window.closeAllMenus();
    });
}

// 遊戲邏輯
function createRoom() {
    gameId = Math.floor(Math.random()*9000+1000).toString();
    set(ref(db, 'games/'+gameId), { fen: game.fen(), turn: 'w', white: currentUser.uid, status: 'waiting' })
    .then(() => {
        playerColor = 'w'; isOnline = true;
        setupGameListener();
        document.getElementById('room-display').innerText = "房間: " + gameId;
        toggleLobby(true);
        Visuals.moveCamera({x:0, y:60, z:100});
    });
}

function joinRoom() {
    const id = prompt("輸入房間號:");
    if(!id) return;
    get(ref(db, 'games/'+id)).then(snap => {
        if(snap.exists() && snap.val().status === 'waiting') {
            gameId = id;
            update(ref(db, 'games/'+id), { black: currentUser.uid, status: 'playing' });
            playerColor = 'b'; isOnline = true;
            setupGameListener();
            document.getElementById('room-display').innerText = "房間: " + gameId;
            toggleLobby(true);
            Visuals.moveCamera({x:0, y:60, z:-100});
        } else alert("房間無效");
    });
}

function setupGameListener() {
    onValue(ref(db, 'games/'+gameId), snap => {
        const d = snap.val();
        if(!d) return;
        if(d.fen !== game.fen()) {
            game.load(d.fen);
            Visuals.syncBoardVisuals(game);
        }
        const opColor = playerColor==='w'?'b':'w';
        if(d[opColor] && d[opColor].camera) {
             Visuals.updateOpponentGhost(d[opColor].camera);
        }
    });
}

function handleCameraUpdate(pos) {
    if(isOnline && gameId) {
        const now = Date.now();
        if(now - lastCameraUpdate > 200) {
            update(ref(db, `games/${gameId}/${playerColor}/camera`), pos);
            lastCameraUpdate = now;
        }
    }
}

function sendMove(move) {
    if(isOnline) update(ref(db, 'games/'+gameId), { fen: game.fen(), turn: game.turn() });
}

function leaveRoom() {
    gameId = null; isOnline = false;
    game.reset(); Visuals.syncBoardVisuals(game);
    Visuals.moveCamera({x:0, y:60, z:100});
    toggleLobby(false);
}

function toggleLobby(inGame) {
    document.getElementById('lobby-buttons').style.display = inGame ? 'none' : 'block';
    document.getElementById('btn-leave').style.display = inGame ? 'block' : 'none';
}

export function switchGameMode(mode) {
    currentGameMode = mode;
    Visuals.setGameMode(mode);
    if(mode === '4p') {
        if(!game4p) game4p = new Chess4P();
        Visuals.syncBoardVisuals(game4p, true);
        document.getElementById('room-display').innerText = "4人模式 (單機)";
    } else {
        game.reset();
        Visuals.syncBoardVisuals(game);
        document.getElementById('room-display').innerText = "狀態：閒置中";
    }
}

function handleSquareClick(sq) {
    if(currentGameMode === '4p') {
        if(!selectedSquare) selectedSquare = sq;
        else {
            const res = game4p.move(selectedSquare, sq);
            if(res) Visuals.animateMove({from: res.from, to: res.to, color: res.color}, () => Visuals.syncBoardVisuals(game4p, true));
            selectedSquare = null;
        }
        return;
    }
    // 2P
    if(isOnline && game.turn() !== playerColor) return;
    if(!selectedSquare) {
        const p = game.get(sq);
        if(p && p.color === game.turn()) {
            selectedSquare = sq;
            Visuals.highlightSquare(sq, game.moves({square:sq, verbose:true}));
        }
    } else {
        const move = game.move({from: selectedSquare, to: sq, promotion: 'q'});
        if(move) {
            Visuals.animateMove(move, () => {
                Visuals.syncBoardVisuals(game);
                sendMove(move);
                if(!isOnline && game.turn() === 'b') setTimeout(makeRandomAI, 500);
            });
        }
        selectedSquare = null;
        Visuals.clearHighlights();
    }
}

function makeRandomAI() {
    const ms = game.moves();
    if(ms.length) {
        game.move(ms[Math.floor(Math.random()*ms.length)]);
        Visuals.animateMove(game.history({verbose:true}).pop(), () => Visuals.syncBoardVisuals(game));
    }
}

export function triggerAvatarUpload() { document.getElementById('avatar-upload').click(); }
export function previewStyle(type, value) {
    Visuals.updateTheme({ [type === 'piece' ? 'pieceStyle' : 'boardStyle']: value });
}
