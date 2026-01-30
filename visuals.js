// 新增：對手視角幽靈球 (Ghost Cursor)
let opponentCursorMesh = null;

export function updateOpponentGhost(pos) {
    if (!pos) return;
    if (!scene) return; 

    if (!opponentCursorMesh) {
        // 創建一個發光的球體代表對手
        const geo = new THREE.SphereGeometry(2, 16, 16); 
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffaa00, 
            transparent: true, 
            opacity: 0.4,
            wireframe: true
        });
        opponentCursorMesh = new THREE.Mesh(geo, mat);
        scene.add(opponentCursorMesh);
    }

    // 使用 Tween 讓移動更平滑
    if(window.TWEEN) {
        new TWEEN.Tween(opponentCursorMesh.position)
            .to({x: pos.x, y: pos.y, z: pos.z}, 120) 
            .start();
    } else {
        opponentCursorMesh.position.set(pos.x, pos.y, pos.z);
    }
}

