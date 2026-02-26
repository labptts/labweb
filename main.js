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
// 0. Mobile detection (early, used everywhere)
// ==========================================
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;

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
// 2. Post-processing — Selective Bloom
// ==========================================

// Слой для объектов с bloom (сферы, кольца, солнце)
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);

// Материалы для временного затемнения non-bloom объектов
const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const materials = {};

function darkenNonBloomed(obj) {
  if (obj.isMesh || obj.isSprite) {
    if (!bloomLayer.test(obj.layers)) {
      materials[obj.uuid] = obj.material;
      obj.material = darkMaterial;
    }
  }
}

function restoreMaterial(obj) {
  if (materials[obj.uuid]) {
    obj.material = materials[obj.uuid];
    delete materials[obj.uuid];
  }
}

// Render target для bloom pass
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  { type: THREE.HalfFloatType }
);

// Bloom composer (только для bloom объектов)
const bloomComposer = new EffectComposer(renderer, renderTarget);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.2,   // strength
  0.6,   // radius
  0.1    // threshold
);
bloomComposer.addPass(bloomPass);

// Шейдер для комбинирования bloom с основной сценой
const BloomMixShader = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec4 bloom = texture2D(bloomTexture, vUv);
      gl_FragColor = base + bloom;
    }
  `
};

// Финальный composer
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const mixPass = new ShaderPass(BloomMixShader, 'baseTexture');
mixPass.uniforms.bloomTexture.value = bloomComposer.renderTarget2.texture;
composer.addPass(mixPass);

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
sunSprite.layers.enable(BLOOM_LAYER);
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
lensFlares.layers.enable(BLOOM_LAYER);
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
  points.layers.enable(BLOOM_LAYER);
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
dustParticles.layers.enable(BLOOM_LAYER);
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
  earth.layers.enable(BLOOM_LAYER);
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
    video: '/videos/DelimobilDooh_LAB_WEB.webm',
    client: 'Delimobil',
    subtitle: 'DOOH in Style',
    type: 'DOOH',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_Delimobil_DOOH.MP4'
    }
  },
  {
    video: '/videos/FonbetKHL_LAB_WEB.webm',
    client: 'Fonbet KZ',
    subtitle: 'KHL moments',
    type: 'TV, OLV',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_Fonbet_KHL.MP4'
    }
  },
  {
    video: '/videos/OakleyPlantaris_LAB_WEB.webm',
    client: 'Oakley',
    subtitle: 'Plantaris launch',
    type: 'OLV',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_OAKLEY.mp4'
    }
  },
  {
    video: '/videos/Samolet360_LAB_WEB.webm',
    client: 'Samolet',
    subtitle: 'Neighbourhood 360',
    type: 'TV, OLV, DOOH',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/Lab_Samolet_Neigh360.mp4'
    }
  },
  {
    video: '/videos/TbankNY_LAB_WEB.webm',
    client: 'T-Bank',
    subtitle: 'New Year wish',
    type: 'OLV, DOOH',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_Tbank_NewYear.MP4'
    }
  },
  {
    video: '/videos/Artlist_BigGame_LAB_WEB.webm',
    client: 'Artlist',
    subtitle: 'Big Game',
    type: 'CONTEST',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_Artlist_Biggame_contest.MP4'
    }
  },
  {
    video: '/videos/Cola_LAB_WEB.webm',
    client: 'Coca-Cola',
    subtitle: 'Halloween',
    type: 'SOCIALS',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/Lab_CocaCola_Halloween.mp4'
    }
  },
  {
    video: '/videos/Cupra_LAB_WEB.webm',
    client: 'Cupra',
    subtitle: 'Raval',
    type: 'OLV',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_Cupra_Raval_2026.mp4'
    }
  },
  {
    video: '/videos/OTP_Alpaka_LAB_WEB.webm',
    client: 'OTP Bank',
    subtitle: 'Soft Payments 1/2',
    type: 'TV, OLV, DOOH',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_OTP_Alpaka.MP4'
    }
  },
  {
    video: '/videos/OTP_Husky_LAB_WEB.webm',
    client: 'OTP Bank',
    subtitle: 'Soft Payments 2/2',
    type: 'TV, OLV, DOOH',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_OTP_HUSKY.MP4'
    }
  },
  {
    video: '/videos/Profi_LAB_WEB.webm',
    client: 'Profi',
    subtitle: 'Heroes',
    type: 'DOOH, OLV',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/Lab_ProfiHeroes.mp4'
    }
  },
  {
    video: '/videos/SMLT_NY_LAB_WEB.webm',
    client: 'Samolet',
    subtitle: 'Pre-New Year',
    type: 'TV, OLV, DOOH',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/Lab_Samolet_NY.mp4'
    }
  },
  {
    video: '/videos/Starbucks_LAB_WEB.webm',
    client: 'Starbucks',
    subtitle: 'Halloween',
    type: 'SOCIALS',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/Lab_Starbucks_Halloween.mp4'
    }
  },
  {
    video: '/videos/Tbank_b2s_LAB_WEB.webm',
    client: 'T-Bank',
    subtitle: 'Back2School',
    type: 'OLV',
    content: {
      type: 'video',
      mp4Url: 'https://labstudioweb.s3.eu-north-1.amazonaws.com/LAB_Tbank.mp4'
    }
  },
  {
    image: '/NOWRUZ1.webp',
    client: 'Yandex GO KZ',
    subtitle: 'Nauriz',
    type: 'DOOH, IN-APP',
    content: {
      type: 'gallery',
      images: [
        '/NOWRUZ1.webp',
        '/NOWRUZ2.webp',
        '/NOWRUZ3.webp',
        '/NOWRUZ4.webp',
        '/NOWRUZ5.webp',
      ]
    }
  },
  {
    image: '/YandexDrive_Bags_1_1.webp',
    client: 'Yandex.Drive',
    subtitle: 'Studio',
    type: 'DOOH, IN-APP',
    content: {
      type: 'gallery',
      images: [
        '/YandexDrive_Bags_1_1.webp',
        '/YandexDrive_Bags_1_2.webp',
        '/YandexDrive_Bags_1_3.webp',
      ]
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

  return { video, texture, type: 'video' };
}

// ==========================================
// 7b. Lazy Video System (мобилка)
// ==========================================
// На мобилке одновременно активны только MAX_ACTIVE_VIDEOS ближайших к камере видео.
// Остальные показывают статичный постер-кадр. Видео загружаются/выгружаются динамически.

// ==========================================
// 7b. Frustum-based Lazy Video System
// ==========================================
// Видео загружаются/воспроизводятся только для сфер, которые видны на экране
// (или почти видны — с запасом). Невидимые сферы показывают статичный кадр.
// При повороте камеры видео плавно включаются и выключаются.

const FRUSTUM_MARGIN = 0.35; // Запас за пределами экрана (0.35 = ~35% ширины экрана)

// Создаёт «ленивую» видео-текстуру: начинает с placeholder, видео по запросу
function createLazyVideoTexture(videoSrc) {
  // Placeholder canvas (тёмный фон пока видео не активно)
  const placeholderCanvas = document.createElement('canvas');
  placeholderCanvas.width = 128;
  placeholderCanvas.height = 128;
  const pCtx = placeholderCanvas.getContext('2d');
  const grad = pCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#08080f');
  pCtx.fillStyle = grad;
  pCtx.fillRect(0, 0, 128, 128);

  const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);
  placeholderTexture.minFilter = THREE.LinearFilter;
  placeholderTexture.magFilter = THREE.LinearFilter;
  placeholderTexture.colorSpace = THREE.SRGBColorSpace;
  placeholderTexture.generateMipmaps = false;
  placeholderTexture.center.set(0.5, 0.5);
  placeholderTexture.offset.set(0.25, 0);

  const entry = {
    videoSrc,
    video: null,
    texture: placeholderTexture,
    videoTexture: null,
    placeholderTexture,
    type: 'video',
    active: false,
    isLazy: true,

    activate() {
      if (this.active) return;
      this.active = true;

      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'auto';
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
      vid.src = this.videoSrc;

      const self = this;
      function tryPlay() {
        const p = vid.play();
        if (p !== undefined) {
          p.catch(() => {
            const h = () => { vid.play(); document.removeEventListener('click', h); document.removeEventListener('touchstart', h); };
            document.addEventListener('click', h);
            document.addEventListener('touchstart', h);
          });
        }
      }
      vid.addEventListener('canplaythrough', tryPlay, { once: true });
      vid.load();

      const vTex = new THREE.VideoTexture(vid);
      vTex.minFilter = THREE.LinearFilter;
      vTex.magFilter = THREE.LinearFilter;
      vTex.colorSpace = THREE.SRGBColorSpace;
      vTex.generateMipmaps = false;
      vTex.center.set(0.5, 0.5);
      vTex.offset.set(0.25, 0);

      self.video = vid;
      self.videoTexture = vTex;
      self.texture = vTex;
    },

    deactivate() {
      if (!this.active) return;
      this.active = false;

      if (this.video) {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        this.video = null;
      }
      if (this.videoTexture) {
        this.videoTexture.dispose();
        this.videoTexture = null;
      }
      this.texture = this.placeholderTexture;
    }
  };

  return entry;
}

// Создаёт текстуру из статичной картинки
function createImageTexture(imageSrc) {
  const loader = new THREE.TextureLoader();
  const texture = loader.load(imageSrc);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.center.set(0.5, 0.5);
  texture.offset.set(0.25, 0);

  return { video: null, texture, type: 'image', loaded: loader };
}

// Создаём текстуры для всех проектов
// Все видео — lazy: загружаются только когда сфера видна на экране
const projectTextures = projectsData.map(p => {
  if (p.video) return createLazyVideoTexture(p.video);
  if (p.image) return createImageTexture(p.image);
  return createLazyVideoTexture('');
});

// ==========================================
// 8. Billboard-текст (Sprite — всегда к камере)
// ==========================================

// Настройки свечения текста (можно регулировать)
const TEXT_GLOW_SETTINGS = {
  enabled: true,
  blur: 20,           // Радиус размытия (0-30)
  color: 'rgba(255, 255, 255, 0.5)', // Цвет свечения
  offsetX: 0,
  offsetY: 0,
};

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

  // Настройка свечения для основного текста
  if (TEXT_GLOW_SETTINGS.enabled) {
    ctx.shadowColor = TEXT_GLOW_SETTINGS.color;
    ctx.shadowBlur = TEXT_GLOW_SETTINGS.blur;
    ctx.shadowOffsetX = TEXT_GLOW_SETTINGS.offsetX;
    ctx.shadowOffsetY = TEXT_GLOW_SETTINGS.offsetY;
  }

  // Линия 1 — крупный жирный
  ctx.font = '700 64px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line1, 256, 90);

  // Линия 2 — тонкий, tracking
  ctx.font = '300 40px "Inter", "SF Pro Display", "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = 'rgba(220, 230, 240, 0.85)';
  ctx.fillText(line2, 256, 165);

  // Сброс свечения
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(isMobile ? 2.8 : 3.5, isMobile ? 1.4 : 1.75, 1);
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

const SPHERE_COUNT = 16;
// isMobile already defined at top of file
const SPHERE_RADIUS = isMobile ? 0.9 : 1.2;
const ORBIT_DISTANCE = isMobile ? 15 : 12;
const MIN_SPHERE_DISTANCE = isMobile ? 5.5 : 5.0; // Минимальная дистанция между центрами сфер

const projects = projectsData.map((p, i) => ({
  name: `Project ${i + 1}`,
  client: p.client,
  subtitle: p.subtitle,
  type: p.type,
  content: p.content,
}));

// Генерация позиций сфер с гарантированным минимальным расстоянием
function generateSpherePositions(count, orbitDist, minDist) {
  const positions = [];
  const maxAttempts = 2000;

  // Используем фиксированный seed для воспроизводимости (mulberry32)
  let seed = 42;
  function seededRandom() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const theta = seededRandom() * Math.PI * 2;
      const yNorm = 0.20 + seededRandom() * 0.75; // от 0.20 до 0.95 — верхняя полусфера
      const rMult = 0.85 + seededRandom() * 0.30; // вариативность радиуса

      const radiusAtY = Math.sqrt(1 - yNorm * yNorm) * rMult;
      const x = radiusAtY * Math.cos(theta) * orbitDist;
      const z = radiusAtY * Math.sin(theta) * orbitDist;
      const y = yNorm * orbitDist * 0.65;

      // Проверяем дистанцию до всех уже размещённых сфер
      let tooClose = false;
      for (const p of positions) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dz = z - p.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < minDist) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        positions.push({ x, y, z });
        placed = true;
        break;
      }
    }

    // Крайний fallback (не должен сработать при адекватных параметрах)
    if (!placed) {
      const theta = (i / count) * Math.PI * 2;
      const yNorm = 0.3 + (i % 3) * 0.25;
      const radiusAtY = Math.sqrt(1 - yNorm * yNorm);
      positions.push({
        x: radiusAtY * Math.cos(theta) * orbitDist,
        y: yNorm * orbitDist * 0.65,
        z: radiusAtY * Math.sin(theta) * orbitDist,
      });
    }
  }
  return positions;
}

const spherePositions = generateSpherePositions(SPHERE_COUNT, ORBIT_DISTANCE, MIN_SPHERE_DISTANCE);

const spheres = [];
const sphereGroups = [];

projects.forEach((project, i) => {
  const group = new THREE.Group();

  const pos = spherePositions[i];
  group.position.set(pos.x, pos.y, pos.z);

  // Сфера — текстура (видео или картинка) с лёгким glass-эффектом
  const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
  const projectTexture = projectTextures[i].texture;
  const material = new THREE.MeshPhysicalMaterial({
    map: projectTexture,
    emissiveMap: projectTexture,
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
  mesh.layers.enable(BLOOM_LAYER);
  group.add(mesh);

  // Единственное кольцо (фронтальное, меньшее, ближе к сфере)
  const ring = createGlowRing(SPHERE_RADIUS, 0x8899bb, 1.08, 1.12, 0.03);
  ring.userData.defaultColor = new THREE.Color(0x8899bb);
  ring.userData.hoverColor = new THREE.Color(0xB8FF00);
  ring.layers.enable(BLOOM_LAYER);
  // Кольцо будет ориентироваться в animate()
  group.add(ring);

  // Billboard текст - будет позиционироваться в animate()
  const label = createTextSprite(project.client, project.subtitle, project.type);
  // Храним метку отдельно в сцене, не в группе сферы
  label.userData.parentGroup = group;
  scene.add(label);

  group.userData = {
    baseY: pos.y,
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

// --- Разделение drag и click ---
let pointerDownPos = { x: 0, y: 0 };
let pointerDownTime = 0;
const DRAG_THRESHOLD = 6;   // px
const CLICK_MAX_TIME = 350; // ms

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos.x = e.clientX;
  pointerDownPos.y = e.clientY;
  pointerDownTime = performance.now();
});

renderer.domElement.addEventListener('click', (e) => {
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const elapsed = performance.now() - pointerDownTime;
  if (dist > DRAG_THRESHOLD || elapsed > CLICK_MAX_TIME) return; // was a drag
  onClickOrTouch(e.clientX, e.clientY);
});

renderer.domElement.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    pointerDownPos.x = e.touches[0].clientX;
    pointerDownPos.y = e.touches[0].clientY;
    pointerDownTime = performance.now();
  }
}, { passive: true });

renderer.domElement.addEventListener('touchend', (e) => {
  if (e.changedTouches.length > 0) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - pointerDownPos.x;
    const dy = touch.clientY - pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - pointerDownTime;
    if (dist > DRAG_THRESHOLD || elapsed > CLICK_MAX_TIME) return;
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
  if (content && content.type === 'video' && content.mp4Url) {
    mediaHtml = `
      <div class="modal-video-container">
        <video 
          src="${content.mp4Url}"
          autoplay 
          loop 
          controls 
          controlsList="nodownload"
          disablePictureInPicture
          oncontextmenu="return false;"
          playsinline
          style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;background:#000;">
        </video>
      </div>
    `;
  } else if (content && content.type === 'gallery' && content.images) {
    const imagesHtml = content.images.map((src, idx) => `
      <img src="${src}" alt="${client} ${idx + 1}" class="gallery-img" loading="lazy">
    `).join('');
    mediaHtml = `
      <div class="modal-gallery">
        ${imagesHtml}
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
  bloomComposer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  
  // Обновляем grain
  grainPass.uniforms.uIntensity.value = w < 768 ? 0.018 : 0.04;
  grainPass.uniforms.uResolution.value.set(w, h);
});

