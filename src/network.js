import { io } from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.players = {};
    this.connected = false;
    
    // When using Vite proxy, we can just use relative URL for Socket.IO connection
    this.serverUrl = window.location.hostname === 'localhost' 
      ? window.location.origin 
      : 'https://vibe-quake3-server.onrender.com'; // Using default HTTPS port on Render
    console.log("Using server URL:", this.serverUrl);
    
    // Debug flag for logging network messages
    this.debug = true;
    
    this.playerModels = {};
    this._receivedFirstHealthUpdate = false;
  }
  
  // Initialize connection to the server
  connect() {
    if (this.socket) {
      console.log('Socket connection already exists');
      return;
    }
    
    this.log('Connecting to server:', this.serverUrl);
    
    // Always use the explicit Render URL in production
    // On Vercel, window.location.hostname is NOT localhost, so we must use the explicit URL
    this.socket = window.location.hostname === 'localhost' 
      ? io() // Use Vite proxy for local development only
      : io('https://vibe-quake3-server.onrender.com', {
          withCredentials: false,
          transports: ['websocket', 'polling']
        }); // Always use explicit URL for production
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  // Set up all Socket.IO event listeners
  setupEventListeners() {
    if (!this.socket) return;
    
    console.log("==== SETTING UP SOCKET EVENT LISTENERS ====");
    
    // Connection established
    this.socket.on('connect', () => {
      this.connected = true;
      console.log("==== SOCKET CONNECTED ====");
      console.log("Socket ID:", this.socket.id);
      console.log("Connected to server:", this.serverUrl);
      
      // Initialize frag counter
      this.updateFragDisplay(0);
      
      // IMPORTANT FIX: Set up a timer to sync armor value after connection
      setTimeout(() => {
        if (this.game && this.game.player) {
          console.log(`Connection established - syncing armor value (${this.game.player.armor}) with server`);
          this.game.player.syncArmorWithServer();
        }
      }, 1000); // Wait 1 second to ensure player is fully initialized
    });
    
    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error("==== SOCKET CONNECTION ERROR ====");
      console.error("Error:", error);
    });
    
    // Connection timeout
    this.socket.on('connect_timeout', (timeout) => {
      console.error("==== SOCKET CONNECTION TIMEOUT ====");
      console.error("Timeout:", timeout);
    });
    
    // Connection lost
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.warn("==== SOCKET DISCONNECTED ====");
      console.warn("Reason:", reason);
    });
    
    // Receive current players when joining
    this.socket.on('currentPlayers', (players) => {
      console.log("==== CURRENT PLAYERS RECEIVED ====");
      console.log("Players:", players);
      console.log("Player count:", Object.keys(players).length);
      this.players = players;
      this.createPlayerModels();
    });
    
    // New player joined
    this.socket.on('newPlayer', (playerInfo) => {
      console.log("==== NEW PLAYER JOINED ====");
      console.log("Player info:", playerInfo);
      this.players[playerInfo.id] = playerInfo;
      this.createPlayerModel(playerInfo);
    });
    
    // Player moved
    this.socket.on('playerMoved', (playerInfo) => {
      // Validate the player info
      if (!playerInfo || !playerInfo.id || !playerInfo.position) {
        console.error('Received invalid player movement update:', playerInfo);
        return;
      }
      
      // Check if we know about this player
      if (!this.players[playerInfo.id]) {
        console.log(`Received position update for unknown player: ${playerInfo.id}`);
        // Add the player to our local record - might be a late join
        this.players[playerInfo.id] = playerInfo;
        this.createPlayerModel(playerInfo);
        return;
      }
      
      // Update our record of the player's position and rotation
      this.players[playerInfo.id].position = playerInfo.position;
      this.players[playerInfo.id].rotation = playerInfo.rotation;
      
      // Log occasional position updates (avoid console spam)
      if (Math.random() < 0.01) {
        const pos = playerInfo.position;
        this.log(`Player ${playerInfo.id} moved to (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
      }
      
      // Update the 3D model
      this.updatePlayerModel(playerInfo);
    });
    
    // Player shot
    this.socket.on('shotFired', (shotInfo) => {
      this.log('Shot fired by player:', shotInfo.id);
      
      // If it's not our own shot, visualize it
      if (shotInfo.id !== this.socket.id && this.game.player) {
        this.visualizeShot(shotInfo);
      }
    });
    
    // Health update
    this.socket.on('healthUpdate', (healthInfo) => {
      this.log('Health update received:', healthInfo);
      console.log(`FULL HEALTH UPDATE OBJECT: ${JSON.stringify(healthInfo)}`);
      
      if (healthInfo.id === this.socket.id && this.game.player) {
        // Update our own health and armor
        const oldHealth = this.game.player.health;
        const oldArmor = this.game.player.armor || 0;
        
        console.log(`==== HEALTH UPDATE FROM SERVER ====`);
        console.log(`Player ID: ${healthInfo.id} (our player)`);
        console.log(`Current state: Health=${oldHealth}, Armor=${oldArmor}`);
        console.log(`New values: Health=${healthInfo.health}, Armor=${healthInfo.armor}`);
        console.log(`Armor value type: ${typeof healthInfo.armor}`);
        console.log(`Object has armor property: ${healthInfo.hasOwnProperty('armor')}`);
        
        // Always update health
        this.game.player.health = Math.round(healthInfo.health);
        
        // FIX: Only update armor if the server actually specifies a value
        // Do not set armor to 0 when it's undefined
        if (healthInfo.armor !== undefined) {
          console.log(`Setting armor to server-provided value: ${healthInfo.armor}`);
          this.game.player.armor = Math.round(healthInfo.armor);
        } else {
          console.log(`Server did not specify armor, keeping current value: ${oldArmor}`);
          console.log(`WARNING: Server sent undefined armor value. This should not happen!`);
          
          // DEBUG: Request a sync from server to get correct values
          if (this.socket) {
            console.log("Requesting health update from server to fix missing armor value");
            this.socket.emit('requestHealthUpdate');
          }
        }
        
        // Update displays
        this.game.player.updateHealthDisplay();
        this.game.player.updateArmorDisplay();
        
        console.log(`Health ${oldHealth !== this.game.player.health ? 'changed' : 'unchanged'}: ${oldHealth} → ${this.game.player.health}`);
        console.log(`Armor ${oldArmor !== this.game.player.armor ? 'changed' : 'unchanged'}: ${oldArmor} → ${this.game.player.armor}`);
        console.log(`==== HEALTH UPDATE APPLIED ====`);
      } else if (this.players[healthInfo.id]) {
        // Update other player's health
        const oldHealth = this.players[healthInfo.id].health || 0;
        const oldArmor = this.players[healthInfo.id].armor || 0;
        
        console.log(`Player ${healthInfo.id} health/armor update: Health ${oldHealth} → ${healthInfo.health}, Armor ${oldArmor} → ${healthInfo.armor}`);
        
        // Update stored values
        this.players[healthInfo.id].health = Math.round(healthInfo.health);
        
        // Only update armor if a value is provided
        if (healthInfo.armor !== undefined) {
          this.players[healthInfo.id].armor = Math.round(healthInfo.armor);
        }
      } else {
        console.log(`Received health update for unknown player: ${healthInfo.id}`);
      }
    });
    
    // Player respawned
    this.socket.on('playerRespawned', (respawnInfo) => {
      console.log("==== PLAYER RESPAWN EVENT ====");
      console.log('Player respawned:', respawnInfo);
      
      if (respawnInfo.id === this.socket.id && this.game.player) {
        // Handle our own respawn
        console.log('Handling our own respawn');
        
        // Update position
        this.game.player.setPosition(
          respawnInfo.position.x,
          respawnInfo.position.y,
          respawnInfo.position.z
        );
        
        // IMPORTANT: Ensure health is reset in client-side data
        // This provides a backup to ensure health UI is updated
        this.game.player.health = 100;
        this.game.player.armor = 0;
        
        // Force UI update
        this.game.player.updateHealthDisplay();
        this.game.player.updateArmorDisplay();
        
        console.log('Player respawned with health:', this.game.player.health);
      } else if (this.players[respawnInfo.id]) {
        // Update other player's position
        this.players[respawnInfo.id].position = respawnInfo.position;
        this.updatePlayerModel(this.players[respawnInfo.id]);
        
        // Also update their health in our local data
        this.players[respawnInfo.id].health = 100;
        this.players[respawnInfo.id].armor = 0;
      }
    });
    
    // Player disconnected
    this.socket.on('playerDisconnected', (playerId) => {
      this.log('Player disconnected:', playerId);
      
      // Remove player model
      this.removePlayerModel(playerId);
      
      // Remove from players object
      delete this.players[playerId];
    });
    
    // Frag update (when a player gets a kill)
    this.socket.on('fragUpdate', (fragInfo) => {
      console.log(`==== FRAG UPDATE RECEIVED ====`);
      console.log(`Player ${fragInfo.id} now has ${fragInfo.frags} frags`);
      
      // Update frags for the player who got the kill
      if (this.players[fragInfo.id]) {
        this.players[fragInfo.id].frags = fragInfo.frags;
        
        // If this is our own frag update, display it prominently
        if (fragInfo.id === this.socket.id && this.game.player) {
          console.log(`YOU FRAGGED A PLAYER! Total frags: ${fragInfo.frags}`);
          
          // Update or create the frag counter display
          this.updateFragDisplay(fragInfo.frags);
        }
      }
    });
  }
  
  // Send player movement update to the server
  sendMovementUpdate(position, rotation) {
    if (!this.socket || !this.connected) {
      // Silently fail if not connected
      return false;
    }
    
    // Validate position before sending
    if (!position || typeof position.x !== 'number' || 
        typeof position.y !== 'number' || 
        typeof position.z !== 'number') {
      console.error('Invalid position data:', position);
      return false;
    }
    
    // Create position update object
    const movementData = {
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      rotation: rotation
    };
    
    // Log position update at reduced frequency to avoid console spam
    if (Math.random() < 0.05) { // Only log ~5% of updates
      this.log('Sending position update:', 
        `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
        'rotation:', rotation.toFixed(2));
    }
    
    // Send the update to the server
    try {
      this.socket.emit('playerMovement', movementData);
      return true;
    } catch (error) {
      console.error('Error sending position update:', error);
      return false;
    }
  }
  
  // Send shot information to the server
  sendShot(origin, direction) {
    if (!this.socket || !this.connected) {
      console.error('Cannot send shot: not connected to server');
      return;
    }
    
    this.log('Sending shot to server from', 
      `(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`,
      'in direction',
      `(${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`
    );
    
    this.socket.emit('playerShot', {
      origin: {
        x: origin.x,
        y: origin.y,
        z: origin.z
      },
      direction: {
        x: direction.x,
        y: direction.y,
        z: direction.z
      }
    });
  }
  
  // Send hit information to the server
  sendHit(hitPlayerId, damage) {
    if (!this.socket || !this.connected) {
      console.error('Cannot send hit: not connected to server');
      return false;
    }
    
    console.log(`==== SENDING HIT TO SERVER ====`);
    console.log(`Target player ID: ${hitPlayerId}`);
    console.log(`Damage amount: ${damage}`);
    
    if (!hitPlayerId) {
      console.error('CRITICAL ERROR: Attempted to send hit with invalid player ID');
      return false;
    }
    
    if (isNaN(damage) || damage <= 0) {
      console.error(`CRITICAL ERROR: Invalid damage value: ${damage}`);
      return false;
    }
    
    this.log('Sending hit to server:', 'player', hitPlayerId, 'with damage', damage);
    
    // Add try-catch to handle any potential errors
    try {
      // Create the hit data object
      const hitData = {
        id: hitPlayerId,
        damage: damage
      };
      
      // Log the exact data being sent
      console.log(`Hit data being sent: ${JSON.stringify(hitData)}`);
      
      // Add a confirmation callback to verify the message was sent
      this.socket.emit('playerHit', hitData, (acknowledgment) => {
        if (acknowledgment && acknowledgment.success) {
          console.log(`Server acknowledged hit: ${acknowledgment.message}`);
        } else if (acknowledgment) {
          console.error(`Server rejected hit: ${acknowledgment.message}`);
        }
      });
      
      // Send a debug message to confirm the hit was sent
      console.log(`HIT SENT TO SERVER: Player ${hitPlayerId} with ${damage} damage`);
      console.log(`==== HIT EVENT COMPLETE ====`);
      
      return true;
    } catch (error) {
      console.error('Error sending hit event:', error);
      
      // Try sending with a simpler method as fallback
      try {
        this.socket.emit('playerHit', {
          id: hitPlayerId,
          damage: damage
        });
        console.log(`Hit sent with fallback method`);
        return true;
      } catch (fallbackError) {
        console.error('Fallback hit sending also failed:', fallbackError);
        return false;
      }
    }
  }
  
  // Create 3D models for all other players
  createPlayerModels() {
    for (const id in this.players) {
      // Skip our own player
      if (id === this.socket.id) continue;
      
      this.createPlayerModel(this.players[id]);
    }
  }
  
  // Create a 3D model for a specific player
  createPlayerModel(playerInfo) {
    // Skip if this is our own player
    if (playerInfo.id === this.socket.id) return;
    
    // Skip if model already exists
    if (this.playerModels[playerInfo.id]) return;
    
    // Create a simple colored capsule for other players
    const geometry = new THREE.CapsuleGeometry(0.5, 1.2, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0000, // Red color for other players
      roughness: 0.7,
      metalness: 0.3
    });
    
    const model = new THREE.Mesh(geometry, material);
    model.name = 'other-player'; // Add a consistent name for hit detection
    
    // Store player ID in the mesh's userData for hit detection
    model.userData = {
      playerId: playerInfo.id
    };
    
    console.log(`Created player model with ID ${playerInfo.id} stored in userData`);
    
    // Position at the player's location
    if (playerInfo.position) {
      model.position.set(
        playerInfo.position.x,
        playerInfo.position.y + 1, // Adjust to match player height
        playerInfo.position.z
      );
    }
    
    // Add to scene
    this.game.scene.add(model);
    
    // Store the model
    this.playerModels[playerInfo.id] = model;
    
    this.log('Created model for player:', playerInfo.id);
  }
  
  // Update a player model's position and rotation
  updatePlayerModel(playerInfo) {
    // If we don't have a model for this player, try to create one
    if (!this.playerModels[playerInfo.id]) {
      this.createPlayerModel(playerInfo);
      return;
    }
    
    const model = this.playerModels[playerInfo.id];
    
    // Update position
    if (playerInfo.position) {
      // Validate position values
      const pos = playerInfo.position;
      if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
        console.error(`Invalid position values for player ${playerInfo.id}:`, pos);
        return;
      }
      
      // Update model position - y is offset for the character height
      model.position.set(
        pos.x,
        pos.y + 1, // Adjust to match player height
        pos.z
      );
    }
    
    // Update rotation (Y-axis only)
    if (playerInfo.rotation !== undefined && !isNaN(playerInfo.rotation)) {
      model.rotation.y = playerInfo.rotation;
    }
  }
  
  // Remove a player model
  removePlayerModel(playerId) {
    if (!this.playerModels[playerId]) return;
    
    // Remove from scene
    this.game.scene.remove(this.playerModels[playerId]);
    
    // Delete reference
    delete this.playerModels[playerId];
    
    this.log('Removed model for player:', playerId);
  }
  
  // Visualize a shot fired by another player
  visualizeShot(shotInfo) {
    if (!this.game.player || !this.game.player.weapons) return;
    
    // Convert shot data to THREE.Vector3 objects
    const origin = new THREE.Vector3(
      shotInfo.origin.x,
      shotInfo.origin.y,
      shotInfo.origin.z
    );
    
    const direction = new THREE.Vector3(
      shotInfo.direction.x,
      shotInfo.direction.y,
      shotInfo.direction.z
    ).normalize();
    
    // Use the weapons system to visualize the shot
    this.game.player.weapons.createBulletTrail(
      origin,
      origin.clone().add(direction.multiplyScalar(1000))
    );
  }
  
  // Update method to be called from the game loop
  update(deltaTime) {
    // Any continuous network tasks can go here
  }
  
  // Logging helper
  log(...args) {
    if (this.debug) {
      console.log('[Network]', ...args);
    }
  }
  
  // Clean up resources
  dispose() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Remove all player models
    for (const id in this.playerModels) {
      this.game.scene.remove(this.playerModels[id]);
    }
    
    this.playerModels = {};
    this.players = {};
    this.connected = false;
  }
  
  // Create or update the frag counter display
  updateFragDisplay(frags) {
    // Find or create the frag counter element
    let fragCounter = document.getElementById('frag-counter');
    
    if (!fragCounter) {
      // Create frag counter if it doesn't exist
      fragCounter = document.createElement('div');
      fragCounter.id = 'frag-counter';
      fragCounter.style.position = 'absolute';
      fragCounter.style.top = '20px';
      fragCounter.style.right = '20px';
      fragCounter.style.padding = '10px';
      fragCounter.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
      fragCounter.style.color = '#ff9900';
      fragCounter.style.fontFamily = 'Arial, sans-serif';
      fragCounter.style.fontSize = '24px';
      fragCounter.style.fontWeight = 'bold';
      fragCounter.style.borderRadius = '5px';
      fragCounter.style.zIndex = '1000';
      fragCounter.style.textShadow = '1px 1px 0 #000';
      document.body.appendChild(fragCounter);
    }
    
    // Update the content
    fragCounter.textContent = `FRAGS: ${frags}`;
    
    // Animation effect for frag update
    fragCounter.style.transform = 'scale(1.5)';
    fragCounter.style.transition = 'transform 0.2s';
    
    // Reset scale after animation
    setTimeout(() => {
      fragCounter.style.transform = 'scale(1)';
    }, 200);
  }
} 