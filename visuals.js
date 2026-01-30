import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls, raycaster, mouse;
let tilesMap = {}, piecesMap = {};
let selectedSquare = null;
let opponentGhost = null;

const BOARD_Y = 0; // 棋盤高度

// 材質庫 (霓虹風格)
const MATS = {
    tileBlack: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.8 }),
    tileWhite: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.8, emissive: 0x001133, emissiveIntensity: 0.2 }),
    
    pieceWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00e5ff, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.2 }),
    pieceBlack: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff0055, emissiveIntensity: 0.5, metalness: 0.9, roughness: 0.2 }),
    
    highlight: new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 }),
    moveHint: new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 }),
    captureHint: new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 }),
    
    ghost: new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true, opacity: 0.3 })
};

// 幾何體快取 (優化效能)
const GEOS = {
    box: new THREE.BoxGeometry(1, 0.2, 1),
    pawn: new THREE.CylinderGeometry(0.3, 0.3, 1, 16),
    rook: new THREE.BoxGeometry(0.6, 1.2, 0.6),
    knight: new THREE.ConeGeometry(0.3, 1.2, 16), // 簡化為錐體
    bishop: new THREE.CylinderGeometry(0.1, 0.3, 1.4, 16),
    queen: new THREE.CylinderGeometry(0.4, 0.2, 1.8, 16),
    king: new THREE.CylinderGeometry(0.4, 0.4, 2.0, 8),
    ghostSphere: new THREE.SphereGeometry(1, 16, 16)
};

export function init3D(container, onClick, onCamMove) {
    // 1. 場景設定 (純黑背景)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.015);

    // 2. 相機
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 30); // 預設位置

    // 3. 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 4. 控制器
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1; // 限制不能鑽到地底
    controls.minDistance = 10;
    controls.maxDistance = 100;
    
    // 監聽相機移動
    controls.addEventListener('change', () => {
        if(onCamMove) onCamMove(camera.position);
    });

    // 5. 燈光 (霓虹配置)
    setupNeonLighting();

    // 6. 建立物件
    createBoard();
    createOpponentGhost();

    // 7. 事件監聽
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // 修正 canvas 偏移導致的點擊誤差 (因為左側有選單)
    window.addEventListener('click', (event) => {
        // 計算考慮左側選單偏移後的滑鼠座標
        const canvasBounds = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
        mouse.y = -((event.clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children);
        
        for (let hit of intersects) {
            if (hit.object.userData.sq) {
                onClick(hit.object.userData.sq);
                break;
            }
        }
    });

    window.addEventListener('resize', onResize);
    animate();
}

function setupNeonLighting() {
    const ambient = new THREE.AmbientLight(0x111122, 0.4);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 霓虹點光源
    const blueL = new THREE.PointLight(0x00e5ff, 2, 50);
    blueL.position.set(-10, 5, 0);
    scene.add(blueL);

    const pinkL = new THREE.PointLight(0xff0055, 2, 50);
    pinkL.position.set(10, 5, 0);
    scene.add(pinkL);
}

function createBoard() {
    const boardGroup = new THREE.Group();
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const isWhite = (r+c)%2 === 0; // 注意：棋盤格色計算
            const sqName = String.fromCharCode(97+c) + (8-r); // e.g., "a8"
            
            const tile = new THREE.Mesh(GEOS.box, isWhite ? MATS.tileWhite : MATS.tileBlack);
            tile.position.set(c - 3.5, BOARD_Y, r - 3.5); // 置中
            tile.receiveShadow = true;
            tile.userData = { sq: sqName };
            
            tilesMap[sqName] = tile;
            boardGroup.add(tile);
        }
    }
    
    // 棋盤邊框
    const border = new THREE.Mesh(
        new THREE.BoxGeometry(9, 0.5, 9),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a })
    );
    border.position.y = -0.2;
    scene.add(border);
    scene.add(boardGroup);
}

