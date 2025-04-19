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
    // Create a larger ground plane (200x200 units)
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2e7d32, // Forest green color
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
    // Create an array to track occupied positions
    this.occupiedPositions = [];
    
    // Add 6 mountains evenly distributed around the map
    this.createMountain(80, 20, 80, 25, 15, 0xff9800);    // Orange mountain (Southeast)
    this.createMountain(-80, 25, 80, 30, 20, 0x795548);   // Brown mountain (Northeast)
    this.createMountain(-80, 30, -80, 35, 25, 0x607d8b);  // Blue-grey mountain (Northwest)
    this.createMountain(80, 22, -80, 28, 18, 0x8bc34a);   // Light green mountain (Southwest)
    this.createMountain(0, 35, -90, 32, 27, 0x9c27b0);    // Purple mountain (North)
    this.createMountain(0, 28, 90, 30, 22, 0x3f51b5);     // Indigo mountain (South)
    
    // Add trees around the world (1000 trees)
    this.addManyTrees(1000);
    
    console.log("Added mountains and trees to create an expansive world");
  }
  
  // Create a mountain using a cone geometry
  createMountain(x, y, z, radius, height, color) {
    // Check if position is already occupied
    if (this.isPositionOccupied(x, z, radius)) {
      console.log(`Cannot place mountain at (${x},${z}) - position occupied`);
      return null;
    }
    
    // Create mountain geometry
    const mountainGeometry = new THREE.ConeGeometry(radius, height, 16); // Increased segments for smoother surface
    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.9,
      metalness: 0.1
    });
    const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
    
    // Position the mountain - ensuring the base is on the ground (y=0)
    mountain.position.set(x, height/2, z);
    
    // Enable shadows
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    
    // Add to scene
    this.scene.add(mountain);
    
    // Create physics body for the mountain
    if (this.physics) {
      // Create a custom mountain material with higher friction
      const mountainMaterial = new CANNON.Material('mountainMaterial');
      
      // Define a contact material between player and mountain (for better traction)
      if (!this.physics.world.getContactMaterial(this.physics.playerMaterial, mountainMaterial)) {
        const playerMountainContact = new CANNON.ContactMaterial(
          this.physics.playerMaterial,
          mountainMaterial,
          {
            friction: 0.9,         // High friction for better climbing
            restitution: 0.1,      // Low bounce
            contactEquationStiffness: 1e8,        // Firmer contact
            contactEquationRelaxation: 3          // Stable contact
          }
        );
        
        // Add the contact material to the world
        this.physics.world.addContactMaterial(playerMountainContact);
      }
      
      // Create mountain shape as a cylinder with tapering
      const mountainShape = new CANNON.Cylinder(radius * 0.05, radius, height, 16);
      
      // Create mountain physics body
      const mountainBody = new CANNON.Body({
        mass: 0, // Static
        position: new CANNON.Vec3(x, height/2, z),
        shape: mountainShape,
        material: mountainMaterial,
        collisionFilterGroup: 1,  // Mountain collision group
        collisionFilterMask: -1   // Collide with everything
      });
      
      // Add mountain physics to world
      this.physics.world.addBody(mountainBody);
      this.physics.linkBodyToMesh(mountainBody, mountain, 'mountain');
      
      // Store reference to the mountain
      if (!this.physics.mountains) {
        this.physics.mountains = [];
      }
      this.physics.mountains.push(mountainBody);
    }
    
    // Mark this area as occupied
    this.markPositionAsOccupied(x, z, radius * 1.2); // Add a buffer around the mountain
    
    return mountain;
  }
  
  // Check if a position is too close to existing objects
  isPositionOccupied(x, z, radius) {
    if (!this.occupiedPositions) {
      this.occupiedPositions = [];
      return false;
    }
    
    for (const pos of this.occupiedPositions) {
      const dx = pos.x - x;
      const dz = pos.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // If the distance is less than the sum of the radii, there's an overlap
      if (distance < (pos.radius + radius)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Mark a position as occupied
  markPositionAsOccupied(x, z, radius) {
    if (!this.occupiedPositions) {
      this.occupiedPositions = [];
    }
    
    this.occupiedPositions.push({ x, z, radius });
  }
  
  // Add many trees across the map
  addManyTrees(count) {
    // Set map bounds, slightly smaller than the actual map to keep trees within boundaries
    const mapBounds = 95;
    const minSpacing = 3; // Minimum spacing between trees
    let treesPlaced = 0;
    let attempts = 0;
    const maxAttempts = count * 5; // Limit attempts to prevent infinite loop
    
    console.log(`Attempting to place ${count} trees...`);
    
    while (treesPlaced < count && attempts < maxAttempts) {
      attempts++;
      
      // Generate random position
      const x = (Math.random() * 2 - 1) * mapBounds;
      const z = (Math.random() * 2 - 1) * mapBounds;
      
      // Random tree size determines spacing needed
      const trunkRadius = 0.3 + Math.random() * 0.2;
      const leavesRadius = 1.5 + Math.random() * 1;
      const spacing = Math.max(leavesRadius, minSpacing);
      
      // Check if position is available
      if (!this.isPositionOccupied(x, z, spacing)) {
        this.createTree(x, 0, z, trunkRadius, leavesRadius);
        this.markPositionAsOccupied(x, z, spacing);
        treesPlaced++;
        
        // Log progress occasionally
        if (treesPlaced % 100 === 0) {
          console.log(`Placed ${treesPlaced} trees so far...`);
        }
      }
    }
    
    console.log(`Successfully placed ${treesPlaced} trees out of ${count} requested (${attempts} attempts)`);
  }
  
  // Create an individual tree
  createTree(x, y, z, trunkRadius, leavesRadius) {
    // Add variation to trunk/leaves
    const trunkHeight = 2 + Math.random() * 3;
    trunkRadius = trunkRadius || (0.3 + Math.random() * 0.2);
    leavesRadius = leavesRadius || (1.5 + Math.random() * 1);
    
    // Small random variation in color
    const trunkColorHue = 0.07 + Math.random() * 0.04; // ~0.07-0.11 (brown hues)
    const leavesColorHue = 0.3 + Math.random() * 0.1; // ~0.3-0.4 (green hues)
    
    // Create trunk
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius, trunkHeight, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(trunkColorHue, 0.5, 0.3), // Brown variations
      roughness: 0.9,
      metalness: 0.1
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    
    // Position trunk
    trunk.position.set(x, y + trunkHeight/2, z);
    
    // Create leaves
    const leavesGeometry = new THREE.SphereGeometry(leavesRadius, 8, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(leavesColorHue, 0.7, 0.4), // Green variations
      roughness: 0.8,
      metalness: 0.1
    });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    
    // Position leaves on top of trunk
    leaves.position.set(x, y + trunkHeight + leavesRadius/2, z);
    
    // Enable shadows
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    
    // Add to scene
    this.scene.add(trunk);
    this.scene.add(leaves);
    
    // Create physics bodies for trunk and leaves (simplified)
    if (this.physics) {
      // Trunk physics
      const trunkShape = new CANNON.Cylinder(trunkRadius, trunkRadius, trunkHeight, 8);
      const trunkBody = new CANNON.Body({
        mass: 0, // Static
        position: new CANNON.Vec3(x, y + trunkHeight/2, z),
        shape: trunkShape,
        material: new CANNON.Material({
          friction: 0.8,
          restitution: 0.2
        })
      });
      
      // Leaves physics (simplified as sphere)
      const leavesShape = new CANNON.Sphere(leavesRadius);
      const leavesBody = new CANNON.Body({
        mass: 0, // Static
        position: new CANNON.Vec3(x, y + trunkHeight + leavesRadius/2, z),
        shape: leavesShape,
        material: new CANNON.Material({
          friction: 0.5,
          restitution: 0.1
        })
      });
      
      // Add to physics world
      this.physics.world.addBody(trunkBody);
      this.physics.world.addBody(leavesBody);
      this.physics.linkBodyToMesh(trunkBody, trunk, 'tree-trunk');
      this.physics.linkBodyToMesh(leavesBody, leaves, 'tree-leaves');
    }
    
    return { trunk, leaves };
  }
  
  // Add dynamic objects that can be shot
  addDynamicObjects() {
    // Removed all dynamic objects to leave only players and armor pickups
    console.log("Dynamic objects removed - arena is now empty except for players and pickups");
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
          // Validate position first
          if (this.player.position && 
              !isNaN(this.player.position.x) && 
              !isNaN(this.player.position.y) && 
              !isNaN(this.player.position.z)) {
            
            // Send the update and check if it was successful
            const updateSent = this.network.sendMovementUpdate(
              this.player.position, 
              this.player.rotation
            );
            
            // Only reset the timer if the update was successfully sent
            if (updateSent) {
              this.lastNetworkUpdate = 0;
            } 
            // If update failed but we're still connected, retry sooner
            else if (this.network.connected) {
              this.lastNetworkUpdate = this.networkUpdateRate * 0.8; // Try again at 80% of the regular interval
            }
          } else {
            console.error('Invalid player position:', this.player.position);
            // Try to fix by using last known good position
            if (this.player.physicsBody && this.player.physicsBody.position) {
              this.player.position.set(
                this.player.physicsBody.position.x,
                this.player.physicsBody.position.y,
                this.player.physicsBody.position.z
              );
              console.log('Reset player position from physics body');
            }
            this.lastNetworkUpdate = this.networkUpdateRate * 0.5; // Try again soon
          }
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