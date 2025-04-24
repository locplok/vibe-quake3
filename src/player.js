import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WeaponSystem } from './weapons.js';

// Define spawn points around the map
const SPAWN_POINTS = [
  // Center area
  { x: 0, y: 1, z: 0 },        // Center
  { x: 10, y: 1, z: 10 },      // Near center
  { x: -10, y: 1, z: 10 },     // Near center
  { x: 10, y: 1, z: -10 },     // Near center
  { x: -10, y: 1, z: -10 },    // Near center
  
  // Mid-range positions
  { x: 40, y: 1, z: 40 },      // Southeast quadrant
  { x: -40, y: 1, z: 40 },     // Northeast quadrant
  { x: -40, y: 1, z: -40 },    // Northwest quadrant
  { x: 40, y: 1, z: -40 },     // Southwest quadrant
  
  // Near mountains
  { x: 70, y: 1, z: 70 },      // Near Orange mountain (Southeast)
  { x: -70, y: 1, z: 70 },     // Near Brown mountain (Northeast)
  { x: -70, y: 1, z: -70 },    // Near Blue-grey mountain (Northwest)
  { x: 70, y: 1, z: -70 },     // Near Light green mountain (Southwest)
  { x: 0, y: 1, z: -80 },      // Near Purple mountain (North)
  { x: 0, y: 1, z: 80 },       // Near Indigo mountain (South)
  
  // Far positions (near map edges)
  { x: 90, y: 1, z: 0 },       // Far east
  { x: -90, y: 1, z: 0 },      // Far west
  { x: 0, y: 1, z: 90 },       // Far south
  { x: 0, y: 1, z: -90 },      // Far north
  { x: 90, y: 1, z: 90 },      // Far southeast corner
  { x: -90, y: 1, z: 90 },     // Far northeast corner
  { x: -90, y: 1, z: -90 },    // Far northwest corner
  { x: 90, y: 1, z: -90 },     // Far southwest corner
  
  // On elevated terrain (for interesting spawns)
  { x: 80, y: 3, z: 80 },      // On Orange mountain base (Southeast)
  { x: -80, y: 3, z: 80 },     // On Brown mountain base (Northeast)
  { x: -80, y: 3, z: -80 },    // On Blue-grey mountain base (Northwest)
  { x: 80, y: 3, z: -80 }      // On Light green mountain base (Southwest)
];

export class Player {
  constructor(scene, camera, inputHandler, physicsWorld) {
    this.scene = scene;
    this.camera = camera;
    this.input = inputHandler;
    this.physics = physicsWorld;
    this.playerHeight = 1.7; // Height in units
    this.playerRadius = 0.5; // Width in units
    this.model = null;
    
    // Physics body
    this.physicsBody = null;
    
    // Movement parameters
    this.moveSpeed = 200.0; // Increased 10x from 20.0 for ultra-fast movement
    this.jumpForce = 500; // Increased from 300 to 500 for higher jumps to reach mountains
    this.sprintMultiplier = 1.5; // Adjusted to make running 3x faster than original walk speed
    this.rotationSpeed = 2.0;
    
    // Jump tracking
    this.canJump = true;
    this.jumpCooldown = 0;
    
    // Debug physics reference
    console.log("Player constructor - Physics reference:", this.physics ? "YES" : "NO");
    if (this.physics) {
      console.log("Physics world has", this.physics.bodies ? this.physics.bodies.length : "unknown", "bodies");
    }
    
    // Initialize weapon system
    this.weapons = new WeaponSystem(scene, physicsWorld);
    console.log("Weapon system initialized with physics:", this.weapons.physics ? "YES" : "NO");
    
    // Ensure the physics reference is set
    if (!this.weapons.physics && this.physics) {
      console.log("Fixing missing physics reference in weapon system");
      this.weapons.physics = this.physics;
    }
    
    // Create an object to hold all player-related objects
    this.playerGroup = new THREE.Group();
    this.scene.add(this.playerGroup);
    
    // Create the player model
    this.createPlayerModel();
    
    // Set up physics
    this.setupPhysics();
    
    // The direction the player is facing (radians)
    this.rotation = 0;
    
    // Create a separate object for camera rotation
    this.cameraHolder = new THREE.Object3D();
    this.cameraHolder.position.set(0, this.playerHeight * 0.8, 0); // Position at eye level
    this.playerGroup.add(this.cameraHolder);
    this.cameraHolder.add(this.camera);
    this.camera.position.set(0, 0, 0); // Camera at the center of the holder
    
    // Current player state
    this.position = new THREE.Vector3(0, this.playerHeight / 2, 0);
    this.velocity = new THREE.Vector3();
    this.health = 100;
    this.armor = 0; // ALWAYS START WITH ZERO ARMOR
    this.maxArmor = 100;
    this.armorProtection = 0.8; // 80% protection
    
    // Choose a random spawn position
    this.respawnAtRandomPosition();
    
    // Create and update displays in the correct order - armor first, then health
    this.createArmorDisplay();
    this.createHealthDisplay();
    
    console.log("Player initialized with health:", this.health, "and armor:", this.armor);
  }
  
