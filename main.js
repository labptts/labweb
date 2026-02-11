import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
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

// Film Grain шейдер
const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 0.04 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    uniform vec2 uResolution;
    varying vec2 vUv;
    
    // Улучшенная хэш-функция для более равномерного шума
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      // Используем экранные координаты для равномерного шума
      vec2 screenCoord = gl_FragCoord.xy;
      
      // Анимированный шум с временной вариацией
      float grain = hash(screenCoord + fract(uTime * 43.0) * 100.0) - 0.5;
      
      // Применяем шум к тёмным/средним областям
      float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      float grainMask = smoothstep(0.7, 0.2, luminance);
      
      color.rgb += grain * uIntensity * grainMask;
      
      gl_FragColor = color;
    }
  `
};

const grainPass = new ShaderPass(FilmGrainShader);

// Уменьшаем grain на мобильных
if (window.innerWidth < 768) {
  grainPass.uniforms.uIntensity.value = 0.018;
}

composer.addPass(grainPass);

composer.addPass(new OutputPass());

// ==========================================
// 3. OrbitControls — кинематографичное вращение
// ==========================================

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = -0.4; // Инвертированное управление (drag-стиль)
controls.autoRotate = true;
controls.autoRotateSpeed = 0.08;

// ==========================================
// 4. Освещение (премиальное, холодные тона)
// ==========================================

const ambientLight = new THREE.AmbientLight(0x0a0a1a, 0.5);
scene.add(ambientLight);

// Основной свет — DirectionalLight (не создаёт видимых артефактов)
const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.0);
keyLight.position.set(-50, 30, -40);
scene.add(keyLight);

// Заполняющий свет
const fillLight = new THREE.DirectionalLight(0x4466aa, 0.4);
fillLight.position.set(15, -5, 10);
scene.add(fillLight);

// Контровый свет
const rimLight = new THREE.DirectionalLight(0x6699cc, 0.5);
rimLight.position.set(0, 15, 15);
scene.add(rimLight);

// Солнце (круглый Sprite — без квадратных артефактов)
function createSunSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Радиальный градиент для круглого солнца
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255, 255, 250, 1)');
  gradient.addColorStop(0.15, 'rgba(255, 250, 235, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 235, 200, 0.5)');
  gradient.addColorStop(0.7, 'rgba(255, 210, 150, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 180, 100, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(20, 20, 1);
  sprite.position.set(-60, 30, -100);
  return sprite;
}

const sunSprite = createSunSprite();
scene.add(sunSprite);

// Анаморфные lens flares от солнца
function createLensFlares() {
  // Создаём текстуры для бликов программно
  function createFlareTexture(width, height, color, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Горизонтальный анаморфный блик
    const gradient = ctx.createLinearGradient(0, height/2, width, height/2);
    gradient.addColorStop(0, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, 0)`);
    gradient.addColorStop(0.3, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, ${opacity})`);
    gradient.addColorStop(0.5, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, ${opacity * 1.5})`);
    gradient.addColorStop(0.7, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, ${opacity})`);
    gradient.addColorStop(1, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, 0)`);
    
    ctx.fillStyle = gradient;
    
    // Вертикальный градиент для мягкости
    const vertGradient = ctx.createLinearGradient(0, 0, 0, height);
    vertGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vertGradient.addColorStop(0.4, 'rgba(255,255,255,1)');
    vertGradient.addColorStop(0.6, 'rgba(255,255,255,1)');
    vertGradient.addColorStop(1, 'rgba(0,0,0,0)');
    
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = vertGradient;
    ctx.fillRect(0, 0, width, height);
    
    return new THREE.CanvasTexture(canvas);
  }
  
  // Круглый блик для центра
  function createCircleFlare(size, color, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, ${opacity})`);
    gradient.addColorStop(0.5, `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, ${opacity * 0.3})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    return new THREE.CanvasTexture(canvas);
  }
  
  const lensflare = new Lensflare();
  
  // Основное свечение (только круглые ореолы)
  const mainColor = new THREE.Color(1, 0.95, 0.8);
  const flareMain = createCircleFlare(256, mainColor, 0.35);
  lensflare.addElement(new LensflareElement(flareMain, 60, 0, mainColor));
  
  // Вторичные цветные блики по линии (только круглые)
  const blueFlare = createCircleFlare(64, new THREE.Color(0.4, 0.6, 1.0), 0.25);
  lensflare.addElement(new LensflareElement(blueFlare, 30, 0.3));
  lensflare.addElement(new LensflareElement(blueFlare, 20, 0.5));
  
  const cyanFlare = createCircleFlare(64, new THREE.Color(0.5, 0.9, 1.0), 0.15);
  lensflare.addElement(new LensflareElement(cyanFlare, 40, 0.7));
  
  const orangeFlare = createCircleFlare(64, new THREE.Color(1.0, 0.7, 0.3), 0.12);
  lensflare.addElement(new LensflareElement(orangeFlare, 25, 0.9));
  lensflare.addElement(new LensflareElement(orangeFlare, 18, 1.1));
  
  // Позиционируем в точке солнца
  lensflare.position.set(-60, 30, -100);
  
  return lensflare;
}

