import * as THREE from 'three';
import { Player } from './player.js';
import { InputHandler } from './input-handler.js';
import { PhysicsWorld } from './physics.js';
import { NetworkManager } from './network.js';
import { PickupManager } from './pickups.js';
import * as CANNON from 'cannon-es';

// Scene, camera, and renderer setup
class Game {
  constructor() {
    // Initialize timing
    this.clock = new THREE.Clock();
    this.deltaTime = 0;
    this.lastTime = 0;
    
    // Create scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane
    );
    
    // Set initial camera position slightly above ground level
    this.camera.position.set(0, 1.7, 0);
    
    // Set up WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87CEEB); // Sky blue color
    this.renderer.shadowMap.enabled = true;
    
    // Add renderer to DOM
    const container = document.getElementById('game-container');
    if (container) {
      container.appendChild(this.renderer.domElement);
    } else {
      console.error('Game container element not found');
      return;
    }
    
    // Initialize physics
    this.physics = new PhysicsWorld();
    
    // Add ground plane
    this.addGround();
    
    // Add obstacles
    this.addObstacles();
    
    // Add dynamic objects
    this.addDynamicObjects();
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
    
    // Initialize input handler
    this.inputHandler = new InputHandler();
    
    // Create player with physics
    this.player = new Player(this.scene, this.camera, this.inputHandler, this.physics);
    
    // Initialize network manager
    this.network = new NetworkManager(this);
    
    // Initialize pickup manager
    this.pickupManager = new PickupManager(this.scene, this.physics);
    this.pickupManager.definePickupLocations();
    
    // Connect to server
    this.network.connect();
    
    // Last position/rotation sent to the server
    this.lastNetworkUpdate = 0;
    this.networkUpdateRate = 0.05; // 50ms (20 updates per second)
    
    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    
    // Display instructions
    this.showInstructions();
    
    // Create debug info
    this.createDebugInfo();
    
    // Schedule system verification
    setTimeout(() => this.verifySystemsInitialization(), 2000);
    
    // Start animation loop
    this.lastTime = this.clock.getElapsedTime();
    this.animate();
    
