
// ===== Configuration =====
// We are moving away from Socket.IO to local processing
// const socket = io('http://localhost:5000'); 

const connectionStatus = document.getElementById('connection-status');
const modeText = document.getElementById('mode-text');
const modeIndicator = document.getElementById('mode-indicator');
const gridSizeEl = document.getElementById('grid-size');
const cubeCountEl = document.getElementById('cube-count');
const posXEl = document.getElementById('pos-x');
const posYEl = document.getElementById('pos-y');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const vrBtn = document.getElementById('vr-btn');
const vrExitBtn = document.getElementById('vr-exit');
const mainWrap = document.getElementById('main-wrap');
const controlPanel = document.getElementById('control-panel');
const stage = document.getElementById('stage');
const hud = document.getElementById('hud');
const footer = document.getElementById('footer');
const videoElement = document.getElementById('input_video');

// Mock connection status since we are local
connectionStatus.className = 'connection-status connected';
connectionStatus.innerHTML = '<span class="status-indicator active"></span>Running Locally (Client-Side)';

// ===== Three.js Setup =====
const container = document.getElementById('three-root');
const hudCoords = document.getElementById('coords');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827); // Fallback background


const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Camera Feed Texture
const videoTexture = new THREE.VideoTexture(videoElement);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.format = THREE.RGBFormat;

// Create video background planes for each camera (for VR) and mono camera
const videoGeo = new THREE.PlaneGeometry(16, 9);
const videoMat = new THREE.MeshBasicMaterial({ map: videoTexture, depthTest: false, depthWrite: false });

function createBackgroundPlane(camera) {
    const plane = new THREE.Mesh(videoGeo, videoMat);
    plane.position.z = -20;

    // Scale plane to fill the frustum at distance 20
    // h = 2 * tan(fov/2) * dist
    // For 50 deg FOV:
    const dist = 20;
    const vFOV = THREE.MathUtils.degToRad(50);
    const height = 2 * Math.tan(vFOV / 2) * dist;
    const width = height * (16 / 9); // Assuming 16:9 camera aspect

    plane.scale.set(width / 16, height / 9, 1);
    camera.add(plane);
}

// Two cameras for stereo rendering
const cameraLeft = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const cameraRight = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const cameraMono = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
cameraMono.position.set(0, 3, 12);
cameraMono.lookAt(0, 0, 0);

// Add background planes to cameras
createBackgroundPlane(cameraLeft);
createBackgroundPlane(cameraRight);
createBackgroundPlane(cameraMono);

// Add cameras to scene so the attached planes are rendered
scene.add(cameraLeft);
scene.add(cameraRight);
scene.add(cameraMono);

let isVRMode = false;
let eyeSeparation = 0.064; // 64mm default

const ipdSlider = document.getElementById('ipd-slider');
ipdSlider.addEventListener('input', (e) => {
    eyeSeparation = parseFloat(e.target.value);
    console.log('Eye Separation:', eyeSeparation);
});

const hemi = new THREE.HemisphereLight(0x7b92ff, 0x10121a, 0.6);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(5, 8, 3);
dir.castShadow = true;
dir.shadow.camera.left = -15;
dir.shadow.camera.right = 15;
dir.shadow.camera.top = 15;
dir.shadow.camera.bottom = -15;
dir.shadow.mapSize.set(2048, 2048);
scene.add(dir);

// Transparent ground to receive shadows but show camera feed
const groundMat = new THREE.ShadowMaterial({ opacity: 0.5 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2;
ground.receiveShadow = true;
scene.add(ground);

// Cube group for multi-cube management
let cubeGroup = new THREE.Group();
scene.add(cubeGroup);

// Single cube for normal mode
const material = new THREE.MeshStandardMaterial({
    color: 0x7c5cff,
    metalness: 0.3,
    roughness: 0.4
});

let singleCube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
singleCube.castShadow = true;
singleCube.receiveShadow = true;
singleCube.position.y = 0;
scene.add(singleCube);

// Smooth interpolation
let targetSize = 1;
let targetPosX = 0;
let targetPosY = 0;
let targetRotZ = 0;
let targetGridX = 1;
let targetGridY = 1;
let currentMode = 'normal';
const smoothness = 0.15;

// Gyroscope for head tracking
let alpha = 0, beta = 0, gamma = 0;

function handleOrientation(event) {
    if (isVRMode) {
        alpha = event.alpha || 0;
        beta = event.beta || 0;
        gamma = event.gamma || 0;
    }
}

window.addEventListener('deviceorientation', handleOrientation);

function fitToParent() {
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);

    if (isVRMode) {
        // Split screen in half for each eye
        cameraLeft.aspect = (rect.width / 2) / rect.height;
        cameraRight.aspect = (rect.width / 2) / rect.height;
        cameraLeft.updateProjectionMatrix();
        cameraRight.updateProjectionMatrix();
    } else {
        cameraMono.aspect = rect.width / rect.height;
        cameraMono.updateProjectionMatrix();
    }
}

window.addEventListener('resize', fitToParent);
setTimeout(fitToParent, 10);

// Create cube grid
function createCubeGrid(gridX, gridY) {
    while (cubeGroup.children.length > 0) {
        cubeGroup.remove(cubeGroup.children[0]);
    }

    const spacing = 2.2;
    const offsetX = -(gridX - 1) * spacing / 2;
    const offsetY = -(gridY - 1) * spacing / 2;

    for (let x = 0; x < gridX; x++) {
        for (let y = 0; y < gridY; y++) {
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 1.8, 1.8),
                material.clone()
            );
            cube.castShadow = true;
            cube.receiveShadow = true;
            cube.position.set(
                offsetX + x * spacing,
                offsetY + y * spacing,
                0
            );

            const edges = new THREE.EdgesGeometry(cube.geometry);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b2233 });
            const edgeLines = new THREE.LineSegments(edges, edgeMat);
            cube.add(edgeLines);

            cubeGroup.add(cube);
        }
    }
}

