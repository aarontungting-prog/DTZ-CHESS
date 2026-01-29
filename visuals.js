import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls, raycaster, mouse;
let tilesMap = {}, piecesMap = {};
let is4P = false;
let currentSettings = { pieceStyle: 'neon', boardStyle: 'neon' };
let opponentCursorMesh = null;

const MAT = {
    w: new THREE.MeshStandardMaterial({color: 0xeeeeff, roughness:0.2}),
    b: new THREE.MeshStandardMaterial({color: 0x333333, roughness:0.3}),
    red: new THREE.MeshStandardMaterial({color: 0xff3333}),
    blue: new THREE.MeshStandardMaterial({color: 0x3333ff}),
    yellow: new THREE.MeshStandardMaterial({color: 0xffff33}),
    green: new THREE.MeshStandardMaterial({color: 0x33ff33}),
    tileW: new THREE.MeshStandardMaterial({color: 0xffddbb, roughness:0.5}),
    tileB: new THREE.MeshStandardMaterial({color: 0x664444, roughness:0.5}),
    tileNeonW: new THREE.MeshStandardMaterial({color: 0x00ffff, emissive:0x004444, transparent:true, opacity:0.3}),
    tileNeonB: new THREE.MeshStandardMaterial({color: 0x000000, roughness:0.1}),
    high: new THREE.MeshStandardMaterial({color: 0xffff00, emissive:0x555500}),
    cursor: new THREE.MeshBasicMaterial({color: 0xffaa00, transparent: true, opacity: 0.6})
};

const GEO = {
    cyl: new THREE.CylinderGeometry(0.35, 0.35, 1, 16),
    tile: new THREE.BoxGeometry(1, 0.2, 1),
    sphere: new THREE.SphereGeometry(0.3)
};

export function isInitialized() {
    return !!scene;
}

export function init3D(container, onClick, onCam) {
    if(scene) return; // 防止重複初始化

    try {
        console.log("3D Starting...");
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 1000);
        camera.position.set(0, 15, 12);

        renderer = new THREE.WebGLRenderer({antialias:true});
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(5, 10, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x505050));

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0,0,0);
        if(onCam) controls.addEventListener('change', () => onCam(camera.position));

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth/window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        window.addEventListener('mousedown', (e) => {
            if(e.target.tagName !== 'CANVAS') return;
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(Object.values(tilesMap));
            if(intersects.length > 0 && onClick) onClick(intersects[0].object.userData.sq);
        });
        
        createBoard2P();
        animate();
    } catch(e) {
        console.error("3D Init Failed", e);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if(window.TWEEN) window.TWEEN.update();
    if(controls) controls.update();
    if(renderer && scene && camera) renderer.render(scene, camera);
}

// ✨✨ 這裡加了防禦，保證 scene 存在才執行 ✨✨
export function setGameMode(mode) {
    if(!scene) return;
    is4P = (mode === '4p');
    for(let k in tilesMap) scene.remove(tilesMap[k]);
    for(let k in piecesMap) scene.remove(piecesMap[k]);
    tilesMap = {}; piecesMap = {};
    if(is4P) { createBoard4P(); camera.position.set(0, 25, 20); }
    else { createBoard2P(); camera.position.set(0, 15, 12); }
}

function createBoard2P() {
    if(!scene) return;
    const matW = currentSettings.boardStyle === 'neon' ? MAT.tileNeonW : MAT.tileW;
    const matB = currentSettings.boardStyle === 'neon' ? MAT.tileNeonB : MAT.tileB;
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const sq = String.fromCharCode(97+c)+(8-r);
            const t = new THREE.Mesh(GEO.tile, (r+c)%2? matW : matB);
            t.position.set(c-3.5, 0, r-3.5);
            t.userData = {sq:sq};
            scene.add(t);
            tilesMap[sq] = t;
        }
    }
}

