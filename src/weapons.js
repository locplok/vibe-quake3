import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class WeaponSystem {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    
    // Debug the physics reference
    console.log("WeaponSystem constructor - Physics reference:", this.physics ? "YES" : "NO");
    if (this.physics) {
      console.log("Physics bodies count:", this.physics.bodies.length);
    }
    
    // Raycaster for hit detection
    this.raycaster = new THREE.Raycaster();
    
    // Weapon properties
    this.damage = 25;
    this.range = 1000;
    this.cooldown = 0.2; // seconds
    this.lastShootTime = 0;
    this.bulletSpeed = 500; // Units per second
    
    // Visual effects
    this.bulletTrailLifetime = 2.0; // Increased: How long bullet trails last in seconds
    this.impactLifetime = 1.0; // Increased: How long impact effects last in seconds
    
    // Impact effect materials
    this.impactMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff6600,
      transparent: true,
      opacity: 0.8
    });
    
    // Bullet trail line material
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffff00,
      opacity: 0.9,
      transparent: true,
      linewidth: 3 // Note: linewidth > 1 only works in WebGL 2
    });
    
    // Collection for bullet trail effects
    this.activeTrails = [];
    
    // Collection for impact effects
    this.activeImpacts = [];
    
    console.log('Weapon system initialized with physics:', physics ? "YES" : "NO");
  }
  
  shoot(origin, direction, currentTime) {
    // Physics system sanity check
    if (!this.physics) {
      console.error('Weapon system has no physics reference.');
      // Try to get physics reference from the global game object
      if (window.game && window.game.physics) {
        console.log("Fixing missing physics reference from global game object");
        this.physics = window.game.physics;
      } else {
        return { hit: false };
      }
    }
    
    // Ensure direction is normalized
    direction.normalize();
    
    // Check cooldown
    if (currentTime - this.lastShootTime < this.cooldown) {
      console.log("Weapon on cooldown, can't shoot yet");
      return { hit: false };
    }
    
    console.log("=== SHOOTING ===");
    console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`);
    console.log(`Direction: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`);
    
    // Update last shoot time
    this.lastShootTime = currentTime;
    
    // Always send shot information to the network first
    if (window.game && window.game.network) {
      console.log(`Sending shot event to server with origin and direction`);
      window.game.network.sendShot(origin, direction);
    }
    
    // First, check for hits on player models
    const playerHit = this.checkPlayerHits(origin, direction);
    if (playerHit) {
      console.log('Hit player:', playerHit.playerId, 'at distance', playerHit.distance.toFixed(2));
      
      // Create a bullet trail to the hit point
      this.createBulletTrail(origin, playerHit.point);
      
      // Note: we've already sent the shot event above, no need to send it again
      return playerHit;
    }
    
    // If no player was hit, check for hits on scene objects
    const raycaster = new THREE.Raycaster(origin, direction, 0, this.range);
    
    // Collect all scene objects for raycasting
    const meshes = [];
    this.scene.traverse(object => {
      // Only include mesh objects that aren't the player or effects
      if (object.isMesh && 
          object.name !== 'player' && 
          !object.name.includes('effect') &&
          !object.name.includes('Trail') &&
          !object.name.includes('Impact')) {
        meshes.push(object);
      }
    });
    
    // Perform the raycast
    const intersects = raycaster.intersectObjects(meshes);
    
    // If we hit something
    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitPosition = hit.point;
      const hitNormal = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
      const hitObject = hit.object;
      
      console.log('Hit object:', hitObject.name, 'at distance', hit.distance.toFixed(2));
      
      // Create end point for visuals
      const endPoint = hitPosition.clone();
      
      // Create a bullet trail
      this.createBulletTrail(origin, endPoint);
      
      // Create an impact effect at the hit position
      this.createImpactEffect(hitPosition, hitNormal);
      
      // Apply impulse to physics objects if hit
      const hitBody = this.findBodyByMesh(hitObject);
      if (hitBody && hitBody.body) {
        const impulseStrength = 10; // Adjust as needed for gameplay
        const impulsePoint = new CANNON.Vec3(hitPosition.x, hitPosition.y, hitPosition.z);
        const impulseVector = new CANNON.Vec3(direction.x, direction.y, direction.z).scale(impulseStrength);
        
        hitBody.body.applyImpulse(impulseVector, impulsePoint);
      }
      
      return {
        hit: true,
        object: hitObject,
        position: hitPosition,
        distance: hit.distance
      };
    } else {
      // No hit, create a bullet trail to maximum range
      const endPoint = origin.clone().add(direction.multiplyScalar(this.range));
      this.createBulletTrail(origin, endPoint);
      
      return { hit: false };
    }
  }
  
  findBodyByMesh(mesh) {
    if (!this.physics || !this.physics.bodies) {
      console.error('No physics system available in WeaponSystem');
      return null;
    }
    
    for (let i = 0; i < this.physics.bodies.length; i++) {
      const body = this.physics.bodies[i];
      if (body.mesh === mesh) {
        return body;
      }
    }
    
    return null;
  }
  
  createBulletTrail(startPoint, endPoint) {
    // Create geometry for the line
    const geometry = new THREE.BufferGeometry().setFromPoints([
      startPoint,
      endPoint
    ]);
    
    // Create the line
    const line = new THREE.Line(geometry, this.trailMaterial.clone());
    line.name = 'BulletTrail';
    
    // Make the line render on top of other objects
    line.renderOrder = 999;
    line.material.depthTest = false;
    
    // Add to scene
    this.scene.add(line);
    
    // Create a point light at the muzzle flash position for visual effect
    const flash = new THREE.PointLight(0xff8800, 5, 3);
    flash.position.copy(startPoint);
    this.scene.add(flash);
    
    // Track the trail with its creation time
    this.activeTrails.push({
      mesh: line,
      creationTime: performance.now() / 1000,
      lifetime: this.bulletTrailLifetime
    });
    
    // Also track the muzzle flash
    this.activeTrails.push({
      mesh: flash,
      creationTime: performance.now() / 1000,
      lifetime: 0.1 // Short flash
    });
  }
  
  createImpactEffect(position, normal) {
    // Create a small sprite or mesh at the impact point
    const impactGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const impact = new THREE.Mesh(impactGeometry, this.impactMaterial);
    impact.name = 'ImpactEffect';
    
    // Position at hit point
    impact.position.copy(position);
    
    // Offset slightly to avoid z-fighting
    impact.position.add(normal.multiplyScalar(0.01));
    
    // Add to scene
    this.scene.add(impact);
    
    // Track the impact with its creation time
    this.activeImpacts.push({
      mesh: impact,
      creationTime: performance.now() / 1000,
      lifetime: this.impactLifetime
    });
  }
  
  update(currentTime) {
    // If currentTime is not provided, get the current time
    if (currentTime === undefined) {
      currentTime = performance.now() / 1000;
    }
    
    // Update bullet trails
    for (let i = this.activeTrails.length - 1; i >= 0; i--) {
      const trail = this.activeTrails[i];
      const age = currentTime - trail.creationTime;
      
      // If the trail has exceeded its lifetime
      if (age > trail.lifetime) {
        // Remove from scene
        this.scene.remove(trail.mesh);
        
        // Dispose of geometry and materials
        if (trail.mesh.geometry) {
          trail.mesh.geometry.dispose();
        }
        
        // Remove from active trails
        this.activeTrails.splice(i, 1);
      } else {
        // Fade out the trail over time
        const opacity = 1 - (age / trail.lifetime);
        if (trail.mesh.material) {
          trail.mesh.material.opacity = opacity;
        }
      }
    }
    
    // Update impact effects
    for (let i = this.activeImpacts.length - 1; i >= 0; i--) {
      const impact = this.activeImpacts[i];
      const age = currentTime - impact.creationTime;
      
      // If the impact has exceeded its lifetime
      if (age > impact.lifetime) {
        // Remove from scene
        this.scene.remove(impact.mesh);
        
        // Dispose of geometry and materials
        if (impact.mesh.geometry) {
          impact.mesh.geometry.dispose();
        }
        
        // Remove from active impacts
        this.activeImpacts.splice(i, 1);
      } else {
        // Shrink impact over time
        const scale = 1 - (age / impact.lifetime);
        impact.mesh.scale.set(scale, scale, scale);
        
        // Fade out the impact over time
        if (impact.mesh.material) {
          impact.mesh.material.opacity = scale;
        }
      }
    }
  }
  
  // Utility function to debug the physics system
  debugPhysicsSystem() {
    console.log("--- PHYSICS DEBUG ---");
    if (!this.physics) {
      console.log("No physics system available!");
      return;
    }
    
    console.log("Physics system is available");
    console.log("Bodies count:", this.physics.bodies.length);
    
    // Log details of each body
    this.physics.bodies.forEach((item, index) => {
      console.log(`Body ${index}:`, {
        type: item.type,
        hasMesh: !!item.mesh,
        meshName: item.mesh ? (item.mesh.name || "unnamed") : "n/a",
        mass: item.body ? item.body.mass : "n/a",
        position: item.body ? `(${item.body.position.x.toFixed(2)}, ${item.body.position.y.toFixed(2)}, ${item.body.position.z.toFixed(2)})` : "n/a"
      });
    });
    console.log("---------------------");
  }
  
  // New method to check for hits on other players
  checkPlayerHits(origin, direction) {
    // Only check for player hits if we're in multiplayer mode
    if (!window.game || !window.game.network) {
      console.log("No game or network available for player hit detection");
      return null;
    }
    
    const playerModels = window.game.network.playerModels;
    const players = window.game.network.players;
    if (!playerModels || Object.keys(playerModels).length === 0) {
      console.log("No player models found for hit detection");
      return null;
    }
    
    console.log(`Checking for hits against ${Object.keys(playerModels).length} players`);
    
    // Create a temporary array of meshes to check against
    const playerMeshes = [];
    const playerIds = new Map(); // Use a Map to store the relationship between mesh and player ID
    
    // Gather all player meshes for raycast checking, skip dead players
    for (const playerId in playerModels) {
      // Skip players that are marked as dead or waiting to respawn
      if (players[playerId] && (players[playerId].isDead || players[playerId].waitingToRespawn)) {
        console.log(`Skipping dead player ${playerId} for hit detection`);
        continue;
      }
      
      if (playerModels[playerId]) {
        console.log(`Adding player ${playerId} to hit detection check`);
        const playerMesh = playerModels[playerId];
        playerMeshes.push(playerMesh);
        playerIds.set(playerMesh, playerId); // Store the mesh->ID relationship
      }
    }
    
    if (playerMeshes.length === 0) {
      console.log("No player meshes to check against");
      return null;
    }
    
    // Set up raycaster for player hit detection with more detailed options
    const playerRaycaster = new THREE.Raycaster(origin, direction, 0, this.range);
    
    // Log detailed raycaster information
    console.log(`Raycaster origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`);
    console.log(`Raycaster direction: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`);
    console.log(`Raycaster range: ${this.range}`);
    
    // Check for intersections with player models
    const playerIntersects = playerRaycaster.intersectObjects(playerMeshes, false);
    
    console.log(`Got ${playerIntersects.length} player intersections`);
    
    if (playerIntersects.length > 0) {
      const hit = playerIntersects[0];
      console.log("Player hit detected! Object:", hit.object.name);
      
      // Try multiple ways to get the player ID
      let hitPlayerId = hit.object.userData?.playerId;
      
      // If userData doesn't have playerID, try using the Map
      if (!hitPlayerId) {
        hitPlayerId = playerIds.get(hit.object);
        console.log(`Retrieved player ID from Map: ${hitPlayerId}`);
      }
      
      // Double-check that the player is not dead (extra safety)
      if (hitPlayerId && players[hitPlayerId] && (players[hitPlayerId].isDead || players[hitPlayerId].waitingToRespawn)) {
        console.log(`Hit detected on dead player ${hitPlayerId}, ignoring`);
        return null;
      }
      
      if (hitPlayerId) {
        console.log(`★★★ HIT PLAYER WITH ID: ${hitPlayerId} ★★★`);
        
        // Create impact effect at hit point
        const normal = direction.clone().negate();
        this.createImpactEffect(hit.point, normal);
        
        // IMPORTANT: Always use exact damage amount for consistency
        const damage = 25; // Fixed damage value
        
        // Send hit information to the network
        if (window.game.network && window.game.network.connected) {
          console.log(`★★★ SENDING HIT EVENT TO SERVER ★★★`);
          console.log(`Target: Player ${hitPlayerId}`);
          console.log(`Damage: ${damage}`);
          
          // CRITICAL: Add retry mechanism for sending hit
          try {
            window.game.network.sendHit(hitPlayerId, damage);
            console.log(`★★★ HIT EVENT SENT SUCCESSFULLY ★★★`);
          } catch (error) {
            console.error(`Error sending hit event: ${error}`);
            // Retry once
            setTimeout(() => {
              console.log("Retrying hit event send...");
              window.game.network.sendHit(hitPlayerId, damage);
            }, 100);
          }
        } else {
          console.error("CANNOT SEND HIT - NETWORK DISCONNECTED OR UNAVAILABLE");
        }
        
        // Return hit information
        return {
          hit: true,
          object: hit.object,
          point: hit.point,
          distance: hit.distance,
          isPlayer: true,
          playerId: hitPlayerId,
          damage: damage // Include damage in return value
        };
      } else {
        console.log("Hit object has no player ID in userData");
      }
    } else {
      console.log("No player intersection detected");
    }
    
    return null;
  }
  
  // Check if the hit object is a player model
  isPlayerModel(object) {
    if (!object) return false;
    // Check if the object belongs to another player
    return object.name === 'player-model' || object.name === 'other-player';
  }
  
  // Process player hit
  processPlayerHit(hitObject, hitPoint) {
    // Try to get the player ID from the model
    const playerId = hitObject.userData?.playerId;
    
    if (!playerId) {
      console.log('Hit a player object but could not determine player ID');
      return;
    }
    
    // Check if the player is dead or waiting to respawn
    if (window.game && window.game.network && window.game.network.players[playerId]) {
      const player = window.game.network.players[playerId];
      if (player.isDead || player.waitingToRespawn) {
        console.log(`Cannot hit player ${playerId} - they are dead`);
        return;
      }
    }
    
    console.log(`Hit player ${playerId} with ${this.damage} damage`);
    
    // Send hit info to the server
    if (window.game && window.game.network) {
      console.log(`Sending hit to server: playerId=${playerId}, damage=${this.damage}`);
      window.game.network.sendHit(playerId, this.damage);
    } else {
      console.log('No network manager found, cannot report player hit');
    }
  }
  
  // Handle hit detection and effects
  handleHit(hitResult, direction) {
    if (!hitResult || !hitResult.object) return;
    
    console.log(`==== HIT DETECTION ====`);
    console.log(`Hit object: ${hitResult.object.name || 'unnamed'}`);
    console.log(`Hit distance: ${hitResult.distance.toFixed(2)}`);
    
    // Create impact effect
    this.createImpactEffect(hitResult.point);
    
    // Check if we hit a player
    if (hitResult.object.name === 'other-player' && hitResult.object.userData) {
      const playerId = hitResult.object.userData.playerId;
      console.log(`Hit player with ID: ${playerId}`);
      
      // Use fixed damage value instead of distance-based calculation
      // for consistent damage behavior across the game
      const damage = 25;
      console.log(`Using standard damage: ${damage}`);
      
      // Send hit to server
      if (window.game && window.game.network) {
        console.log(`★★★ SENDING PLAYER HIT FROM HANDLE_HIT ★★★`);
        console.log(`Target: Player ${playerId}`);
        console.log(`Damage: ${damage}`);
        window.game.network.sendHit(playerId, damage);
        console.log(`★★★ HIT EVENT SENT ★★★`);
      } else {
        console.error("CRITICAL ERROR: Cannot send player hit - network unavailable");
      }
      
      return {
        hit: true,
        type: 'player',
        id: playerId,
        damage: damage
      };
    }
    
    // Apply physics impact if the object has a physics body
    if (this.physics) {
      const body = this.findPhysicsBodyByMesh(hitResult.object);
      if (body) {
        // Calculate impact force based on distance
        const impactForce = 200 - hitResult.distance * 10;
        const scaledDirection = direction.clone().multiplyScalar(impactForce);
        const impulse = new CANNON.Vec3(scaledDirection.x, scaledDirection.y, scaledDirection.z);
        
        // Apply impulse at hit point
        const worldPoint = new CANNON.Vec3(
          hitResult.point.x,
          hitResult.point.y,
          hitResult.point.z
        );
        body.applyImpulse(impulse, worldPoint);
        
        console.log(`Applied physics impulse: ${impulse.length().toFixed(2)} at distance ${hitResult.distance.toFixed(2)}`);
        
        return {
          hit: true,
          type: 'physics',
          body: body
        };
      }
    }
    
    // Just a regular hit on a static object
    return {
      hit: true,
      type: 'static'
    };
    
    console.log(`==== HIT PROCESSING COMPLETE ====`);
  }
} 