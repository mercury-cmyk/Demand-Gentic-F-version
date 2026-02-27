// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('hero-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 1, 100);
pointLight.position.set(0, 0, 5);
scene.add(pointLight);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 5;
controls.maxDistance = 50;

// AI Brain
const brainGeometry = new THREE.IcosahedronGeometry(2, 2);
const brainMaterial = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    emissive: 0x00aaff,
    emissiveIntensity: 0.5,
    metalness: 0.8,
    roughness: 0.4,
    wireframe: true
});
const brain = new THREE.Mesh(brainGeometry, brainMaterial);
scene.add(brain);

// Globe
const textureLoader = new THREE.TextureLoader();
const globeTexture = textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg');
const globeGeometry = new THREE.SphereGeometry(5, 64, 64);
const globeMaterial = new THREE.MeshStandardMaterial({
    map: globeTexture,
    metalness: 0.5,
    roughness: 0.7
});
const globe = new THREE.Mesh(globeGeometry, globeMaterial);
globe.position.set(0, 0, 0); // At the center, brain will be inside initially
scene.add(globe);


// Particle Systems (Placeholders)
const particleCount = 2000;
const particles = new THREE.BufferGeometry();
const posArray = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 30;
}
particles.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

const particleMaterial = new THREE.PointsMaterial({
    size: 0.05,
    color: 0xffffff
});
const particleMesh = new THREE.Points(particles, particleMaterial);
scene.add(particleMesh);

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Brain animation
    brain.rotation.x += 0.001;
    brain.rotation.y += 0.001;
    const time = Date.now() * 0.001;
    brain.material.emissiveIntensity = Math.sin(time * 3) * 0.2 + 0.3;

    // Globe animation
    globe.rotation.y += 0.0005;

    // Particle animation
    particleMesh.rotation.y += 0.0002;

    controls.update();
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
