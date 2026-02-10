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
// 4. Освещение (премиальное, холодные тона)
// ==========================================

const ambientLight = new THREE.AmbientLight(0x0a0a1a, 0.3);
scene.add(ambientLight);

// Основной свет — мягкий холодный белый
const keyLight = new THREE.PointLight(0xc8d4e8, 50, 120);
keyLight.position.set(10, 10, 10);
scene.add(keyLight);

// Заполняющий свет — приглушённый синий
const fillLight = new THREE.PointLight(0x4466aa, 25, 80);
fillLight.position.set(-15, -5, -10);
scene.add(fillLight);

// Контровый свет — лёгкий голубой
const rimLight = new THREE.PointLight(0x6699cc, 35, 100);
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

// Более премиальные звёзды - меньше и тоньше
scene.add(createStarLayer(400, 80, 200, 0.4, 0xffffff, 0.9));
scene.add(createStarLayer(800, 60, 220, 0.2, 0xddeeff, 0.5));
scene.add(createStarLayer(1500, 50, 250, 0.1, 0xaabbdd, 0.25));

// ==========================================
// 6. Земля с атмосферой (вид из космоса)
// ==========================================

function createEarthWithAtmosphere() {
  const earthGroup = new THREE.Group();
  
  // Большая сфера Земли (видимая сверху)
  const earthRadius = 180;
  const earthGeometry = new THREE.SphereGeometry(earthRadius, 128, 128);
  
  // Шейдерный материал для тёмной Земли с огнями городов
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCameraPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uCameraPos;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      // Хеш-функция для процедурного шума
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      // Шум для огней городов
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      
      // Многоуровневый шум для лучшего распределения городов
      float cityNoise(vec2 p) {
        float n = 0.0;
        n += noise(p * 8.0) * 0.5;
        n += noise(p * 16.0) * 0.25;
        n += noise(p * 32.0) * 0.125;
        return n;
      }
      
      void main() {
        // Нормаль направлена внутрь для BackSide, инвертируем
        vec3 normal = -vNormal;
        
        // Направление к камере
        vec3 viewDir = normalize(uCameraPos - vWorldPosition);
        
        // Fresnel эффект для края атмосферы
        float fresnel = 1.0 - max(0.0, dot(normal, viewDir));
        fresnel = pow(fresnel, 1.5);
        
        // Базовый тёмный цвет поверхности Земли (океаны и континенты ночью)
        vec3 oceanColor = vec3(0.005, 0.008, 0.015);
        vec3 landColor = vec3(0.01, 0.012, 0.018);
        
        // Процедурные "континенты" через шум
        vec2 sphereUv = vec2(
          atan(vPosition.x, vPosition.z) / (2.0 * 3.14159) + 0.5,
          asin(clamp(vPosition.y / 180.0, -1.0, 1.0)) / 3.14159 + 0.5
        );
        
        float landMask = smoothstep(0.35, 0.5, noise(sphereUv * 3.0 + 0.5));
        vec3 surfaceColor = mix(oceanColor, landColor, landMask);
        
        // Огни городов (только на суше)
        float cityPattern = cityNoise(sphereUv * 80.0);
        float cityMask = landMask * smoothstep(0.6, 0.8, cityPattern);
        
        // Мерцание огней
        float flicker = 0.85 + 0.15 * sin(uTime * 2.0 + hash(floor(sphereUv * 200.0)) * 6.28);
        
        // Цвет огней городов (тёплый жёлто-оранжевый)
        vec3 cityLightColor = vec3(1.0, 0.8, 0.4) * cityMask * flicker * 0.4;
        
        // Добавляем крупные города (более яркие точки)
        float bigCityPattern = noise(sphereUv * 25.0);
        float bigCityMask = landMask * smoothstep(0.75, 0.85, bigCityPattern);
        vec3 bigCityColor = vec3(1.0, 0.9, 0.6) * bigCityMask * flicker * 0.8;
        
        surfaceColor += cityLightColor + bigCityColor;
        
        // Атмосферное свечение на краю (горизонт) - приглушённое
        vec3 atmosphereInner = vec3(0.04, 0.08, 0.15);
        vec3 atmosphereMid = vec3(0.1, 0.2, 0.35);
        vec3 atmosphereOuter = vec3(0.2, 0.35, 0.5);
        
        vec3 atmoColor;
        if (fresnel > 0.9) {
          float t = (fresnel - 0.9) / 0.1;
          atmoColor = mix(atmosphereMid, atmosphereOuter, t);
        } else if (fresnel > 0.7) {
          float t = (fresnel - 0.7) / 0.2;
          atmoColor = mix(atmosphereInner, atmosphereMid, t);
        } else {
          atmoColor = atmosphereInner * (fresnel / 0.7) * 0.3;
        }
        
        // Смешиваем поверхность с атмосферой только на самых краях
        vec3 finalColor = surfaceColor + atmoColor * smoothstep(0.65, 0.98, fresnel) * 0.6;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    transparent: false,
    side: THREE.BackSide,
    depthWrite: true,
  });
  
  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earth.position.set(0, -earthRadius - 35, 0);
  earthGroup.add(earth);
  
  return { group: earthGroup, earthMaterial, earth };
}

// ==========================================
// 6.1 Луна (полумесяц)
// ==========================================

