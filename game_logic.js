import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as Visuals from './visuals.js';
import { Chess4P } from './chess_4p_rules.js';

// 請確認這組 Config 是你自己的，如果是用我的測試用 Config，可能會因為多人使用而受限
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
let isProcessing = false;
let game = null;
let game4p = null;
let currentGameMode = '2p';
let selectedSquare = null;
let userSettings = { avatarSeed: "Bot", avatarImage: null, name: "Commander", pieceStyle: "neon", boardStyle: "neon" };
let lastCursorUpdate = 0;
let lastCameraUpdate = 0;

export function initGame() {
    console.log("Game Logic Initializing...");
    
    // 1. 初始化遊戲引擎
    if (window.Chess) { game = new window.Chess(); } 
    game4p = new Chess4P();

    // 2. 初始化 Firebase
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        console.log("Firebase initialized successfully.");
    } catch(e) { 
        console.error("Firebase Init Error:", e);
        alert("Firebase 初始化失敗，請檢查 Console");
    }

    // 3. 綁定按鈕 (不管 3D 有沒有載入，先綁定按鈕)
    setupUIListeners();

    // 4. 初始化 3D
    Visuals.init3D(null, handleSquareClick, handleCameraUpdate);
    Visuals.setLoginMode(true);

    // 5. 監聽登入狀態
    onAuthStateChanged(auth, (user) => {
        const loadingEl = document.getElementById('loading');
        if(loadingEl) loadingEl.style.display = 'none';
        
        if (user) {
            console.log("登入成功，使用者 ID:", user.uid);
            currentUser = user;
            
            // 切換介面
            document.getElementById('auth-modal').style.display = 'none';
            document.getElementById('ui').style.display = 'block';
            
            // 停止旋轉，載入資料
            Visuals.setLoginMode(false);
            checkAndCreateUserProfile(user);
        } else {
            console.log("未登入 / 已登出");
            currentUser = null;
            
            // 顯示登入框
            document.getElementById('auth-modal').style.display = 'flex';
            document.getElementById('ui').style.display = 'none';
            
            // 開始旋轉
            Visuals.setLoginMode(true);
            resetAuthForm();
        }
    });

    setTimeout(() => { 
        if(game) Visuals.syncBoardVisuals(game); 
    }, 500);
}

function setupUIListeners() {
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if(el) el.onclick = fn;
        else console.warn("按鈕未找到:", id);
    };

    bind('btn-create', createRoom);
    bind('btn-join', joinRoom);
    bind('btn-leave', leaveRoom);
    bind('auth-action-btn', handleLogin);
    
    // --- 訪客登入按鈕 ---
    const guestBtn = document.getElementById('guest-btn');
    if(guestBtn) {
        guestBtn.onclick = () => {
            console.log("點擊訪客登入...");
            guestBtn.innerText = "連線中...";
            
            signInAnonymously(auth)
                .then(() => {
                    console.log("訪客登入 API 呼叫成功");
                })
                .catch((error) => {
                    console.error("訪客登入失敗:", error);
                    guestBtn.innerText = "訪客登入"; // 重置文字
                    
                    // 錯誤處理彈窗
                    let msg = "登入失敗: " + error.code;
                    if(error.code === 'auth/operation-not-allowed') {
                        msg = "錯誤：請到 Firebase Console 開啟「匿名登入 (Anonymous)」功能！";
                    } else if (error.code === 'auth/network-request-failed') {
                        msg = "網路錯誤：請檢查您的網路連線，或防火牆設定。";
                    }
                    alert(msg);
                });
        };
    }

    bind('btn-logout', handleLogout); 
    bind('forgot-pw', handleForgotPassword);
    
    bind('btn-custom', () => {
        document.getElementById('custom-panel').classList.add('active');
        const guestControls = document.getElementById('guest-avatar-controls');
        if(currentUser && currentUser.isAnonymous) guestControls.style.display = 'block';
        else guestControls.style.display = 'none';
    });

    bind('btn-close-custom', window.closeAllMenus);
    bind('btn-save-custom', saveUserSettings);
    bind('btn-random-avatar', randomizeAvatar);
    
    document.getElementById('mode-2p').onclick = () => window.switchMode('2p');
    document.getElementById('mode-4p').onclick = () => window.switchMode('4p');

    const fileInput = document.getElementById('avatar-upload');
    if(fileInput) fileInput.addEventListener('change', handleAvatarFileSelect);
    
    document.getElementById('avatar-seed').oninput = (e) => updateAvatarPreview(e.target.value, null);

    const pieceGrid = document.getElementById('piece-skin-grid');
    if(pieceGrid) {
        pieceGrid.querySelectorAll('.skin-item:not(.locked)').forEach(item => {
            item.onclick = () => window.previewSkin('piece', item.dataset.val, item);
        });
    }
    const boardGrid = document.getElementById('board-skin-grid');
    if(boardGrid) {
        boardGrid.querySelectorAll('.skin-item:not(.locked)').forEach(item => {
            item.onclick = () => window.previewSkin('board', item.dataset.val, item);
        });
    }
}

