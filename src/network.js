import { io } from 'socket.io-client';
import * as THREE from 'three';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.players = {};
    this.connected = false;
    this.playerName = '';
    
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
  
  // Helper log function that only prints when debug is true
  log(...args) {
    if (this.debug) {
      console.log(...args);
    }
  }
  
  // Connect to the game server
  connect(playerName = '') {
    // Store the player name
    this.playerName = playerName || 'Player' + Math.floor(Math.random() * 1000);
    console.log(`Connecting to server as: ${this.playerName}`);
    
    // Create Socket.IO connection
    this.socket = io(this.serverUrl);
    
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
      
      // Send player name to server
      this.socket.emit('playerName', this.playerName);
      
      // Initialize frag counter
      this.updateFragDisplay(0);
      
      // Initialize leaderboard
      this.createLeaderboard();
      
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
      this.updateLeaderboard(); // Update the leaderboard with current players
    });
    
    // New player joined
    this.socket.on('newPlayer', (playerInfo) => {
      console.log("==== NEW PLAYER JOINED ====");
      console.log("Player info:", playerInfo);
      this.players[playerInfo.id] = playerInfo;
      this.createPlayerModel(playerInfo);
      this.updateLeaderboard(); // Update the leaderboard with the new player
    });
    
    // Player moved
    this.socket.on('playerMoved', (playerInfo) => {
      console.log(`🔄 RECEIVED playerMoved event from: ${playerInfo.id}`, playerInfo);
      
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
    
    // Health update (for us or other players)
    this.socket.on('healthUpdate', (healthInfo) => {
      console.log(`RECEIVED HEALTH UPDATE for player ${healthInfo.id}:`, healthInfo);
      
      // If it's for us, update our health display
      if (healthInfo.id === this.socket.id && this.game.player) {
        console.log(`Updating our health to ${healthInfo.health} and armor to ${healthInfo.armor}`);
        
        // If this is the first health update, save the armor value
        if (!this._receivedFirstHealthUpdate) {
          this._receivedFirstHealthUpdate = true;
          console.log(`First health update received with armor: ${healthInfo.armor}`);
        }
        
        // Update player health
        this.game.player.health = healthInfo.health;
        
        // Only update armor if it's defined
        if (healthInfo.armor !== undefined) {
          this.game.player.armor = healthInfo.armor;
        } else {
          console.warn("Server sent health update without armor value!");
        }
        
        // Update UI
        this.game.player.updateHealthDisplay();
        this.game.player.updateArmorDisplay();
        
        // Flash screen red if took damage
        if (this.game.player.lastHealth > healthInfo.health) {
          this.game.player.showDamage();
        }
        
        // Store current health for next comparison
        this.game.player.lastHealth = healthInfo.health;
      } 
      // If it's for another player, store it
      else if (this.players[healthInfo.id]) {
        this.players[healthInfo.id].health = healthInfo.health;
        
        // Only update armor if it's defined
        if (healthInfo.armor !== undefined) {
          this.players[healthInfo.id].armor = healthInfo.armor;
        }
      }
    });
    
    // Frag count update
    this.socket.on('fragUpdate', (fragInfo) => {
      if (fragInfo.id === this.socket.id) {
        this.updateFragDisplay(fragInfo.frags);
      }
      
      // Update player's frag count in our local players object
      if (this.players[fragInfo.id]) {
        this.players[fragInfo.id].frags = fragInfo.frags;
      }
      
      // Update the leaderboard
      this.updateLeaderboard();
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
      if (this.players[playerId]) {
        delete this.players[playerId];
        this.updateLeaderboard(); // Update the leaderboard when a player disconnects
      }
    });
  }
  
  // Helper method to update the frag display
  updateFragDisplay(frags) {
    // If we don't already have a frag counter, create one
    if (!document.getElementById('frag-counter')) {
      const fragCounter = document.createElement('div');
      fragCounter.id = 'frag-counter';
      fragCounter.style.position = 'absolute';
      fragCounter.style.top = '20px';
      fragCounter.style.right = '20px';
      fragCounter.style.color = 'white';
      fragCounter.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      fragCounter.style.padding = '5px 10px';
      fragCounter.style.borderRadius = '5px';
      fragCounter.style.fontFamily = 'Arial';
      
      document.getElementById('ui-container').appendChild(fragCounter);
    }
    
    // Update the frag count display
    document.getElementById('frag-counter').textContent = `Frags: ${frags}`;
  }
  
  // Create leaderboard in the bottom right corner
  createLeaderboard() {
    if (document.getElementById('leaderboard')) return;
    
    const leaderboard = document.createElement('div');
    leaderboard.id = 'leaderboard';
    leaderboard.style.position = 'absolute';
    leaderboard.style.bottom = '20px';
    leaderboard.style.right = '20px';
    leaderboard.style.color = 'white';
    leaderboard.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    leaderboard.style.padding = '10px';
    leaderboard.style.borderRadius = '5px';
    leaderboard.style.fontFamily = 'Arial';
    leaderboard.style.minWidth = '180px';
    leaderboard.style.maxHeight = '200px';
    leaderboard.style.overflowY = 'auto';
    leaderboard.style.zIndex = '100';
    
    const title = document.createElement('div');
    title.textContent = 'LEADERBOARD';
    title.style.fontWeight = 'bold';
    title.style.textAlign = 'center';
    title.style.borderBottom = '1px solid #666';
    title.style.marginBottom = '5px';
    title.style.paddingBottom = '5px';
    
    leaderboard.appendChild(title);
    
    // Create container for player scores
    const scoresContainer = document.createElement('div');
    scoresContainer.id = 'leaderboard-scores';
    leaderboard.appendChild(scoresContainer);
    
    document.getElementById('ui-container').appendChild(leaderboard);
    
    // Initially update the leaderboard
    this.updateLeaderboard();
  }
  
  // Update the leaderboard with current player frags
  updateLeaderboard() {
    if (!document.getElementById('leaderboard-scores')) return;
    
    const scoresContainer = document.getElementById('leaderboard-scores');
    scoresContainer.innerHTML = ''; // Clear current entries
    
    // Sort players by frag count (descending)
    const sortedPlayers = Object.values(this.players).sort((a, b) => {
      return (b.frags || 0) - (a.frags || 0);
    });
    
    // Add each player to the leaderboard
    sortedPlayers.forEach(player => {
      const playerEntry = document.createElement('div');
      playerEntry.className = 'leaderboard-entry';
      playerEntry.style.display = 'flex';
      playerEntry.style.justifyContent = 'space-between';
      playerEntry.style.margin = '2px 0';
      playerEntry.style.padding = '2px 0';
      
      // Highlight current player
      if (player.id === this.socket?.id) {
        playerEntry.style.fontWeight = 'bold';
        playerEntry.style.color = '#ffcc00';
      }
      
      const playerName = document.createElement('span');
      playerName.textContent = player.name || 'Unknown';
      playerName.style.textOverflow = 'ellipsis';
      playerName.style.overflow = 'hidden';
      playerName.style.whiteSpace = 'nowrap';
      playerName.style.maxWidth = '130px';
      
      const playerFrags = document.createElement('span');
      playerFrags.textContent = player.frags || '0';
      playerFrags.style.marginLeft = '10px';
      
      playerEntry.appendChild(playerName);
      playerEntry.appendChild(playerFrags);
      scoresContainer.appendChild(playerEntry);
    });
    
    // If no players, show a message
    if (sortedPlayers.length === 0) {
      const noPlayers = document.createElement('div');
      noPlayers.textContent = 'No players online';
      noPlayers.style.textAlign = 'center';
      noPlayers.style.fontStyle = 'italic';
      noPlayers.style.color = '#999';
      scoresContainer.appendChild(noPlayers);
    }
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
    
    // Debug counter for position updates
    if (!this._posUpdateCount) this._posUpdateCount = 0;
    this._posUpdateCount++;
    
    // Log every 100 position updates
    if (this._posUpdateCount % 100 === 0) {
      console.log(`🔄 SENT ${this._posUpdateCount} position updates so far. Latest:`, 
        `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
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
      console.error('Error sending hit to server:', error);
      return false;
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
    // Only create models for other players
    if (playerInfo.id === this.socket.id) return;
    
    // Remove existing model if there is one
    this.removePlayerModel(playerInfo.id);
    
    // Create a simple capsule geometry for the player model
    const geometry = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red for other players
    const playerModel = new THREE.Mesh(geometry, material);
    
    // Position the model
    if (playerInfo.position) {
      playerModel.position.set(
        playerInfo.position.x,
        playerInfo.position.y,
        playerInfo.position.z
      );
    }
    
    // Rotate the model
    if (playerInfo.rotation !== undefined) {
      playerModel.rotation.y = playerInfo.rotation;
    }
    
    // Cast shadows
    playerModel.castShadow = true;
    
    // Add to scene
    this.game.scene.add(playerModel);
    
    // Store reference
    this.playerModels[playerInfo.id] = playerModel;
    
    console.log(`Created model for player ${playerInfo.id}`);
    
    // Create player name element
    this.createPlayerNameTag(playerInfo);
  }
  
  // Create a player name tag above their model
  createPlayerNameTag(playerInfo) {
    // Check if we have a name for this player
    const playerName = playerInfo.name || `Player ${playerInfo.id.substring(0, 4)}`;
    
    // Create a div for the player name if it doesn't exist
    let nameElement = document.getElementById(`player-name-${playerInfo.id}`);
    
    if (!nameElement) {
      nameElement = document.createElement('div');
      nameElement.id = `player-name-${playerInfo.id}`;
      nameElement.className = 'player-name';
      nameElement.textContent = playerName;
      document.getElementById('ui-container').appendChild(nameElement);
    }
  }
  
  // Update a player model with new position/rotation
  updatePlayerModel(playerInfo) {
    const model = this.playerModels[playerInfo.id];
    if (!model) return;
    
    // Update position
    if (playerInfo.position) {
      model.position.set(
        playerInfo.position.x,
        playerInfo.position.y,
        playerInfo.position.z
      );
    }
    
    // Update rotation
    if (playerInfo.rotation !== undefined) {
      model.rotation.y = playerInfo.rotation;
    }
    
    // Update player name tag position
    this.updatePlayerNameTagPosition(playerInfo.id);
  }
  
  // Update the position of a player's name tag
  updatePlayerNameTagPosition(playerId) {
    const nameElement = document.getElementById(`player-name-${playerId}`);
    const model = this.playerModels[playerId];
    
    if (!nameElement || !model) return;
    
    // Project the 3D position to 2D screen coordinates
    const modelPosition = new THREE.Vector3(
      model.position.x,
      model.position.y + 2.0, // Position above the player's head
      model.position.z
    );
    
    // Project to 2D space
    modelPosition.project(this.game.camera);
    
    // Convert to screen coordinates
    const x = (modelPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (modelPosition.y * -0.5 + 0.5) * window.innerHeight;
    
    // Check if the name tag is in front of the camera
    const isBehindCamera = modelPosition.z > 1;
    
    // Update name tag position
    nameElement.style.left = `${x}px`;
    nameElement.style.top = `${y}px`;
    
    // Calculate distance from camera to player for opacity
    const distance = this.game.camera.position.distanceTo(model.position);
    const opacity = Math.max(0, Math.min(1, 1 - (distance - 5) / 15)); // Fade between 5-20 units
    
    // Update opacity based on distance and visibility
    nameElement.style.opacity = isBehindCamera ? '0' : opacity.toString();
  }
  
  // Remove a player model
  removePlayerModel(playerId) {
    // Remove the model from the scene
    if (this.playerModels[playerId]) {
      this.game.scene.remove(this.playerModels[playerId]);
      delete this.playerModels[playerId];
    }
    
    // Remove the name tag
    const nameElement = document.getElementById(`player-name-${playerId}`);
    if (nameElement) {
      nameElement.remove();
    }
    
    console.log(`Removed model for player ${playerId}`);
  }
  
  // Visualize a shot from another player
  visualizeShot(shotInfo) {
    if (!shotInfo.origin || !shotInfo.direction) {
      console.error('Invalid shot data:', shotInfo);
      return;
    }
    
    const origin = new THREE.Vector3(
      shotInfo.origin.x,
      shotInfo.origin.y,
      shotInfo.origin.z
    );
    
    const direction = new THREE.Vector3(
      shotInfo.direction.x,
      shotInfo.direction.y,
      shotInfo.direction.z
    );
    
    // Normalize the direction
    direction.normalize();
    
    // Calculate endpoint (arbitrary distance of 100 units)
    const endpoint = new THREE.Vector3().copy(origin).add(direction.multiplyScalar(100));
    
    // Create bullet trail geometry
    const bulletGeometry = new THREE.BufferGeometry().setFromPoints([
      origin,
      endpoint
    ]);
    
    // Create bullet trail material
    const bulletMaterial = new THREE.LineBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    
    // Create the bullet trail
    const bulletTrail = new THREE.Line(bulletGeometry, bulletMaterial);
    
    // Add to scene
    this.game.scene.add(bulletTrail);
    
    // Remove bullet trail after a short time
    setTimeout(() => {
      this.game.scene.remove(bulletTrail);
      bulletTrail.geometry.dispose();
      bulletMaterial.dispose();
    }, 100);
  }
  
  // Update method called each frame
  update() {
    // Update player name tags positions
    for (const playerId in this.playerModels) {
      this.updatePlayerNameTagPosition(playerId);
    }
    
    // Refresh leaderboard periodically
    if (!this._lastLeaderboardUpdate) {
      this._lastLeaderboardUpdate = Date.now();
      this.updateLeaderboard();
    } else {
      const now = Date.now();
      if (now - this._lastLeaderboardUpdate > 2000) { // Update every 2 seconds
        this._lastLeaderboardUpdate = now;
        this.updateLeaderboard();
      }
    }
  }
  
  // Clean up resources when disconnecting
  dispose() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Clean up player models
    for (const playerId in this.playerModels) {
      this.removePlayerModel(playerId);
    }
    
    // Remove UI elements
    const fragCounter = document.getElementById('frag-counter');
    if (fragCounter) {
      fragCounter.parentNode.removeChild(fragCounter);
    }
    
    const leaderboard = document.getElementById('leaderboard');
    if (leaderboard) {
      leaderboard.parentNode.removeChild(leaderboard);
    }
    
    // Clear player collections
    this.playerModels = {};
    this.players = {};
    
    this.connected = false;
  }
} 