// ==========================================
// 14. Анимация (кинематографичная)
// ==========================================

const clock = new THREE.Clock();
let lazyVideoLastCheck = -1; // throttle для lazy video проверки

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

  // ---- Frustum-based Lazy Video: включаем видео для видимых сфер ----
  if (Math.floor(elapsed * 3) !== lazyVideoLastCheck) {
    lazyVideoLastCheck = Math.floor(elapsed * 3); // ~3 раза в секунду

    // Обновляем frustum камеры
    camera.updateMatrixWorld();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(projScreenMatrix);

    // Расширенный frustum: добавляем запас, чтобы видео включалось
    // когда сфера ещё «почти видна» (за краем экрана)
    // Для этого проецируем позицию сферы в NDC и проверяем с запасом
    const ndcLimit = 1.0 + FRUSTUM_MARGIN;

    const shouldBeActive = new Set();

    for (let i = 0; i < sphereGroups.length; i++) {
      const wp = new THREE.Vector3();
      sphereGroups[i].getWorldPosition(wp);

      // Проверяем сначала стандартный фрустум (быстрая проверка)
      const sphereBound = new THREE.Sphere(wp, SPHERE_RADIUS);
      if (frustum.intersectsSphere(sphereBound)) {
        shouldBeActive.add(i);
        continue;
      }

      // Расширенная проверка: проецируем в NDC с запасом
      const ndc = wp.clone().project(camera);
      if (ndc.z > 0 && ndc.z < 1 &&
          Math.abs(ndc.x) < ndcLimit &&
          Math.abs(ndc.y) < ndcLimit) {
        shouldBeActive.add(i);
      }
    }

    // Активируем/деактивируем видео
    for (let i = 0; i < projectTextures.length; i++) {
      const pt = projectTextures[i];
      if (!pt.isLazy) continue; // пропускаем картинки

      if (shouldBeActive.has(i) && !pt.active) {
        pt.activate();
        const mesh = spheres[i];
        if (mesh) {
          mesh.material.map = pt.texture;
          mesh.material.emissiveMap = pt.texture;
          mesh.material.needsUpdate = true;
        }
      } else if (!shouldBeActive.has(i) && pt.active) {
        pt.deactivate();
        const mesh = spheres[i];
        if (mesh) {
          mesh.material.map = pt.texture;
          mesh.material.emissiveMap = pt.texture;
          mesh.material.needsUpdate = true;
        }
      }
    }
  }

  controls.update();
  checkHover();
  
  // Selective bloom: рендерим bloom только для объектов на BLOOM_LAYER
  scene.traverse(darkenNonBloomed);
  bloomComposer.render();
  scene.traverse(restoreMaterial);
  
  composer.render();
}