function createBoard4P() {
    if(!scene) return;
    const size = 14, offset = size/2 - 0.5;
    const matW = currentSettings.boardStyle === 'neon' ? MAT.tileNeonW : MAT.tileW;
    const matB = currentSettings.boardStyle === 'neon' ? MAT.tileNeonB : MAT.tileB;
    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            if((r<3||r>10) && (c<3||c>10)) continue;
            const t = new THREE.Mesh(GEO.tile, (r+c)%2? matW : matB);
            t.position.set(c-offset, 0, offset-r);
            t.userData = {sq:{r,c}};
            scene.add(t);
            tilesMap[`${r},${c}`] = t;
        }
    }
}

export function syncBoardVisuals(gameInstance, is4P=false) {
    if(!scene) return; // ⚠️ 防禦
    for(let k in piecesMap) scene.remove(piecesMap[k]);
    piecesMap = {};

    if(is4P) {
        const b = gameInstance.getBoard();
        const size=14, offset=size/2-0.5;
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                const p = b[r][c];
                if(p && p!=='X') {
                    const m = createPiece(p.type, p.color);
                    m.position.set(c-offset, 0.6, offset-r);
                    scene.add(m);
                    piecesMap[`${r},${c}`] = m;
                }
            }
        }
    } else {
        const b = gameInstance.board();
        for(let r=0; r<8; r++) {
            for(let c=0; c<8; c++) {
                const p = b[r][c];
                if(p) {
                    const sq = String.fromCharCode(97+c)+(8-r);
                    const m = createPiece(p.type, p.color);
                    m.position.set(c-3.5, 0.6, r-3.5);
                    scene.add(m);
                    piecesMap[sq] = m;
                }
            }
        }
    }
}

function createPiece(type, color) {
    let mat = MAT.white;
    if(color === 'b') mat = MAT.black;
    else if(color === 'red') mat = MAT.red;
    else if(color === 'blue') mat = MAT.blue;
    else if(color === 'yellow') mat = MAT.yellow;
    else if(color === 'green') mat = MAT.green;

    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.cyl, mat);
    body.position.y = 0;
    g.add(body);

    if(type === 'p') {
        const head = new THREE.Mesh(GEO.sphere, mat);
        head.position.y = 0.6; g.add(head);
    }
    return g;
}

export function animateMove(move, cb) {
    let p, tPos;
    if(move.from.r !== undefined) { 
        p = piecesMap[`${move.from.r},${move.from.c}`];
        tPos = tilesMap[`${move.to.r},${move.to.c}`]?.position;
    } else { 
        p = piecesMap[move.from];
        tPos = tilesMap[move.to]?.position;
    }
    if(p && tPos) {
        if(window.TWEEN) new TWEEN.Tween(p.position).to({x:tPos.x, z:tPos.z}, 200).onComplete(cb).start();
        else { p.position.set(tPos.x, 0.6, tPos.z); cb(); }
    } else if(cb) cb();
}

export function highlightSquare(sq) {
    if(!scene) return;
    if(tilesMap[sq]) tilesMap[sq].material = MAT.high;
}

export function clearHighlights() {
    if(!scene) return;
    const matW = currentSettings.boardStyle === 'neon' ? MAT.tileNeonW : MAT.tileW;
    const matB = currentSettings.boardStyle === 'neon' ? MAT.tileNeonB : MAT.tileB;
    for(let k in tilesMap) {
        // 簡單重置
        if(k.indexOf(',')>-1) tilesMap[k].material = matB; // 4p 簡化
        else tilesMap[k].material = (k.charCodeAt(0)+k.charCodeAt(1))%2 ? matW : matB;
    }
}

export function updateTheme(settings) {
    if(settings.boardStyle) {
        currentSettings.boardStyle = settings.boardStyle;
        if(scene) {
            if(is4P) createBoard4P(); else createBoard2P();
            if(window.gameInstance) syncBoardVisuals(window.gameInstance, is4P);
        }
    }
}

export function setLoginMode(enabled) { if(controls) controls.autoRotate = enabled; }
export function updateOpponentGhost(pos) {
    if(!pos || !scene) return;
    if(!opponentCursorMesh) {
        opponentCursorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5), MAT.cursor);
        scene.add(opponentCursorMesh);
    }
    opponentCursorMesh.position.copy(pos);
}

export function moveCamera(pos) {
    if(!camera) return;
    if(window.TWEEN) new TWEEN.Tween(camera.position).to(pos, 1000).start();
    else camera.position.copy(pos);
}
