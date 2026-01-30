// 將原本的 setupSunsetLighting 刪除，換成這個：
function setupNeonLighting() {
    // 1. 將背景設為純黑，讓霓虹光更明顯
    scene.background = new THREE.Color(0x050505);
    
    // 2. 黑色霧氣，讓遠處物體漸隱於黑暗
    scene.fog = new THREE.FogExp2(0x050505, 0.003);

    // 3. 微弱的環境光 (深藍色)，模擬夜光
    const ambient = new THREE.AmbientLight(0x111122, 0.5); 
    scene.add(ambient);

    // 4. 主光源：上方投射下來的冷白光 (製造棋子陰影)
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(50, 100, 50);
    if (!isMobile) {
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
    }
    scene.add(mainLight);

    // 5. 霓虹氛圍光：添加兩個彩色光源來渲染氣氛
    // 青色霓虹光 (從左側打入)
    const neonBlue = new THREE.PointLight(0x00e5ff, 1.5, 200);
    neonBlue.position.set(-50, 20, 0);
    scene.add(neonBlue);

    // 紫紅色霓虹光 (從右側打入)
    const neonPink = new THREE.PointLight(0xff0055, 1.5, 200);
    neonPink.position.set(50, 20, 0);
    scene.add(neonPink);
    
    // 注意：原本的 Sky (天空盒) 移除，因為它會讓畫面變白
}
