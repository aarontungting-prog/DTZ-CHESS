import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 自檢狀態更新
function updateStatus(id, msg, type) {
    const el = document.getElementById(id);
    if(el) {
        el.innerText = msg;
        el.className = `status-item ${type}`;
    }
}

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const CONFIG = {
    pixelRatio: isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio
};

let scene, camera, renderer, controls, raycaster, mouse, clock;
let grassMat, cloudParticles = [];
let tilesMap = {}, piecesMap = {};
let customModels = null;
const BOARD_HEIGHT = 15;
let currentSettings = { pieceStyle: 'neon', boardStyle: 'neon' };
let opponentCursorMesh = null;
let currentGameMode = '2p';

// 幾何體備案
const GEOMETRIES = {
    cyl: new THREE.CylinderGeometry(0.4, 0.45, 0.2, 32),
    pawn: new THREE.CylinderGeometry(0.15, 0.35, 0.6, 16),
    rook: new THREE.BoxGeometry(0.5, 0.8, 0.5),
    tile: new THREE.BoxGeometry(1, 0.2, 1)
};

const MATERIALS = {
    white: new THREE.MeshStandardMaterial({color:0xeeeeff, roughness:0.2}),
    black: new THREE.MeshStandardMaterial({color:0x222222, roughness:0.3}),
    red: new THREE.MeshStandardMaterial({color:0xff3333}),
    blue: new THREE.MeshStandardMaterial({color:0x3333ff}),
    yellow: new THREE.MeshStandardMaterial({color:0xffff33}),
    green: new THREE.MeshStandardMaterial({color:0x33ff33}),
    glowW: new THREE.MeshStandardMaterial({color:0x00e5ff, emissive:0x00e5ff, emissiveIntensity:2}),
    glowB: new THREE.MeshStandardMaterial({color:0xff0055, emissive:0xff0055, emissiveIntensity:2}),
    cursorGhost: new THREE.MeshBasicMaterial({color: 0xffaa00, transparent: true, opacity: 0.6})
};

export function init3D(container, onClickCallback, onCameraUpdate) {
    try {
        clock = new THREE.Clock();
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xff9966, 0.0008);

        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 6000);
        camera.position.set(0, 60, 100);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(CONFIG.pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (!isMobile) renderer.shadowMap.enabled = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        
        const existingCanvas = document.querySelector('canvas');
        if (existingCanvas) existingCanvas.remove();
        document.body.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, BOARD_HEIGHT, 0);

        if(onCameraUpdate) {
            controls.addEventListener('change', () => onCameraUpdate(camera.position));
        }

        setupLighting();
        
        // 載入模型 (含狀態回報)
        const loader = new GLTFLoader();
        loader.load('./models/chess_set.glb', (gltf) => {
            customModels = gltf.scene;
            updateStatus('status-model', "✅ 模型載入完成", "ok");
            if(window.gameInstance) syncBoardVisuals(window.gameInstance);
        }, undefined, (err) => {
            console.warn("Model fallback:", err);
            updateStatus('status-model', "⚠️ 模型失敗 (使用備案)", "error");
        });

        // 生成環境
        createFloatingBoard();
        createProceduralTerrain();

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        window.addEventListener('resize', onResize);
        window.addEventListener('touchstart', (e) => onTouchStart(e, onClickCallback), {passive: false});
        window.addEventListener('click', (e) => onMouseClick(e, onClickCallback));
        window.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        animate();
        return { scene, camera, controls, moveCamera, updateTheme, setLoginMode, updateOpponentGhost: updateOpponentCursor, setGameMode, syncBoardVisuals, animateMove, highlightSquare, clearHighlights };
    
    } catch(err) {
        console.error(err);
        throw err;
    }
}

export function setGameMode(mode) {
    currentGameMode = mode;
    // 移除舊物件
    const toRemove = [];
    scene.traverse(child => {
        if(child.userData && (child.userData.isTile || child.userData.isPiece || child.userData.isBoardBase)) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(obj => scene.remove(obj));
    
    tilesMap = {}; piecesMap = {};

    if (mode === '4p') {
        createCrossBoard();
        moveCamera({x:0, y:90, z:130}, {x:0, y:BOARD_HEIGHT, z:0});
    } else {
        createFloatingBoard();
        moveCamera({x:0, y:60, z:100}, {x:0, y:BOARD_HEIGHT, z:0});
    }
}

function createCrossBoard() {
    const size = 14;
    const offset = size / 2 - 0.5;
    const b = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 15), new THREE.MeshStandardMaterial({color:0x221111}));
    b.position.y = BOARD_HEIGHT - 0.25;
    b.userData.isBoardBase = true;
    scene.add(b);

    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            const isCorner = (r < 3 && c < 3) || (r < 3 && c > 10) || (r > 10 && c < 3) || (r > 10 && c > 10);
            if (isCorner) continue;
            const color = (r + c) % 2 !== 0 ? 0xffddbb : 0x443333;
            const t = new THREE.Mesh(GEOMETRIES.cubeTile, new THREE.MeshStandardMaterial({color: color}));
            t.position.set(c - offset, BOARD_HEIGHT, offset - r);
            t.userData = { isTile: true, square: {r: r, c: c} }; 
            if(!isMobile) t.receiveShadow=true;
            scene.add(t);
            tilesMap[`${r},${c}`] = t; 
        }
    }
}

