import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';

// ==========================================
// 1. Сцена, камера, рендерер
// ==========================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 0.001); // Небольшой сдвиг, чтобы OrbitControls работал корректно

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. OrbitControls — только вращение
// ==========================================

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;   // Запрет приближения
controls.enablePan = false;    // Запрет смещения
controls.enableDamping = true; // Плавное торможение
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.5;

// ==========================================
// 3. Звёздное поле (Skybox из частиц)
// ==========================================

function createStarField() {
  const count = 2000;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 80 + Math.random() * 120; // Расстояние от центра
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.4,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

scene.add(createStarField());

// ==========================================
// 4. Видео-текстура (общий плейсхолдер)
// ==========================================

const video = document.createElement('video');
video.src = './test_preview.mp4';
video.crossOrigin = 'anonymous';
video.loop = true;
video.muted = true;
video.playsInline = true;
video.play().catch(() => {
  // Автовоспроизведение может быть заблокировано — начнём по клику
  document.addEventListener('click', () => video.play(), { once: true });
});

const videoTexture = new THREE.VideoTexture(video);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.colorSpace = THREE.SRGBColorSpace;

// ==========================================
// 5. Генерация сфер проектов
// ==========================================

const SPHERE_COUNT = 10;
const SPHERE_RADIUS = 1;
const ORBIT_DISTANCE = 11; // Расстояние от центра (10–12 единиц)

const projects = Array.from({ length: SPHERE_COUNT }, (_, i) => ({
  name: `Project ${i + 1}`,
  client: `Client ${i + 1}`,
}));

const spheres = [];

projects.forEach((project, i) => {
  // Равномерное распределение по сфере (метод Фибоначчи / золотой угол)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * i) / (SPHERE_COUNT - 1); // от 1 до -1
  const radiusAtY = Math.sqrt(1 - y * y);
  const theta = goldenAngle * i;

  const x = radiusAtY * Math.cos(theta) * ORBIT_DISTANCE;
  const z = radiusAtY * Math.sin(theta) * ORBIT_DISTANCE;
  const posY = y * ORBIT_DISTANCE;

  const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 32);
  const material = new THREE.MeshBasicMaterial({ map: videoTexture });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(x, posY, z);
  mesh.userData = project; // Сохраняем данные проекта

  scene.add(mesh);
  spheres.push(mesh);
});

// ==========================================
// 6. Raycaster и обработка событий
// ==========================================

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredSphere = null;

// Обновление координат указателя
function updatePointer(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
}

// Обработка наведения мышью
window.addEventListener('pointermove', (event) => {
  updatePointer(event.clientX, event.clientY);
});

// Hover-проверка (вызывается в цикле анимации)
function checkHover() {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(spheres);

  const target = intersects.length > 0 ? intersects[0].object : null;

  if (hoveredSphere && hoveredSphere !== target) {
    // Возвращаем предыдущую сферу в исходный масштаб
    gsap.to(hoveredSphere.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
    renderer.domElement.style.cursor = 'default';
  }

  if (target && target !== hoveredSphere) {
    // Увеличиваем новую сферу
    gsap.to(target.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 0.3 });
    renderer.domElement.style.cursor = 'pointer';
  }

  hoveredSphere = target;
}

// Клик / тач по сфере
function onClickOrTouch(clientX, clientY) {
  updatePointer(clientX, clientY);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(spheres);

  if (intersects.length > 0) {
    const { name, client } = intersects[0].object.userData;
    console.log(`Clicked: ${name}`);
    showModal(name, client);
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
// 7. Модальное окно
// ==========================================

const modalOverlay = document.getElementById('modal-overlay');
const modalText = document.getElementById('modal-text');
const modalClose = document.getElementById('modal-close');

function showModal(projectName, clientName) {
  modalText.textContent = `Project: ${projectName} | Client: ${clientName}`;
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
// 8. Адаптивность (resize)
// ==========================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ==========================================
// 9. Цикл анимации
// ==========================================

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  checkHover();
  renderer.render(scene, camera);
}

animate();
