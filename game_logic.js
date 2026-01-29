import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as Visuals from './visuals.js';

// ⚠️⚠️⚠️ 記得填入你的 Firebase Config ⚠️⚠️⚠️
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

// --- 四人棋核心 (內嵌) ---
class Chess4P {
    constructor() {
        this.board = []; 
        this.colors = ['red', 'blue', 'yellow', 'green']; 
        this.turnIndex = 0; 
        this.initBoard();
    }
    initBoard() {
        for(let r=0; r<14; r++) this.board[r] = new Array(14).fill(null);
        const dead = [{r:[0,3], c:[0,3]}, {r:[0,3], c:[11,14]}, {r:[11,14], c:[0,3]}, {r:[11,14], c:[11,14]}];
        for(let z of dead) for(let r=z.r[0]; r<z.r[1]; r++) for(let c=z.c[0]; c<z.c[1]; c++) this.board[r][c] = 'X';
        this.setupPieces();
    }
    setupPieces() {
        const p = ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r']; 
        this.place('red', 13, 12, false, p, 'row');
        this.place('blue', 0, 1, false, p, 'col');
        this.place('yellow', 0, 1, true, p, 'row');
        this.place('green', 13, 12, true, p, 'col');
    }
    place(col, back, pawn, rev, list, mode) {
        const pcs = rev ? [...list].reverse() : list;
        for(let i=0; i<8; i++) {
            let rB = mode==='row'? back : 3+i, cB = mode==='row'? 3+i : back;
            let rP = mode==='row'? pawn : 3+i, cP = mode==='row'? 3+i : pawn;
            this.board[rB][cB] = { type: pcs[i], color: col };
            this.board[rP][cP] = { type: 'p', color: col };
        }
    }
    turn() { return this.colors[this.turnIndex]; }
    move(from, to) {
        const piece = this.board[from.r][from.c];
        const target = this.board[to.r][to.c];
        if (!piece || piece.color !== this.turn() || target === 'X' || (target && target.color === piece.color)) return null;
        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = null;
        this.turnIndex = (this.turnIndex + 1) % 4;
        return { from, to, color: piece.color };
    }
    getBoard() { return this.board; }
}

let app, db, auth, currentUser, gameId, game, game4p;
let currentGameMode = '2p';
let selectedSquare = null;
let isGuestLoginIntent = false;
let userSettings = { pieceStyle: 'neon', boardStyle: 'neon' };
let lastCameraUpdate = 0;

export function initGame() {
    console.log("🚀 Init...");
    setupUIListeners();

    if(window.Chess) game = new window.Chess();
    game4p = new Chess4P();

    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, (user) => {
            const loading = document.getElementById('loading');
            if(loading) loading.style.display = 'none';

            if (user) {
                if (user.isAnonymous && !isGuestLoginIntent) {
                    signOut(auth); return;
                }
                currentUser = user;
                document.getElementById('auth-modal').style.display = 'none';
                document.getElementById('ui').style.display = 'block';
                // ✨ 修正順序：登入成功後才初始化 3D ✨
                if(!Visuals.isInitialized()) {
                    Visuals.init3D(null, handleSquareClick, handleCameraUpdate);
                }
                Visuals.setLoginMode(false);
                checkUserProfile(user);
            } else {
                currentUser = null;
                document.getElementById('auth-modal').style.display = 'flex';
                document.getElementById('ui').style.display = 'none';
                // 未登入時也啟動 3D 讓他轉
                if(!Visuals.isInitialized()) {
                    Visuals.init3D(null, handleSquareClick, handleCameraUpdate);
                }
                Visuals.setLoginMode(true);
                const btn = document.getElementById('guest-btn');
                if(btn) { btn.innerText="訪客登入"; btn.disabled=false; }
            }
        });
    } catch(e) { alert("Firebase Error: " + e.message); }
    
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
            const seed = d.avatarSeed || d.name;
            document.getElementById('hud-avatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
            document.getElementById('my-avatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
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
        } else alert("無效房間");
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
        if(d[opColor] && d[opColor].camera) Visuals.updateOpponentGhost(d[opColor].camera);
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
