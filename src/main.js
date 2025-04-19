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
    // Create a large ground plane (100x100 units)
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
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
    
    // Create a border wall to define the arena boundaries
    // North wall
    this.createBox(0, 2, -15, 30, 4, 1, 0x888888);
    // South wall
    this.createBox(0, 2, 15, 30, 4, 1, 0x888888);
    // East wall
    this.createBox(15, 2, 0, 1, 4, 30, 0x888888);
    // West wall
    this.createBox(-15, 2, 0, 1, 4, 30, 0x888888);
    
    // Create various platforms and obstacles spread around the map
    // Main central structure
    this.createBox(0, 0.5, 0, 4, 1, 4, 0xcccccc);
    
    // Red corner platform with ramp
    this.createBox(10, 1, 10, 4, 2, 4, 0xff0000);
    this.createRamp(7, 0.75, 10, 5, 1, 3, 0.3, 0xff5555);
    
    // Blue corner tower
    this.createBox(-10, 1, -10, 3, 2, 3, 0x0000ff);
    this.createBox(-10, 3, -10, 2, 2, 2, 0x5555ff);
    this.createBox(-10, 5, -10, 1, 2, 1, 0x8888ff);
    
    // Green corner with jumping platforms
    this.createBox(-10, 0.5, 10, 3, 1, 3, 0x00ff00);
    this.createBox(-8, 1.5, 8, 1, 1, 1, 0x00ff00);
    this.createBox(-6, 2.5, 6, 1, 1, 1, 0x00ff00);
    this.createBox(-4, 3.5, 4, 1, 1, 1, 0x00ff00);
    
    // Yellow corner with walls (creates a small maze)
    this.createBox(10, 1, -10, 4, 2, 4, 0xffff00);
    this.createBox(8, 1, -8, 1, 2, 3, 0xffff00);
    this.createBox(12, 1, -8, 1, 2, 3, 0xffff00);
    this.createBox(10, 1, -6, 3, 2, 1, 0xffff00);
    
    // Bridge across the middle
    this.createBox(0, 1, 0, 12, 0.5, 2, 0xaaaaaa);
    
    // Side platforms
    this.createBox(7, 1.5, 0, 2, 0.5, 2, 0xaa55aa);
    this.createBox(-7, 1.5, 0, 2, 0.5, 2, 0xaa55aa);
    this.createBox(0, 1.5, 7, 2, 0.5, 2, 0x55aaaa);
    this.createBox(0, 1.5, -7, 2, 0.5, 2, 0x55aaaa);
    
    // Various ramps around the map
    this.createRamp(5, 0.75, 5, 3, 1, 3, 0.3, 0xff00ff);
    this.createRamp(-5, 0.75, -5, 3, 1, 3, -0.3, 0xff00ff);
    this.createRamp(5, 0.75, -5, 3, 1, 3, 0.3, 0xff00ff);
    this.createRamp(-5, 0.75, 5, 3, 1, 3, -0.3, 0xff00ff);
    
    // Elevated platform with cover
    this.createBox(0, 2, -3, 4, 0.5, 4, 0x999999);
    this.createBox(0, 2.75, -5, 4, 1, 0.5, 0x999999); // Cover wall
    
    // Create some cover objects
    this.createBox(3, 0.75, 3, 1, 1.5, 1, 0xaaaaaa);
    this.createBox(-3, 0.75, -3, 1, 1.5, 1, 0xaaaaaa);
    this.createBox(3, 0.75, -3, 1, 1.5, 1, 0xaaaaaa);
    this.createBox(-3, 0.75, 3, 1, 1.5, 1, 0xaaaaaa);
    
    // Sniper perch
    this.createBox(-12, 4, 0, 2, 0.5, 2, 0x996633);
    
    // Pillars in various locations
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 8;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.createBox(x, 2, z, 1, 4, 1, 0x888888);
    }
  }
  
  // Add dynamic objects that can be shot
  addDynamicObjects() {
    if (!this.physics) return;
    
    // Create multiple stacks of boxes in different locations
    const locations = [
      { x: 0, y: 0.5, z: -5 },
      { x: 5, y: 0.5, z: 0 },
      { x: -5, y: 0.5, z: 0 },
      { x: 0, y: 2.5, z: 0 },
      { x: 8, y: 0.5, z: 8 },
      { x: -8, y: 0.5, z: -8 }
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
    
    // Create many spheres across the map
    for (let i = 0; i < 25; i++) {
      // Random position within map bounds
      const x = (Math.random() * 28 - 14);
      const y = 2 + Math.random() * 3;
      const z = (Math.random() * 28 - 14);
      
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
    this.createDynamicSphere(0, 4, 0, 1.2, 0xff0000);
    
    // Medium balls in corners
    this.createDynamicSphere(12, 3, 12, 0.8, 0x00ff00);
    this.createDynamicSphere(-12, 3, 12, 0.8, 0x0000ff);
    this.createDynamicSphere(12, 3, -12, 0.8, 0xffff00);
    this.createDynamicSphere(-12, 3, -12, 0.8, 0xff00ff);
    
    // Create some special effect dynamic boxes (metallic)
    for (let i = 0; i < 10; i++) {
      const x = (Math.random() * 20 - 10);
      const y = 1 + Math.random() * 3;
      const z = (Math.random() * 20 - 10);
      
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