    console.log('Game initialized with physics, weapons, pickups, and network');
  }
  
  // Add ground plane to the scene
  addGround() {
    // Create a large ground plane (increased from 100x100 to 200x200 units)
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x555555, // Gray color
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    
    // Rotate the plane to be horizontal
    ground.rotation.x = -Math.PI / 2;
    
    // Position at y=0
    ground.position.y = 0;
    
    // Enable shadows
    ground.receiveShadow = true;
    
    // Add to scene
    this.scene.add(ground);
    
    // Create physics ground
    if (this.physics) {
      const groundBody = this.physics.createGround();
      // Link the physics ground to the mesh
      this.physics.linkBodyToMesh(groundBody, ground, 'ground');
    }
  }
  
  // Add obstacles to the scene
  addObstacles() {
    if (!this.physics) return;
    
    // Create a border wall to define the arena boundaries (expanded from 30x30 to 60x60)
    // North wall
    this.createBox(0, 2, -30, 60, 4, 1, 0x888888);
    // South wall
    this.createBox(0, 2, 30, 60, 4, 1, 0x888888);
    // East wall
    this.createBox(30, 2, 0, 1, 4, 60, 0x888888);
    // West wall
    this.createBox(-30, 2, 0, 1, 4, 60, 0x888888);
    
    // Create various platforms and obstacles spread around the map
    
    // Central area
    // Main central structure
    this.createBox(0, 0.5, 0, 8, 1, 8, 0xcccccc);
    
    // Create outer bases in corners (moved further out)
    // Red corner platform with ramp
    this.createBox(20, 1, 20, 8, 2, 8, 0xff0000);
    this.createRamp(14, 0.75, 20, 10, 1, 6, 0.3, 0xff5555);
    
    // Blue corner tower
    this.createBox(-20, 1, -20, 6, 2, 6, 0x0000ff);
    this.createBox(-20, 3, -20, 4, 2, 4, 0x5555ff);
    this.createBox(-20, 5, -20, 2, 2, 2, 0x8888ff);
    
    // Green corner with jumping platforms
    this.createBox(-20, 0.5, 20, 6, 1, 6, 0x00ff00);
    this.createBox(-16, 1.5, 16, 2, 1, 2, 0x00ff00);
    this.createBox(-12, 2.5, 12, 2, 1, 2, 0x00ff00);
    this.createBox(-8, 3.5, 8, 2, 1, 2, 0x00ff00);
    
    // Yellow corner with walls (creates a small maze)
    this.createBox(20, 1, -20, 8, 2, 8, 0xffff00);
    this.createBox(16, 1, -16, 2, 2, 6, 0xffff00);
    this.createBox(24, 1, -16, 2, 2, 6, 0xffff00);
    this.createBox(20, 1, -12, 6, 2, 2, 0xffff00);
    
    // Bridge across the middle - extended
    this.createBox(0, 1, 0, 24, 0.5, 4, 0xaaaaaa);
    this.createBox(0, 1, 0, 4, 0.5, 24, 0xaaaaaa);
    
    // Side platforms - moved further out
    this.createBox(14, 1.5, 0, 4, 0.5, 4, 0xaa55aa);
    this.createBox(-14, 1.5, 0, 4, 0.5, 4, 0xaa55aa);
    this.createBox(0, 1.5, 14, 4, 0.5, 4, 0x55aaaa);
    this.createBox(0, 1.5, -14, 4, 0.5, 4, 0x55aaaa);
    
    // Various ramps around the map - moved and resized
    this.createRamp(10, 0.75, 10, 6, 1, 6, 0.3, 0xff00ff);
    this.createRamp(-10, 0.75, -10, 6, 1, 6, -0.3, 0xff00ff);
    this.createRamp(10, 0.75, -10, 6, 1, 6, 0.3, 0xff00ff);
    this.createRamp(-10, 0.75, 10, 6, 1, 6, -0.3, 0xff00ff);
    
    // Add some mid-distance platforms
    this.createBox(20, 1, 0, 5, 0.5, 5, 0x996633);
    this.createBox(-20, 1, 0, 5, 0.5, 5, 0x996633);
    this.createBox(0, 1, 20, 5, 0.5, 5, 0x996633);
    this.createBox(0, 1, -20, 5, 0.5, 5, 0x996633);
    
    // Elevated platform with cover
    this.createBox(0, 2, -6, 8, 0.5, 8, 0x999999);
    this.createBox(0, 2.75, -10, 8, 1, 0.5, 0x999999); // Cover wall
    
    // Create cover objects - enlarged and moved
    this.createBox(6, 0.75, 6, 2, 1.5, 2, 0xaaaaaa);
    this.createBox(-6, 0.75, -6, 2, 1.5, 2, 0xaaaaaa);
    this.createBox(6, 0.75, -6, 2, 1.5, 2, 0xaaaaaa);
    this.createBox(-6, 0.75, 6, 2, 1.5, 2, 0xaaaaaa);
    
    // Sniper perches on opposite sides
    this.createBox(-25, 4, 0, 4, 0.5, 4, 0x996633);
    this.createBox(25, 4, 0, 4, 0.5, 4, 0x996633);
    
    // Mid-height circle of platforms
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 16;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.createBox(x, 2, z, 2, 0.5, 2, 0x888888);
    }
    
    // Pillars in various locations - now in a wider circle
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 22;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.createBox(x, 3, z, 1.5, 6, 1.5, 0x888888);
    }
    
    // Add some elevated walkways
    // East-West elevated walkway
    this.createBox(10, 3, 0, 12, 0.5, 2, 0x999999);
    this.createBox(-10, 3, 0, 12, 0.5, 2, 0x999999);
    
    // North-South elevated walkway
    this.createBox(0, 3, 10, 2, 0.5, 12, 0x999999);
    this.createBox(0, 3, -10, 2, 0.5, 12, 0x999999);
    
    // ====== NEW ELEVATED PATHWAY SYSTEM ======
    
    // Create a spiral ramp system that goes up around the map
    // Starting point - North section
    const baseHeight = 1;
    const rampLength = 8;
    const rampWidth = 3;
    const pathWidth = 3;
    
    // Base platform for start of elevated path - North
    this.createBox(0, baseHeight, -25, 6, 0.5, 6, 0x777777);
    
    // First ramp going up - North to East
    this.createRamp(8, baseHeight+1.5, -20, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Platform at first level - East side
    this.createBox(15, baseHeight+3, -15, 6, 0.5, 6, 0x777777);
    
    // Second ramp going up - East to Southeast
    this.createRamp(18, baseHeight+4.5, -8, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Platform at second level - Southeast
    this.createBox(22, baseHeight+6, 0, 6, 0.5, 6, 0x777777);
    
    // Third ramp going up - Southeast to South
    this.createRamp(18, baseHeight+7.5, 8, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Platform at third level - South
    this.createBox(15, baseHeight+9, 15, 6, 0.5, 6, 0x777777);
    
    // Fourth ramp going up - South to Southwest
    this.createRamp(8, baseHeight+10.5, 18, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Platform at fourth level - Southwest
    this.createBox(0, baseHeight+12, 22, 6, 0.5, 6, 0x777777);
    
    // Fifth ramp going up - Southwest to West
    this.createRamp(-8, baseHeight+13.5, 18, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Platform at fifth level - West
    this.createBox(-15, baseHeight+15, 15, 6, 0.5, 6, 0x777777);
    
    // Sixth ramp going up - West to Northwest
    this.createRamp(-18, baseHeight+16.5, 8, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Platform at sixth level - Northwest
    this.createBox(-22, baseHeight+18, 0, 6, 0.5, 6, 0x777777);
    
    // Seventh ramp going up - Northwest to North
    this.createRamp(-18, baseHeight+19.5, -8, rampLength, 0.5, rampWidth, 0.3, 0x777777);
    
    // Final platform at top level - North
    this.createBox(-15, baseHeight+21, -15, 6, 0.5, 6, 0x777777);
    
    // ====== CONNECTING BRIDGES BETWEEN SPIRAL LEVELS ======
    
    // Connect level 1 to level 3
    this.createBox(18, baseHeight+3, -7, pathWidth, 0.5, 16, 0x777777);
    
    // Connect level 2 to level 4
    this.createBox(10, baseHeight+6, 18, 14, 0.5, pathWidth, 0x777777);
    
    // Connect level 3 to level 5
    this.createBox(-7, baseHeight+9, 18, 16, 0.5, pathWidth, 0x777777);
    
    // Connect level 4 to level 6
    this.createBox(-18, baseHeight+12, 10, pathWidth, 0.5, 14, 0x777777);
    
    // Connect level 5 to level 7
    this.createBox(-18, baseHeight+15, -7, pathWidth, 0.5, 16, 0x777777);
    
    // Connect level 6 to final platform
    this.createBox(-17, baseHeight+18, -15, 10, 0.5, pathWidth, 0x777777);
    
    // Add railings to prevent falling off the elevated paths
    // North platform railings
    this.createBox(0, baseHeight+1.5, -27, 6, 1, 0.5, 0x555555);
    this.createBox(3, baseHeight+1.5, -25, 0.5, 1, 6, 0x555555);
    this.createBox(-3, baseHeight+1.5, -25, 0.5, 1, 6, 0x555555);
    
    // Final platform railings
    this.createBox(-15, baseHeight+22.5, -17, 6, 1, 0.5, 0x555555);
    this.createBox(-17, baseHeight+22.5, -15, 0.5, 1, 6, 0x555555);
    this.createBox(-13, baseHeight+22.5, -15, 0.5, 1, 6, 0x555555);
    
    // ====== JUMPING PLATFORM SEQUENCES ======
    
    // === SEQUENCE 1: Northeast Quadrant Jumping Platforms ===
    // These platforms create a jumping path from ground level to elevated heights
    const jumpPlatformColor = 0x88CC99; // Greenish platforms for jumping sequences
    
    // Starting point near northeast
    this.createBox(12, 1, -12, 2, 0.3, 2, jumpPlatformColor);
    
    // Sequence going up with progressively higher platforms
    this.createBox(15, 2, -14, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(18, 3, -12, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(20, 4, -9, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(22, 5, -5, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(24, 6, -2, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(26, 7, 2, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(24, 8, 6, 2, 0.3, 2, jumpPlatformColor);
    this.createBox(21, 9, 9, 2, 0.3, 2, jumpPlatformColor);
    
    // === SEQUENCE 2: Southeast Floating Islands ===
    // A sequence of floating platforms arranged in a circular pattern
    const islandColor = 0x99AADD; // Blueish platforms for the floating islands
    
    // Central floating island
    this.createBox(10, 5, 10, 4, 0.4, 4, islandColor);
    
    // Surrounding smaller islands in a circular pattern
    const islandCount = 8;
    const islandRadius = 8;
    for (let i = 0; i < islandCount; i++) {
      const angle = (i / islandCount) * Math.PI * 2;
      const x = 10 + Math.cos(angle) * islandRadius;
      const z = 10 + Math.sin(angle) * islandRadius;
      // Vary heights slightly to make it more interesting
      const height = 5 + Math.sin(angle * 2) * 1.5;
      this.createBox(x, height, z, 2.5, 0.4, 2.5, islandColor);
    }
    
    // === SEQUENCE 3: Southwest Ascending Staircase ===
    // A more structured sequence of platforms forming a staircase pattern
    const stairColor = 0xDDAA88; // Orangish platforms for the staircase
    
    // Starting platform
    this.createBox(-10, 1, 10, 3, 0.3, 3, stairColor);
    
    // Staircase platforms - 10 steps ascending
    for (let i = 1; i <= 10; i++) {
      const offset = i * 1.5; // Each step moves diagonally
      const height = 1 + i * 0.8; // Each step goes higher
      this.createBox(-10 - offset, height, 10 + offset, 2, 0.3, 2, stairColor);
    }
    
    // === SEQUENCE 4: Northwest Zigzag Path ===
    // A zigzag path of platforms going upward
    const zigzagColor = 0xCC88DD; // Purplish platforms for zigzag
    
    // Starting point
    this.createBox(-15, 1, -5, 2, 0.3, 2, zigzagColor);
    
    // Zigzag pattern - alternating left and right while ascending
    for (let i = 1; i <= 8; i++) {
      const xOffset = (i % 2 === 0) ? -3 : 3; // Alternating left/right
      const zOffset = -2; // Always moving forward (north)
      const height = 1 + i * 1.2; // Going higher with each step
      
      // Position relative to the previous platform
      const x = -15 + (xOffset * Math.floor((i + 1) / 2));
      const z = -5 + (zOffset * i);
      
      this.createBox(x, height, z, 2, 0.3, 2, zigzagColor);
    }
    
    // === SEQUENCE 5: Central Jumping Challenge ===
    // A central sequence of smaller platforms requiring precise jumps
    const challengeColor = 0xFF5555; // Red platforms for the challenging jumps
    
    // Starting platform
    this.createBox(0, 4, 0, 1.5, 0.3, 1.5, challengeColor);
    
    // Create a circular pattern of small platforms around the center
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      // Spiral outward and upward
      const distance = 2 + (i * 0.5);
      const height = 4 + (i * 0.4);
      
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      
      // Smaller platforms for more challenging jumps
      this.createBox(x, height, z, 1, 0.3, 1, challengeColor);
    }
    
    // === SEQUENCE 6: Western Wall Climbing Challenge ===
    // Platforms attached to the western wall that go up
    const wallClimbColor = 0xDDDD55; // Yellow platforms for wall climbing
    
    // Starting near the western wall, at ground level
    this.createBox(-27, 1, 0, 2, 0.3, 2, wallClimbColor);
    
    // Create platforms going up along the wall
    for (let i = 1; i <= 12; i++) {
      // Alternate between going north and south along the wall
      const zOffset = (i % 2 === 0) ? 3 : -3;
      const z = (i % 4 < 2) ? zOffset * Math.ceil(i/2) : zOffset * Math.floor(i/2);
      
      const height = 1 + i * 1;
      this.createBox(-27, height, z, 2, 0.3, 2, wallClimbColor);
    }
    
    // === SEQUENCE 7: Eastern "Floating Bridge" ===
    // Small floating platforms forming a bridge across a section
    const bridgeColor = 0x55DDDD; // Cyan platforms for the bridge
    
    // Create a bridge of small, closely spaced platforms
    for (let i = 0; i < 15; i++) {
      const x = 20;
      const z = -15 + (i * 2); // From north to south
      // Slightly wavy height pattern
      const height = 7 + Math.sin(i * 0.7) * 1;
      
      this.createBox(x, height, z, 1.5, 0.3, 1, bridgeColor);
    }
  }
  
  // Add dynamic objects that can be shot
  addDynamicObjects() {
    if (!this.physics) return;
    
    // Create multiple stacks of boxes in different locations
    const locations = [
      { x: 0, y: 0.5, z: -10 },
      { x: 10, y: 0.5, z: 0 },
      { x: -10, y: 0.5, z: 0 },
      { x: 0, y: 2.5, z: 0 },
      { x: 15, y: 0.5, z: 15 },
      { x: -15, y: 0.5, z: -15 },
      { x: 15, y: 0.5, z: -15 },
      { x: -15, y: 0.5, z: 15 },
      { x: 25, y: 0.5, z: 0 },
      { x: -25, y: 0.5, z: 0 },
      { x: 0, y: 0.5, z: 25 },
      { x: 0, y: 0.5, z: -25 }
    ];
    
    // Create a stack of boxes at each location
    locations.forEach(loc => {
      const boxSize = 0.5;
      const spacing = 0.6;
      
      for (let y = 0; y < 3; y++) {
        for (let x = -1; x <= 1; x++) {
          for (let z = -1; z <= 1; z++) {
            const posX = loc.x + x * spacing;
            const posY = loc.y + boxSize/2 + y * spacing;
            const posZ = loc.z + z * spacing;
            
            // Randomize colors slightly
            const randomColor = 0xaa0000 + Math.floor(Math.random() * 0x55ffff);
            this.createDynamicBox(posX, posY, posZ, boxSize, boxSize, boxSize, randomColor);
          }
        }
      }
    });
    
    // Create many spheres across the map (increased count and spread)
    for (let i = 0; i < 50; i++) {
      // Random position within the expanded map bounds
      const x = (Math.random() * 56 - 28);
      const y = 2 + Math.random() * 3;
      const z = (Math.random() * 56 - 28);
      
      // Random size and color
      const radius = 0.3 + Math.random() * 0.4;
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const color = (r << 16) | (g << 8) | b;
      
      this.createDynamicSphere(x, y, z, radius, color);
    }
    
    // Create some special large dynamic objects
    // Large ball on central platform
    this.createDynamicSphere(0, 4, 0, 1.5, 0xff0000);
    
    // Medium balls in corners (moved further out)
    this.createDynamicSphere(24, 3, 24, 1.2, 0x00ff00);
    this.createDynamicSphere(-24, 3, 24, 1.2, 0x0000ff);
    this.createDynamicSphere(24, 3, -24, 1.2, 0xffff00);
    this.createDynamicSphere(-24, 3, -24, 1.2, 0xff00ff);
    
    // Create some special effect dynamic boxes (metallic) - increased count
    for (let i = 0; i < 20; i++) {
      const x = (Math.random() * 50 - 25);
      const y = 1 + Math.random() * 3;
      const z = (Math.random() * 50 - 25);
      
      // Create a special metallic box
      this.createMetallicBox(x, y, z);
    }
  }
  
  // Create a static box obstacle with physics
  createBox(x, y, z, width, height, depth, color) {
    // Create visual mesh
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.3
    });
    const box = new THREE.Mesh(geometry, material);
    
    // Position
    box.position.set(x, y, z);
    
    // Enable shadows
    box.castShadow = true;
    box.receiveShadow = true;
    
    // Add to scene
    this.scene.add(box);
    
    // Create physics body
    const boxShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
    const boxBody = new CANNON.Body({
      mass: 0, // Static
      position: new CANNON.Vec3(x, y, z),
      shape: boxShape,
      material: new CANNON.Material({
        friction: 0.3,
        restitution: 0.3
      })
    });
    
    // Add to physics world and link with mesh
    this.physics.world.addBody(boxBody);
    this.physics.linkBodyToMesh(boxBody, box, 'obstacle');
    
    return { mesh: box, body: boxBody };
  }
  
  // Create a dynamic box with physics
  createDynamicBox(x, y, z, width, height, depth, color) {
    // Create visual mesh
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.5
    });
    const box = new THREE.Mesh(geometry, material);
    box.name = 'DynamicBox';
    
    // Position
    box.position.set(x, y, z);
    
    // Enable shadows
    box.castShadow = true;
    box.receiveShadow = true;
    
    // Add to scene
    this.scene.add(box);
    
    // Create physics body
    const boxShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
    const boxBody = new CANNON.Body({
      mass: 5, // Dynamic with mass
      position: new CANNON.Vec3(x, y, z),
      shape: boxShape,
      material: new CANNON.Material({
        friction: 0.3,
        restitution: 0.5
      })
    });
    
    // Add random rotation to make stacks more interesting
    boxBody.quaternion.setFromEuler(
      Math.random() * 0.1,
      Math.random() * 0.1,
      Math.random() * 0.1
    );
    
    // Add to physics world and link with mesh
    this.physics.world.addBody(boxBody);
    this.physics.linkBodyToMesh(boxBody, box, 'dynamic');
    
    return { mesh: box, body: boxBody };
  }
  
  // Create a dynamic sphere with physics
  createDynamicSphere(x, y, z, radius, color) {
    // Create visual mesh
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.2,
      metalness: 0.8
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = 'DynamicSphere';
    
    // Position
    sphere.position.set(x, y, z);
    
    // Enable shadows
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    
    // Add to scene
    this.scene.add(sphere);
    
    // Create physics body
    const sphereShape = new CANNON.Sphere(radius);
    const sphereBody = new CANNON.Body({
      mass: 3, // Dynamic with mass
      position: new CANNON.Vec3(x, y, z),
      shape: sphereShape,
      material: new CANNON.Material({
        friction: 0.1,
        restitution: 0.7
      })
    });
    
    // Add to physics world and link with mesh
    this.physics.world.addBody(sphereBody);
    this.physics.linkBodyToMesh(sphereBody, sphere, 'dynamic');
    
    return { mesh: sphere, body: sphereBody };
  }
  
  // Create a ramp obstacle with physics
  createRamp(x, y, z, width, height, depth, angle, color) {
    // Create visual mesh
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.3
    });
    const ramp = new THREE.Mesh(geometry, material);
    
    // Position
    ramp.position.set(x, y, z);
    
    // Rotate to create a ramp
    ramp.rotation.z = angle;
    
    // Enable shadows
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    
    // Add to scene
    this.scene.add(ramp);
    
    // Create physics body
    const rampShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
    const rampBody = new CANNON.Body({
      mass: 0, // Static
      position: new CANNON.Vec3(x, y, z),
      shape: rampShape,
      material: new CANNON.Material({
        friction: 0.3,
        restitution: 0.3
      })
    });
    
    // Apply the same rotation
    const quaternion = new CANNON.Quaternion();
    quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), angle);
    rampBody.quaternion = quaternion;
    
    // Add to physics world and link with mesh
    this.physics.world.addBody(rampBody);
    this.physics.linkBodyToMesh(rampBody, ramp, 'ramp');
    
    return { mesh: ramp, body: rampBody };
  }
  
  // Create a special metallic box
  createMetallicBox(x, y, z) {
    const size = 0.4 + Math.random() * 0.3;
    
    // Create visual mesh
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 1.0,
      envMapIntensity: 1.0
    });
    const box = new THREE.Mesh(geometry, material);
    box.name = 'MetallicBox';
    
    // Position
    box.position.set(x, y, z);
    
    // Enable shadows
    box.castShadow = true;
    box.receiveShadow = true;
    
    // Add to scene
    this.scene.add(box);
    
    // Create physics body
    const boxShape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
    const boxBody = new CANNON.Body({
      mass: 10, // Heavier than normal boxes
      position: new CANNON.Vec3(x, y, z),
      shape: boxShape,
      material: new CANNON.Material({
        friction: 0.1,
        restitution: 0.8
      })
    });
    
    // Add to physics world and link with mesh
    this.physics.world.addBody(boxBody);
    this.physics.linkBodyToMesh(boxBody, box, 'dynamic');
    
    return { mesh: box, body: boxBody };
  }
  
  // Handle window resize
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  // Show game instructions
  showInstructions() {
    // Create instructions element if it doesn't exist
    if (!document.getElementById('instructions')) {
      const instructions = document.createElement('div');
      instructions.id = 'instructions';
      instructions.innerHTML = `
        <div style="position: absolute; top: 20px; left: 20px; color: white; background-color: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px; font-family: Arial; max-width: 400px;">
          <h2 style="margin-top: 0;">Controls:</h2>
          <p>QWERTY: WASD / AZERTY: ZQSD - Move</p>
          <p>AZERTY: Z - Forward, Q - Left, S - Backward, D - Right</p>
          <p>Mouse - Look around</p>
          <p>Space - Jump</p>
          <p>Shift - Sprint</p>
          <p>Left Click - Shoot</p>
          <p>F3 - Toggle debug info</p>
          <p>Click on the game to activate controls</p>
        </div>
      `;
      document.body.appendChild(instructions);
      
      // Hide instructions when the pointer is locked
      document.addEventListener('pointerlockchange', () => {
        instructions.style.display = document.pointerLockElement ? 'none' : 'block';
      });
    }
    
    // Create crosshair if it doesn't exist
    if (!document.getElementById('crosshair')) {
      const crosshair = document.createElement('div');
      crosshair.id = 'crosshair';
      crosshair.style.position = 'absolute';
      crosshair.style.top = '50%';
      crosshair.style.left = '50%';
      crosshair.style.transform = 'translate(-50%, -50%)';
      crosshair.style.width = '10px';
      crosshair.style.height = '10px';
      crosshair.style.backgroundColor = 'transparent';
      crosshair.style.border = '2px solid white';
      crosshair.style.borderRadius = '50%';
      crosshair.style.pointerEvents = 'none';
      crosshair.style.zIndex = '999';
      
      // Create inner dot
      const innerDot = document.createElement('div');
      innerDot.style.position = 'absolute';
      innerDot.style.top = '50%';
      innerDot.style.left = '50%';
      innerDot.style.transform = 'translate(-50%, -50%)';
      innerDot.style.width = '2px';
      innerDot.style.height = '2px';
      innerDot.style.backgroundColor = 'white';
      innerDot.style.borderRadius = '50%';
      
      crosshair.appendChild(innerDot);
      document.body.appendChild(crosshair);
    }
  }
  
  // Create debug info
  createDebugInfo() {
    const debugInfo = document.createElement('div');
    debugInfo.id = 'debug-info';
    debugInfo.style.position = 'absolute';
    debugInfo.style.bottom = '10px';
    debugInfo.style.right = '10px';
    debugInfo.style.color = 'white';
    debugInfo.style.fontFamily = 'monospace';
    debugInfo.style.fontSize = '12px';
    debugInfo.style.backgroundColor = 'rgba(0,0,0,0.5)';
    debugInfo.style.padding = '5px';
    debugInfo.style.borderRadius = '3px';
    debugInfo.style.pointerEvents = 'none';
    debugInfo.style.maxWidth = '300px';
    debugInfo.style.display = 'none'; // Hidden by default
    document.body.appendChild(debugInfo);
    
    // Toggle debug info with 'F3'
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
      }
    });
    
    this.debugInfo = debugInfo;
    this.updateDebugInfo();
  }
  
  // Update debug info
  updateDebugInfo() {
    const debugInfoElement = document.getElementById('debug-info');
    if (!debugInfoElement) return;
    
    // Hide/show debug info with Tab key
    if (this.inputHandler.keys.tab) {
      debugInfoElement.style.display = 'block';
    } else {
      debugInfoElement.style.display = 'none';
      return;
    }
    
    // Get information about the game state
    const player = this.player || { position: { x: 0, y: 0, z: 0 } };
    const physics = this.physics || { bodies: [] };
    const networkStatus = this.network && this.network.connected ? 'Connected' : 'Disconnected';
    const playerCount = this.network ? Object.keys(this.network.players).length : 0;
    const pickupCount = this.pickupManager ? this.pickupManager.pickups.length : 0;
    
    debugInfoElement.innerHTML = `
      <div>Position: (${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})</div>
      <div>FPS: ${(1 / this.deltaTime).toFixed(0)}</div>
      <div>Physics Bodies: ${physics.bodies.length}</div>
      <div>Health: ${player.health}</div>
      <div>Armor: ${player.armor}</div>
      <div>Active Trails: ${player.weapons.activeTrails.length}</div>
      <div>Active Impacts: ${player.weapons.activeImpacts.length}</div>
      <div>Pickups: ${pickupCount}</div>
      <div>Network: ${networkStatus}</div>
      <div>Players Online: ${playerCount}</div>
    `;
  }
  
  // Animation loop
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    // Calculate delta time
    const currentTime = this.clock.getElapsedTime();
    this.deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Cap delta time to avoid huge jumps
    if (this.deltaTime > 0.1) this.deltaTime = 0.1;
    
    // Update physics
    if (this.physics) {
      this.physics.update(this.deltaTime);
      this.physics.updateMeshes();
    }
    
    // Update player
    if (this.player) {
      this.player.update(this.deltaTime);
      
      // Send network updates on a regular interval
      if (this.network && this.network.connected) {
        this.lastNetworkUpdate += this.deltaTime;
        if (this.lastNetworkUpdate >= this.networkUpdateRate) {
          this.network.sendMovementUpdate(this.player.position, this.player.rotation);
          this.lastNetworkUpdate = 0;
        }
      }
    }
    
    // Update pickups
    if (this.pickupManager) {
      this.pickupManager.update(this.deltaTime);
      
      // Check for pickup collisions
      if (this.player) {
        this.pickupManager.checkCollisions(this.player);
      }
    }
    
    // Update network
    if (this.network) {
      this.network.update(this.deltaTime);
    }
    
    // Update debug info
    this.updateDebugInfo();
    
    // Reset mouse delta at the end of the frame
    if (this.inputHandler) {
      this.inputHandler.resetMouseDelta();
    }
    
    // Add keyboard shortcut for system verification
    if (this.inputHandler && this.inputHandler.keys && 
        this.lastPressedV !== this.inputHandler.keys.forward) {
      if (this.inputHandler.keys.forward) {
        // Only trigger when V is first pressed
        this.verifySystemsInitialization();
      }
      this.lastPressedV = this.inputHandler.keys.forward;
    }
    
    // Render
    this.render();
  }
  
  // Render scene
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  
  // Method to verify system initialization
  verifySystemsInitialization() {
    console.log("========== SYSTEM VERIFICATION ==========");
    
    // Check scene
    console.log("Scene:", this.scene ? "OK" : "MISSING");
    if (this.scene) {
      console.log("Scene children:", this.scene.children.length);
      
      // Count meshes by type
      let boxCount = 0;
      let sphereCount = 0;
      let planeCount = 0;
      
      this.scene.traverse(obj => {
        if (obj.isMesh) {
          if (obj.geometry.type.includes('Box')) boxCount++;
          if (obj.geometry.type.includes('Sphere')) sphereCount++;
          if (obj.geometry.type.includes('Plane')) planeCount++;
        }
      });
      
      console.log(`Scene contains: ${boxCount} boxes, ${sphereCount} spheres, ${planeCount} planes`);
    }
    
    // Check physics
    console.log("Physics:", this.physics ? "OK" : "MISSING");
    if (this.physics) {
      console.log("Physics bodies:", this.physics.bodies.length);
      console.log("Ground body:", this.physics.groundBody ? "OK" : "MISSING");
    }
    
    // Check player
    console.log("Player:", this.player ? "OK" : "MISSING");
    if (this.player) {
      console.log("Player position:", 
        `(${this.player.position.x.toFixed(2)}, ${this.player.position.y.toFixed(2)}, ${this.player.position.z.toFixed(2)})`);
      console.log("Player physics body:", this.player.physicsBody ? "OK" : "MISSING");
      console.log("Player weapon system:", this.player.weapons ? "OK" : "MISSING");
      console.log("Player armor:", this.player.armor);
      
      if (this.player.weapons) {
        console.log("Weapon physics:", this.player.weapons.physics ? "OK" : "MISSING");
        
        if (this.player.weapons.physics) {
          const samePhysicsInstance = this.player.weapons.physics === this.physics;
          console.log("Same physics instance:", samePhysicsInstance ? "YES" : "NO");
          
          if (!samePhysicsInstance) {
            console.error("CRITICAL ERROR: WeaponSystem has different physics instance than Game!");
            // Fix the reference
            this.player.weapons.physics = this.physics;
            console.log("Fixed physics reference in weapon system");
          }
        }
      }
    }
    
    // Check pickups
    console.log("Pickup manager:", this.pickupManager ? "OK" : "MISSING");
    if (this.pickupManager) {
      console.log("Active pickups:", this.pickupManager.pickups.length);
      console.log("Pickup locations:", this.pickupManager.pickupLocations.length);
    }
    
    // Check input handler
    console.log("Input handler:", this.inputHandler ? "OK" : "MISSING");
    
    // Check network
    console.log("Network:", this.network ? "OK" : "MISSING");
    if (this.network) {
      console.log("Network connected:", this.network.connected ? "YES" : "NO");
      console.log("Socket ID:", this.network.socket ? this.network.socket.id : "No socket");
      console.log("Players:", Object.keys(this.network.players).length);
    }
    
    console.log("========================================");
  }
}

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});