createCubeGrid(1, 1);

// ===== VR Mode (Cardboard Split-Screen) =====
vrBtn.addEventListener('click', () => {
    // Request permission for iOS 13+ devices
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    startVR();
                } else {
                    alert('Permission to access device orientation was denied');
                }
            })
            .catch(console.error);
    } else {
        startVR();
    }
});

function startVR() {
    isVRMode = true;

    // Hide UI elements
    document.body.classList.add('vr-active'); // Lock scrolling
    mainWrap.classList.add('vr-mode');
    controlPanel.classList.add('vr-hidden');
    stage.classList.add('vr-mode');
    hud.classList.add('vr-hidden');
    footer.classList.add('vr-hidden');
    vrExitBtn.classList.add('visible');

    // Request fullscreen
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
    }

    // Lock orientation to landscape
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => { });
    }

    // Ensure video is playing
    if (videoElement.paused) {
        videoElement.play().catch(console.error);
    }

    // Delay resize to allow fullscreen transition to complete
    setTimeout(() => {
        fitToParent();
    }, 100);
    setTimeout(() => {
        fitToParent();
    }, 500);

    console.log('🥽 VR Cardboard Mode Activated!');
}

vrExitBtn.addEventListener('click', () => {
    isVRMode = false;

    // Show UI elements
    document.body.classList.remove('vr-active'); // Unlock scrolling
    mainWrap.classList.remove('vr-mode');
    controlPanel.classList.remove('vr-hidden');
    stage.classList.remove('vr-mode');
    hud.classList.remove('vr-hidden');
    footer.classList.remove('vr-hidden');
    vrExitBtn.classList.remove('visible');

    // Exit fullscreen
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    }

    fitToParent();
    console.log('👋 Exited VR Mode');
});

