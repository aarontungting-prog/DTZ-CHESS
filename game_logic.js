import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as Visuals from './visuals.js';

// Config
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

// 4P Rules (Simplified)
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

export function initGame() {
    console.log("🚀 Init...");
    setupUI();

    if(window.Chess) game = new window.Chess();
    game4p = new Chess4P();

    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, (user) => {
            document.getElementById('loading').style.display = 'none';
            if (user) {
                if (user.isAnonymous && !isGuestLoginIntent) { signOut(auth); return; }
                currentUser = user;
                document.getElementById('auth-modal').style.display = 'none';
                document.getElementById('ui').style.display = 'block';
                Visuals.init3D(document.body, handleSquareClick); // 登入後才啟動 3D
                setTimeout(() => { if(game) Visuals.syncBoardVisuals(game); }, 500);
            } else {
                currentUser = null;
                document.getElementById('auth-modal').style.display = 'flex';
                document.getElementById('ui').style.display = 'none';
                isGuestLoginIntent = false;
                const btn = document.getElementById('guest-btn');
                if(btn) { btn.innerText="訪客登入"; btn.disabled=false; }
            }
        });
    } catch(e) { alert("Error: " + e.message); }
}

function setupUI() {
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
            alert("Login Failed: " + e.message);
            btn.innerText = "訪客登入";
            btn.disabled = false;
            isGuestLoginIntent = false;
        });
    });
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(!email || !pass) return;
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch(e) { try { await createUserWithEmailAndPassword(auth, email, pass); } catch(err) { alert(err.message); } }
}

function createRoom() {
    gameId = Math.floor(Math.random()*9000+1000).toString();
    set(ref(db, 'games/'+gameId), { fen: game.fen(), turn: 'w', white: currentUser.uid, status: 'waiting' })
    .then(() => {
        playerColor = 'w'; isOnline = true;
        setupGameListener();
        document.getElementById('room-display').innerText = "房間: " + gameId;
        toggleLobby(true);
    });
}

function joinRoom() {
    const id = prompt("房間號:");
    if(!id) return;
    get(ref(db, 'games/'+id)).then(snap => {
        if(snap.exists() && snap.val().status === 'waiting') {
            gameId = id;
            update(ref(db, 'games/'+id), { black: currentUser.uid, status: 'playing' });
            playerColor = 'b'; isOnline = true;
            setupGameListener();
            document.getElementById('room-display').innerText = "房間: " + gameId;
            toggleLobby(true);
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
    });
}

function sendMove(move) {
    if(isOnline) update(ref(db, 'games/'+gameId), { fen: game.fen(), turn: game.turn() });
}

function leaveRoom() {
    gameId = null; isOnline = false;
    game.reset(); Visuals.syncBoardVisuals(game);
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
    } else {
        game.reset();
        Visuals.syncBoardVisuals(game);
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

// ✨ 補回你原本缺少的 export ✨
export function triggerAvatarUpload() {} 
export function previewStyle() {}
