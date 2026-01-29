import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 更新狀態 UI
function updateStatus(id, msg, type) {
    const el = document.getElementById(id);
    if(el) {
        el.innerText = msg;
        el.className = `status-item ${type}`;
    }
}

let scene, camera, renderer, controls, raycaster, mouse;
let tilesMap = {}, piecesMap = {};
let currentMode = '2p';

// 純色材質 (絕對安全)
const MAT = {
    boardBase: new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.5}),
    tileBlack: new THREE.MeshStandardMaterial({color: 0x222222, roughness: 0.5}),
    tileWhite: new THREE.MeshStandardMaterial({color: 0xaaaaaa, roughness: 0.5}),
    // 棋子顏色
    white: new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0x222222}),
    black: new THREE.MeshStandardMaterial({color: 0x333333, emissive: 0x000000}),
    red: new THREE.MeshStandardMaterial({color: 0xff0000, emissive: 0x550000}),
    blue: new THREE.MeshStandardMaterial({color: 0x0000ff, emissive: 0x000055}),
    yellow: new THREE.MeshStandardMaterial({color: 0xffff00, emissive: 0x555500}),
    green: new THREE.MeshStandardMaterial({color: 0x00ff00, emissive: 0x005500}),
    highlight: new THREE.MeshStandardMaterial({color: 0x00ff00, emissive: 0x00ff00, transparent:true, opacity:0.5})
};

// 簡單幾何形狀
const GEO = {
    tile: new THREE.BoxGeometry(1, 0.2, 1),
    pawn: new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16),
    piece: new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16),
    king: new THREE.BoxGeometry(0.5, 1.5, 0.5)
};

export function init3D(container, onClick) {
    try {
        console.log("3D Starting...");
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e); // 深藍色背景 (取代天空)

        // 攝影機調整
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 15, 12); // 拉近一點，讓你看到棋盤

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // 燈光
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // 事件監聽
        window.addEventListener('resize', onResize);
        window.addEventListener('touchstart', (e) => onTouch(e, onClick), {passive:false});
        window.addEventListener('click', (e) => onClickEvent(e, onClick));

        // 建立初始場景
        createBoard2P();
        animate();

        updateStatus('status-3d', "✅ 3D 運作正常", "ok");
        return { scene, setGameMode, syncBoardVisuals, animateMove, highlightSquare, clearHighlights, setLoginMode, updateOpponentGhost: ()=>{} };

    } catch(e) {
        console.error(e);
        updateStatus('status-3d', "❌ 3D 嚴重錯誤", "error");
        throw e;
    }
}

function createBoard2P() {
    clearScene();
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 9), MAT.boardBase);
    base.position.y = -0.25;
    scene.add(base);

    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const sq = String.fromCharCode(97+c) + (8-r);
            const isWhite = (r+c)%2 === 0;
            const tile = new THREE.Mesh(GEO.tile, isWhite ? MAT.tileWhite : MAT.tileBlack);
            tile.position.set(c-3.5, 0, r-3.5);
            tile.userData = { sq: sq };
            scene.add(tile);
            tilesMap[sq] = tile;
        }
    }
    camera.position.set(0, 12, 10);
    controls.target.set(0, 0, 0);
}

function createBoard4P() {
    clearScene();
    const size = 14;
    const offset = size/2 - 0.5;
    
    // 底座
    const base = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 15), MAT.boardBase);
    base.position.y = -0.25;
    scene.add(base);

    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            if((r<3 || r>10) && (c<3 || c>10)) continue; // 挖空角落

            const isWhite = (r+c)%2 === 0;
            const tile = new THREE.Mesh(GEO.tile, isWhite ? MAT.tileWhite : MAT.tileBlack);
            tile.position.set(c-offset, 0, offset-r);
            tile.userData = { sq: {r,c} };
            scene.add(tile);
            tilesMap[`${r},${c}`] = tile;
        }
    }
    camera.position.set(0, 25, 20); // 4人棋要拉遠一點
    controls.target.set(0, 0, 0);
}

