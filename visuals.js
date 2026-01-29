import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

let scene, camera, renderer, controls, raycaster, mouse;
let tilesMap = {}, piecesMap = {};
let currentGameMode = '2p';

// 簡單材質
const MAT = {
    white: new THREE.MeshStandardMaterial({color: 0xeeeeff}),
    black: new THREE.MeshStandardMaterial({color: 0x333333}),
    red: new THREE.MeshStandardMaterial({color: 0xff3333}),
    blue: new THREE.MeshStandardMaterial({color: 0x3333ff}),
    yellow: new THREE.MeshStandardMaterial({color: 0xffff33}),
    green: new THREE.MeshStandardMaterial({color: 0x33ff33}),
    tileW: new THREE.MeshStandardMaterial({color: 0xffddbb}),
    tileB: new THREE.MeshStandardMaterial({color: 0x664444}),
    highlight: new THREE.MeshStandardMaterial({color: 0xffff00, emissive: 0x555500})
};

const GEO = {
    box: new THREE.BoxGeometry(0.8, 1, 0.8),
    cyl: new THREE.CylinderGeometry(0.4, 0.4, 1, 16),
    tile: new THREE.BoxGeometry(1, 0.2, 1)
};

export function init3D(container, onClick) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 20);

    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(10, 20, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // 觸控事件
    window.addEventListener('touchstart', (e) => handleInput(e.touches[0], onClick), {passive:false});
    window.addEventListener('mousedown', (e) => handleInput(e, onClick));

    createBoard2P();
    animate();
}

function handleInput(e, cb) {
    if(e.target.closest('#ui') || e.target.closest('#auth-modal') || e.target.closest('.side-panel')) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(tilesMap));
    if(intersects.length > 0 && cb) cb(intersects[0].object.userData.sq);
}

function animate() {
    requestAnimationFrame(animate);
    if(window.TWEEN) window.TWEEN.update();
    controls.update();
    renderer.render(scene, camera);
}

export function setLoginMode(enabled) {
    controls.autoRotate = enabled;
}

export function setGameMode(mode) {
    currentGameMode = mode;
    clearScene();
    if(mode === '4p') createBoard4P();
    else createBoard2P();
}

function clearScene() {
    for(let k in tilesMap) scene.remove(tilesMap[k]);
    for(let k in piecesMap) scene.remove(piecesMap[k]);
    tilesMap = {}; piecesMap = {};
}

function createBoard2P() {
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const sq = String.fromCharCode(97+c)+(8-r);
            const t = new THREE.Mesh(GEO.tile, (r+c)%2? MAT.tileW : MAT.tileB);
            t.position.set(c-3.5, 0, r-3.5);
            t.userData = { sq: sq };
            scene.add(t);
            tilesMap[sq] = t;
        }
    }
}

function createBoard4P() {
    const size = 14;
    const offset = size/2 - 0.5;
    for(let r=0; r<size; r++) {
        for(let c=0; c<size; c++) {
            if((r<3 || r>10) && (c<3 || c>10)) continue; // 挖空角落
            const t = new THREE.Mesh(GEO.tile, (r+c)%2? MAT.tileW : MAT.tileB);
            t.position.set(c-offset, 0, offset-r);
            t.userData = { sq: {r,c} };
            scene.add(t);
            tilesMap[`${r},${c}`] = t;
        }
    }
    camera.position.set(0, 30, 30);
}

export function syncBoardVisuals(gameInstance, is4P=false) {
    for(let k in piecesMap) scene.remove(piecesMap[k]);
    piecesMap = {};

    if(is4P) {
        const board = gameInstance.getBoard();
        const size = 14, offset = size/2 - 0.5;
        for(let r=0; r<size; r++) {
            for(let c=0; c<size; c++) {
                const p = board[r][c];
                if(p && p!=='X') {
                    const m = new THREE.Mesh(GEO.cyl, MAT[p.color] || MAT.white);
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
                    const m = new THREE.Mesh(GEO.cyl, p.color==='w'? MAT.white : MAT.black);
                    m.position.set(c-3.5, 0.6, r-3.5);
                    scene.add(m);
                    piecesMap[sq] = m;
                }
            }
        }
    }
}

export function animateMove(move, cb) {
    // 簡單位移
    const p = piecesMap[move.from];
    const t = tilesMap[move.to];
    if(p && t) {
        p.position.x = t.position.x;
        p.position.z = t.position.z;
    }
    if(cb) cb();
}

export function highlightSquare(sq) { /* 暫略 */ }
export function clearHighlights() {}
export function updateOpponentGhost() {}
export function moveCamera(pos) { camera.position.set(pos.x, pos.y, pos.z); }
export function updateTheme() {}