// Initialize immediately if DOM already loaded
if (document.readyState === 'complete') {
  window.game = new Game();
}

// Expose test functions globally to run from console
window.runArmorTest = function(armorAmount = 50) {
  if (!window.game || !window.game.player) {
    console.error('Game or player not initialized!');
    return;
  }
  
  // Set specific values for testing
  window.game.player.health = 100;
  window.game.player.armor = armorAmount;
  
  // Run the test
  window.game.player.testArmorDamage();
};

// Add this diagnostic command to manually test armor protection on a server player
window.testServerArmorProtection = function(targetId, damage = 25) {
  if (!window.game || !window.game.network || !window.game.network.socket) {
    console.error('Game or network not initialized!');
    return;
  }
  
  console.log(`Sending test damage ${damage} to player ${targetId}`);
  window.game.network.socket.emit('playerHit', {
    id: targetId,
    damage: damage
  });
};

// Add this diagnostic command to set armor value for server testing
window.setServerArmor = function(amount = 50) {
  if (!window.game || !window.game.network || !window.game.network.socket) {
    console.error('Game or network not initialized!');
    return;
  }
  
  console.log(`Setting armor to ${amount} (both local and server)`);
  
  // Update local armor first
  if (window.game.player) {
    const oldArmor = window.game.player.armor;
    window.game.player.armor = amount;
    window.game.player.updateArmorDisplay();
    console.log(`Local armor updated: ${oldArmor} → ${amount}`);
  }
  
  // Then send to server
  window.game.network.socket.emit('debugSetArmor', amount);
};

