import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const CONFIG = {
    grassCount: isMobile ? 5000 : 80000,
    treeCount: isMobile ? 50 : 850,
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
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xff9966, 0.0008);
    scene.background = new THREE.Color(0x331111);

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

    controls.addEventListener('change', () => {
        if(onCameraUpdate) {
            onCameraUpdate(camera.position);
        }
    });

    setupSunsetLighting();
    loadCustomModels();
    
    requestAnimationFrame(() => {
        createFloatingBoard();
        createProceduralTerrain();
        setTimeout(createVegetation, 50);
        setTimeout(createHighAltitudeClouds, 100);
    });

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener('resize', onResize);
    window.addEventListener('touchstart', (e) => onTouchStart(e, onClickCallback), {passive: false});
    window.addEventListener('click', (e) => onMouseClick(e, onClickCallback));
    window.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_HEIGHT);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);
        if (target && onMouseMoveCallback) onMouseMoveCallback(target);
    });

    animate();
    
    return { scene, camera, controls, moveCamera, updateTheme, setLoginMode, updateOpponentGhost: updateOpponentCursor, setGameMode, syncBoardVisuals, animateMove, highlightSquare, clearHighlights };
}

export function setGameMode(mode) {
    currentGameMode = mode;
    const toRemove = [];
    scene.traverse(child => {
        if(child.userData.isTile || child.userData.isPiece || child.userData.isBoardBase) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(obj => scene.remove(obj));
    tilesMap = {}; 
    piecesMap = {};

    if (mode === '4p') {
        createCrossBoard();
        moveCamera({x:0, y:80, z:120}, {x:0, y:BOARD_HEIGHT, z:0});
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

export function syncBoardVisuals(gameInstance, is4P = false) {
    if(!window.gameInstance) window.gameInstance = gameInstance;

    for(let sq in piecesMap) { scene.remove(piecesMap[sq]); }
    piecesMap = {};

    if (is4P) {
        const board = gameInstance.getBoard();
        for(let r=0; r<14; r++) {
            for(let c=0; c<14; c++) {
                const p = board[r][c];
                if (p && p !== 'X') {
                    const size = 14;
                    const offset = size / 2 - 0.5;
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

    const body = new THREE.Mesh(GEOMETRIES.pawnBody, mat);
    body.position.y = 0.5; if(!isMobile) body.castShadow = true;
    const head = new THREE.Mesh(GEOMETRIES.pawnHead, mat);
    head.position.y = 0.95; if(!isMobile) head.castShadow = true;
    g.add(body, head);

    return g;
}

function clr(){for(let s in tilesMap){tilesMap[s].material.emissive.setHex(0x000000);tilesMap[s].material.emissiveIntensity=0;}}

function onTouchStart(e, cb){
    if (e.target.closest('.auth-box') || 
        e.target.closest('.hud-container') || 
        e.target.closest('.side-panel') || 
        e.target.id === 'mobile-menu-btn' || 
        e.target.id === 'menu-backdrop' || 
        e.target.tagName === 'INPUT' || 
        e.target.tagName === 'BUTTON' || 
        e.target.tagName === 'SELECT') {
            return; 
    }
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
    if(intersects.length > 0 && cb) {
        cb(intersects[0].object.userData.square);
    }
}

function onResize(){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);}
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
function getTerrainHeight(x, z) { const dist = Math.sqrt(x*x + z*z); if (dist < 400) return -12 + Math.sin(x*0.004)*Math.cos(z*0.004)*2.0; const blend = smoothstep(400, 700, dist); let h = blend * 140; h += Math.sin(x * 0.015) * Math.cos(z * 0.015) * 25; h += Math.sin(x * 0.03 + z * 0.02) * 10; return h - 12; }
function smoothstep(min, max, value) { var x = Math.max(0, Math.min(1, (value - min) / (max - min))); return x * x * (3 - 2 * x); }
function createProceduralTerrain(){ const geo=new THREE.PlaneGeometry(3500,3500,isMobile?100:180,isMobile?100:180); geo.rotateX(-Math.PI/2); const pos=geo.attributes.position; const colors=[]; const c1=new THREE.Color(0x226622);const c2=new THREE.Color(0x665544); for(let i=0;i<pos.count;i++){ const h=getTerrainHeight(pos.getX(i),pos.getZ(i)); pos.setY(i,h); const b=smoothstep(-12,8,h); const c=c1.clone().lerp(c2,b); colors.push(c.r,c.g,c.b); } geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geo.computeVertexNormals(); const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9,metalness:0.1,flatShading:true}); const mesh=new THREE.Mesh(geo,mat); if(!isMobile) mesh.receiveShadow=true; scene.add(mesh); }
function createVegetation(){ const grp=new THREE.Group(); const lMat=new THREE.MeshStandardMaterial({color:0x1a3d1a,roughness:0.9,flatShading:true});const tMat=new THREE.MeshStandardMaterial({color:0x3d2817,roughness:1.0});const lGeo=new THREE.DodecahedronGeometry(4,0);const tGeo=new THREE.CylinderGeometry(0.7,1.0,6,6);tGeo.translate(0,3,0);for(let i=0;i<CONFIG.treeCount;i++){const a=Math.random()*Math.PI*2;const r=70+Math.random()*380;const x=Math.cos(a)*r;const z=Math.sin(a)*r;const h=getTerrainHeight(x,z);const tr=new THREE.Group();const t=new THREE.Mesh(tGeo,tMat);if(!isMobile) t.castShadow=true;tr.add(t);for(let j=0;j<3;j++){const l=new THREE.Mesh(lGeo,lMat);l.position.set((Math.random()-0.5)*5,5.5+Math.random()*3.5,(Math.random()-0.5)*5);l.scale.setScalar(0.8+Math.random()*0.4);if(!isMobile) l.castShadow=true;tr.add(l);}tr.position.set(x,h,z);tr.scale.setScalar(0.9+Math.random()*0.6);grp.add(tr);}scene.add(grp); const bGeo=new THREE.PlaneGeometry(0.3,1.5);bGeo.translate(0,0.75,0); grassMat=new THREE.MeshStandardMaterial({color:0x226622,side:THREE.DoubleSide}); grassMat.onBeforeCompile=s=>{s.uniforms.time={value:0};s.vertexShader=`uniform float time;\n`+s.vertexShader;s.vertexShader=s.vertexShader.replace(`#include <begin_vertex>`,`vec3 transformed=vec3(position);float w=sin(time*1.5+position.x*0.5)*0.2*position.y;transformed.x+=w;#include <begin_vertex>`);grassMat.userData.shader=s;}; const iG=new THREE.InstancedMesh(bGeo,grassMat,CONFIG.grassCount); const dummy=new THREE.Object3D();let c=0; for(let i=0;i<100000;i++){ if(c>=CONFIG.grassCount)break; const r=Math.random()*420;const a=Math.random()*Math.PI*2;const x=Math.cos(a)*r;const z=Math.sin(a)*r;const h=getTerrainHeight(x,z); if(h<-8){dummy.position.set(x,h,z);dummy.rotation.y=Math.random()*Math.PI;dummy.scale.setScalar(0.7+Math.random()*0.6);dummy.updateMatrix();iG.setMatrixAt(c++,dummy.matrix);} } if(!isMobile) iG.receiveShadow=true; scene.add(iG); }
function createHighAltitudeClouds(){ const cv=document.createElement('canvas');cv.width=128;cv.height=128; const cx=cv.getContext('2d'),g=cx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,180,120,0.5)');g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(0,0,128,128); const mat=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}); const gp=new THREE.Group(); for(let i=0;i<(isMobile?25:45);i++){ const cl=new THREE.Group(); for(let j=0;j<15;j++){const p=new THREE.Sprite(mat);p.position.set((Math.random()-0.5)*50,(Math.random()-0.5)*20,(Math.random()-0.5)*50);p.scale.setScalar(40+Math.random()*40);cl.add(p);} cl.position.set((Math.random()-0.5)*3200,250+Math.random()*150,(Math.random()-0.5)*3200);gp.add(cl);cloudParticles.push(cl);}scene.add(gp); }
function createFloatingBoard(){ const g=new THREE.TorusGeometry(8,0.3,16,32);const m=new THREE.MeshBasicMaterial({color:0xffaa00});const r=new THREE.Mesh(g,m);r.rotation.x=Math.PI/2;r.position.y=BOARD_HEIGHT-3;scene.add(r); const b=new THREE.Mesh(new THREE.BoxGeometry(9,0.5,9),new THREE.MeshStandardMaterial({color:0x221111,roughness:0.5}));b.position.y=BOARD_HEIGHT-0.25;if(!isMobile) b.receiveShadow=true;scene.add(b); for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const n=String.fromCharCode(97+c)+(r+1),w=(r+c)%2!==0; const t=new THREE.Mesh(new THREE.BoxGeometry(1,0.2,1),new THREE.MeshStandardMaterial({color:w?0xffddbb:0x443333,roughness:0.2,metalness:0.3})); t.position.set(c-3.5,BOARD_HEIGHT,3.5-r);t.userData={square:n,isTile:true};if(!isMobile) {t.receiveShadow=true;t.castShadow=true;}scene.add(t);tilesMap[n]=t; } }
function animate(){ requestAnimationFrame(animate); const t=clock.getElapsedTime(); if(window.TWEEN) window.TWEEN.update(); controls.update(); if(grassMat&&grassMat.userData.shader)grassMat.userData.shader.uniforms.time.value=t; cloudParticles.forEach(c=>{c.rotation.y+=0.0003;}); renderer.render(scene,camera); }

export function setLoginMode(enabled) { isLoginRotating = enabled; if(controls) { controls.autoRotate = enabled; controls.autoRotateSpeed = 0.5; } if(!enabled) { moveCamera({x: 0, y: 60, z: 100}, {x:0, y:BOARD_HEIGHT, z:0}); } }
export function updateOpponentCursor(pos) { if (!pos) return; if (!opponentCursorMesh) { const geo = new THREE.SphereGeometry(1.5, 16, 16); opponentCursorMesh = new THREE.Mesh(geo, MATERIALS.cursorGhost); scene.add(opponentCursorMesh); const light = new THREE.PointLight(0xffaa00, 1, 10); opponentCursorMesh.add(light); } if(window.TWEEN) { new TWEEN.Tween(opponentCursorMesh.position).to({x: pos.x, y: pos.y, z: pos.z}, 120).start(); } else { opponentCursorMesh.position.set(pos.x, pos.y, pos.z); } }
export function highlightSquare(sq, moves) { clr(); selectedSquare = sq; if(tilesMap[sq]) { tilesMap[sq].material.emissive.setHex(0xffff00); tilesMap[sq].material.emissiveIntensity = 0.8; } moves.forEach(m => { if(tilesMap[m.to]) { tilesMap[m.to].material.emissive.setHex(m.captured ? 0xff3300 : 0x00aaff); tilesMap[m.to].material.emissiveIntensity = 0.5; } }); }
export function clearHighlights() { clr(); selectedSquare = null; }
export function animateMove(move, callback) { clr(); const s = piecesMap[move.from]; const targetTile = tilesMap[move.to]; if(!s || !targetTile) { if(callback) callback(); return; } const ePos = targetTile.position.clone(); if(move.captured && piecesMap[move.to]) { scene.remove(piecesMap[move.to]); } if(window.TWEEN) { new TWEEN.Tween(s.position).to(ePos, 200).easing(TWEEN.Easing.Quadratic.Out).onComplete(() => { if(move.promotion) { scene.remove(s); } if(callback) callback(); }).start(); } else { s.position.copy(ePos); if(callback) callback(); } }