// 一般登入邏輯
async function handleLogin() {
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const errorMsg = document.getElementById('auth-error');
    
    if(!emailEl || !passEl) return;
    const email = emailEl.value.trim();
    const password = passEl.value.trim();
    
    if(!email || !password) { 
        errorMsg.innerText = "請輸入帳號密碼"; return; 
    }

    if (isRegistering) {
        const nickname = document.getElementById('nickname').value.trim();
        if(!nickname) { errorMsg.innerText = "請輸入您的暱稱"; return; }
        errorMsg.innerText = "註冊中...";
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            // 註冊成功會自動觸發 onAuthStateChanged
        } catch (error) { handleAuthError(error); }
        return;
    }

    errorMsg.innerText = "登入中...";
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            // 切換為註冊模式
            isRegistering = true;
            document.getElementById('nickname-container').style.display = 'block'; 
            document.getElementById('auth-action-btn').innerText = "確認註冊"; 
            errorMsg.innerText = "初次見面？請輸入暱稱來註冊。";
            errorMsg.style.color = "#00ff00"; 
        } else {
            handleAuthError(error);
        }
    }
}

function handleAuthError(error) {
    const errorMsg = document.getElementById('auth-error');
    errorMsg.style.color = "#ff0055";
    let msg = error.message;
    if(error.code === 'auth/operation-not-allowed') msg = "請到 Firebase 開啟 Email 登入功能！";
    if(error.code === 'auth/email-already-in-use') msg = "此信箱已被註冊";
    if(error.code === 'auth/weak-password') msg = "密碼太弱 (至少6位)";
    errorMsg.innerText = msg;
    console.error("Auth Error:", error);
}

// ... (以下為標準遊戲邏輯，保持不變) ...

export function switchGameMode(mode) {
    currentGameMode = mode;
    Visuals.setGameMode(mode);

    if (mode === '4p') {
        game4p = new Chess4P(); 
        Visuals.syncBoardVisuals(game4p, true); 
        updateStatusHUD();
        document.getElementById('btn-create').style.display = 'none';
        document.getElementById('btn-join').style.display = 'none';
        document.getElementById('room-display').innerText = "4人模式 (單機預覽)";
        document.getElementById('room-display').style.color = "#ffff00";
    } else {
        game.reset();
        Visuals.syncBoardVisuals(game, false);
        updateStatusHUD();
        document.getElementById('btn-create').style.display = 'block';
        document.getElementById('btn-join').style.display = 'block';
        document.getElementById('room-display').innerText = "狀態：閒置中";
        document.getElementById('room-display').style.color = "#fff";
    }
}

function handleSquareClick(sq) {
    if(isProcessing) return;

    if (currentGameMode === '4p') {
        if (!selectedSquare) {
            const p = game4p.board[sq.r][sq.c];
            if (p && p.color === game4p.turn()) selectedSquare = sq;
        } else {
            const result = game4p.move(selectedSquare, sq);
            if (result) {
                Visuals.animateMove({
                    from: {r: result.from.r, c: result.from.c},
                    to: {r: result.to.r, c: result.to.c},
                    color: result.color
                }, () => {
                    Visuals.syncBoardVisuals(game4p, true);
                    updateStatusHUD();
                });
            }
            selectedSquare = null;
        }
        return;
    }

    if(isOnline && game.turn() !== playerColor) return;
    const p = game.get(sq);
    
    if(!selectedSquare) {
        if(p && p.color === game.turn()) {
            if(!isOnline || (isOnline && p.color === playerColor)) {
                selectedSquare = sq;
                const validMoves = game.moves({square: sq, verbose: true});
                Visuals.highlightSquare(sq, validMoves);
            }
        }
    } else {
        if(p && p.color === game.turn()) {
            selectedSquare = sq;
            const validMoves = game.moves({square: sq, verbose: true});
            Visuals.highlightSquare(sq, validMoves);
            return;
        }
        const move = game.move({from: selectedSquare, to: sq, promotion: 'q'});
        if(move) {
            isProcessing = true;
            Visuals.animateMove(move, () => {
                Visuals.syncBoardVisuals(game, false);
                updateStatusHUD();
                if(!isOnline) {
                    if(game.turn() === 'b') setTimeout(makeRandomAI, 500);
                    else isProcessing = false;
                }
            });
            if(isOnline) sendMove(move);
            selectedSquare = null;
        } else {
            selectedSquare = null;
            Visuals.clearHighlights();
        }
    }
}