// 根據 chess.js 的 FEN 同步 3D 棋子
export function syncBoardVisuals(gameInstance) {
    // 清除舊棋子
    for(let key in piecesMap) { scene.remove(piecesMap[key]); }
    piecesMap = {};

    const board = gameInstance.board(); // 8x8 array
    
    board.forEach((row, rIndex) => {
        row.forEach((piece, cIndex) => {
            if (piece) {
                const mesh = createPieceMesh(piece.type, piece.color);
                mesh.position.set(cIndex - 3.5, BOARD_Y + 0.6, rIndex - 3.5);
                scene.add(mesh);
                
                const sqName = String.fromCharCode(97+cIndex) + (8-rIndex);
                piecesMap[sqName] = mesh; // 這裡我們暫時用格子名當 key，移動時要注意更新
                mesh.userData = { type: piece.type, color: piece.color };
            }
        });
    });
}

function createPieceMesh(type, color) {
    let geo;
    switch(type) {
        case 'p': geo = GEOS.pawn; break;
        case 'r': geo = GEOS.rook; break;
        case 'n': geo = GEOS.knight; break;
        case 'b': geo = GEOS.bishop; break;
        case 'q': geo = GEOS.queen; break;
        case 'k': geo = GEOS.king; break;
        default: geo = GEOS.pawn;
    }
    const mat = color === 'w' ? MATS.pieceWhite : MATS.pieceBlack;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
}

// 視覺化移動動畫
export function animateMove(move, onComplete) {
    // move: { from: 'e2', to: 'e4' ... }
    const startObj = piecesMap[move.from];
    
    // 如果是吃子，先移除被吃掉的
    if (move.captured || piecesMap[move.to]) {
        // 特別處理：如果是吃過路兵 (en passant)，被吃的位置不是 move.to
        // 但這裡簡化處理，因為 syncBoardVisuals 會在動畫後重繪整個盤面
        if(piecesMap[move.to]) {
            scene.remove(piecesMap[move.to]);
            delete piecesMap[move.to];
        }
    }

    if (!startObj) { if(onComplete) onComplete(); return; }

    const targetPos = tilesMap[move.to].position.clone();
    targetPos.y += 0.6; // 修正高度

    // 使用 Tween
    new TWEEN.Tween(startObj.position)
        .to({ x: targetPos.x, z: targetPos.z }, 200)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            // 移動結束後，直接重繪整個盤面以確保狀態正確 (特別是升變、入堡)
            if(onComplete) onComplete();
        })
        .start();
}

export function highlightSquare(sq, moves) {
    // 高亮選取格
    if(tilesMap[sq]) {
        // 為了不影響原材質，我們疊加一個發光平面
        const hl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), MATS.highlight);
        hl.rotation.x = -Math.PI/2;
        hl.position.y = 0.11;
        tilesMap[sq].add(hl);
        hl.name = "highlight_overlay";
    }

    // 提示可走步數
    moves.forEach(m => {
        if(tilesMap[m.to]) {
            const mat = m.captured ? MATS.captureHint : MATS.moveHint;
            const hint = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), mat);
            hint.rotation.x = -Math.PI/2;
            hint.position.y = 0.11;
            tilesMap[m.to].add(hint);
            hint.name = "highlight_overlay";
        }
    });
}

export function clearHighlights() {
    for(let key in tilesMap) {
        const tile = tilesMap[key];
        for(let i = tile.children.length - 1; i >= 0; i--) {
            if(tile.children[i].name === "highlight_overlay") {
                tile.remove(tile.children[i]);
            }
        }
    }
}

// 建立對手幽靈球
function createOpponentGhost() {
    opponentGhost = new THREE.Mesh(GEOS.ghostSphere, MATS.ghost);
    scene.add(opponentGhost);
}

export function updateOpponentGhost(pos) {
    if(!opponentGhost) return;
    new TWEEN.Tween(opponentGhost.position)
        .to(pos, 300)
        .start();
}

export function moveCamera(pos, target) {
    new TWEEN.Tween(camera.position).to(pos, 1500).easing(TWEEN.Easing.Cubic.Out).start();
    if(target) controls.target.set(target.x, target.y, target.z);
}

export function setLoginMode(active) {
    controls.autoRotate = active;
}

function onResize() {
    // 修正 canvas 寬度 (扣除左側選單 300px)
    const sidebarWidth = window.innerWidth > 600 ? 300 : 0;
    const w = window.innerWidth - sidebarWidth;
    const h = window.innerHeight;
    
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function animate(time) {
    requestAnimationFrame(animate);
    TWEEN.update(time);
    controls.update();
    renderer.render(scene, camera);
}
