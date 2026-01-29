import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as Visuals from './visuals.js';
import { Chess4P } from './chess_4p_rules.js';

// 請確認這裡是你自己的 Config
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

let app, db, auth, currentUser, gameId, game, game4p;
let currentGameMode = '2p';
let selectedSquare = null;
let isGuestLoginIntent = false;

export function initGame() {
    console.log("🚀 System Launching...");
    setupUIListeners(); // 先綁按鈕，確保有點擊反應

    // 初始化引擎
    if(window.Chess) game = new window.Chess();
    game4p = new Chess4P();

    // 啟動 3D
    try {
        Visuals.init3D(null, handleSquareClick);
        Visuals.setLoginMode(true);
    } catch(e) { console.error("3D Fail", e); }

    // 連線 Firebase
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, (user) => {
            const loading = document.getElementById('loading');
            if(loading) loading.style.display = 'none';

            if (user) {
                // 如果是自動登入的訪客 -> 踢出
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
                // 重置按鈕
                const btn = document.getElementById('guest-btn');
                if(btn) { btn.innerText="訪客登入"; btn.disabled=false; }
            }
        });
    } catch(e) { alert("Firebase Config Error: " + e.message); }
    
    setTimeout(() => { if(game) Visuals.syncBoardVisuals(game); }, 500);
}

function setupUIListeners() {
    const click = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
    
    click('btn-create', createRoom);
    click('btn-join', joinRoom);
    click('btn-leave', leaveRoom);
    click('auth-action-btn', handleLogin);
    click('btn-logout', () => signOut(auth));
    
    // 訪客按鈕
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
        if(e.code.includes('user-not-found')) {
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
            const seed = d.avatarSeed || d.name;
            document.getElementById('hud-avatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
            document.getElementById('my-avatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
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

// 遊戲邏輯區
function createRoom() {
    gameId = Math.floor(Math.random()*9000+1000).toString();
    set(ref(db, 'games/'+gameId), {
        fen: game.fen(), turn: 'w',
        white: currentUser.uid, status: 'waiting'
    }).then(() => {
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
    });
}

function sendMove(move) {
    if(isOnline) {
        update(ref(db, 'games/'+gameId), { fen: game.fen(), turn: game.turn() });
    }
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
        game4p = new Chess4P();
        Visuals.syncBoardVisuals(game4p, true);
        document.getElementById('room-display').innerText = "4人模式 (預覽)";
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

// 觸發上傳
export function triggerAvatarUpload() { document.getElementById('avatar-upload').click(); }
