import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Define pickup types
export const PICKUP_TYPES = {
  HEALTH: 'health',
  ARMOR: 'armor'
};

// Define pickup properties
const PICKUP_PROPERTIES = {
  [PICKUP_TYPES.HEALTH]: {
    model: 'healthpack',
    color: 0xff0000, // Red
    value: 25,
    respawnTime: 30, // Seconds
    size: 0.5
  },
  [PICKUP_TYPES.ARMOR]: {
    model: 'armor',
    color: 0x00ff00, // Green
    value: 25,
    respawnTime: 45, // Seconds
    size: 0.5
  }
};

// Manage all pickups in the game
export class PickupManager {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.pickups = [];
    this.pickupLocations = [];
    
    // Materials for pickups
    this.materials = {
      [PICKUP_TYPES.HEALTH]: new THREE.MeshStandardMaterial({
        color: PICKUP_PROPERTIES[PICKUP_TYPES.HEALTH].color,
        emissive: PICKUP_PROPERTIES[PICKUP_TYPES.HEALTH].color,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.7
      }),
      [PICKUP_TYPES.ARMOR]: new THREE.MeshStandardMaterial({
        color: PICKUP_PROPERTIES[PICKUP_TYPES.ARMOR].color,
        emissive: PICKUP_PROPERTIES[PICKUP_TYPES.ARMOR].color,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.8
      })
    };
    
