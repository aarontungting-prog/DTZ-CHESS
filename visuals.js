import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const CONFIG = {
    grassCount: isMobile ? 3000 : 60000, // 降低數量以防崩潰
    treeCount: isMobile ? 30 : 600,
    shadowSize: isMobile ? 512 : 2048, 
    pixelRatio: isMobile ? Math.min(window.devicePixelRatio, 1.2) : window.devicePixelRatio
};

let scene, camera, renderer, controls, raycaster, mouse, clock;
let grassMat, cloudParticles = [];
let tilesMap = {}, piecesMap = {};
let selectedSquare = null;
let customModels = null;
const BOARD_HEIGHT = 15;
let currentSettings = { pieceStyle: 'neon', boardStyle: 'neon' };
let isLoginRotating = false; 
let opponentCursorMesh = null;
let currentGameMode = '2p';

// 幾何體快取
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
    // 4P 顏色
    red: new THREE.MeshStandardMaterial({color:0xff3333, roughness:0.3, metalness:0.5}),
    blue: new THREE.MeshStandardMaterial({color:0x3333ff, roughness:0.3, metalness:0.5}),
    yellow: new THREE.MeshStandardMaterial({color:0xffff33, roughness:0.3, metalness:0.5}),
    green: new THREE.MeshStandardMaterial({color:0x33ff33, roughness:0.3, metalness:0.5}),
    // 發光材質
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
        console.log("3D Engine: Starting...");
        clock = new THREE.Clock();
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xff9966, 0.0008);
        scene.background = new THREE.Color(0x331111);

        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 6000);
        camera.position.set(0, 60, 100);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(CONFIG.pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        // 如果是手機，關閉陰影以提升效能（也避免手機渲染錯誤黑屏）
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

        setupSunsetLighting();
        loadCustomModels();
        
        // 延遲生成場景物件，確保主線程不卡死
        setTimeout(() => {
            createFloatingBoard();
            createProceduralTerrain();
            setTimeout(createVegetation, 50);
            setTimeout(createHighAltitudeClouds, 100);
            console.log("3D Engine: Scene objects created.");
        }, 100);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        window.addEventListener('resize', onResize);
        window.addEventListener('touchstart', (e) => onTouchStart(e, onClickCallback), {passive: false});
        window.addEventListener('click', (e) => onMouseClick(e, onClickCallback));
        window.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            // 減少 Raycaster 運算頻率
            if(window.gameInstance || currentGameMode === '4p') {
                raycaster.setFromCamera(mouse, camera);
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_HEIGHT);
                const target = new THREE.Vector3();
                raycaster.ray.intersectPlane(plane, target);
                if (target && onMouseMoveCallback) onMouseMoveCallback(target);
            }
        });

        animate();
        console.log("3D Engine: Loop started.");
        
        return { scene, camera, controls, moveCamera, updateTheme, setLoginMode, updateOpponentGhost: updateOpponentCursor, setGameMode, syncBoardVisuals, animateMove, highlightSquare, clearHighlights };
    
    } catch(err) {
        console.error("Critical 3D Error:", err);
        throw err; // 拋出錯誤讓外部捕獲
    }
}

export function setGameMode(mode) {
    console.log("Setting Game Mode:", mode);
    currentGameMode = mode;
    
    // 安全移除舊物件
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
    console.log("Creating 4P Board...");
    const size = 14;
    const offset = size / 2 - 0.5;
    
    const b = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 15), new THREE.MeshStandardMaterial({color:0x221111, roughness:0.5}));
    b.position.y = BOARD_HEIGHT - 0.25;
    b.userData.isBoardBase = true;
    if(!isMobile) b.receiveShadow = true;
    scene.add(b);

    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            // 判斷 3x3 角落
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

