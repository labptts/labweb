import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap } from 'gsap';

// ==========================================
// 1. Сцена, камера, рендерер (Premium CG)
// ==========================================

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000308, 0.012);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(0, 0, 0.001);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. Post-processing — Bloom
// ==========================================

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,   // strength
  0.4,   // radius
  0.2    // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ==========================================
// 3. OrbitControls — кинематографичное вращение
// ==========================================

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.rotateSpeed = 0.35;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.15;

// ==========================================
// 4. Освещение (трёхточечное)
// ==========================================

const ambientLight = new THREE.AmbientLight(0x1a1a3e, 0.5);
scene.add(ambientLight);

const keyLight = new THREE.PointLight(0x6c63ff, 80, 100);
keyLight.position.set(10, 10, 10);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xff6ec7, 40, 80);
fillLight.position.set(-15, -5, -10);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x00d4ff, 60, 100);
rimLight.position.set(0, 15, -15);
scene.add(rimLight);

// ==========================================
// 5. Звёздное поле (многослойное)
// ==========================================

function createStarLayer(count, minR, maxR, size, color, opacity) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = minR + Math.random() * (maxR - minR);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

scene.add(createStarLayer(600, 60, 180, 0.6, 0xffffff, 1.0));
scene.add(createStarLayer(1200, 50, 200, 0.35, 0xaaccff, 0.7));
scene.add(createStarLayer(3000, 40, 220, 0.15, 0x8888cc, 0.4));

// ==========================================
// 6. Космическая пыль / туманности
// ==========================================

function createNebulaDust() {
  const count = 800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const palette = [
    new THREE.Color(0x6c63ff),
    new THREE.Color(0xff6ec7),
    new THREE.Color(0x00d4ff),
    new THREE.Color(0x1a1a3e),
  ];

  for (let i = 0; i < count; i++) {
    const r = 15 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

const nebula = createNebulaDust();
scene.add(nebula);

// ==========================================
// 7. Видео-текстура
// ==========================================

const video = document.createElement('video');
video.src = '/test_preview.mp4';
video.crossOrigin = 'anonymous';
video.loop = true;
video.muted = true;
video.playsInline = true;
video.play().catch(() => {
  document.addEventListener('click', () => video.play(), { once: true });
});

const videoTexture = new THREE.VideoTexture(video);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.colorSpace = THREE.SRGBColorSpace;

// ==========================================
// 8. Billboard-текст (Sprite — всегда к камере)
// ==========================================

function createTextSprite(line1, line2) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Линия 1 — крупный жирный
  ctx.font = '700 64px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(108, 99, 255, 0.8)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line1, 256, 90);

  // Линия 2 — тонкий, tracking
  ctx.font = '300 40px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.shadowColor = 'rgba(108, 99, 255, 0.4)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(line2, 256, 165);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.5, 1.75, 1);
  return sprite;
}

// ==========================================
// 9. Кольца свечения
// ==========================================

