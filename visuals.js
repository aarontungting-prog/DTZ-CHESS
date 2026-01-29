import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 效能設定：手機版降低畫質
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const CONFIG = {
    grassCount: isMobile ? 5000 : 80000,
    treeCount: isMobile ? 30 : 600,
    shadowSize: isMobile ? 512 : 2048, 
    pixelRatio: isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio
};

let scene, camera, renderer, controls, raycaster, mouse, clock;
let grassMat, cloudParticles = [];
let tilesMap = {}, piecesMap = {};
let selectedSquare = null;
let customModels = null; // 存放載入的模型
const BOARD_HEIGHT = 15;
let currentSettings = { pieceStyle: 'neon', boardStyle: 'neon' };
let isLoginRotating = false; 
let opponentCursorMesh = null;
let currentGameMode = '2p';

// 幾何體快取 (當模型載入失敗時的備案)
const GEOMETRIES = {
    cylBase: new THREE.CylinderGeometry(0.4, 0.45, 0.2, 32),
    pawnBody: new THREE.CylinderGeometry(0.15, 0.35, 0.6, 16),
    pawnHead: new THREE.SphereGeometry(0.25, 32, 32),
    rookBody: new THREE.CylinderGeometry(0.35, 0.35, 0.8, 32),
    rookHead: new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32),
    knightBody: new THREE.CylinderGeometry(0.25, 0.35, 0.6, 16),
    knightHead: new THREE.BoxGeometry(0.3, 0.6, 0.2),
    bishopBody: new THREE.CylinderGeometry(0.15, 0.35, 1.0, 16),
    queenBody: new THREE.CylinderGeometry(0.2, 0.4, 1.4, 32),
    kingBody: new THREE.CylinderGeometry(0.25, 0.45, 1.6, 32),
    sphereSmall: new THREE.SphereGeometry(0.15),
    boxCross: new THREE.BoxGeometry(0.1, 0.4, 0.1),
    torus: new THREE.TorusGeometry(0.2, 0.05, 16, 32),
    cubeTile: new THREE.BoxGeometry(1, 0.2, 1)
};

// 材質定義
const MATERIALS = {
    white: new THREE.MeshStandardMaterial({color:0xeeeeff, roughness:0.2, metalness:0.5}),
    black: new THREE.MeshStandardMaterial({color:0x222222, roughness:0.3, metalness:0.8}),
    red: new THREE.MeshStandardMaterial({color:0xff3333, roughness:0.3, metalness:0.5}),
    blue: new THREE.MeshStandardMaterial({color:0x3333ff, roughness:0.3, metalness:0.5}),
    yellow: new THREE.MeshStandardMaterial({color:0xffff33, roughness:0.3, metalness:0.5}),
    green: new THREE.MeshStandardMaterial({color:0x33ff33, roughness:0.3, metalness:0.5}),
    glowW: new THREE.MeshStandardMaterial({color:0x00e5ff, emissive:0x00e5ff, emissiveIntensity:2}),
    glowB: new THREE.MeshStandardMaterial({color:0xff0055, emissive:0xff0055, emissiveIntensity:2}),
    glowR: new THREE.MeshStandardMaterial({color:0xff0000, emissive:0xff0000, emissiveIntensity:2}),
    glowG: new THREE.MeshStandardMaterial({color:0x00ff00, emissive:0x00ff00, emissiveIntensity:2}),
    glowY: new THREE.MeshStandardMaterial({color:0xffff00, emissive:0xffff00, emissiveIntensity:2}),
    glowBlue: new THREE.MeshStandardMaterial({color:0x0000ff, emissive:0x0000ff, emissiveIntensity:2}),
    classicWhite: new THREE.MeshPhongMaterial({color: 0xdddddd, shininess: 30}),
    classicBlack: new THREE.MeshPhongMaterial({color: 0x111111, shininess: 30}),
    cursorGhost: new THREE.MeshBasicMaterial({color: 0xffaa00, transparent: true, opacity: 0.6})
};