function createFloatingBoard(){ 
    const b=new THREE.Mesh(new THREE.BoxGeometry(9,0.5,9),new THREE.MeshStandardMaterial({color:0x221111}));
    b.position.y=BOARD_HEIGHT-0.25;
    b.userData.isBoardBase = true;
    scene.add(b); 
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ 
        const n=String.fromCharCode(97+c)+(r+1),w=(r+c)%2!==0; 
        const t=new THREE.Mesh(new THREE.BoxGeometry(1,0.2,1),new THREE.MeshStandardMaterial({color:w?0xffddbb:0x443333})); 
        t.position.set(c-3.5,BOARD_HEIGHT,3.5-r);t.userData={square:n,isTile:true};
        if(!isMobile) t.receiveShadow=true;
        scene.add(t);tilesMap[n]=t; 
    } 
}

export function syncBoardVisuals(gameInstance, is4P = false) {
    if(!window.gameInstance) window.gameInstance = gameInstance;
    for(let sq in piecesMap) { scene.remove(piecesMap[sq]); }
    piecesMap = {};

    if (is4P) {
        const board = gameInstance.getBoard();
        const size = 14, offset = size/2 - 0.5;
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                const p = board[r][c];
                if (p && p !== 'X') {
                    const s = createOptimizedPiece(p.type, p.color);
                    s.position.set(c - offset, BOARD_HEIGHT, offset - r);
                    s.userData.isPiece = true;
                    scene.add(s);
                    piecesMap[`${r},${c}`] = s;
                }
            }
        }
    } else {
        const b = gameInstance.board();
        for(let r=0; r<8; r++){
            for(let c=0; c<8; c++){
                const p = b[r][c];
                if(p){
                    const sq = String.fromCharCode(97+c)+(8-r);
                    const s = createOptimizedPiece(p.type, p.color);
                    s.position.set(c-3.5, BOARD_HEIGHT, r-3.5);
                    s.userData.isPiece = true;
                    scene.add(s);
                    piecesMap[sq] = s;
                }
            }
        }
    }
}

function createOptimizedPiece(t, c) {
    // 1. 嘗試使用模型
    if (customModels && currentSettings.pieceStyle === 'neon') { 
        const pieceName = getPieceName(t, c);
        const modelPiece = customModels.getObjectByName(pieceName);
        if (modelPiece) {
            const clone = modelPiece.clone();
            clone.scale.setScalar(2); 
            return clone;
        }
    }

    // 2. 備案：幾何體
    const g = new THREE.Group();
    let mat, glow;

    // 顏色映射 (包含 4P 顏色)
    if (MATERIALS[c]) mat = MATERIALS[c]; 
    else if (c === 'w') mat = MATERIALS.white;
    else if (c === 'b') mat = MATERIALS.black;
    
    // 簡單形狀
    const base = new THREE.Mesh(GEOMETRIES.cylBase, mat);
    base.position.y = 0.1; g.add(base);

    if(t === 'p') {
        const body = new THREE.Mesh(GEOMETRIES.pawnBody, mat); body.position.y = 0.5;
        g.add(body);
    } else {
        const body = new THREE.Mesh(GEOMETRIES.rookBody, mat); body.position.y = 0.6;
        g.add(body);
    }
    return g;
}

function getPieceName(type, color) {
    const names = { 'p': 'Pawn', 'r': 'Rook', 'n': 'Knight', 'b': 'Bishop', 'q': 'Queen', 'k': 'King' };
    const c = color === 'w' ? 'White' : 'Black';
    return `${c}_${names[type]}`;
}

function setupLighting(){
    const ambient=new THREE.AmbientLight(0xffccaa,0.75);scene.add(ambient);
    const sunLight=new THREE.DirectionalLight(0xff8800,3.2);
    sunLight.position.set(-300,100,-300);
    if(!isMobile) { sunLight.castShadow=true; sunLight.shadow.mapSize.set(1024,1024); }
    scene.add(sunLight);
    const sky=new Sky();sky.scale.setScalar(450000);scene.add(sky);
    const uniforms=sky.material.uniforms;
    uniforms['turbidity'].value=10;uniforms['rayleigh'].value=3;
    uniforms['mieCoefficient'].value=0.005;uniforms['mieDirectionalG'].value=0.8;
    uniforms['sunPosition'].value.copy(sunLight.position);
}