function createGlowRing(radius, color, innerMult, outerMult, opacity) {
  const geometry = new THREE.RingGeometry(radius * innerMult, radius * outerMult, 64);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

// ==========================================
// 10. Генерация 5 сфер проектов
// ==========================================

const SPHERE_COUNT = 5;
const SPHERE_RADIUS = 1.2;
const ORBIT_DISTANCE = 12;

const projects = Array.from({ length: SPHERE_COUNT }, (_, i) => ({
  name: `Project ${i + 1}`,
  client: 'Client',
  subtitle: 'Test',
}));

const spheres = [];
const sphereGroups = [];

projects.forEach((project, i) => {
  const group = new THREE.Group();

  // Равномерное распределение (Фибоначчи)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * i) / (SPHERE_COUNT - 1);
  const radiusAtY = Math.sqrt(1 - y * y);
  const theta = goldenAngle * i;

  const x = radiusAtY * Math.cos(theta) * ORBIT_DISTANCE;
  const z = radiusAtY * Math.sin(theta) * ORBIT_DISTANCE;
  const posY = y * ORBIT_DISTANCE;

  group.position.set(x, posY, z);

  // Сфера — стеклянный материал с видео
  const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
  const material = new THREE.MeshPhysicalMaterial({
    map: videoTexture,
    roughness: 0.1,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 0.9,
    envMapIntensity: 1.5,
    ior: 1.5,
    emissive: new THREE.Color(0x1a1a3e),
    emissiveIntensity: 0.15,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = project;
  group.add(mesh);

  // Внутреннее кольцо (фиолетовое)
  const ringInner = createGlowRing(SPHERE_RADIUS, 0x6c63ff, 1.3, 1.35, 0.25);
  ringInner.rotation.x = Math.PI / 2;
  group.add(ringInner);

  // Внешнее кольцо (голубое)
  const ringOuter = createGlowRing(SPHERE_RADIUS, 0x00d4ff, 1.5, 1.53, 0.1);
  ringOuter.rotation.x = Math.PI * 0.6;
  ringOuter.rotation.y = Math.PI * 0.3;
  group.add(ringOuter);

  // Billboard текст (под сферой)
  const label = createTextSprite(project.client, project.subtitle);
  label.position.set(0, -(SPHERE_RADIUS + 1.3), 0);
  group.add(label);

  group.userData = {
    baseY: posY,
    phase: i * ((Math.PI * 2) / SPHERE_COUNT),
    ringInner,
    ringOuter,
  };

  scene.add(group);
  spheres.push(mesh);
  sphereGroups.push(group);
});

// ==========================================
// 11. Raycaster и взаимодействие
// ==========================================

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredSphere = null;

function updatePointer(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (event) => {
  updatePointer(event.clientX, event.clientY);
});

function checkHover() {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(spheres);
  const target = intersects.length > 0 ? intersects[0].object : null;

  if (hoveredSphere && hoveredSphere !== target) {
    const prevGroup = hoveredSphere.parent;
    gsap.to(prevGroup.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.out' });
    gsap.to(prevGroup.userData.ringInner.material, { opacity: 0.25, duration: 0.4 });
    gsap.to(prevGroup.userData.ringOuter.material, { opacity: 0.1, duration: 0.4 });
    renderer.domElement.style.cursor = 'default';
  }

  if (target && target !== hoveredSphere) {
    const group = target.parent;
    gsap.to(group.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.5, ease: 'power2.out' });
    gsap.to(group.userData.ringInner.material, { opacity: 0.7, duration: 0.4 });
    gsap.to(group.userData.ringOuter.material, { opacity: 0.4, duration: 0.4 });
    renderer.domElement.style.cursor = 'pointer';
  }

  hoveredSphere = target;
}

function onClickOrTouch(clientX, clientY) {
  updatePointer(clientX, clientY);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(spheres);

  if (intersects.length > 0) {
    const { name, client, subtitle } = intersects[0].object.userData;
    showModal(name, `${client} — ${subtitle}`);
  }
}

renderer.domElement.addEventListener('click', (e) => {
  onClickOrTouch(e.clientX, e.clientY);
});

renderer.domElement.addEventListener('touchend', (e) => {
  if (e.changedTouches.length > 0) {
    const touch = e.changedTouches[0];
    onClickOrTouch(touch.clientX, touch.clientY);
  }
});

// ==========================================
// 12. Модальное окно
// ==========================================

const modalOverlay = document.getElementById('modal-overlay');
const modalText = document.getElementById('modal-text');
const modalClose = document.getElementById('modal-close');

function showModal(projectName, clientName) {
  modalText.textContent = `${projectName} — ${clientName}`;
  modalOverlay.classList.add('active');
}

function hideModal() {
  modalOverlay.classList.remove('active');
}

modalClose.addEventListener('click', hideModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) hideModal();
});

// ==========================================
// 13. Адаптивность
// ==========================================

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
});

// ==========================================
// 14. Анимация (кинематографичная)
// ==========================================

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  // Левитация сфер («дыхание»)
  sphereGroups.forEach((group) => {
    const { baseY, phase, ringInner, ringOuter } = group.userData;
    group.position.y = baseY + Math.sin(elapsed * 0.4 + phase) * 0.5;

    // Вращение колец
    ringInner.rotation.z = elapsed * 0.2 + phase;
    ringOuter.rotation.z = -elapsed * 0.15 + phase;
  });

  // Медленное движение туманности
  nebula.rotation.y = elapsed * 0.01;
  nebula.rotation.x = Math.sin(elapsed * 0.005) * 0.02;

  // Движение источников света
  keyLight.position.x = 10 * Math.cos(elapsed * 0.1);
  keyLight.position.z = 10 * Math.sin(elapsed * 0.1);
  fillLight.position.y = -5 + Math.sin(elapsed * 0.15) * 3;

  controls.update();
  checkHover();
  composer.render();
}

animate();