export function init3D(container, onClickCallback, onCameraUpdate) {
    try {
        console.log("3D Engine: Starting High-Fidelity Mode...");
        clock = new THREE.Clock();
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xff9966, 0.0008); // 迷霧回歸

        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 6000);
        camera.position.set(0, 60, 100);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(CONFIG.pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        if (!isMobile) {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        
        const existingCanvas = document.querySelector('canvas');
        if (existingCanvas) existingCanvas.remove();
        document.body.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2.05;
        controls.minDistance = 10; controls.maxDistance = 450;
        controls.target.set(0, BOARD_HEIGHT, 0);

        if(onCameraUpdate) {
            controls.addEventListener('change', () => onCameraUpdate(camera.position));
        }

        // 光照與天空
        setupSunsetLighting();
        
        // 嘗試載入模型 (失敗會自動用備案)
        loadCustomModels();
        
        // 生成環境
        requestAnimationFrame(() => {
            createFloatingBoard();
            createProceduralTerrain();
            setTimeout(createVegetation, 50); // 草地
            setTimeout(createHighAltitudeClouds, 100); // 雲
            console.log("3D Engine: Environment created.");
        });

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        window.addEventListener('resize', onResize);
        window.addEventListener('touchstart', (e) => onTouchStart(e, onClickCallback), {passive: false});
        window.addEventListener('click', (e) => onMouseClick(e, onClickCallback));
        window.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            if(window.gameInstance || currentGameMode === '4p') {
                raycaster.setFromCamera(mouse, camera);
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_HEIGHT);
                const target = new THREE.Vector3();
                raycaster.ray.intersectPlane(plane, target);
                if (target && onMouseMoveCallback) onMouseMoveCallback(target);
            }
        });

        animate();
        return { scene, camera, controls, moveCamera, updateTheme, setLoginMode, updateOpponentGhost: updateOpponentCursor, setGameMode, syncBoardVisuals, animateMove, highlightSquare, clearHighlights };
    
    } catch(err) {
        console.error("3D Init Failed:", err);
        throw err;
    }
}

// 載入模型 (含錯誤處理)
function loadCustomModels() {
    const loader = new GLTFLoader();
    loader.load(
        './models/chess_set.glb', // 請確保這個路徑下有檔案
        (gltf) => {
            customModels = gltf.scene;
            console.log("✅ Models Loaded Successfully!");
            // 如果遊戲已經開始，重新整理棋盤以套用模型
            if(window.gameInstance) syncBoardVisuals(window.gameInstance);
        }, 
        undefined, 
        (error) => {
            console.warn("⚠️ Model load failed, using fallback geometry.", error);
            // 失敗時 customModels 為 null，createOptimizedPiece 會自動用幾何體
        }
    );
}

export function setGameMode(mode) {
    currentGameMode = mode;
    const toRemove = [];
    scene.traverse(child => {
        if(child.userData && (child.userData.isTile || child.userData.isPiece || child.userData.isBoardBase)) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(obj => scene.remove(obj));
    
    tilesMap = {}; 
    piecesMap = {};

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
    const b = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 15), new THREE.MeshStandardMaterial({color:0x221111, roughness:0.5}));
    b.position.y = BOARD_HEIGHT - 0.25;
    b.userData.isBoardBase = true;
    if(!isMobile) b.receiveShadow = true;
    scene.add(b);

    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            const isCorner = (r < 3 && c < 3) || (r < 3 && c > 10) || (r > 10 && c < 3) || (r > 10 && c > 10);
            if (isCorner) continue;
            const color = (r + c) % 2 !== 0 ? 0xffddbb : 0x443333;
            const t = new THREE.Mesh(GEOMETRIES.cubeTile, new THREE.MeshStandardMaterial({color: color, roughness:0.2, metalness:0.3}));
            t.position.set(c - offset, BOARD_HEIGHT, offset - r);
            t.userData = { isTile: true, square: {r: r, c: c} }; 
            if(!isMobile) { t.receiveShadow=true; t.castShadow=true; }
            scene.add(t);
            tilesMap[`${r},${c}`] = t; 
        }
    }
}