function createProceduralTerrain(){ 
    const geo=new THREE.PlaneGeometry(2000,2000,32,32); geo.rotateX(-Math.PI/2); 
    const mat=new THREE.MeshStandardMaterial({color: 0x224422, roughness:0.9, metalness:0.1}); 
    const mesh=new THREE.Mesh(geo,mat); 
    mesh.position.y = -12;
    if(!isMobile) mesh.receiveShadow = true;
    scene.add(mesh); 
}

function clr(){for(let s in tilesMap){tilesMap[s].material.emissive.setHex(0x000000);tilesMap[s].material.emissiveIntensity=0;}}

function onTouchStart(e, cb){
    if (e.target.closest('.auth-box') || e.target.closest('.hud-container') || e.target.closest('.side-panel') || e.target.id === 'mobile-menu-btn') return;
    if(e.touches.length > 1) return;
    e.preventDefault(); 
    mouse.x=(e.touches[0].clientX/window.innerWidth)*2-1;mouse.y=-(e.touches[0].clientY/window.innerHeight)*2+1;
    chk(cb);
}

function onMouseClick(e, cb){
    if (e.target.closest('.auth-box') || e.target.closest('.hud-container') || e.target.closest('.side-panel') || e.target.id === 'mobile-menu-btn') return;
    mouse.x=(e.clientX/window.innerWidth)*2-1;mouse.y=-(e.clientY/window.innerHeight)*2+1;
    chk(cb);
}

function chk(cb){
    raycaster.setFromCamera(mouse,camera);
    const intersects = raycaster.intersectObjects(Object.values(tilesMap));
    if(intersects.length > 0 && cb) cb(intersects[0].object.userData.square);
}

function onResize(){
    if(!camera || !renderer) return;
    camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);
}

function animate(){ 
    requestAnimationFrame(animate); 
    const t=clock.getElapsedTime(); 
    if(window.TWEEN) window.TWEEN.update(); 
    controls.update(); 
    renderer.render(scene,camera); 
}

export function setLoginMode(enabled) { isLoginRotating = enabled; if(controls) controls.autoRotate = enabled; if(!enabled) moveCamera({x: 0, y: 60, z: 100}, {x:0, y:BOARD_HEIGHT, z:0}); }
export function updateOpponentCursor(pos) { if (!pos || !scene) return; if (!opponentCursorMesh) { const geo = new THREE.SphereGeometry(1.5, 16, 16); opponentCursorMesh = new THREE.Mesh(geo, MATERIALS.cursorGhost); scene.add(opponentCursorMesh); } if(window.TWEEN) { new TWEEN.Tween(opponentCursorMesh.position).to({x: pos.x, y: pos.y, z: pos.z}, 120).start(); } else { opponentCursorMesh.position.set(pos.x, pos.y, pos.z); } }
export function highlightSquare(sq, moves) { clr(); selectedSquare = sq; if(tilesMap[sq]) { tilesMap[sq].material.emissive.setHex(0xffff00); tilesMap[sq].material.emissiveIntensity = 0.8; } moves.forEach(m => { if(tilesMap[m.to]) { tilesMap[m.to].material.emissive.setHex(m.captured ? 0xff3300 : 0x00aaff); tilesMap[m.to].material.emissiveIntensity = 0.5; } }); }
export function clearHighlights() { clr(); selectedSquare = null; }
export function animateMove(move, cb) { 
    let p, tPos;
    if(typeof move.from === 'string') { p = piecesMap[move.from]; tPos = tilesMap[move.to].position; } 
    else { p = piecesMap[`${move.from.r},${move.from.c}`]; tPos = tilesMap[`${move.to.r},${move.to.c}`].position; }
    if(p && tPos) {
        if(window.TWEEN) { new TWEEN.Tween(p.position).to({x:tPos.x, z:tPos.z}, 200).onComplete(cb).start(); } 
        else { p.position.set(tPos.x, 0.6, tPos.z); cb(); }
    } else if(cb) cb();
}
export function updateTheme(settings) { if (settings.pieceStyle) currentSettings.pieceStyle = settings.pieceStyle; if (window.gameInstance) syncBoardVisuals(window.gameInstance, currentGameMode === '4p'); }
export function moveCamera(pos) { if(window.TWEEN) new TWEEN.Tween(camera.position).to(pos, 1000).start(); else camera.position.set(pos.x, pos.y, pos.z); }
let onMouseMoveCallback = null;