function clearScene() {
    for(let k in tilesMap) scene.remove(tilesMap[k]);
    for(let k in piecesMap) scene.remove(piecesMap[k]);
    tilesMap = {}; piecesMap = {};
    // 移除所有 Mesh，保留 Light
    const toRemove = [];
    scene.traverse(o => { if(o.isMesh) toRemove.push(o); });
    toRemove.forEach(o => scene.remove(o));
}

export function setGameMode(mode) {
    currentMode = mode;
    if(mode === '4p') createBoard4P();
    else createBoard2P();
}

export function syncBoardVisuals(gameInstance, is4P=false) {
    // 清除舊棋子
    for(let k in piecesMap) scene.remove(piecesMap[k]);
    piecesMap = {};

    if(is4P) {
        const board = gameInstance.getBoard();
        const size=14, offset=size/2 - 0.5;
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                const p = board[r][c];
                if(p && p!=='X') {
                    createPiece(p.type, p.color, c-offset, offset-r, `${r},${c}`);
                }
            }
        }
    } else {
        const board = gameInstance.board();
        for(let r=0; r<8; r++) {
            for(let c=0; c<8; c++) {
                const p = board[r][c];
                if(p) {
                    createPiece(p.type, p.color, c-3.5, r-3.5, String.fromCharCode(97+c)+(8-r));
                }
            }
        }
    }
}

function createPiece(type, color, x, z, key) {
    let geo = GEO.piece;
    if(type === 'p') geo = GEO.pawn;
    if(type === 'k') geo = GEO.king;

    // 顏色轉換
    let mat = MAT.white;
    if(color === 'b') mat = MAT.black;
    if(color === 'red') mat = MAT.red;
    if(color === 'blue') mat = MAT.blue;
    if(color === 'yellow') mat = MAT.yellow;
    if(color === 'green') mat = MAT.green;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.6, z);
    scene.add(mesh);
    piecesMap[key] = mesh;
}

export function animateMove(move, cb) {
    let p, tPos;
    if(typeof move.from === 'string') { // 2P
        p = piecesMap[move.from];
        tPos = tilesMap[move.to].position;
    } else { // 4P
        p = piecesMap[`${move.from.r},${move.from.c}`];
        tPos = tilesMap[`${move.to.r},${move.to.c}`].position;
    }

    if(p && tPos) {
        if(window.TWEEN) {
            new TWEEN.Tween(p.position).to({x:tPos.x, z:tPos.z}, 200).onComplete(cb).start();
        } else {
            p.position.set(tPos.x, 0.6, tPos.z);
            cb();
        }
    } else if(cb) cb();
}

export function highlightSquare(sq) {
    for(let k in tilesMap) tilesMap[k].material = (k.charCodeAt(0)+k.charCodeAt(1))%2 ? MAT.tileWhite : MAT.tileBlack; // Reset
    if(tilesMap[sq]) tilesMap[sq].material = MAT.highlight;
}

export function clearHighlights() {
    // 簡單重置顏色 (正確邏輯需要判斷位置)
}

export function setLoginMode(enabled) {
    if(controls) controls.autoRotate = enabled;
    if(!enabled && currentMode==='2p') camera.position.set(0, 12, 10);
}

// 互動輔助
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
function animate() {
    requestAnimationFrame(animate);
    if(window.TWEEN) window.TWEEN.update();
    controls.update();
    renderer.render(scene, camera);
}
function onTouch(e, cb) {
    if(e.target.closest('.hud-container') || e.target.closest('.side-panel')) return;
    mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    checkRaycast(cb);
}
function onClickEvent(e, cb) {
    if(e.target.closest('.hud-container') || e.target.closest('.side-panel') || e.target.id==='mobile-menu-btn') return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    checkRaycast(cb);
}
function checkRaycast(cb) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(tilesMap));
    if(intersects.length > 0 && cb) cb(intersects[0].object.userData.sq);
}
// 空函式防止報錯
export function updateTheme() {}
export function updateOpponentGhost() {}
export function moveCamera(pos) { camera.position.set(pos.x, pos.y, pos.z); }