function createFloatingBoard(){ 
    const g=new THREE.TorusGeometry(8,0.3,16,32);const m=new THREE.MeshBasicMaterial({color:0xffaa00});const r=new THREE.Mesh(g,m);r.rotation.x=Math.PI/2;r.position.y=BOARD_HEIGHT-3;scene.add(r); 
    const b=new THREE.Mesh(new THREE.BoxGeometry(9,0.5,9),new THREE.MeshStandardMaterial({color:0x221111,roughness:0.5}));b.position.y=BOARD_HEIGHT-0.25;if(!isMobile) b.receiveShadow=true;scene.add(b); 
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ 
        const n=String.fromCharCode(97+c)+(r+1),w=(r+c)%2!==0; 
        const t=new THREE.Mesh(new THREE.BoxGeometry(1,0.2,1),new THREE.MeshStandardMaterial({color:w?0xffddbb:0x443333,roughness:0.2,metalness:0.3})); 
        t.position.set(c-3.5,BOARD_HEIGHT,3.5-r);t.userData={square:n,isTile:true};if(!isMobile) {t.receiveShadow=true;t.castShadow=true;}scene.add(t);tilesMap[n]=t; 
    } 
}

export function syncBoardVisuals(gameInstance, is4P = false) {
    if(!window.gameInstance) window.gameInstance = gameInstance;
    if(!scene) return;

    for(let sq in piecesMap) { scene.remove(piecesMap[sq]); }
    piecesMap = {};

    if (is4P) {
        const board = gameInstance.getBoard();
        if(!board) return;
        const size = 14;
        const offset = size / 2 - 0.5;
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
                    scene.add(s);
                    piecesMap[sq] = s;
                }
            }
        }
    }
}

function createOptimizedPiece(t, c) {
    // 1. 如果有模型且設定為 neon，嘗試複製模型
    if (customModels && currentSettings.pieceStyle === 'neon') { 
        const pieceName = getPieceName(t, c);
        const modelPiece = customModels.getObjectByName(pieceName);
        if (modelPiece) {
            const clone = modelPiece.clone();
            clone.scale.setScalar(2); 
            // 恢復陰影
            if(!isMobile) clone.traverse(child => { if(child.isMesh) child.castShadow = true; });
            return clone;
        }
    }

    // 2. 備案：使用幾何體 (確保一定有東西顯示)
    const g = new THREE.Group();
    let mat, glow;

    if (c === 'w') { mat = MATERIALS.white; glow = MATERIALS.glowW; }
    else if (c === 'b') { mat = MATERIALS.black; glow = MATERIALS.glowB; }
    else if (c === 'red') { mat = MATERIALS.red; glow = MATERIALS.glowR; }
    else if (c === 'blue') { mat = MATERIALS.blue; glow = MATERIALS.glowBlue; }
    else if (c === 'yellow') { mat = MATERIALS.yellow; glow = MATERIALS.glowY; }
    else if (c === 'green') { mat = MATERIALS.green; glow = MATERIALS.glowG; }
    else { mat = MATERIALS.white; glow = MATERIALS.glowW; }

    const base = new THREE.Mesh(GEOMETRIES.cylBase, mat);
    base.position.y = 0.1; 
    if(!isMobile) base.castShadow = true;
    g.add(base);

    if(t === 'p') {
        const body = new THREE.Mesh(GEOMETRIES.pawnBody, mat); body.position.y = 0.5;
        const head = new THREE.Mesh(GEOMETRIES.pawnHead, mat); head.position.y = 0.95;
        g.add(body, head);
    } else {
        const body = new THREE.Mesh(GEOMETRIES.rookBody, mat); body.position.y = 0.6;
        g.add(body);
        if(t==='k' || t==='q') {
            const top = new THREE.Mesh(GEOMETRIES.sphereSmall, glow); top.position.y = 1.5;
            g.add(top);
        }
    }
    return g;
}