function updateStatusHUD(){
    const t = document.getElementById('turn-txt');
    if (currentGameMode === '4p') {
        const turn = game4p.turn(); 
        const names = {'red': '紅方', 'blue': '藍方', 'yellow': '黃方', 'green': '綠方'};
        const colors = {'red': '#ff3333', 'blue': '#3333ff', 'yellow': '#ffff33', 'green': '#33ff33'};
        t.innerText = `${names[turn]} 回合`;
        t.style.color = colors[turn];
        return;
    }
    const turn = game.turn();
    if(isOnline){
        t.innerText = turn==='w' ? "白方回合" : "黑方回合";
        t.style.color = turn==='w' ? "#00e5ff" : "#ff0055";
    } else {
        t.innerText = turn==='w' ? "藍方回合" : "電腦回合";
        t.style.color = turn==='w' ? "#00e5ff" : "#ff0055";
    }
}

function handleCameraUpdate(camData) {
    if (!isOnline || !gameId || !currentUser) return;
    const now = Date.now();
    if (now - lastCameraUpdate > 200) {
        update(ref(db, `games/${gameId}/${playerColor}/camera`), {
            x: camData.x, y: camData.y, z: camData.z
        });
        lastCameraUpdate = now;
    }
}

function setupGameListeners() {
    onValue(ref(db, 'games/' + gameId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.status === 'playing' && !data.winner && document.getElementById('turn-txt').innerText.includes("等待")) {
            if (data.black) {
                const oppName = playerColor === 'w' ? data.black.name : data.white.name;
                document.getElementById('opponent-info').innerText = `VS: ${oppName}`;
                document.getElementById('room-display').innerText = `房間號：${gameId} (對戰中)`;
                if(playerColor === 'w') alert(`對手 ${data.black.name} 已加入！`);
                updateStatusHUD();
            }
        }
        if (data.fen !== game.fen()) {
            game.load(data.fen);
            Visuals.syncBoardVisuals(game);
            updateStatusHUD();
            if (game.turn() === playerColor) isProcessing = false;
        }
        if (data.winner) handleGameOver(data.winner);
    });

    const opponentColor = playerColor === 'w' ? 'b' : 'w';
    onValue(ref(db, `games/${gameId}/${opponentColor}/camera`), (snapshot) => {
        const pos = snapshot.val();
        if (pos) Visuals.updateOpponentGhost(pos);
    });
}

function handleLogout() {
    if (!currentUser) return;
    if (currentUser.isAnonymous) {
        const confirmLogout = confirm("訪客登出後，您的戰績將會被刪除。確定要登出嗎？");
        if (!confirmLogout) return;
        remove(ref(db, 'users/' + currentUser.uid))
            .then(() => signOut(auth))
            .catch(() => signOut(auth));
    } else {
        signOut(auth);
    }
}

function leaveRoom() {
    if (!gameId) return;
    const confirmLeave = confirm("確定要退出房間嗎？");
    if (!confirmLeave) return;

    off(ref(db, 'games/' + gameId));
    off(ref(db, `games/${gameId}/w/camera`));
    off(ref(db, `games/${gameId}/b/camera`));

    gameId = null;
    isOnline = false;
    game.reset();
    Visuals.syncBoardVisuals(game);
    Visuals.moveCamera({x: 0, y: 60, z: 100});
    Visuals.updateOpponentGhost(null);
    toggleLobbyUI(false);
}