  // Get a random spawn point
  getRandomSpawnPoint() {
    const randomIndex = Math.floor(Math.random() * SPAWN_POINTS.length);
    return SPAWN_POINTS[randomIndex];
  }
  
  // Respawn at a random position
  respawnAtRandomPosition() {
    const spawnPoint = this.getRandomSpawnPoint();
    this.setPosition(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    
    // Add a random rotation when spawning
    const randomRotation = Math.random() * Math.PI * 2;
    this.rotation = randomRotation;
    this.playerGroup.rotation.y = this.rotation;
    
    // Log the spawn location
    console.log(`Player spawned at (${spawnPoint.x}, ${spawnPoint.y}, ${spawnPoint.z}) with rotation ${this.rotation.toFixed(2)}`);
  }
  
  createPlayerModel() {
    // Create a capsule shape for the player
    const geometry = new THREE.CapsuleGeometry(this.playerRadius, 1.2, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0000ff, // Blue color
      roughness: 0.7,
      metalness: 0.3
    });
    
    this.model = new THREE.Mesh(geometry, material);
    
    // Position the capsule so its bottom is at y=0
    this.model.position.set(0, this.playerHeight / 2, 0);
    
    // Enable shadows
    this.model.castShadow = true;
    this.model.receiveShadow = true;
    
    // Add model to the player group
    this.playerGroup.add(this.model);
  }
  
  setupPhysics() {
    if (!this.physics) return;
    
    // Create player physics body
    this.physicsBody = this.physics.createPlayerBody(
      new CANNON.Vec3(0, this.playerHeight / 2, 0),
      this.playerRadius,
      this.playerHeight
    );
    
    // Link the physics body to the model
    this.physics.linkBodyToMesh(this.physicsBody, this.model, 'player');
    
    // Note: mountain-specific collision detection is now handled in the physics class
    // We'll use the physicsBody.canJump property that's set there
  }
  
  update(deltaTime) {
    if (!deltaTime) return;
    
    // Handle rotation from mouse input
    this.handleRotation();
    
    // Handle movement from keyboard input
    this.handleMovement(deltaTime);
    
    // Handle jump input
    this.handleJump(deltaTime);
    
    // Handle shooting
    this.handleShooting();
    
    // Update jump cooldown
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= deltaTime;
    }
    
    // Update position from physics
    if (this.physicsBody) {
      this.position.set(
        this.physicsBody.position.x,
        this.physicsBody.position.y,
        this.physicsBody.position.z
      );
    }
    
    // Update weapon system with current time
    if (this.weapons) {
      this.weapons.update(performance.now() / 1000);
    }
    
