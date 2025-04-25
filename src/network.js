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
        // Handle our own respawn using the new networkRespawn method
        console.log('Handling our own respawn');
        this.game.player.networkRespawn(respawnInfo.position);
        
        // Reset the lastSpawnTime for survival time tracking
        if (this.players[this.socket.id]) {
          this.players[this.socket.id].lastSpawnTime = Date.now();
          this.players[this.socket.id].waitingToRespawn = false;
          this.players[this.socket.id].isDead = false;
        }
        
        console.log('Player respawned with health:', this.game.player.health);
      } else if (this.players[respawnInfo.id]) {
        // Update other player's position
        this.players[respawnInfo.id].position = respawnInfo.position;
        
        // Mark player as no longer dead or waiting to respawn
        this.players[respawnInfo.id].waitingToRespawn = false;
        this.players[respawnInfo.id].isDead = false;
        
        // Make player visible again
        this.updatePlayerVisibility(respawnInfo.id);
        
        // Debug to verify model state after respawn
        const playerModel = this.playerModels[respawnInfo.id];
        if (playerModel) {
          console.log(`Player ${respawnInfo.id} model after respawn: visible=${playerModel.visible}, in scene=${playerModel.parent !== null}`);
        }
        
        // Update the model position
        this.updatePlayerModel(this.players[respawnInfo.id]);
        
        // Also update their health in our local data
        this.players[respawnInfo.id].health = 100;
        this.players[respawnInfo.id].armor = 0;
        
        // Update lastSpawnTime
        this.players[respawnInfo.id].lastSpawnTime = Date.now();
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
    
    // Player died - waiting for respawn
    this.socket.on('playerDied', (deathInfo) => {
      console.log("==== PLAYER DEATH EVENT ====");
      console.log('Player died:', deathInfo);
      
      // Update our local player data to mark this player as dead
      if (this.players[deathInfo.id]) {
        this.players[deathInfo.id].isDead = true;
        this.players[deathInfo.id].waitingToRespawn = true;
        
        // If this is another player, update their model visibility
        if (deathInfo.id !== this.socket.id) {
          this.updatePlayerVisibility(deathInfo.id);
          
          // Debug to verify model state after death
          const playerModel = this.playerModels[deathInfo.id];
          if (playerModel) {
            console.log(`Player ${deathInfo.id} model after death: visible=${playerModel.visible}, in scene=${playerModel.parent !== null}`);
          }
        }
      }
      
      if (deathInfo.id === this.socket.id && this.game.player) {
        // Handle our own death
        console.log('We died! Showing death overlay.');
        
        // Format survival time for display
        const survivalTimeFormatted = this.formatSurvivalTime(deathInfo.survivalTime);
        
        // Store the killer ID for spawning away from them later
        if (this.players[this.socket.id]) {
          this.players[this.socket.id].lastKillerId = deathInfo.killerId;
        }
        
        // Show death overlay
        this.showDeathOverlay(deathInfo.killerId, survivalTimeFormatted);
        
        // Setup respawn event listener for Enter key
        this.setupRespawnListener();
      }
    });

    // Add survival time update listener
    this.socket.on('survivalTimeUpdate', (timeInfo) => {
      console.log(`Received survival time update for player ${timeInfo.id}:`, timeInfo);
      
      // Update our local player data with the survival time info
      if (this.players[timeInfo.id]) {
        this.players[timeInfo.id].survivalTime = timeInfo.survivalTime;
        this.players[timeInfo.id].longestSurvivalTime = timeInfo.longestSurvivalTime;
        
        // If this is us and it's a new record, show a congratulations message
        if (timeInfo.id === this.socket.id && timeInfo.isNewRecord) {
          this.showNewSurvivalRecord(timeInfo.longestSurvivalTime);
        }
        
        // Update the leaderboard with new survival time data
        this.updateLeaderboard();
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
    // Make sure the UI container exists before creating the leaderboard
    const uiContainer = document.getElementById('ui-container');
    if (!uiContainer) {
      console.error('UI container not found, leaderboard creation delayed');
      // Try again later
      setTimeout(() => this.createLeaderboard(), 500);
      return;
    }
    
    // Skip if leaderboard already exists
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
    leaderboard.style.minWidth = '250px'; // Make wider to accommodate survival time
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
    
    // Create header row with column titles
    const headerRow = document.createElement('div');
    headerRow.className = 'leaderboard-header';
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.fontWeight = 'bold';
    headerRow.style.marginBottom = '3px';
    headerRow.style.paddingBottom = '3px';
    headerRow.style.borderBottom = '1px solid #444';
    
    const nameHeader = document.createElement('span');
    nameHeader.textContent = 'PLAYER';
    nameHeader.style.flex = '1';
    
    const fragsHeader = document.createElement('span');
    fragsHeader.textContent = 'FRAGS';
    fragsHeader.style.width = '50px';
    fragsHeader.style.textAlign = 'center';
    
    const timeHeader = document.createElement('span');
    timeHeader.textContent = 'BEST TIME';
    timeHeader.style.width = '80px';
    timeHeader.style.textAlign = 'right';
    
    headerRow.appendChild(nameHeader);
    headerRow.appendChild(fragsHeader);
    headerRow.appendChild(timeHeader);
    leaderboard.appendChild(headerRow);
    
    // Create container for player scores
    const scoresContainer = document.createElement('div');
    scoresContainer.id = 'leaderboard-scores';
    leaderboard.appendChild(scoresContainer);
    
    uiContainer.appendChild(leaderboard);
    
    // Create survival timer display
    this.createSurvivalTimer();
    
    // Initially update the leaderboard
    this.updateLeaderboard();
  }
  
  // Update the leaderboard with current player frags and survival times
  updateLeaderboard() {
    const scoresContainer = document.getElementById('leaderboard-scores');
    if (!scoresContainer) return;
    
    scoresContainer.innerHTML = ''; // Clear current entries
    
    // Make sure this.players exists and isn't null
    if (!this.players) return;
    
    try {
      // Sort players by frag count (descending)
      const sortedPlayers = Object.values(this.players)
        .filter(player => player && player.id) // Ensure we only have valid player objects
        .sort((a, b) => {
          return (b.frags || 0) - (a.frags || 0);
        });
      
      // Add each player to the leaderboard
      sortedPlayers.forEach(player => {
        if (!player || !player.id) return; // Skip invalid players
        
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
        
        // Create player name column
        const playerName = document.createElement('span');
        playerName.textContent = player.name || 'Unknown';
        playerName.style.textOverflow = 'ellipsis';
        playerName.style.overflow = 'hidden';
        playerName.style.whiteSpace = 'nowrap';
        playerName.style.maxWidth = '100px';
        playerName.style.flex = '1';
        
        // Create frags column
        const playerFrags = document.createElement('span');
        playerFrags.textContent = player.frags || '0';
        playerFrags.style.width = '50px';
        playerFrags.style.textAlign = 'center';
        
        // Create survival time column
        const playerSurvival = document.createElement('span');
        const survivalTime = player.longestSurvivalTime || 0;
        playerSurvival.textContent = this.formatSurvivalTime(survivalTime);
        playerSurvival.style.width = '80px';
        playerSurvival.style.textAlign = 'right';
        
        playerEntry.appendChild(playerName);
        playerEntry.appendChild(playerFrags);
        playerEntry.appendChild(playerSurvival);
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
    } catch (err) {
      console.error('Error updating leaderboard:', err);
      
      // Add error message to leaderboard
      const errorMessage = document.createElement('div');
      errorMessage.textContent = 'Error updating scores';
      errorMessage.style.color = '#ff5252';
      errorMessage.style.textAlign = 'center';
      scoresContainer.appendChild(errorMessage);
    }
  }
  
  // Create the survival timer UI element
  createSurvivalTimer() {
    // Skip if timer already exists
    if (document.getElementById('survival-timer')) return;
    
    const uiContainer = document.getElementById('ui-container');
    if (!uiContainer) {
      console.error('UI container not found, survival timer creation delayed');
      setTimeout(() => this.createSurvivalTimer(), 500);
      return;
    }
    
    const timerContainer = document.createElement('div');
    timerContainer.id = 'survival-timer';
    timerContainer.style.position = 'absolute';
    timerContainer.style.top = '50px'; // Below frag counter
    timerContainer.style.right = '20px';
    timerContainer.style.color = 'white';
    timerContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    timerContainer.style.padding = '5px 10px';
    timerContainer.style.borderRadius = '5px';
    timerContainer.style.fontFamily = 'Arial';
    timerContainer.style.fontSize = '14px';
    timerContainer.textContent = 'Survival: 00:00';
    
    uiContainer.appendChild(timerContainer);
    
    // Start the timer update loop
    this._startSurvivalTimer();
  }
  
  // Format milliseconds to MM:SS.ms format
  formatSurvivalTime(ms) {
    if (!ms) return '00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  // Start the survival timer update loop
  _startSurvivalTimer() {
    this._survivalTimerStarted = true;
    
    // Update survival timer every 100ms
    this._survivalTimerInterval = setInterval(() => {
      if (!this.socket || !this.socket.id || !this.players[this.socket.id]) return;
      
      // Skip updating timer if player is dead/waiting to respawn
      if (this.players[this.socket.id].waitingToRespawn) return;
      
      const timerElement = document.getElementById('survival-timer');
      if (!timerElement) return;
      
      // Calculate current survival time
      const survivalTime = Date.now() - (this.players[this.socket.id].lastSpawnTime || Date.now());
      timerElement.textContent = `Survival: ${this.formatSurvivalTime(survivalTime)}`;
    }, 100);
  }
  
  // Show the death overlay
  showDeathOverlay(killerId, survivalTime) {
    // Skip if overlay already exists
    if (document.getElementById('death-overlay')) {
      return;
    }
    
    const uiContainer = document.getElementById('ui-container');
    if (!uiContainer) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'death-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(200, 0, 0, 0.3)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = 'white';
    overlay.style.fontFamily = 'Arial';
    overlay.style.textAlign = 'center';
    overlay.style.zIndex = '1000';
    
    // Show killer info
    const deathMessage = document.createElement('div');
    deathMessage.style.fontSize = '24px';
    deathMessage.style.marginBottom = '20px';
    
    if (killerId && this.players[killerId]) {
      deathMessage.textContent = `You were fragged by ${this.players[killerId].name}`;
    } else {
      deathMessage.textContent = 'You died';
    }
    
    const survivalTimeDisplay = document.createElement('div');
    survivalTimeDisplay.style.fontSize = '20px';
    survivalTimeDisplay.style.marginBottom = '30px';
    survivalTimeDisplay.textContent = `Survival time: ${survivalTime}`;
    
    const respawnPrompt = document.createElement('div');
    respawnPrompt.style.fontSize = '20px';
    respawnPrompt.style.marginTop = '10px';
    respawnPrompt.style.padding = '5px 15px';
    respawnPrompt.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    respawnPrompt.style.borderRadius = '5px';
    respawnPrompt.style.animation = 'pulse 1.5s infinite';
    respawnPrompt.textContent = 'Press ENTER to respawn';
    
    // Add a style for the pulsing animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 0.5; }
        50% { opacity: 1; }
        100% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    
    overlay.appendChild(deathMessage);
    overlay.appendChild(survivalTimeDisplay);
    overlay.appendChild(respawnPrompt);
    
    uiContainer.appendChild(overlay);
  }
  
  // Set up the respawn key listener
  setupRespawnListener() {
    // Remove any existing listener first
    this.removeRespawnListener();
    
    // Create the respawn handler
    this._respawnHandler = (event) => {
      // Listen for Enter key
      if (event.key === 'Enter') {
        console.log('Enter key pressed, requesting respawn');
        this.requestRespawn();
      }
    };
    
    // Add the listener
    window.addEventListener('keydown', this._respawnHandler);
  }
  
  // Remove the respawn key listener
  removeRespawnListener() {
    if (this._respawnHandler) {
      window.removeEventListener('keydown', this._respawnHandler);
      this._respawnHandler = null;
    }
  }
  
  // Request server to respawn the player
  requestRespawn() {
    if (!this.socket || !this.connected) return;
    
    console.log('Sending respawn request to server');
    this.socket.emit('playerRequestRespawn');
    
    // Remove the death overlay
    const overlay = document.getElementById('death-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    
    // Remove the respawn listener
    this.removeRespawnListener();
  }
  
  // Show a new survival record message
  showNewSurvivalRecord(time) {
    const uiContainer = document.getElementById('ui-container');
    if (!uiContainer) return;
    
    const recordMessage = document.createElement('div');
    recordMessage.className = 'record-message';
    recordMessage.style.position = 'absolute';
    recordMessage.style.top = '100px';
    recordMessage.style.left = '50%';
    recordMessage.style.transform = 'translateX(-50%)';
    recordMessage.style.color = '#ffcc00';
    recordMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    recordMessage.style.padding = '10px 15px';
    recordMessage.style.borderRadius = '5px';
    recordMessage.style.fontFamily = 'Arial';
    recordMessage.style.fontSize = '18px';
    recordMessage.style.fontWeight = 'bold';
    recordMessage.style.textAlign = 'center';
    recordMessage.style.zIndex = '101';
    recordMessage.textContent = `NEW PERSONAL BEST SURVIVAL TIME: ${this.formatSurvivalTime(time)}`;
    
    uiContainer.appendChild(recordMessage);
    
    // Remove the message after 5 seconds
    setTimeout(() => {
      if (recordMessage.parentNode) {
        recordMessage.parentNode.removeChild(recordMessage);
      }
    }, 5000);
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
    
    // Set visibility based on isDead state
    playerModel.visible = !(playerInfo.isDead || playerInfo.waitingToRespawn);
    
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
    try {
      // Update player name tags positions
      for (const playerId in this.playerModels) {
        if (this.playerModels[playerId]) {
          this.updatePlayerNameTagPosition(playerId);
        }
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
    } catch (err) {
      console.error('Error in network update:', err);
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
    
    const survivalTimer = document.getElementById('survival-timer');
    if (survivalTimer) {
      survivalTimer.parentNode.removeChild(survivalTimer);
    }
    
    const deathOverlay = document.getElementById('death-overlay');
    if (deathOverlay) {
      deathOverlay.parentNode.removeChild(deathOverlay);
    }
    
    // Clear intervals
    if (this._survivalTimerInterval) {
      clearInterval(this._survivalTimerInterval);
      this._survivalTimerInterval = null;
    }
    
    // Remove event listeners
    this.removeRespawnListener();
    
    // Clear player collections
    this.playerModels = {};
    this.players = {};
    
    this.connected = false;
  }
  
  // Add a new method to handle player visibility based on isDead state
  updatePlayerVisibility(playerId) {
    const playerModel = this.playerModels[playerId];
    if (!playerModel) return;
    
    // Get player state
    const player = this.players[playerId];
    if (!player) return;
    
    // If player is dead, hide their model
    if (player.isDead || player.waitingToRespawn) {
      console.log(`Hiding model for dead player ${playerId}`);
      playerModel.visible = false;
      
      // Remove from scene temporarily to ensure it can't be hit by raycasts
      if (playerModel.parent) {
        // Store reference to parent for later re-addition
        playerModel.userData.originalParent = playerModel.parent;
        playerModel.parent.remove(playerModel);
      }
    } else {
      // Make sure player is visible if they're alive
      console.log(`Showing model for alive player ${playerId}`);
      playerModel.visible = true;
      
      // Re-add to scene if it was removed
      if (playerModel.userData.originalParent && !playerModel.parent) {
        playerModel.userData.originalParent.add(playerModel);
        playerModel.userData.originalParent = null;
      }
    }
  }
} 