function createCrescentMoon() {
  const moonGroup = new THREE.Group();
  
  // Шейдерный материал для полумесяца
  const moonMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPhase: { value: 0.25 }, // Фаза луны (0-1)
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uPhase;
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center);
        
        // Круглая маска луны
        if (dist > 0.48) discard;
        
        // Создаём эффект полумесяца
        float angle = atan(center.y, center.x);
        float crescentMask = smoothstep(-0.15, 0.1, center.x + 0.2);
        
        // Мягкий край
        float edge = 1.0 - smoothstep(0.4, 0.48, dist);
        
        // Цвет луны - мягкий серебристый
        vec3 moonColor = vec3(0.85, 0.85, 0.82);
        
        // Лёгкие вариации на поверхности
        float surface = 0.9 + 0.1 * sin(center.x * 15.0) * sin(center.y * 12.0);
        
        float alpha = crescentMask * edge * surface;
        
        gl_FragColor = vec4(moonColor, alpha * 0.9);
      }
    `,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  
  const moonGeometry = new THREE.PlaneGeometry(3, 3);
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.set(-15, 5, -60);
  moonGroup.add(moon);
  
  // Мягкое свечение вокруг луны
  const glowGeometry = new THREE.PlaneGeometry(8, 8);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec2 center = vUv - 0.5;
        float dist = length(center);
        float glow = exp(-dist * 4.0) * 0.15;
        vec3 color = vec3(0.9, 0.9, 0.85);
        gl_FragColor = vec4(color, glow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.copy(moon.position);
  glow.position.z += 0.1;
  moonGroup.add(glow);
  
  return moonGroup;
}

const earthScene = createEarthWithAtmosphere();
scene.add(earthScene.group);

const crescentMoon = createCrescentMoon();
scene.add(crescentMoon);

// ==========================================
// 7. Видео-текстура
// ==========================================

const video = document.createElement('video');
video.crossOrigin = 'anonymous';
video.loop = true;
video.muted = true;
video.playsInline = true;
video.preload = 'auto';
video.setAttribute('playsinline', '');
video.setAttribute('webkit-playsinline', '');
video.src = '/test_preview.mp4';

// Надёжный запуск видео
function tryPlayVideo() {
  const p = video.play();
  if (p !== undefined) {
    p.catch(() => {
      // Автоплей заблокирован — ждём взаимодействия
      const startOnInteraction = () => {
        video.play();
        document.removeEventListener('click', startOnInteraction);
        document.removeEventListener('touchstart', startOnInteraction);
      };
      document.addEventListener('click', startOnInteraction);
      document.addEventListener('touchstart', startOnInteraction);
    });
  }
}

video.addEventListener('canplaythrough', tryPlayVideo);
video.load();

const videoTexture = new THREE.VideoTexture(video);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.generateMipmaps = false;

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
  ctx.shadowColor = 'rgba(100, 140, 180, 0.6)';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line1, 256, 90);

  // Линия 2 — тонкий, tracking
  ctx.font = '300 40px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.shadowColor = 'rgba(100, 140, 180, 0.3)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(220, 230, 240, 0.75)';
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

  // Сфера — видео-текстура с лёгким glass-эффектом
  const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
  const material = new THREE.MeshPhysicalMaterial({
    map: videoTexture,
    emissiveMap: videoTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.6,
    roughness: 0.25,
    metalness: 0.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    reflectivity: 0.3,
    envMapIntensity: 0.5,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = project;
  group.add(mesh);

  // Единственное кольцо (фронтальное, всегда к камере)
  const ring = createGlowRing(SPHERE_RADIUS, 0x8899bb, 1.25, 1.32, 0.12);
  // Кольцо будет ориентироваться в animate()
  group.add(ring);

  // Billboard текст - будет позиционироваться в animate()
  const label = createTextSprite(project.client, project.subtitle);
  // Храним метку отдельно в сцене, не в группе сферы
  label.userData.parentGroup = group;
  scene.add(label);

  group.userData = {
    baseY: posY,
    phase: i * ((Math.PI * 2) / SPHERE_COUNT),
    ring,
    label,
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
    gsap.to(prevGroup.userData.ring.material, { opacity: 0.12, duration: 0.4 });
    renderer.domElement.style.cursor = 'default';
  }

  if (target && target !== hoveredSphere) {
    const group = target.parent;
    gsap.to(group.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.5, ease: 'power2.out' });
    gsap.to(group.userData.ring.material, { opacity: 0.7, duration: 0.4 });
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

  // Получаем направление камеры для ориентации колец
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  
  sphereGroups.forEach((group) => {
    const { baseY, phase, ring, label } = group.userData;
    group.position.y = baseY + Math.sin(elapsed * 0.4 + phase) * 0.5;

    // Кольцо всегда смотрит на камеру (фронтально)
    if (ring) {
      ring.lookAt(camera.position);
    }
    
    // Позиционируем текст всегда под сферой относительно камеры
    if (label) {
      const sphereWorldPos = new THREE.Vector3();
      group.getWorldPosition(sphereWorldPos);
      
      const labelOffset = cameraUp.clone().multiplyScalar(-(SPHERE_RADIUS + 1.5));
      label.position.copy(sphereWorldPos).add(labelOffset);
    }
  });
  
  // Обновляем позицию камеры и время для шейдера Земли
  if (earthScene.earthMaterial.uniforms) {
    earthScene.earthMaterial.uniforms.uCameraPos.value.copy(camera.position);
    earthScene.earthMaterial.uniforms.uTime.value = elapsed;
  }

  // Движение источников света
  keyLight.position.x = 10 * Math.cos(elapsed * 0.1);
  keyLight.position.z = 10 * Math.sin(elapsed * 0.1);
  fillLight.position.y = -5 + Math.sin(elapsed * 0.15) * 3;

  controls.update();
  checkHover();
  composer.render();
}

animate();