function getPieceName(type, color) {
    const names = { 'p': 'Pawn', 'r': 'Rook', 'n': 'Knight', 'b': 'Bishop', 'q': 'Queen', 'k': 'King' };
    const c = color === 'w' ? 'White' : 'Black';
    return `${c}_${names[type]}`;
}

// ... 環境函式 (天空、草地) ...
function setupSunsetLighting(){
    const ambient=new THREE.AmbientLight(0xffccaa,0.75);scene.add(ambient);
    const sunLight=new THREE.DirectionalLight(0xff8800,3.2);
    sunLight.position.set(-300,100,-300);
    if(!isMobile) { sunLight.castShadow=true; sunLight.shadow.mapSize.set(CONFIG.shadowSize,CONFIG.shadowSize); const d=700;sunLight.shadow.camera.left=-d;sunLight.shadow.camera.right=d;sunLight.shadow.camera.top=d;sunLight.shadow.camera.bottom=-d; }
    scene.add(sunLight);
    const sky=new Sky();sky.scale.setScalar(450000);scene.add(sky);
    const uniforms=sky.material.uniforms;
    uniforms['turbidity'].value=10;uniforms['rayleigh'].value=3;
    uniforms['mieCoefficient'].value=0.005;uniforms['mieDirectionalG'].value=0.8;
    uniforms['sunPosition'].value.copy(sunLight.position);
}
function createProceduralTerrain(){ 
    const geo=new THREE.PlaneGeometry(3500,3500,isMobile?50:100,isMobile?50:100); geo.rotateX(-Math.PI/2); 
    const mat=new THREE.MeshStandardMaterial({color: 0x226622, roughness:0.9, metalness:0.1}); 
    const mesh=new THREE.Mesh(geo,mat); 
    if(!isMobile) mesh.receiveShadow=true; 
    mesh.position.y = -12;
    scene.add(mesh); 
}
function createVegetation(){ 
    const bGeo=new THREE.PlaneGeometry(0.3,1.5);bGeo.translate(0,0.75,0);
    grassMat=new THREE.MeshStandardMaterial({color:0x226622,side:THREE.DoubleSide});
    const iG=new THREE.InstancedMesh(bGeo,grassMat,CONFIG.grassCount);
    const dummy=new THREE.Object3D();
    for(let i=0;i<CONFIG.grassCount;i++){
        const r=Math.random()*400;const a=Math.random()*Math.PI*2;
        dummy.position.set(Math.cos(a)*r, -12, Math.sin(a)*r);
        dummy.rotation.y=Math.random()*Math.PI;
        dummy.updateMatrix();
        iG.setMatrixAt(i,dummy.matrix);
    }
    if(!isMobile) iG.receiveShadow=true;
    scene.add(iG);
}
function createHighAltitudeClouds(){ 
    // 簡化雲層以確保穩定
    const geo = new THREE.PlaneGeometry(100,100);
    const mat = new THREE.MeshBasicMaterial({color:0xffaa00, transparent:true, opacity:0.1, side:THREE.DoubleSide});
    const cloud = new THREE.Mesh(geo,mat);
    cloud.position.y = 200;
    cloud.rotation.x = Math.PI/2;
    scene.add(cloud);
}

// ... 互動與動畫函式 ...
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

export function setLoginMode(enabled) { isLoginRotating = enabled; if(controls) { controls.autoRotate = enabled; } if(!enabled) { moveCamera({x: 0, y: 60, z: 100}, {x:0, y:BOARD_HEIGHT, z:0}); } }
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
export function moveCamera(pos) { camera.position.set(pos.x, pos.y, pos.z); }
let onMouseMoveCallback = null;