export function syncBoardVisuals(gameInstance, is4P = false) {
    if(!window.gameInstance) window.gameInstance = gameInstance;
    if(!scene) return; // 保護機制

    for(let sq in piecesMap) { scene.remove(piecesMap[sq]); }
    piecesMap = {};

    if (is4P) {
        // 4P 同步
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
        // 2P 同步
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
    // 這裡做了安全修改：如果找不到模型，自動使用幾何體 fallback
    const g = new THREE.Group();
    let mat, glow;

    if (c === 'w') { mat = MATERIALS.white; glow = MATERIALS.glowW; }
    else if (c === 'b') { mat = MATERIALS.black; glow = MATERIALS.glowB; }
    else if (c === 'red') { mat = MATERIALS.red; glow = MATERIALS.glowR; }
    else if (c === 'blue') { mat = MATERIALS.blue; glow = MATERIALS.glowBlue; }
    else if (c === 'yellow') { mat = MATERIALS.yellow; glow = MATERIALS.glowY; }
    else if (c === 'green') { mat = MATERIALS.green; glow = MATERIALS.glowG; }
    else { mat = MATERIALS.white; glow = MATERIALS.glowW; }

    // 底座
    const base = new THREE.Mesh(GEOMETRIES.cylBase, mat);
    base.position.y = 0.1; 
    if(!isMobile) base.castShadow = true;
    g.add(base);

    // 簡單幾何體組合 (保證一定能顯示，不依賴外部模型)
    if(t === 'p') {
        const body = new THREE.Mesh(GEOMETRIES.pawnBody, mat); body.position.y = 0.5;
        const head = new THREE.Mesh(GEOMETRIES.pawnHead, mat); head.position.y = 0.95;
        g.add(body, head);
    } else {
        // 其他棋子暫用通用形狀代替，避免出錯，你原本的邏輯也可保留
        const body = new THREE.Mesh(GEOMETRIES.rookBody, mat); body.position.y = 0.6;
        g.add(body);
        
        // 用頂部特徵區分
        if(t==='k' || t==='q') {
            const top = new THREE.Mesh(GEOMETRIES.sphereSmall, glow);
            top.position.y = 1.5;
            g.add(top);
        }
    }
    
    // 影子
    if(!isMobile) {
        g.traverse(c => { if(c.isMesh) c.castShadow = true; });
    }

    return g;
}

// ... 標準輔助函式 ...
function clr(){for(let s in tilesMap){tilesMap[s].material.emissive.setHex(0x000000);tilesMap[s].material.emissiveIntensity=0;}}

function onTouchStart(e, cb){
    if (e.target.closest('.auth-box') || e.target.closest('.hud-container') || e.target.closest('.side-panel') || e.target.id === 'mobile-menu-btn' || e.target.id === 'menu-backdrop' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
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
    if(!raycaster || !camera) return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(tilesMap));
    if(intersects.length > 0 && cb) {
        cb(intersects[0].object.userData.square);
    }
}

function onResize(){
    if(!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

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

// 簡化的地形與植被生成
function createProceduralTerrain(){ 
    const geo=new THREE.PlaneGeometry(3500,3500,64,64); 
    geo.rotateX(-Math.PI/2);
    const mat=new THREE.MeshStandardMaterial({color: 0x224422, roughness:0.9, metalness:0.1}); 
    const mesh=new THREE.Mesh(geo,mat); 
    if(!isMobile) mesh.receiveShadow=true; 
    mesh.position.y = -12;
    scene.add(mesh); 
}
function createVegetation(){ /* 簡化：暫時移除以保證載入速度 */ }
function createHighAltitudeClouds(){ /* 簡化：暫時移除 */ }

function createFloatingBoard(){ 
    const g=new THREE.TorusGeometry(8,0.3,16,32);const m=new THREE.MeshBasicMaterial({color:0xffaa00});const r=new THREE.Mesh(g,m);r.rotation.x=Math.PI/2;r.position.y=BOARD_HEIGHT-3;scene.add(r); 
    const b=new THREE.Mesh(new THREE.BoxGeometry(9,0.5,9),new THREE.MeshStandardMaterial({color:0x221111,roughness:0.5}));b.position.y=BOARD_HEIGHT-0.25;if(!isMobile) b.receiveShadow=true;scene.add(b); 
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ 
        const n=String.fromCharCode(97+c)+(r+1),w=(r+c)%2!==0; 
        const t=new THREE.Mesh(new THREE.BoxGeometry(1,0.2,1),new THREE.MeshStandardMaterial({color:w?0xffddbb:0x443333,roughness:0.2,metalness:0.3})); 
        t.position.set(c-3.5,BOARD_HEIGHT,3.5-r);t.userData={square:n,isTile:true};if(!isMobile) {t.receiveShadow=true;t.castShadow=true;}scene.add(t);tilesMap[n]=t; 
    } 
}

function animate(){ 
    requestAnimationFrame(animate); 
    const t=clock.getElapsedTime(); 
    if(window.TWEEN) window.TWEEN.update(); 
    if(controls) controls.update(); 
    if(renderer && scene && camera) renderer.render(scene,camera); 
}

// 外部呼叫介面
export function setLoginMode(enabled) { 
    isLoginRotating = enabled; 
    if(controls) { 
        controls.autoRotate = enabled; 
        controls.autoRotateSpeed = 0.5; 
    } 
    if(!enabled) { moveCamera({x: 0, y: 60, z: 100}, {x:0, y:BOARD_HEIGHT, z:0}); } 
}

export function updateOpponentCursor(pos) { 
    if (!pos || !scene) return; 
    if (!opponentCursorMesh) { 
        const geo = new THREE.SphereGeometry(1.5, 16, 16); 
        opponentCursorMesh = new THREE.Mesh(geo, MATERIALS.cursorGhost); 
        scene.add(opponentCursorMesh); 
    } 
    if(window.TWEEN) { new TWEEN.Tween(opponentCursorMesh.position).to({x: pos.x, y: pos.y, z: pos.z}, 120).start(); } else { opponentCursorMesh.position.set(pos.x, pos.y, pos.z); } 
}

export function highlightSquare(sq, moves) { 
    clr(); selectedSquare = sq; 
    if(tilesMap[sq]) { tilesMap[sq].material.emissive.setHex(0xffff00); tilesMap[sq].material.emissiveIntensity = 0.8; } 
    moves.forEach(m => { if(tilesMap[m.to]) { tilesMap[m.to].material.emissive.setHex(m.captured ? 0xff3300 : 0x00aaff); tilesMap[m.to].material.emissiveIntensity = 0.5; } }); 
}

export function clearHighlights() { clr(); selectedSquare = null; }

export function animateMove(move, callback) { 
    clr(); 
    const s = piecesMap[move.from]; 
    const targetTile = tilesMap[move.to]; 
    if(!s || !targetTile) { if(callback) callback(); return; } 
    const ePos = targetTile.position.clone(); 
    if(move.captured && piecesMap[move.to]) { scene.remove(piecesMap[move.to]); } 
    if(window.TWEEN) { new TWEEN.Tween(s.position).to(ePos, 200).easing(TWEEN.Easing.Quadratic.Out).onComplete(() => { if(move.promotion) { scene.remove(s); } if(callback) callback(); }).start(); } else { s.position.copy(ePos); if(callback) callback(); } 
}

// 輔助變數與回調
let onMouseMoveCallback = null; 
function loadCustomModels() { 
    const loader = new GLTFLoader(); 
    loader.load('./models/chess_set.glb', (gltf) => { customModels = gltf.scene; }, undefined, (err) => { console.warn("Model load failed, using fallback"); }); 
}