// Add direct damage test command
window.testLocalDamage = function(damage = 25) {
  if (!window.game || !window.game.player) {
    console.error('Game or player not initialized!');
    return;
  }
  
  console.log(`Testing local damage calculation with ${damage} damage on player with ${window.game.player.armor} armor`);
  window.game.player.takeDamage(damage);
  
  return {
    health: window.game.player.health,
    armor: window.game.player.armor
  };
};

// Add this diagnostic command to test armor functionality fully
window.testArmorSystem = function() {
  if (!window.game || !window.game.player) {
    console.error('Game or player not initialized!');
    return;
  }
  
  console.log('=== ARMOR SYSTEM TEST ===');
  
  // Step 1: Set initial state
  const player = window.game.player;
  console.log(`Initial state: Health=${player.health}, Armor=${player.armor}`);
  
  // Step 2: Add armor if not already at max
  if (player.armor < player.maxArmor) {
    const armorToAdd = player.maxArmor - player.armor;
    console.log(`Adding ${armorToAdd} armor`);
    player.addArmor(armorToAdd);
  } else {
    console.log('Armor already at maximum');
  }
  
  // Step 3: Force armor sync with server
  console.log('Forcing armor sync with server');
  player.syncArmorWithServer();
  
  // Step 4: Apply test damage to see armor protection
  console.log('\nWait 1 second for server sync, then apply test damage...');
  setTimeout(() => {
    console.log('Applying 25 test damage with armor protection');
    window.testLocalDamage(25);
    
    // Report final state
    console.log(`\nFinal state: Health=${player.health}, Armor=${player.armor}`);
    console.log('If armor protection is working, health should have dropped by ~5 points (20% of damage)');
    console.log('and armor should have absorbed ~20 points (80% of damage)');
    console.log('=== TEST COMPLETE ===');
  }, 1000);
  
  return "Test initiated - check console for results";
};