const lensFlares = createLensFlares();
scene.add(lensFlares);

// ==========================================
// 5. Звёздное поле (многослойное с мерцанием)
// ==========================================

const starLayers = [];

function createTwinklingStarLayer(count, minR, maxR, size, color, opacity) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count); // Фаза мерцания для каждой звезды
  const speeds = new Float32Array(count); // Скорость мерцания
  
  for (let i = 0; i < count; i++) {
    const r = minR + Math.random() * (maxR - minR);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.5 + Math.random() * 2.0; // Разная скорость мерцания
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      attribute float aPhase;
      attribute float aSpeed;
      varying float vTwinkle;
      
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // Мерцание
        vTwinkle = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
        
        gl_PointSize = uSize * uPixelRatio * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;
      
      void main() {
        // Круглая точка
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        
        float alpha = smoothstep(0.5, 0.0, dist);
        alpha *= uOpacity * vTwinkle;
        
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  
  const points = new THREE.Points(geometry, material);
  starLayers.push(points);
  return points;
}

// Более премиальные звёзды - меньше и тоньше, с мерцанием
scene.add(createTwinklingStarLayer(400, 80, 200, 0.4, 0xffffff, 0.9));
scene.add(createTwinklingStarLayer(800, 60, 220, 0.2, 0xddeeff, 0.5));
scene.add(createTwinklingStarLayer(1500, 50, 250, 0.1, 0xaabbdd, 0.25));

// ==========================================
// 5.5 Пылевые частицы (Dust Particles)
// ==========================================

function createDustParticles(count) {
  const positions = new Float32Array(count * 3);
  const velocities = [];
  
  for (let i = 0; i < count; i++) {
    // Частицы в области вокруг камеры
    positions[i * 3]     = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20 + 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    
    velocities.push({
      x: (Math.random() - 0.5) * 0.005,
      y: (Math.random() - 0.5) * 0.003,
      z: (Math.random() - 0.5) * 0.005,
    });
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const material = new THREE.PointsMaterial({
    color: 0xaabbcc,
    size: 0.03,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  
  const points = new THREE.Points(geometry, material);
  points.userData.velocities = velocities;
  points.userData.positions = positions;
  return points;
}

const dustParticles = createDustParticles(200);
scene.add(dustParticles);

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

const earthScene = createEarthWithAtmosphere();
scene.add(earthScene.group);

// ==========================================
// 7. Видео-текстуры для проектов
// ==========================================

// Данные проектов с реальными видео
const projectsData = [
  {
    video: '/videos/DelimobilDooh_LAB_WEB.mp4',
    client: 'Delimobil',
    subtitle: 'DOOH in Style',
    type: 'DOOH',
    content: {
      type: 'video',
      vimeoId: '1163618338'
    }
  },
  {
    video: '/videos/FonbetKHL_LAB_WEB.mp4',
    client: 'Fonbet KZ',
    subtitle: 'KHL moments',
    type: 'TV, OLV',
    content: {
      type: 'video',
      vimeoId: '1163618380'
    }
  },
  {
    video: '/videos/OakleyPlantaris_LAB_WEB.mp4',
    client: 'Oakley',
    subtitle: 'Plantaris launch',
    type: 'OLV',
    content: {
      type: 'video',
      vimeoId: '1163618518'
    }
  },
  {
    video: '/videos/Samolet360_LAB_WEB.mp4',
    client: 'Samolet',
    subtitle: 'Neighbourhood 360',
    type: 'TV, OLV, DOOH',
    content: {
      type: 'video',
      vimeoId: '1163618584'
    }
  },
  {
    video: '/videos/TbankNY_LAB_WEB.mp4',
    client: 'T-Bank',
    subtitle: 'New Year wish',
    type: 'OLV, DOOH',
    content: {
      type: 'video',
      vimeoId: '1163618628'
    }
  }
];

// Создаёт видео элемент и текстуру для проекта
function createVideoTexture(videoSrc) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.src = videoSrc;

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

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  
  // Центрирование видео на фронтальной части сферы
  texture.center.set(0.5, 0.5);
  texture.offset.set(0.25, 0); // Сдвиг чтобы центр видео был спереди

  return { video, texture };
}

// Создаём текстуры для всех проектов
const videoTextures = projectsData.map(p => createVideoTexture(p.video));

// ==========================================
// 8. Billboard-текст (Sprite — всегда к камере)
// ==========================================

function createTextSprite(line1, line2, projectType = 'TV / DOOH') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Тип проекта — справа сверху, мелкий тонкий шрифт
  ctx.font = '300 24px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(180, 200, 220, 0.7)';
  ctx.fillText(projectType, 490, 20);

  // Линия 1 — крупный жирный
  ctx.font = '700 64px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line1, 256, 90);

  // Линия 2 — тонкий, tracking
  ctx.font = '300 40px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(220, 230, 240, 0.75)';
  ctx.fillText(line2, 256, 165);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.NormalBlending,
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

const projects = projectsData.map((p, i) => ({
  name: `Project ${i + 1}`,
  client: p.client,
  subtitle: p.subtitle,
  type: p.type,
  content: p.content,
}));

const spheres = [];
const sphereGroups = [];

projects.forEach((project, i) => {
  const group = new THREE.Group();

  // Хаотичное распределение в верхней полусфере (текст не залезает на Землю)
  const presetPositions = [
    { theta: 0.4, y: 0.75, r: 1.0 },
    { theta: 2.3, y: 0.45, r: 0.95 },
    { theta: 4.5, y: 0.85, r: 0.88 },
    { theta: 1.5, y: 0.55, r: 1.08 },
    { theta: 5.3, y: 0.3, r: 0.92 },
  ];
  const preset = presetPositions[i];
  
  const radiusAtY = Math.sqrt(1 - preset.y * preset.y) * preset.r;
  const x = radiusAtY * Math.cos(preset.theta) * ORBIT_DISTANCE;
  const z = radiusAtY * Math.sin(preset.theta) * ORBIT_DISTANCE;
  const posY = preset.y * ORBIT_DISTANCE * 0.65;

  group.position.set(x, posY, z);

  // Сфера — видео-текстура с лёгким glass-эффектом
  const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
  const projectVideoTexture = videoTextures[i].texture;
  const material = new THREE.MeshPhysicalMaterial({
    map: projectVideoTexture,
    emissiveMap: projectVideoTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.15,
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

  // Единственное кольцо (фронтальное, меньшее, ближе к сфере)
  const ring = createGlowRing(SPHERE_RADIUS, 0x8899bb, 1.08, 1.12, 0.03);
  ring.userData.defaultColor = new THREE.Color(0x8899bb);
  ring.userData.hoverColor = new THREE.Color(0xB8FF00);
  // Кольцо будет ориентироваться в animate()
  group.add(ring);

  // Billboard текст - будет позиционироваться в animate()
  const label = createTextSprite(project.client, project.subtitle, project.type);
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
    const prevRing = prevGroup.userData.ring;
    gsap.to(prevGroup.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.out' });
    gsap.to(prevRing.material, { opacity: 0.15, duration: 0.4 });
    gsap.to(prevRing.material.color, {
      r: prevRing.userData.defaultColor.r,
      g: prevRing.userData.defaultColor.g,
      b: prevRing.userData.defaultColor.b,
      duration: 0.4
    });
    renderer.domElement.style.cursor = 'default';
  }

  if (target && target !== hoveredSphere) {
    const group = target.parent;
    const ring = group.userData.ring;
    gsap.to(group.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.5, ease: 'power2.out' });
    gsap.to(ring.material, { opacity: 0.9, duration: 0.4 });
    gsap.to(ring.material.color, {
      r: ring.userData.hoverColor.r,
      g: ring.userData.hoverColor.g,
      b: ring.userData.hoverColor.b,
      duration: 0.4
    });
    renderer.domElement.style.cursor = 'pointer';
  }

  hoveredSphere = target;
}

function onClickOrTouch(clientX, clientY) {
  updatePointer(clientX, clientY);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(spheres);

  if (intersects.length > 0) {
    const project = intersects[0].object.userData;
    showModal(project);
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
const modalContent = document.getElementById('modal-content');
const modalClose = document.getElementById('modal-close');

function showModal(project) {
  const { client, subtitle, type, content } = project;
  
  let mediaHtml = '';
  if (content && content.type === 'video' && content.vimeoId) {
    mediaHtml = `
      <div class="modal-video-container">
        <iframe 
          src="https://player.vimeo.com/video/${content.vimeoId}?autoplay=1&loop=1&title=0&byline=0&portrait=0&dnt=1"
          frameborder="0" 
          allow="autoplay; fullscreen; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>
    `;
  }
  
  modalContent.innerHTML = `
    <button id="modal-close">&times;</button>
    ${mediaHtml}
    <div class="modal-info">
      <div class="modal-type">${type}</div>
      <h2 class="modal-client">${client}</h2>
      <p class="modal-subtitle">${subtitle}</p>
    </div>
  `;
  
  // Перепривязываем обработчик закрытия
  document.getElementById('modal-close').addEventListener('click', hideModal);
  
  modalOverlay.classList.add('active');
  controls.autoRotate = false; // Останавливаем вращение
}

function hideModal() {
  modalOverlay.classList.remove('active');
  modalContent.innerHTML = ''; // Очищаем для остановки видео
  controls.autoRotate = true; // Возобновляем вращение
}

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) hideModal();
});

// Закрытие по ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
    hideModal();
  }
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
  
  // Обновляем grain для мобильных
  grainPass.uniforms.uIntensity.value = w < 768 ? 0.018 : 0.04;
  grainPass.uniforms.uResolution.value.set(w, h);
});

// ==========================================
// 14. Анимация (кинематографичная)
// ==========================================

const clock = new THREE.Clock();

// Параметры для camera drift
const cameraDrift = {
  baseTarget: new THREE.Vector3(0, 0, 0),
  offset: new THREE.Vector3(),
};

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  // Film Grain обновление времени
  if (grainPass.uniforms.uTime) {
    grainPass.uniforms.uTime.value = elapsed;
  }
  
  // Обновляем мерцание звёзд
  starLayers.forEach((layer) => {
    if (layer.material.uniforms && layer.material.uniforms.uTime) {
      layer.material.uniforms.uTime.value = elapsed;
    }
  });
  
  // Анимация пылевых частиц
  if (dustParticles && dustParticles.userData.positions && dustParticles.userData.velocities) {
    const positions = dustParticles.userData.positions;
    const velocities = dustParticles.userData.velocities;
    
    for (let i = 0; i < velocities.length; i++) {
      positions[i * 3] += velocities[i].x;
      positions[i * 3 + 1] += velocities[i].y;
      positions[i * 3 + 2] += velocities[i].z;
      
      // Wraparound - если частица уходит далеко, возвращаем её
      if (Math.abs(positions[i * 3]) > 20) positions[i * 3] *= -0.9;
      if (positions[i * 3 + 1] > 15 || positions[i * 3 + 1] < -5) velocities[i].y *= -1;
      if (Math.abs(positions[i * 3 + 2]) > 20) positions[i * 3 + 2] *= -0.9;
    }
    
    dustParticles.geometry.attributes.position.needsUpdate = true;
  }
  
  // Subtle camera drift - лёгкое покачивание
  cameraDrift.offset.x = Math.sin(elapsed * 0.15) * 0.03;
  cameraDrift.offset.y = Math.cos(elapsed * 0.12) * 0.02;
  controls.target.copy(cameraDrift.baseTarget).add(cameraDrift.offset);

  // Получаем направление камеры для ориентации колец
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  
  sphereGroups.forEach((group) => {
    const { baseY, phase, ring, label } = group.userData;
    group.position.y = baseY + Math.sin(elapsed * 0.4 + phase) * 0.5;

    // Вся группа смотрит на камеру (сфера фронтально к зрителю)
    group.lookAt(camera.position);

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

  controls.update();
  checkHover();
  composer.render();
}

animate();