function toggleLobbyUI(isPlaying) {
    const lobbyBtns = document.getElementById('lobby-buttons');
    const leaveBtn = document.getElementById('btn-leave');
    
    if (isPlaying) {
        lobbyBtns.style.display = 'none';
        leaveBtn.style.display = 'block';
    } else {
        lobbyBtns.style.display = 'block';
        leaveBtn.style.display = 'none';
        document.getElementById('room-display').innerText = '狀態：閒置中';
        document.getElementById('room-display').style.color = '#fff';
        document.getElementById('opponent-info').innerText = '對手: ---';
    }
}

function createRoom() {
    if (!currentUser) { alert("請先登入"); return; }
    game.reset(); 
    Visuals.syncBoardVisuals(game); 
    
    gameId = Math.floor(1000 + Math.random() * 9000).toString();
    console.log("正在創建房間:", gameId);
    
    document.getElementById('room-display').innerHTML = `房間號碼：<span style="color:#00e5ff; font-size:16px;">${gameId}</span><br>等待對手加入...`;
    document.getElementById('opponent-info').innerText = "等待對手...";
    toggleLobbyUI(true);
    
    get(ref(db, 'users/' + currentUser.uid)).then(snap => {
        const userData = snap.val() || { name: "Player", elo: 0 };
        
        set(ref(db, 'games/' + gameId), {
            fen: game.fen(), 
            turn: 'w',
            white: { uid: currentUser.uid, elo: userData.elo, name: userData.name },
            black: null, 
            status: 'waiting'
        }).then(() => {
            playerColor = 'w'; 
            isOnline = true;
            setupGameListeners();
            Visuals.moveCamera({x: 0, y: 60, z: 100}); 
            alert(`房間已建立！號碼：${gameId}`);
        }).catch(err => {
            console.error(err);
            alert("網路錯誤，無法建立房間");
            leaveRoom();
        });
    });
}

function joinRoom() {
    const id = prompt('請輸入房間號碼:');
    if(!id) return;
    
    get(ref(db, 'games/' + id)).then((snapshot) => {
        if (snapshot.exists()) {
            const gameData = snapshot.val();
            if(gameData.status !== 'waiting') { alert("房間已滿或遊戲已結束"); return; }
            
            gameId = id; 
            game.reset(); 
            Visuals.syncBoardVisuals(game);
            toggleLobbyUI(true);

            const myInfo = { 
                uid: currentUser.uid, 
                elo: userSettings.elo || 0, 
                name: userSettings.name || "Player" 
            };

            update(ref(db, 'games/' + gameId), {
                black: myInfo,
                status: 'playing'
            }).then(() => {
                playerColor = 'b'; isOnline = true;
                setupGameListeners();
                document.getElementById('room-display').innerText = `房間號：${gameId} (對戰中)`;
                document.getElementById('opponent-info').innerText = `VS: ${gameData.white.name}`;
                Visuals.moveCamera({x: 0, y: 60, z: -100}); 
                game.load(gameData.fen);
                Visuals.syncBoardVisuals(game);
                updateStatusHUD();
            });
        } else { alert("房間不存在"); }
    });
}

function handleMouseMove(point) {
    if (!isOnline || !gameId || !currentUser) return;
    const now = Date.now();
    if (now - lastCursorUpdate > 150) {
        update(ref(db, `games/${gameId}/${playerColor}/cursor`), {
            x: point.x, y: point.y, z: point.z
        });
        lastCursorUpdate = now;
    }
}

export function previewStyle(type, value) {
    const tempSettings = {};
    if (type === 'piece') tempSettings.pieceStyle = value;
    if (type === 'board') tempSettings.boardStyle = value;
    Visuals.updateTheme(tempSettings);
}

export function triggerAvatarUpload() {
    if (currentUser && !currentUser.isAnonymous) {
        document.getElementById('avatar-upload').click();
    } else {
        alert("訪客請使用隨機代碼，或註冊以解鎖上傳功能。");
    }
}

function handleAvatarFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { alert("圖片請小於 1MB"); return; }
    const reader = new FileReader();
    reader.onload = function(evt) {
        const base64 = evt.target.result;
        updateAvatarPreview(null, base64);
        userSettings.tempAvatarImage = base64; 
    };
    reader.readAsDataURL(file);
}

function randomizeAvatar() {
    const randomSeed = Math.random().toString(36).substring(7);
    document.getElementById('avatar-seed').value = randomSeed;
    updateAvatarPreview(randomSeed, null);
}