// Add a multi-shot armor test to verify protection is consistent
window.testMultipleShots = function(shots = 3, damagePerShot = 25) {
  if (!window.game || !window.game.player) {
    console.error('Game or player not initialized!');
    return;
  }
  
  const player = window.game.player;
  
  // Reset to initial state
  player.health = 100;
  player.armor = 100;
  player.updateHealthDisplay();
  player.updateArmorDisplay();
  player.syncArmorWithServer();
  
  console.log('=== MULTIPLE SHOTS TEST ===');
  console.log(`Initial state: Health=${player.health}, Armor=${player.armor}`);
  console.log(`Testing ${shots} shots of ${damagePerShot} damage each`);
  console.log('With 80% armor protection:');
  console.log(`- Each shot should do ~${(damagePerShot * 0.2).toFixed(1)} damage to health`);
  console.log(`- Each shot should do ~${(damagePerShot * 0.8).toFixed(1)} damage to armor`);
  console.log('Expected final values after all shots:');
  console.log(`- Health: ~${(100 - (shots * damagePerShot * 0.2)).toFixed(1)}`);
  console.log(`- Armor: ~${Math.max(0, 100 - (shots * damagePerShot * 0.8)).toFixed(1)}`);
  
  // Apply shots with 500ms delay between each
  let shotCount = 0;
  
  function applyNextShot() {
    if (shotCount < shots) {
      shotCount++;
      console.log(`\nApplying shot #${shotCount}:`);
      window.testLocalDamage(damagePerShot);
      
      // Schedule next shot
      setTimeout(applyNextShot, 500);
    } else {
      // Final report
      console.log(`\nFinal state after ${shots} shots:`);
      console.log(`- Health: ${player.health.toFixed(1)}`);
      console.log(`- Armor: ${player.armor.toFixed(1)}`);
      
      // Calculate if protection worked correctly
      const expectedHealthLoss = shots * damagePerShot * 0.2;
      const actualHealthLoss = 100 - player.health;
      const expectedArmorLoss = Math.min(100, shots * damagePerShot * 0.8);
      const actualArmorLoss = 100 - player.armor;
      
      console.log(`\nExpected vs Actual Results:`);
      console.log(`- Health loss: ${expectedHealthLoss.toFixed(1)} vs ${actualHealthLoss.toFixed(1)}`);
      console.log(`- Armor loss: ${expectedArmorLoss.toFixed(1)} vs ${actualArmorLoss.toFixed(1)}`);
      
      if (Math.abs(expectedHealthLoss - actualHealthLoss) < 1 &&
          Math.abs(expectedArmorLoss - actualArmorLoss) < 1) {
        console.log('✅ ARMOR PROTECTION IS WORKING CORRECTLY');
      } else {
        console.log('❌ CALCULATION ERROR DETECTED');
      }
      
      console.log('=== TEST COMPLETE ===');
    }
  }
  
  // Start applying shots
  setTimeout(applyNextShot, 1000);
  
  return "Multiple shots test initiated - check console for results";
};