// ==========================================
// 15. Loading screen — отслеживаем готовность видео
// ==========================================

(function initLoadingScreen() {
  const loadingEl = document.getElementById('loading-screen');
  const progressBar = document.getElementById('load-progress');
  if (!loadingEl) return;

  const total = projectTextures.length;
  let ready = 0;

  function tick() {
    ready++;
    const pct = Math.min(Math.round((ready / total) * 100), 100);
    if (progressBar) progressBar.style.width = pct + '%';
    if (ready >= total) dismiss();
  }

  function dismiss() {
    // Небольшая задержка для плавности
    setTimeout(() => {
      loadingEl.classList.add('hidden');
      // Удаляем из DOM после анимации
      loadingEl.addEventListener('transitionend', () => loadingEl.remove(), { once: true });
    }, 400);
  }

  projectTextures.forEach(({ video, type, isLazy }) => {
    if (isLazy) {
      // Lazy video — ещё не загружено, считаем готовым сразу
      tick();
    } else if (type === 'image') {
      // Картинки загружаются быстро — считаем сразу
      tick();
    } else if (video) {
      if (video.readyState >= 3) {
        tick();
      } else {
        video.addEventListener('canplaythrough', tick, { once: true });
      }
    } else {
      tick();
    }
  });

  // Таймаут-страховка: если за 8 секунд не всё загрузилось, всё равно показываем
  setTimeout(() => {
    if (!loadingEl.classList.contains('hidden')) dismiss();
  }, 8000);
})();

// ==========================================
// 16. Project List View — переключение режимов
// ==========================================

(function initProjectListView() {
  const navBtn = document.getElementById('nav-project-list');
  const listView = document.getElementById('project-list-view');
  const plList = document.getElementById('pl-list');
  if (!navBtn || !listView || !plList) return;

  let isListMode = false;

  // Генерируем список проектов
  projectsData.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'pl-item';
    li.innerHTML = `
      <div class="pl-left">
        <span class="pl-client">${p.client}</span>
        <span class="pl-subtitle">${p.subtitle}</span>
      </div>
      <span class="pl-type">${p.type}</span>
    `;
    li.addEventListener('click', () => {
      showModal(projects[i]);
    });
    plList.appendChild(li);
  });

  navBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isListMode = !isListMode;

    if (isListMode) {
      listView.classList.add('active');
      navBtn.querySelector('.line1').textContent = 'Universe';
      navBtn.querySelector('.line2').textContent = 'view';
    } else {
      listView.classList.remove('active');
      navBtn.querySelector('.line1').textContent = 'Project';
      navBtn.querySelector('.line2').textContent = 'list view';
    }
  });
})();

animate();