// ===== MediaPipe & Logic =====
function mapValue(value, in_min, in_max, out_min, out_max) {
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function isPinching(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const dist = distance(thumbTip, indexTip);
    // Threshold needs to be tuned for normalized coordinates
    // Assuming 1.0 is full screen width, 0.05 is roughly 5%
    return {
        pinching: dist < 0.05,
        thumb: thumbTip,
        index: indexTip
    };
}

const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0, // 0 = Lite (Fastest), 1 = Full (Default)
    minDetectionConfidence: 0.5, // Lower confidence for speed
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const startCamera = async () => {
    const constraints = {
        video: {
            facingMode: 'environment', // Force back camera
            width: { ideal: 1920 }, // Upgrade to 1080p for sharpness
            height: { ideal: 1080 }
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            processVideo();
        };

        console.log('📹 Camera started with back camera preference');
        startBtn.disabled = true;
        startBtn.textContent = "Camera Running...";
    } catch (err) {
        console.error("Camera start error:", err);
        alert("Could not start camera. \n\n1. Ensure you are using HTTPS.\n2. Allow camera permissions.\n3. If on mobile, use the new https_server.py.");
        startBtn.disabled = false;
        startBtn.textContent = "Start Camera";
    }
};

let lastVideoTime = -1;
let frameCounter = 0;
async function processVideo() {
    if (!videoElement.paused && !videoElement.ended) {
        // Only send if video has advanced
        if (videoElement.currentTime !== lastVideoTime) {
            lastVideoTime = videoElement.currentTime;

            // Throttle: Process only every 3rd frame (approx 10-15 FPS analysis)
            frameCounter++;
            if (frameCounter % 3 === 0) {
                await hands.send({ image: videoElement });
            }
        }
    }
    requestAnimationFrame(processVideo);
}

startBtn.addEventListener('click', startCamera);

stopBtn.addEventListener('click', () => {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    location.reload();
});

function onResults(results) {
    // Update video texture
    // videoTexture.needsUpdate = true; // Three.js handles video texture updates automatically usually

    const handData = {
        mode: 'idle',
        cube_size: 2.0,
        position_x: 0.0,
        position_y: 0.0,
        rotation_z: 0.0,
        grid_x: 1,
        grid_y: 1
    };

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const numHands = results.multiHandLandmarks.length;
        const hand1 = results.multiHandLandmarks[0];

        // Helper: Get Palm Center (Average of Wrist, IndexMCP, PinkyMCP)
        const getPalmCenter = (hand) => {
            const wrist = hand[0];
            const indexMCP = hand[5];
            const pinkyMCP = hand[17];
            return {
                x: (wrist.x + indexMCP.x + pinkyMCP.x) / 3,
                y: (wrist.y + indexMCP.y + pinkyMCP.y) / 3,
                z: (wrist.z + indexMCP.z + pinkyMCP.z) / 3
            };
        };

        if (numHands === 2) {
            const hand2 = results.multiHandLandmarks[1];

            // Check for Pinch (still useful for grid mode, or we can keep it simple)
            const pinch1 = isPinching(hand1);
            const pinch2 = isPinching(hand2);

            if (pinch1.pinching && pinch2.pinching) {
                // ===== PINCH MODE (Grid Generation) =====
                handData.mode = 'pinch';
                // ... (Keep existing pinch logic or simplify? Keeping it for grid feature)
                const p1x = (pinch1.thumb.x + pinch1.index.x) / 2;
                const p1y = (pinch1.thumb.y + pinch1.index.y) / 2;
                const p2x = (pinch2.thumb.x + pinch2.index.x) / 2;
                const p2y = (pinch2.thumb.y + pinch2.index.y) / 2;

                const hDist = Math.abs(p2x - p1x);
                const vDist = Math.abs(p2y - p1y);

                handData.grid_x = Math.max(1, Math.min(8, Math.floor(mapValue(hDist, 0.05, 0.5, 1, 8))));
                handData.grid_y = Math.max(1, Math.min(8, Math.floor(mapValue(vDist, 0.05, 0.4, 1, 8))));

                const cx = (p1x + p2x) / 2;
                const cy = (p1y + p2y) / 2;
                handData.position_x = mapValue(cx, 0, 1, -5, 5);
                handData.position_y = mapValue(cy, 0, 1, 5, -5);

            } else {
                // ===== LEGENDARY TWO-HAND HOLD MODE =====
                // "Energy Ball" style - Cube floats between palms
                handData.mode = 'normal';

                const p1 = getPalmCenter(hand1);
                const p2 = getPalmCenter(hand2);

                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;

                // Distance between palms controls size
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

                // Angle between palms controls rotation
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

                handData.cube_size = Math.max(0.8, Math.min(4.0, mapValue(dist, 0.1, 0.6, 0.8, 4.0)));
                handData.position_x = mapValue(mx, 0, 1, -5, 5);
                handData.position_y = mapValue(my, 0, 1, 5, -5);
                handData.rotation_z = -angle;
            }
        } else if (numHands === 1) {
            // ===== LEGENDARY ONE-HAND PALM MODE =====
            // Cube rests on the palm
            handData.mode = 'normal';

            const p1 = getPalmCenter(hand1);

            // Use wrist to middle finger angle for rotation
            const wrist = hand1[0];
            const middle = hand1[9];
            const angle = Math.atan2(middle.y - wrist.y, middle.x - wrist.x);

            // Z-depth estimation (scale) based on hand size (wrist to middle tip)
            const handSize = distance(wrist, hand1[12]); // 12 is middle tip

            handData.cube_size = mapValue(handSize, 0.1, 0.3, 1.0, 2.5); // Closer hand = Bigger cube
            handData.position_x = mapValue(p1.x, 0, 1, -5, 5);
            handData.position_y = mapValue(p1.y, 0, 1, 5, -5);
            handData.rotation_z = -angle - (Math.PI / 2); // Upright relative to hand
        }
    }

    updateScene(handData);
}