// Add a test for the transition from having armor to no armor
window.testArmorDepletion = function(initialArmor = 20, damagePerShot = 25, shots = 2) {
  if (!window.game || !window.game.player) {
    console.error('Game or player not initialized!');
    return;
  }
  
  const player = window.game.player;
  
  // Reset to initial state with limited armor
  player.health = 100;
  player.armor = initialArmor;
  player.updateHealthDisplay();
  player.updateArmorDisplay();
  player.syncArmorWithServer();
  
  console.log('=== ARMOR DEPLETION TEST ===');
  console.log(`Initial state: Health=${player.health}, Armor=${player.armor}`);
  console.log(`Testing ${shots} shots of ${damagePerShot} damage each`);
  console.log(`First shot should deplete armor and do some health damage`);
  console.log(`Second shot should do FULL damage to health (${damagePerShot})`);
  
  // Apply shots with 1000ms delay between each
  let shotCount = 0;
  
  function applyNextShot() {
    if (shotCount < shots) {
      shotCount++;
      console.log(`\n*** Shot #${shotCount}: ***`);
      window.testLocalDamage(damagePerShot);
      
      // Schedule next shot
      setTimeout(applyNextShot, 1000);
    } else {
      // Final report
      console.log(`\nFinal state after ${shots} shots:`);
      console.log(`- Health: ${player.health.toFixed(1)}`);
      console.log(`- Armor: ${player.armor.toFixed(1)}`);
      
      // Verify armor depletion logic
      if (player.armor === 0) {
        console.log('✅ Armor was fully depleted as expected');
      } else {
        console.log('❌ Armor was not fully depleted!');
      }
      
      // Expected health after shots
      const armorProtection = 0.8;
      const firstShotArmorAbsorption = Math.min(initialArmor, damagePerShot * armorProtection);
      const firstShotHealthDamage = damagePerShot - firstShotArmorAbsorption;
      const secondShotHealthDamage = shots > 1 ? damagePerShot : 0;
      const expectedHealth = 100 - firstShotHealthDamage - secondShotHealthDamage;
      
      console.log(`\nExpected health: ${expectedHealth.toFixed(1)}`);
      console.log(`Actual health: ${player.health.toFixed(1)}`);
      
      if (Math.abs(player.health - expectedHealth) < 0.1) {
        console.log('✅ Health damage calculation is CORRECT');
      } else {
        console.log('❌ Health damage calculation is INCORRECT');
        console.log('   This indicates the armor depletion logic is not working properly');
      }
      
      console.log('=== TEST COMPLETE ===');
    }
  }
  
  // Start applying shots after a delay
  setTimeout(applyNextShot, 1000);
  
  return "Armor depletion test initiated - check console for results";
};