    console.log('PickupManager initialized');
  }
  
  // Add predefined pickup spawn locations
  definePickupLocations() {
    // Health pack locations - distributed across the expanded world
    this.addPickupLocation(0, 1.5, 20, PICKUP_TYPES.HEALTH);
    this.addPickupLocation(-16, 1.5, -16, PICKUP_TYPES.HEALTH);
    this.addPickupLocation(16, 1.5, 16, PICKUP_TYPES.HEALTH);
    this.addPickupLocation(50, 1.5, 50, PICKUP_TYPES.HEALTH);
    this.addPickupLocation(-50, 1.5, -50, PICKUP_TYPES.HEALTH);
    
    // Health packs on mountains (higher elevation)
    this.addPickupLocation(80, 10, 80, PICKUP_TYPES.HEALTH);     // Orange mountain (Southeast)
    this.addPickupLocation(-80, 15, 80, PICKUP_TYPES.HEALTH);    // Brown mountain (Northeast)
    this.addPickupLocation(-80, 18, -80, PICKUP_TYPES.HEALTH);   // Blue-grey mountain (Northwest)
    this.addPickupLocation(80, 14, -80, PICKUP_TYPES.HEALTH);    // Light green mountain (Southwest)
    this.addPickupLocation(0, 22, -90, PICKUP_TYPES.HEALTH);     // Purple mountain (North)
    this.addPickupLocation(0, 17, 90, PICKUP_TYPES.HEALTH);      // Indigo mountain (South)
    
    // Armor locations - distributed across the expanded world
    this.addPickupLocation(0, 1.5, -20, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(10, 1.5, 0, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(-10, 1.5, 0, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(0, 1.5, 0, PICKUP_TYPES.ARMOR); // Center of the map
    this.addPickupLocation(10, 1.5, -10, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(-10, 1.5, 10, PICKUP_TYPES.ARMOR);
    
    // Armor pickups on mountains (higher elevation)
    this.addPickupLocation(80, 8, 80, PICKUP_TYPES.ARMOR);       // Orange mountain (Southeast)
    this.addPickupLocation(-80, 12, 80, PICKUP_TYPES.ARMOR);     // Brown mountain (Northeast)
    this.addPickupLocation(-80, 15, -80, PICKUP_TYPES.ARMOR);    // Blue-grey mountain (Northwest)
    this.addPickupLocation(80, 11, -80, PICKUP_TYPES.ARMOR);     // Light green mountain (Southwest) 
    this.addPickupLocation(0, 18, -90, PICKUP_TYPES.ARMOR);      // Purple mountain (North)
    this.addPickupLocation(0, 14, 90, PICKUP_TYPES.ARMOR);       // Indigo mountain (South)
    
    // Additional armor pickups near tree clusters
    this.addPickupLocation(60, 1.5, 60, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(-60, 1.5, -60, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(60, 1.5, -60, PICKUP_TYPES.ARMOR);
    this.addPickupLocation(-60, 1.5, 60, PICKUP_TYPES.ARMOR);
    
    console.log(`Defined ${this.pickupLocations.length} pickup locations across the expanded world`);
    
    // Spawn initial pickups
    this.spawnAllPickups();
  }
  
  // Add a pickup location
  addPickupLocation(x, y, z, type) {
    this.pickupLocations.push({
      position: new THREE.Vector3(x, y, z),
      type: type,
      active: false,
      lastPickupTime: 0
    });
  }
  
  // Spawn all pickups that should be active
  spawnAllPickups() {
    const currentTime = performance.now() / 1000;
    
    this.pickupLocations.forEach((location, index) => {
      // Check if pickup should be respawned
      if (!location.active) {
        const timeSincePickup = currentTime - location.lastPickupTime;
        const respawnTime = PICKUP_PROPERTIES[location.type].respawnTime;
        
        if (location.lastPickupTime === 0 || timeSincePickup >= respawnTime) {
          this.spawnPickup(index);
        }
      }
    });
  }
  
  // Spawn a single pickup
  spawnPickup(locationIndex) {
    const location = this.pickupLocations[locationIndex];
    if (!location) return;
    
    // Mark as active
    location.active = true;
    
    // Create the pickup mesh based on type
    let geometry;
    
    if (location.type === PICKUP_TYPES.HEALTH) {
      // Cross shape for health
      geometry = new THREE.BoxGeometry(
        PICKUP_PROPERTIES[location.type].size,
        PICKUP_PROPERTIES[location.type].size,
        PICKUP_PROPERTIES[location.type].size
      );
    } else {
      // Sphere for armor
      geometry = new THREE.SphereGeometry(
        PICKUP_PROPERTIES[location.type].size / 2,
        16, 16
      );
    }
    
    const material = this.materials[location.type];
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position the pickup
    mesh.position.copy(location.position);
    
    // Add floating animation
    mesh.userData.baseY = location.position.y;
    mesh.userData.floatOffset = Math.random() * Math.PI * 2;
    mesh.userData.rotationSpeed = 1 + Math.random();
    
    // Add to scene
    this.scene.add(mesh);
    
    // Create pickup object
    const pickup = {
      mesh: mesh,
      type: location.type,
      locationIndex: locationIndex,
      value: PICKUP_PROPERTIES[location.type].value
    };
    
    // Add to pickups array
    this.pickups.push(pickup);
    
    console.log(`Spawned ${location.type} pickup at index ${locationIndex}`);
    
    return pickup;
  }
  
  // Check if player collides with any pickups
  checkCollisions(player) {
    if (!player || !player.position) return;
    
    const playerPosition = player.position;
    const collisionDistance = 1.5; // Distance for pickup collection
    
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      const pickupPosition = pickup.mesh.position;
      
      // Calculate distance
      const distance = playerPosition.distanceTo(pickupPosition);
      
      // If player is close enough, collect the pickup
      if (distance < collisionDistance) {
        this.collectPickup(pickup, player);
      }
    }
  }
  
  // Player collects a pickup
  collectPickup(pickup, player) {
    // Apply pickup effect
    if (pickup.type === PICKUP_TYPES.HEALTH) {
      player.heal(pickup.value);
      console.log(`Player collected health: +${pickup.value}`);
    } else if (pickup.type === PICKUP_TYPES.ARMOR) {
      player.addArmor(pickup.value);
      console.log(`Player collected armor: +${pickup.value}`);
    }
    
    // Update location data
    const location = this.pickupLocations[pickup.locationIndex];
    location.active = false;
    location.lastPickupTime = performance.now() / 1000;
    
    // Play pickup effect
    this.createPickupEffect(pickup.mesh.position.clone(), pickup.type);
    
    // Remove from scene
    this.scene.remove(pickup.mesh);
    
    // Remove from pickups array
    const pickupIndex = this.pickups.indexOf(pickup);
    if (pickupIndex !== -1) {
      this.pickups.splice(pickupIndex, 1);
    }
  }
  
  // Create visual effect when a pickup is collected
  createPickupEffect(position, type) {
    // Create particles
    const particleCount = 15;
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    
    for (let i = 0; i < particleCount; i++) {
      // Random position within 0.5 units of the pickup
      const x = position.x + (Math.random() - 0.5) * 0.5;
      const y = position.y + (Math.random() - 0.5) * 0.5;
      const z = position.z + (Math.random() - 0.5) * 0.5;
      
      vertices.push(x, y, z);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    // Create particle system
    const material = new THREE.PointsMaterial({
      color: this.materials[type].color,
      size: 0.1,
      transparent: true,
      opacity: 0.8
    });
    
    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);
    
    // Add to effects for cleanup
    const effect = {
      mesh: particles,
      createdAt: performance.now() / 1000,
      lifetime: 1.0 // 1 second
    };
    
    this.pickupEffects = this.pickupEffects || [];
    this.pickupEffects.push(effect);
  }
  
  // Update pickups (floating animation, rotation, etc.)
  update(deltaTime) {
    const currentTime = performance.now() / 1000;
    
    // Animate existing pickups
    this.pickups.forEach(pickup => {
      const mesh = pickup.mesh;
      
      // Float up and down
      if (mesh.userData.baseY !== undefined) {
        const floatHeight = 0.2;
        const floatSpeed = 1.5;
        mesh.position.y = mesh.userData.baseY + 
          Math.sin((currentTime + mesh.userData.floatOffset) * floatSpeed) * floatHeight;
      }
      
      // Rotate
      if (mesh.userData.rotationSpeed) {
        mesh.rotation.y += mesh.userData.rotationSpeed * deltaTime;
      }
    });
    
    // Update effects
    if (this.pickupEffects) {
      for (let i = this.pickupEffects.length - 1; i >= 0; i--) {
        const effect = this.pickupEffects[i];
        const age = currentTime - effect.createdAt;
        
        if (age >= effect.lifetime) {
          // Remove expired effect
          this.scene.remove(effect.mesh);
          this.pickupEffects.splice(i, 1);
        } else {
          // Fade out
          if (effect.mesh.material) {
            effect.mesh.material.opacity = 1 - (age / effect.lifetime);
          }
          
          // Expand particles
          effect.mesh.scale.set(1 + age, 1 + age, 1 + age);
        }
      }
    }
    
    // Check for respawns
    this.spawnAllPickups();
  }
} 