function updateAvatarPreview(seed, base64) {
    const imgEl = document.getElementById('my-avatar');
    if (base64) {
        imgEl.src = base64;
    } else {
        const s = seed || userSettings.avatarSeed;
        imgEl.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${s}`;
    }
}

function saveUserSettings() {
    if (!currentUser) return;
    const newName = document.getElementById('edit-name').value.trim();
    const newSettings = {
        name: newName || userSettings.name,
        pieceStyle: document.getElementById('selected-piece-style').value,
        boardStyle: document.getElementById('selected-board-style').value
    };

    if (currentUser.isAnonymous) {
        newSettings.avatarSeed = document.getElementById('avatar-seed').value;
    } else if (userSettings.tempAvatarImage) {
        newSettings.avatarImage = userSettings.tempAvatarImage;
    }

    update(ref(db, 'users/' + currentUser.uid), newSettings).then(() => {
        alert("設定已保存！");
        userSettings = { ...userSettings, ...newSettings };
        delete userSettings.tempAvatarImage;
        loadUserProfile();
        document.getElementById('custom-panel').classList.remove('active');
    });
}

function checkAndCreateUserProfile(user) {
    const userRef = ref(db, 'users/' + user.uid);
    get(userRef).then((snapshot) => {
        if (!snapshot.exists()) {
            const nickEl = document.getElementById('nickname');
            const inputName = nickEl ? nickEl.value.trim() : "";
            const name = inputName || (user.isAnonymous ? `訪客_${user.uid.substring(0,4)}` : user.email.split('@')[0]);
            
            set(userRef, {
                name: name, email: user.email || "guest", elo: 0, wins: 0, losses: 0
            }).then(loadUserProfile);
        } else {
            loadUserProfile();
        }
    });
}

function loadUserProfile() {
    if (!currentUser) return;
    onValue(ref(db, 'users/' + currentUser.uid), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            userSettings = { ...userSettings, ...data };
            document.getElementById('user-name').innerText = data.name;
            document.getElementById('edit-name').value = data.name;
            document.getElementById('user-elo').innerText = data.elo;
            const seed = data.avatarSeed || data.name;
            const avatarUrl = data.avatarImage ? data.avatarImage : `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
            document.getElementById('hud-avatar').src = avatarUrl;
            document.getElementById('my-avatar').src = avatarUrl;
            if(!data.avatarImage) document.getElementById('avatar-seed').value = seed;
            updateRankBadge(data.elo);
            if(data.pieceStyle) document.getElementById('selected-piece-style').value = data.pieceStyle;
            if(data.boardStyle) document.getElementById('selected-board-style').value = data.boardStyle;
            Visuals.updateTheme(userSettings);
        }
    });
}

function updateRankBadge(elo) {
    const badge = document.getElementById('user-rank');
    badge.className = 'rank-badge';
    if (elo < 200) { badge.innerText = "新手 NOVICE"; badge.classList.add('rank-bronze'); }
    else if (elo < 500) { badge.innerText = "銅牌 BRONZE"; badge.classList.add('rank-bronze'); }
    else if (elo < 1000) { badge.innerText = "銀牌 SILVER"; badge.classList.add('rank-silver'); }
    else if (elo < 1500) { badge.innerText = "金牌 GOLD"; badge.classList.add('rank-gold'); }
    else if (elo < 2000) { badge.innerText = "鑽石 DIAMOND"; badge.classList.add('rank-diamond'); }
    else { badge.innerText = "霓虹宗師"; badge.classList.add('rank-master'); }
}

function resetAuthForm() {
    isRegistering = false;
    document.getElementById('nickname-container').style.display = 'none';
    document.getElementById('auth-action-btn').innerText = "進入世界";
    document.getElementById('auth-error').innerText = "";
    
    const guestBtn = document.getElementById('guest-btn');
    if(guestBtn) {
        guestBtn.innerText = "訪客登入";
        guestBtn.disabled = false;
    }
}

async function handleForgotPassword() {
    const email = document.getElementById('email').value.trim();
    const errorMsg = document.getElementById('auth-error');
    if(!email || !email.includes('@')) {
        errorMsg.innerText = "請先輸入 Email";
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        alert(`密碼重設信已發送至 ${email}`);
    } catch (error) {
        errorMsg.innerText = "發送失敗：" + error.message;
    }
}