// Add a function to help fix client-server desynchronization
window.fixArmorSync = function() {
  if (!window.game || !window.game.player || !window.game.network) {
    console.error('Game, player, or network not initialized!');
    return;
  }
  
  console.log('=== FIXING CLIENT-SERVER ARMOR SYNC ===');
  console.log(`Current client armor: ${window.game.player.armor}`);
  
  // Force a sync of armor with server
  window.game.player.syncArmorWithServer();
  
  // Fix potential health display issues
  window.game.player.updateHealthDisplay();
  window.game.player.updateArmorDisplay();
  
  console.log('Armor value has been sent to server');
  console.log('Displays have been updated');
  console.log('=== SYNC COMPLETE ===');
  
  return "Armor sync command executed - check console for details";
};

// Add a diagnostic function to check armor system status
window.checkArmorStatus = function() {
  if (!window.game || !window.game.player) {
    console.error('Game or player not initialized!');
    return;
  }
  
  console.log('=== ARMOR SYSTEM DIAGNOSTIC ===');
  
  // Local client values
  console.log(`Client Health: ${window.game.player.health}`);
  console.log(`Client Armor: ${window.game.player.armor}`);
  console.log(`Armor Protection: ${window.game.player.armorProtection * 100}%`);
  
  // Force immediate sync with server
  console.log('\nForcing sync with server...');
  window.game.player.syncArmorWithServer();
  
  // Check for desynchronization
  if (window.game.player.armor > 0) {
    console.log('\nArmor Protection Test:');
    console.log('With current armor, a 25-damage hit should:');
    console.log(`- Remove ${Math.round(25 * 0.8)} armor points (80% of damage)`);
    console.log(`- Remove ${Math.round(25 * 0.2)} health points (20% of damage)`);
  } else {
    console.log('\nNo armor available - each hit will do full damage to health.');
  }
  
  console.log('\nIf damage calculation seems wrong:');
  console.log('1. Use window.setServerArmor(100) to set armor to 100');
  console.log('2. Use window.fixArmorSync() to fix desynchronization');
  console.log('3. Use window.testArmorSystem() to run a full test');
  
  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  
  return "Armor status checked - see console for details";
}; 