    // Update camera and model positions
    this.updatePositions();
  }
  
  handleRotation() {
    if (!this.input) return;
    
    // Apply horizontal mouse movement to player rotation (Y-axis)
    if (this.input.mouse.dx !== 0) {
      // Left/right rotation - standard behavior (negative dx = look left)
      this.rotation -= this.input.mouse.dx * this.input.mouseSensitivity;
      this.playerGroup.rotation.y = this.rotation;
      
      // Debug horizontal rotation
      if (Math.abs(this.input.mouse.dx) > 10) {
        console.log(`Horizontal rotation: ${this.rotation.toFixed(3)} from dx=${this.input.mouse.dx}`);
      }
    }
    
    // Apply vertical mouse movement to camera pitch (X-axis)
    if (this.input.mouse.dy !== 0) {
      // Calculate the standard pitch change first, with positive dy resulting in positive pitch
      const standardPitchChange = this.input.mouse.dy * this.input.mouseSensitivity;
      
      // Debug vertical rotation
      if (Math.abs(this.input.mouse.dy) > 10) {
        console.log(`Vertical rotation: dy=${this.input.mouse.dy}, pitchChange=${standardPitchChange.toFixed(5)}`);
      }
      
      const currentPitch = this.cameraHolder.rotation.x;
      
      // For standard controls: 
      // - Mouse up (negative dy) → Look up (negative pitch)
      // - Mouse down (positive dy) → Look down (positive pitch)
      
      // For inverted controls (what we want):
      // - Mouse up (negative dy) → Look down (positive pitch)
      // - Mouse down (positive dy) → Look up (negative pitch)
      
      // Invert by negating the whole pitch calculation
      const newPitch = currentPitch - standardPitchChange;
      
      // Limit vertical rotation to prevent flipping
      if (newPitch < Math.PI / 2 && newPitch > -Math.PI / 2) {
        this.cameraHolder.rotation.x = newPitch;
        
        if (Math.abs(this.input.mouse.dy) > 10) {
          console.log(`Applied pitch: ${newPitch.toFixed(3)}`);
        }
      }
    }
    
    // Apply rotation to physics body (important for movement direction)
    if (this.physicsBody) {
      // We only want to change the Y-axis rotation of the physics body
      const rotationQuat = new CANNON.Quaternion();
      rotationQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotation);
      
      // Reset the body's rotation and apply only the Y-axis rotation
      this.physicsBody.quaternion = rotationQuat;
    }
  }
  
  handleMovement(deltaTime) {
    if (!this.input || !this.physicsBody) return;
    
    // Calculate movement input direction
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    if (this.input.keys.forward) moveDirection.z -= 1;
    if (this.input.keys.backward) moveDirection.z += 1;
    if (this.input.keys.left) moveDirection.x -= 1;
    if (this.input.keys.right) moveDirection.x += 1;
    
    // Apply additional dampening for better control
    const lateralVelocity = new CANNON.Vec3(
      this.physicsBody.velocity.x,
      0,
      this.physicsBody.velocity.z
    );
    
    // Apply stronger dampening force when not moving
    if (moveDirection.length() < 0.1) {
      // Strong dampening when no keys are pressed (very quick stop at high speeds)
      this.physicsBody.velocity.x *= 0.5; // Increased dampening from 0.7 to 0.5 for quicker stops at high speed
      this.physicsBody.velocity.z *= 0.5;
      return;
    } else {
      // Lighter dampening when moving (for better control at high speeds)
      this.physicsBody.velocity.x *= 0.7; // Increased from 0.85 to 0.7 for better handling at ultra-high speed
      this.physicsBody.velocity.z *= 0.7;
    }
    
    // Normalize to prevent faster diagonal movement
    if (moveDirection.length() > 0) {
      moveDirection.normalize();
    } else {
      // No movement keys pressed, already applied dampening
      return;
    }
    
    // Calculate base speed (with sprint if active)
    const baseSpeed = this.moveSpeed * (this.input.keys.sprint ? this.sprintMultiplier : 1);
    
    // Scale by speed
    moveDirection.multiplyScalar(baseSpeed);
    
    // Apply rotation to movement direction
    moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
    
    // Apply movement as impulse relative to player's mass
    const impulse = new CANNON.Vec3(
      moveDirection.x * deltaTime * this.physicsBody.mass,
      0, // We don't want vertical impulse from movement
      moveDirection.z * deltaTime * this.physicsBody.mass
    );
    
    this.physicsBody.applyImpulse(impulse);
  }
  
  handleJump(deltaTime) {
    if (!this.input || !this.physicsBody) return;
    
    // Check if jump key is pressed and we can jump
    // Now using the physicsBody.canJump property set by collision detection
    if (this.input.keys.jump && this.physicsBody.canJump && this.jumpCooldown <= 0) {
      // Apply upward impulse
      const jumpImpulse = new CANNON.Vec3(0, this.jumpForce, 0);
      this.physicsBody.applyImpulse(jumpImpulse);
      
      // Set jump cooldown and disable jumping until land
      this.physicsBody.canJump = false;
      this.jumpCooldown = 0.3; // 300ms cooldown
      
      console.log("Player jumped from position:", 
        this.physicsBody.position.x.toFixed(2),
        this.physicsBody.position.y.toFixed(2), 
        this.physicsBody.position.z.toFixed(2));
    }
  }
  
  handleShooting() {
    if (!this.input || !this.weapons) return;
    
    // Always ensure weapon system has physics reference
    if (!this.weapons.physics && this.physics) {
      console.log("Fixing missing physics reference in weapon system");
      this.weapons.physics = this.physics;
    }
    
    // Debug weapon system reference only when first clicking
    if (this.input.mouse.leftButton && !this._lastLeftButton) {
      console.log("Mouse button pressed - attempting to shoot");
      
      // Double check physics reference when shooting begins
      if (!this.weapons.physics && window.game && window.game.physics) {
        console.log("Emergency fix: setting physics from game object");
        this.weapons.physics = window.game.physics;
      }
    }
    
    // Track button state change
    const buttonPressed = this.input.mouse.leftButton && !this._lastLeftButton;
    const buttonHeld = this.input.mouse.leftButton;
    this._lastLeftButton = this.input.mouse.leftButton;
    
    // Only shoot on button press or if enough time has passed for automatic fire
    if (buttonPressed || (buttonHeld && performance.now() / 1000 - this.weapons.lastShootTime > this.weapons.cooldown)) {
      // Get camera position as starting point
      const origin = this.camera.getWorldPosition(new THREE.Vector3());
      
      // Get the camera's world direction vector
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      
      // Make sure direction is normalized
      direction.normalize();
      
      // Offset the origin slightly forward to simulate a gun muzzle position
      const muzzleOffset = direction.clone().multiplyScalar(0.5);
      const muzzlePosition = origin.clone().add(muzzleOffset);
      
      console.log(`==== PLAYER SHOOTING ====`);
      console.log(`Shooting from [${muzzlePosition.x.toFixed(2)}, ${muzzlePosition.y.toFixed(2)}, ${muzzlePosition.z.toFixed(2)}]`);
      console.log(`Direction: [${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)}]`);
      
      // Shoot and get hit result
      const hitResult = this.weapons.shoot(muzzlePosition, direction, performance.now() / 1000);
      
      // Log hit information only when we actually hit something
      if (hitResult && hitResult.hit) {
        console.log('Hit:', hitResult.object.name || 'unnamed object', 'at distance', hitResult.distance.toFixed(2));
        
        // If hit a player, show confirmation in console
        if (hitResult.isPlayer) {
          console.log(`★★★ PLAYER HIT CONFIRMED: ${hitResult.playerId} ★★★`);
          console.log(`Damage: ${hitResult.damage}`);
        }
      } else {
        console.log('No hit detected');
      }
      
      console.log(`==== PLAYER SHOOTING COMPLETE ====`);
    }
  }
  
  updatePositions() {
    // Update player group position to match physics
    if (this.physicsBody) {
      // Update the player group position directly from physics body
      this.playerGroup.position.copy(this.position);
      
      // Ensure model is always at the correct relative position within the group
      this.model.position.set(0, this.playerHeight / 2, 0);
    }
  }
  
  setPosition(x, y, z) {
    if (this.physicsBody) {
      this.physicsBody.position.set(x, y, z);
      this.physicsBody.previousPosition.set(x, y, z);
      this.physicsBody.interpolatedPosition.set(x, y, z);
      this.physicsBody.initPosition.set(x, y, z);
    }
    
    this.position.set(x, y, z);
    this.updatePositions();
    
    console.log("Player position set to:", x, y, z);
  }
  
  takeDamage(amount) {
    // Debug log to track damage calculation
    console.log(`==== PLAYER TAKING DAMAGE ====`);
    console.log(`Damage amount: ${amount}`);
    console.log(`Current state: Health=${this.health}, Armor=${this.armor}`);
    console.log(`Armor protection rate: ${this.armorProtection * 100}%`);
    
    // Calculate damage distribution between armor and health
    let healthDamage = amount;
    let armorDamage = 0;
    
    // If player has armor, it reduces damage to health
    if (this.armor > 0) {
      // Calculate maximum damage that can go to armor (80% of total)
      const maxArmorDamage = amount * this.armorProtection;
      console.log(`- Maximum armor damage (${this.armorProtection*100}% of total): ${maxArmorDamage.toFixed(2)}`);
      
      // Limit by available armor
      armorDamage = Math.min(this.armor, maxArmorDamage);
      console.log(`- Actual armor damage: ${armorDamage.toFixed(2)}`);
      
      // Update armor value
      const oldArmor = this.armor;
      this.armor = Math.round(Math.max(0, this.armor - armorDamage));
      console.log(`- Armor reduced: ${oldArmor} → ${this.armor}`);
      
      // Calculate final health damage (original damage minus what armor absorbed)
      healthDamage = amount - armorDamage;
      console.log(`- Final health damage: ${healthDamage.toFixed(2)}`);
      
      // Update armor display
      this.updateArmorDisplay();
    } else {
      console.log(`- No armor available, full damage (${amount}) goes to health`);
      // Make sure health damage is set to full amount
      healthDamage = amount;
    }
    
    // Apply remaining damage to health
    const oldHealth = this.health;
    // ROUND health values to integers
    this.health = Math.round(Math.max(0, this.health - healthDamage));
    console.log(`- Health reduced: ${oldHealth} → ${this.health}`);
    console.log(`==== DAMAGE CALCULATION COMPLETE ====`);
    
    this.updateHealthDisplay();
    
    // Visual feedback for taking damage
    this.showDamageEffect();
    
    if (this.health <= 0) {
      this.die();
    }
  }
  
  // Add visual feedback when taking damage
  showDamageEffect() {
    // Create a red flash overlay
    if (!this.damageOverlay) {
      this.damageOverlay = document.createElement('div');
      this.damageOverlay.style.position = 'absolute';
      this.damageOverlay.style.top = '0';
      this.damageOverlay.style.left = '0';
      this.damageOverlay.style.width = '100%';
      this.damageOverlay.style.height = '100%';
      this.damageOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      this.damageOverlay.style.pointerEvents = 'none';
      this.damageOverlay.style.opacity = '0';
      this.damageOverlay.style.transition = 'opacity 0.5s';
      this.damageOverlay.style.zIndex = '1000';
      document.body.appendChild(this.damageOverlay);
    }
    
    // Flash the overlay
    this.damageOverlay.style.opacity = '1';
    
    // Clear any existing timeout
    if (this.damageTimeout) {
      clearTimeout(this.damageTimeout);
    }
    
    // Fade out the overlay
    this.damageTimeout = setTimeout(() => {
      if (this.damageOverlay) {
        this.damageOverlay.style.opacity = '0';
      }
    }, 300);
    
    // Add sound (to be implemented)
    // this.playDamageSound();
  }
  
  heal(amount) {
    this.health = Math.min(100, this.health + amount);
    this.updateHealthDisplay();
    
    // Visual feedback for healing
    this.showHealEffect();
  }
  
  die() {
    console.log('==== PLAYER DIED ====');
    
    // Show death effect
    this.showDeathEffect();
    
    // Reset health and armor
    this.health = 100;
    this.armor = 0; // Explicitly reset armor to 0
    
    // IMPORTANT: Force direct DOM update for health display
    const healthValueElement = document.getElementById('health-value');
    if (healthValueElement) {
      healthValueElement.style.width = '100%';
      healthValueElement.style.backgroundColor = '#4CAF50'; // Green
    }
    
    const healthTextElement = document.getElementById('health-text');
    if (healthTextElement) {
      healthTextElement.textContent = '100';
    }
    
    // Force direct DOM update for armor display
    const armorValueElement = document.getElementById('armor-value');
    if (armorValueElement) {
      armorValueElement.style.width = '0%';
    }
    
    const armorTextElement = document.getElementById('armor-text');
    if (armorTextElement) {
      armorTextElement.textContent = '0';
    }
    
    // Also call the regular update methods
    this.updateHealthDisplay();
    this.updateArmorDisplay();
    
    console.log('Health and armor reset - Health:', this.health, 'Armor:', this.armor);
    
    // Reset position to a random spawn point
    this.respawnAtRandomPosition();
  }
  
  // Add death effect
  showDeathEffect() {
    // Create a full-screen death overlay
    if (!this.deathOverlay) {
      this.deathOverlay = document.createElement('div');
      this.deathOverlay.style.position = 'absolute';
      this.deathOverlay.style.top = '0';
      this.deathOverlay.style.left = '0';
      this.deathOverlay.style.width = '100%';
      this.deathOverlay.style.height = '100%';
      this.deathOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
      this.deathOverlay.style.pointerEvents = 'none';
      this.deathOverlay.style.opacity = '0';
      this.deathOverlay.style.transition = 'opacity 1s';
      this.deathOverlay.style.zIndex = '1001';
      
      // Add death message
      const deathMessage = document.createElement('div');
      deathMessage.textContent = 'YOU DIED';
      deathMessage.style.position = 'absolute';
      deathMessage.style.top = '50%';
      deathMessage.style.left = '50%';
      deathMessage.style.transform = 'translate(-50%, -50%)';
      deathMessage.style.fontFamily = 'Arial, sans-serif';
      deathMessage.style.fontSize = '48px';
      deathMessage.style.color = 'white';
      
      this.deathOverlay.appendChild(deathMessage);
      document.body.appendChild(this.deathOverlay);
    }
    
    // Show the overlay
    this.deathOverlay.style.opacity = '1';
    
    // Clear any existing timeout
    if (this.deathTimeout) {
      clearTimeout(this.deathTimeout);
    }
    
    // Fade out the overlay after 2 seconds
    this.deathTimeout = setTimeout(() => {
      if (this.deathOverlay) {
        this.deathOverlay.style.opacity = '0';
      }
    }, 2000);
    
    // Add sound (to be implemented)
    // this.playDeathSound();
  }
  
  updateHealthDisplay() {
    const healthValueElement = document.getElementById('health-value');
    if (healthValueElement) {
      // Ensure health is a whole number
      const roundedHealth = Math.round(this.health);
      healthValueElement.style.width = `${roundedHealth}%`;
      
      // Change color based on health level
      if (roundedHealth > 60) {
        healthValueElement.style.backgroundColor = '#4CAF50'; // Green
      } else if (roundedHealth > 30) {
        healthValueElement.style.backgroundColor = '#FFC107'; // Yellow
      } else {
        healthValueElement.style.backgroundColor = '#F44336'; // Red
      }
    }
    
    // Update health text if it exists
    const healthTextElement = document.getElementById('health-text');
    if (healthTextElement) {
      // Display health as a whole number
      healthTextElement.textContent = `${Math.round(this.health)}`;
    } else {
      // Create health text if it doesn't exist
      const healthBar = document.getElementById('health-bar');
      if (healthBar) {
        const healthText = document.createElement('div');
        healthText.id = 'health-text';
        healthText.textContent = `${Math.round(this.health)}`;
        healthText.style.position = 'absolute';
        healthText.style.top = '50%';
        healthText.style.left = '50%';
        healthText.style.transform = 'translate(-50%, -50%)';
        healthText.style.color = 'white';
        healthText.style.fontWeight = 'bold';
        healthText.style.textShadow = '1px 1px 0 #000';
        healthBar.appendChild(healthText);
      }
    }
  }
  
  // New: Method to add armor
  addArmor(amount) {
    const oldArmor = this.armor;
    this.armor = Math.min(this.maxArmor, this.armor + amount);
    this.updateArmorDisplay();
    
    // Sync the new armor value with the server
    this.syncArmorWithServer();
    
    // Visual feedback for armor pickup
    this.showArmorEffect();
    
    console.log(`Added ${amount} armor: ${oldArmor} → ${this.armor}`);
  }
  
  // New method to sync armor with server
  syncArmorWithServer() {
    if (window.game && window.game.network && window.game.network.socket) {
      console.log(`Syncing armor value with server: ${this.armor}`);
      window.game.network.socket.emit('debugSetArmor', this.armor);
      
      // Force a health update request to get synchronized state
      window.game.network.socket.emit('requestHealthUpdate');
    } else {
      console.warn("Cannot sync armor with server - network unavailable");
    }
  }
  
  // Modified: Create armor display UI with more spacing
  createArmorDisplay() {
    // Get existing HUD container or create one
    let hudContainer = document.getElementById('hud-container');
    if (!hudContainer) {
      hudContainer = document.createElement('div');
      hudContainer.id = 'hud-container';
      hudContainer.style.position = 'absolute';
      hudContainer.style.bottom = '20px';
      hudContainer.style.left = '20px';
      hudContainer.style.zIndex = '1000';
      // Add background for better visibility
      hudContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      hudContainer.style.padding = '10px';
      hudContainer.style.borderRadius = '5px';
      document.body.appendChild(hudContainer);
    }
    
    // Create armor bar container if it doesn't exist
    if (!document.getElementById('armor-bar')) {
      // Container for armor section
      const armorContainer = document.createElement('div');
      armorContainer.id = 'armor-container';
      armorContainer.style.marginBottom = '20px'; // Significant space between bars
      
      // Add a label
      const armorLabel = document.createElement('div');
      armorLabel.textContent = 'ARMOR';
      armorLabel.style.color = 'white';
      armorLabel.style.fontSize = '14px';
      armorLabel.style.marginBottom = '5px';
      armorLabel.style.fontFamily = 'Arial, sans-serif';
      armorLabel.style.textShadow = '1px 1px 0 #000';
      armorContainer.appendChild(armorLabel);
      
      const armorBar = document.createElement('div');
      armorBar.id = 'armor-bar';
      armorBar.style.width = '200px';
      armorBar.style.height = '16px';
      armorBar.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      armorBar.style.border = '1px solid #444';
      armorBar.style.borderRadius = '3px';
      armorBar.style.position = 'relative';
      armorBar.style.overflow = 'hidden';
      
      // Create armor value inside the bar
      const armorValue = document.createElement('div');
      armorValue.id = 'armor-value';
      armorValue.style.width = `${this.armor}%`;
      armorValue.style.height = '100%';
      armorValue.style.backgroundColor = '#00AAFF';
      armorValue.style.transition = 'width 0.3s, background-color 0.3s';
      armorBar.appendChild(armorValue);
      
      // Add armor text
      const armorText = document.createElement('div');
      armorText.id = 'armor-text';
      armorText.textContent = `${this.armor}`;
      armorText.style.position = 'absolute';
      armorText.style.top = '50%';
      armorText.style.left = '50%';
      armorText.style.transform = 'translate(-50%, -50%)';
      armorText.style.color = 'white';
      armorText.style.fontWeight = 'bold';
      armorText.style.textShadow = '1px 1px 0 #000';
      armorBar.appendChild(armorText);
      
      // Add elements to container
      armorContainer.appendChild(armorBar);
      
      // Add container to HUD
      hudContainer.appendChild(armorContainer);
    }
  }
  
  // Modified: Create health display UI with better positioning
  createHealthDisplay() {
    // Get existing HUD container
    let hudContainer = document.getElementById('hud-container');
    if (!hudContainer) {
      // This should never happen as createArmorDisplay creates it
      this.createArmorDisplay();
      hudContainer = document.getElementById('hud-container');
    }
    
    // Create health bar container if it doesn't exist
    if (!document.getElementById('health-bar')) {
      // Container for health section
      const healthContainer = document.createElement('div');
      healthContainer.id = 'health-container';
      
      // Add a label
      const healthLabel = document.createElement('div');
      healthLabel.textContent = 'HEALTH';
      healthLabel.style.color = 'white';
      healthLabel.style.fontSize = '14px';
      healthLabel.style.marginBottom = '5px';
      healthLabel.style.fontFamily = 'Arial, sans-serif';
      healthLabel.style.textShadow = '1px 1px 0 #000';
      healthContainer.appendChild(healthLabel);
      
      const healthBar = document.createElement('div');
      healthBar.id = 'health-bar';
      healthBar.style.width = '200px';
      healthBar.style.height = '20px';
      healthBar.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      healthBar.style.border = '1px solid #444';
      healthBar.style.borderRadius = '3px';
      healthBar.style.position = 'relative';
      healthBar.style.overflow = 'hidden';
      
      // Health value (the colored part)
      const healthValue = document.createElement('div');
      healthValue.id = 'health-value';
      healthValue.style.width = `${this.health}%`;
      healthValue.style.height = '100%';
      healthValue.style.backgroundColor = '#4CAF50';
      healthValue.style.transition = 'width 0.3s, background-color 0.3s';
      healthBar.appendChild(healthValue);
      
      // Add health text
      const healthText = document.createElement('div');
      healthText.id = 'health-text';
      healthText.textContent = `${this.health}`;
      healthText.style.position = 'absolute';
      healthText.style.top = '50%';
      healthText.style.left = '50%';
      healthText.style.transform = 'translate(-50%, -50%)';
      healthText.style.color = 'white';
      healthText.style.fontWeight = 'bold';
      healthText.style.textShadow = '1px 1px 0 #000';
      healthBar.appendChild(healthText);
      
      // Add elements to container
      healthContainer.appendChild(healthBar);
      
      // Add container to HUD
      hudContainer.appendChild(healthContainer);
    }
  }
  
  // Update the armor display
  updateArmorDisplay() {
    console.log(`Updating armor display to ${this.armor}`);
    
    const armorValueElement = document.getElementById('armor-value');
    if (armorValueElement) {
      // Ensure armor is a whole number and within valid range
      const roundedArmor = Math.round(Math.max(0, Math.min(100, this.armor)));
      
      // Update width based on armor percentage
      armorValueElement.style.width = `${roundedArmor}%`;
      console.log(`Set armor bar width to ${roundedArmor}%`);
      
      // Change color based on armor level
      let armorColor;
      if (roundedArmor > 60) {
        armorColor = '#00AAFF'; // Blue
      } else if (roundedArmor > 30) {
        armorColor = '#0088CC'; // Medium blue
      } else {
        armorColor = '#006699'; // Dark blue
      }
      armorValueElement.style.backgroundColor = armorColor;
      console.log(`Set armor bar color to ${armorColor}`);
    } else {
      console.error("Armor value element not found in DOM! Creating HUD displays...");
      // Try to recreate the displays
      this.createArmorDisplay();
      this.createHealthDisplay();
    }
    
    // Update armor text if it exists
    const armorTextElement = document.getElementById('armor-text');
    if (armorTextElement) {
      // Display armor as a whole number
      armorTextElement.textContent = `${Math.round(this.armor)}`;
      console.log(`Set armor text to ${Math.round(this.armor)}`);
    } else {
      console.error("Armor text element not found in DOM!");
    }
  }
  
  // New: Visual feedback for healing
  showHealEffect() {
    // Create a green flash overlay
    if (!this.healOverlay) {
      this.healOverlay = document.createElement('div');
      this.healOverlay.style.position = 'absolute';
      this.healOverlay.style.top = '0';
      this.healOverlay.style.left = '0';
      this.healOverlay.style.width = '100%';
      this.healOverlay.style.height = '100%';
      this.healOverlay.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
      this.healOverlay.style.pointerEvents = 'none';
      this.healOverlay.style.opacity = '0';
      this.healOverlay.style.transition = 'opacity 0.5s';
      this.healOverlay.style.zIndex = '1000';
      document.body.appendChild(this.healOverlay);
    }
    
    // Flash the overlay
    this.healOverlay.style.opacity = '1';
    
    // Clear any existing timeout
    if (this.healTimeout) {
      clearTimeout(this.healTimeout);
    }
    
    // Fade out the overlay
    this.healTimeout = setTimeout(() => {
      if (this.healOverlay) {
        this.healOverlay.style.opacity = '0';
      }
    }, 300);
  }
  
  // New: Visual feedback for armor pickup
  showArmorEffect() {
    // Create a blue flash overlay
    if (!this.armorOverlay) {
      this.armorOverlay = document.createElement('div');
      this.armorOverlay.style.position = 'absolute';
      this.armorOverlay.style.top = '0';
      this.armorOverlay.style.left = '0';
      this.armorOverlay.style.width = '100%';
      this.armorOverlay.style.height = '100%';
      this.armorOverlay.style.backgroundColor = 'rgba(0, 170, 255, 0.2)';
      this.armorOverlay.style.pointerEvents = 'none';
      this.armorOverlay.style.opacity = '0';
      this.armorOverlay.style.transition = 'opacity 0.5s';
      this.armorOverlay.style.zIndex = '1000';
      document.body.appendChild(this.armorOverlay);
    }
    
    // Flash the overlay
    this.armorOverlay.style.opacity = '1';
    
    // Clear any existing timeout
    if (this.armorTimeout) {
      clearTimeout(this.armorTimeout);
    }
    
    // Fade out the overlay
    this.armorTimeout = setTimeout(() => {
      if (this.armorOverlay) {
        this.armorOverlay.style.opacity = '0';
      }
    }, 300);
  }
  
  // Testing armor damage calculation
  testArmorDamage() {
    console.log('=== ARMOR PROTECTION TEST ===');
    console.log(`Initial state: Health=${this.health}, Armor=${this.armor}`);
    
    // Log how damage should be calculated
    console.log(`Armor protection rate: ${this.armorProtection * 100}%`);
    
    // Test with fixed damage value
    const testDamage = 25;
    console.log(`\nTest 1: Taking ${testDamage} damage with ${this.armor} armor`);
    
    // Expected calculation
    const expectedDamageToHealth = testDamage * (1 - this.armorProtection);
    const expectedArmorDamage = Math.min(this.armor, testDamage - expectedDamageToHealth);
    const expectedHealthDamage = testDamage - expectedArmorDamage;
    const expectedFinalHealth = Math.max(0, this.health - expectedHealthDamage);
    const expectedFinalArmor = Math.max(0, this.armor - expectedArmorDamage);
    
    console.log('Expected calculation:');
    console.log(`- Ideal damage to health (${(1-this.armorProtection)*100}% of total): ${expectedDamageToHealth.toFixed(2)}`);
    console.log(`- Armor absorbs: ${expectedArmorDamage.toFixed(2)}`);
    console.log(`- Final health damage: ${expectedHealthDamage.toFixed(2)}`);
    console.log(`- Expected result: Health=${expectedFinalHealth.toFixed(2)}, Armor=${expectedFinalArmor.toFixed(2)}`);
    
    // Apply actual damage using our method
    console.log('\nApplying damage with takeDamage method:');
    this.takeDamage(testDamage);
    
    // Verify success
    console.log(`\nFinal state: Health=${this.health}, Armor=${this.armor}`);
    console.log(`Test ${Math.abs(this.health - expectedFinalHealth) < 0.1 ? 'PASSED ✅' : 'FAILED ❌'}`);
    
    console.log('\n=== TEST COMPLETE ===');
  }
} 