function updateScene(data) {
    if (data.mode === 'pinch') {
        currentMode = 'pinch';
        modeText.textContent = 'Pinch Mode';
        modeIndicator.classList.remove('active');
        modeIndicator.classList.add('pinch');

        singleCube.visible = false;
        cubeGroup.visible = true;

        targetGridX = data.grid_x;
        targetGridY = data.grid_y;
        targetPosX = data.position_x;
        targetPosY = data.position_y;

        gridSizeEl.textContent = `${data.grid_x}x${data.grid_y}`;
        cubeCountEl.textContent = data.grid_x * data.grid_y;
        posXEl.textContent = data.position_x.toFixed(2);
        posYEl.textContent = data.position_y.toFixed(2);

        if (cubeGroup.children.length !== data.grid_x * data.grid_y) {
            createCubeGrid(data.grid_x, data.grid_y);
        }

        hudCoords.innerHTML = `
          Mode: PINCH 🤌<br>
          Grid: ${data.grid_x}x${data.grid_y}<br>
          Position: x:${data.position_x.toFixed(2)} y:${data.position_y.toFixed(2)}
        `;

    } else if (data.mode === 'normal') {
        currentMode = 'normal';
        modeText.textContent = 'Normal Mode';
        modeIndicator.classList.remove('pinch');
        modeIndicator.classList.add('active');

        singleCube.visible = true;
        cubeGroup.visible = false;

        targetSize = data.cube_size / 2;
        targetPosX = data.position_x;
        targetPosY = data.position_y;
        targetRotZ = data.rotation_z;

        gridSizeEl.textContent = '1x1';
        cubeCountEl.textContent = '1';
        posXEl.textContent = data.position_x.toFixed(2);
        posYEl.textContent = data.position_y.toFixed(2);

        hudCoords.innerHTML = `
          Mode: Normal 👋<br>
          Size: ${data.cube_size.toFixed(2)}<br>
          Position: x:${data.position_x.toFixed(2)} y:${data.position_y.toFixed(2)}<br>
          Rotation Z: ${data.rotation_z.toFixed(2)} rad
        `;
    } else {
        modeText.textContent = 'Idle';
        modeIndicator.classList.remove('active', 'pinch');
    }
}

function animate() {
    requestAnimationFrame(animate);

    // Ensure video texture updates
    if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        videoTexture.needsUpdate = true;
    }

    if (currentMode === 'normal') {
        singleCube.scale.x += (targetSize - singleCube.scale.x) * smoothness;
        singleCube.scale.y += (targetSize - singleCube.scale.y) * smoothness;
        singleCube.scale.z += (targetSize - singleCube.scale.z) * smoothness;

        singleCube.position.x += (targetPosX - singleCube.position.x) * smoothness;
        singleCube.position.y += (targetPosY - singleCube.position.y) * smoothness;

        let rotDiff = targetRotZ - singleCube.rotation.z;
        if (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
        if (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
        singleCube.rotation.z += rotDiff * smoothness;

        singleCube.rotation.y += 0.003;
        singleCube.rotation.x += 0.001;

    } else if (currentMode === 'pinch') {
        cubeGroup.position.x += (targetPosX - cubeGroup.position.x) * smoothness;
        cubeGroup.position.y += (targetPosY - cubeGroup.position.y) * smoothness;

        cubeGroup.children.forEach((cube, i) => {
            cube.rotation.y += 0.01;
            cube.rotation.x = Math.sin(Date.now() * 0.001 + i) * 0.1;
        });
    }

    if (isVRMode) {
        // Apply gyroscope rotation to both cameras
        const rotY = THREE.MathUtils.degToRad(alpha);
        const rotX = THREE.MathUtils.degToRad(beta - 90);
        const rotZ = THREE.MathUtils.degToRad(gamma);

        // Update camera positions for stereo effect
        cameraLeft.position.set(-eyeSeparation / 2, 3, 12);
        cameraRight.position.set(eyeSeparation / 2, 3, 12);

        cameraLeft.rotation.set(rotX * 0.5, rotY * 0.5, rotZ * 0.2);
        cameraRight.rotation.set(rotX * 0.5, rotY * 0.5, rotZ * 0.2);

        cameraLeft.lookAt(0, 0, 0);
        cameraRight.lookAt(0, 0, 0);

        // Render split screen - left eye
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, container.clientWidth / 2, container.clientHeight);
        renderer.setViewport(0, 0, container.clientWidth / 2, container.clientHeight);
        renderer.render(scene, cameraLeft);

        // Render split screen - right eye
        renderer.setScissor(container.clientWidth / 2, 0, container.clientWidth / 2, container.clientHeight);
        renderer.setViewport(container.clientWidth / 2, 0, container.clientWidth / 2, container.clientHeight);
        renderer.render(scene, cameraRight);

        renderer.setScissorTest(false);
    } else {
        renderer.render(scene, cameraMono);
    }
}

const ro = new ResizeObserver(() => fitToParent());
ro.observe(container);

animate();