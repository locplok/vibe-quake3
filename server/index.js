const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Set up Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Add middleware to intercept and fix health updates
io.use((socket, next) => {
  // Intercept outgoing packets for individual socket
  const originalEmit = socket.emit;
  socket.emit = function(event, ...args) {
    // Check if this is a health update event
    if (event === 'healthUpdate') {
      const data = args[0];
      console.log(`INTERCEPTED socket.emit healthUpdate (args length: ${args.length}): ${JSON.stringify(data)}`);
      
      // Ensure armor property exists
      if (data && data.armor === undefined) {
        console.log(`FIXING missing armor property for player ${data.id} in socket.emit`);
        // Find the player's armor value or default to 0
        const playerArmor = players[data.id] ? (players[data.id].armor || 0) : 0;
        data.armor = playerArmor;
        console.log(`Set armor to ${data.armor}`);
        
        // Important: Create a completely new object to avoid reference issues
        const fixedData = {
          id: data.id,
          health: data.health,
          armor: playerArmor
        };
        console.log(`FIXED object for socket.emit: ${JSON.stringify(fixedData)}`);
        
        // Replace the original object in args
        args[0] = fixedData;
      }
    }
    return originalEmit.apply(this, [event, ...args]);
  };
  next();
});

// Also intercept io.emit (broadcasts to all)
const originalIoEmit = io.emit;
io.emit = function(event, ...args) {
  // Check if this is a health update event
  if (event === 'healthUpdate') {
    const data = args[0];
    console.log(`INTERCEPTED io.emit healthUpdate (args length: ${args.length}): ${JSON.stringify(data)}`);
    
    // Ensure armor property exists
    if (data && data.armor === undefined) {
      console.log(`FIXING missing armor property for player ${data.id} in io.emit`);
      // Find the player's armor value or default to 0
      const playerArmor = players[data.id] ? (players[data.id].armor || 0) : 0;
      
      // Important: Create a completely new object to avoid reference issues
      const fixedData = {
        id: data.id,
        health: data.health,
        armor: playerArmor
      };
      console.log(`FIXED object for io.emit: ${JSON.stringify(fixedData)}`);
      
      // Replace the original object in args
      args[0] = fixedData;
    }
  }
  return originalIoEmit.apply(this, [event, ...args]);
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Store connected players
const players = {};

// Define spawn points around the map
const SPAWN_POINTS = [
  { x: 0, y: 1, z: 0 },       // Center
  { x: 10, y: 1, z: 10 },     // Mid-distance corner
  { x: -10, y: 1, z: 10 },    // Mid-distance corner
  { x: 10, y: 1, z: -10 },    // Mid-distance corner
  { x: -10, y: 1, z: -10 },   // Mid-distance corner
  { x: 20, y: 1, z: 20 },     // Far corner
  { x: -20, y: 1, z: 20 },    // Far corner
  { x: 20, y: 1, z: -20 },    // Far corner
  { x: -20, y: 1, z: -20 },   // Far corner
  { x: 25, y: 1, z: 0 },      // East side
  { x: -25, y: 1, z: 0 },     // West side
  { x: 0, y: 1, z: 25 },      // South side
  { x: 0, y: 1, z: -25 },     // North side
  { x: 15, y: 1, z: 15 },     // Mid-corner
  { x: -15, y: 1, z: 15 },    // Mid-corner
  { x: 15, y: 1, z: -15 },    // Mid-corner
  { x: -15, y: 1, z: -15 },   // Mid-corner
  
  // New multi-level platform spawn points
  { x: 15, y: 1.5, z: 15 },   // Starting platform (Story 0)
  { x: 3, y: 3.5, z: 15 },    // First landing (Story 1)
  { x: 3, y: 6, z: 5 },       // Second landing (Story 2)
  { x: 15, y: 8.5, z: 5 },    // Third landing (Story 3)
  { x: 15, y: 11, z: 16 },    // Fourth landing (Story 4)
  { x: 3, y: 13.5, z: 16 },   // Fifth landing (Story 5)
  { x: 3, y: 16, z: 5 },      // Final observation deck (Story 6)
  
  // Elevated platforms 
  { x: -20, y: 6, z: -20 },   // Top of blue tower
  { x: -8, y: 4.5, z: 8 },    // Top of green jumping platforms
  { x: 0, y: 3, z: -6 },      // Elevated platform with cover
  { x: -25, y: 5, z: 0 },     // West sniper perch
  { x: 25, y: 5, z: 0 }       // East sniper perch
];

// Get a random spawn point
function getRandomSpawnPoint() {
  const randomIndex = Math.floor(Math.random() * SPAWN_POINTS.length);
  return SPAWN_POINTS[randomIndex];
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Generate random spawn position
  const spawnPoint = getRandomSpawnPoint();
  const randomRotation = Math.random() * Math.PI * 2;
  
  // Create a new player object
  players[socket.id] = {
    id: socket.id,
    position: spawnPoint,
    rotation: randomRotation,
    health: 100,
    armor: 0 // Initialize armor explicitly to 0
  };
  
  // Send the current players to the new player
  socket.emit('currentPlayers', players);
  
  // Broadcast the new player to all other players
  socket.broadcast.emit('newPlayer', players[socket.id]);
  
  // Initialize client with their own health and armor explicitly
  const initialHealthUpdate = {
    id: socket.id,
    health: players[socket.id].health,
    // Ensure armor is never undefined by defaulting to 0
    armor: players[socket.id].armor !== undefined ? players[socket.id].armor : 0
  };
  console.log(`SENDING INITIAL HEALTH UPDATE: ${JSON.stringify(initialHealthUpdate)}`);
  socket.emit('healthUpdate', initialHealthUpdate);
  
  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    console.log(`==== PLAYER MOVEMENT ====`);
    console.log(`Player ID: ${socket.id}`);
    console.log(`Position: (${movementData.position.x.toFixed(2)}, ${movementData.position.y.toFixed(2)}, ${movementData.position.z.toFixed(2)})`);
    console.log(`Rotation: ${movementData.rotation.toFixed(2)}`);
    
    // Update the player's position and rotation
    players[socket.id].position = movementData.position;
    players[socket.id].rotation = movementData.rotation;
    
    // If timestamp is provided, save it to filter outdated updates
    if (movementData.timestamp) {
      players[socket.id].lastMoveTime = movementData.timestamp;
    }
    
    // Broadcast the updated position to all other players
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position: players[socket.id].position,
      rotation: players[socket.id].rotation,
      timestamp: movementData.timestamp || Date.now()
    });
    
    console.log(`Broadcasted movement to ${Object.keys(players).length - 1} other players`);
    console.log(`==== MOVEMENT PROCESSED ====`);
  });
  
  // Handle player shots
  socket.on('playerShot', (shotData) => {
    // Broadcast the shot to all players
    io.emit('shotFired', {
      id: socket.id,
      origin: shotData.origin,
      direction: shotData.direction
    });
  });
  
  // Add a debug command to add armor
  socket.on('debugSetArmor', (amount) => {
    if (players[socket.id]) {
      const oldArmor = players[socket.id].armor || 0;
      players[socket.id].armor = amount;
      console.log(`==== DEBUG ARMOR COMMAND ====`);
      console.log(`Player ${socket.id} armor set: ${oldArmor} → ${amount}`);
      
      // Send health update to all players with the new armor value
      console.log(`Broadcasting health update with new armor value: ${amount}`);
      const armorUpdateObj = {
        id: socket.id,
        health: players[socket.id].health,
        // Ensure armor is never undefined by defaulting to the amount
        armor: players[socket.id].armor !== undefined ? players[socket.id].armor : amount
      };
      console.log(`SENDING ARMOR UPDATE: ${JSON.stringify(armorUpdateObj)}`);
      io.emit('healthUpdate', armorUpdateObj);
      console.log(`==== DEBUG COMMAND COMPLETE ====`);
    }
  });
  
  // Add handler for health update requests
  socket.on('requestHealthUpdate', () => {
    if (players[socket.id]) {
      console.log(`Player ${socket.id} requested health update sync`);
      console.log(`Current values - Health: ${players[socket.id].health}, Armor: ${players[socket.id].armor}`);
      
      // Send immediate health update with current values
      const requestedUpdateObj = {
        id: socket.id,
        health: players[socket.id].health,
        // Ensure armor is never undefined by defaulting to 0
        armor: players[socket.id].armor !== undefined ? players[socket.id].armor : 0
      };
      console.log(`SENDING REQUESTED HEALTH UPDATE: ${JSON.stringify(requestedUpdateObj)}`);
      socket.emit('healthUpdate', requestedUpdateObj);
    }
  });
  
  // Handle player hits
  socket.on('playerHit', (hitData) => {
    const targetId = hitData.id;
    const damage = Math.round(hitData.damage); // Round damage to integer
    
    console.log(`\n=== RECEIVED PLAYER HIT EVENT ===`);
    console.log(`Shooter: ${socket.id}`);
    console.log(`Target: ${targetId}`);
    console.log(`Damage: ${damage}`);
    console.log(`Target exists: ${!!players[targetId]}`);
    
    // Verify target exists
    if (players[targetId]) {
      // Initialize armor if it doesn't exist (shouldn't happen with explicit init)
      if (players[targetId].armor === undefined) {
        players[targetId].armor = 0;
        console.log(`WARNING: Player ${targetId} had undefined armor, initializing to 0`);
      }
      
      console.log(`\n=== SERVER DAMAGE CALCULATION ===`);
      console.log(`Player ${targetId} taking ${damage} damage with ${players[targetId].armor} armor`);
      console.log(`Armor type: ${typeof players[targetId].armor}`);
      
      // Calculate damage reduction with armor (80% protection)
      const armorProtection = 0.8; // 80% damage reduction
      
      // Calculate how damage is distributed
      let healthDamage = damage;
      let armorDamage = 0;
      
      if (players[targetId].armor > 0) {
        // Calculate ideal damage distribution - 80% to armor, 20% to health
        const armorDamagePercent = armorProtection; // 80%
        const healthDamagePercent = 1 - armorProtection; // 20%
        
        // Calculate maximum damage that can go to armor
        const maxArmorDamage = damage * armorDamagePercent;
        console.log(`- Maximum armor damage (${armorDamagePercent*100}% of total): ${maxArmorDamage.toFixed(2)}`);
        
        // Limit by available armor
        armorDamage = Math.min(players[targetId].armor, maxArmorDamage);
        console.log(`- Actual armor damage: ${armorDamage.toFixed(2)}`);
        
        // Update armor
        const oldArmor = players[targetId].armor;
        players[targetId].armor = Math.round(Math.max(0, players[targetId].armor - armorDamage));
        console.log(`- Armor reduced from ${oldArmor} to ${players[targetId].armor}`);
        
        // Calculate health damage (remaining damage goes to health)
        healthDamage = Math.round(damage - armorDamage); 
        console.log(`- Final health damage: ${healthDamage.toFixed(2)}`);
      } else {
        console.log(`- No armor, full damage (${damage}) goes to health`);
        // Explicitly set health damage to full damage amount when no armor
        healthDamage = damage;
      }
      
      // Apply remaining damage to health
      const oldHealth = players[targetId].health;
      players[targetId].health = Math.round(Math.max(0, players[targetId].health - healthDamage));
      
      // CRITICAL FIX: Ensure health never drops below 1 (unless they would die)
      // This ensures players don't end up with less than 1 health from multiple hits
      if (players[targetId].health > 0 && players[targetId].health < 1) {
        players[targetId].health = 1;
        console.log(`- Health clamped to minimum value of 1`);
      }
      
      console.log(`- Health reduced from ${oldHealth} to ${players[targetId].health}`);
      console.log(`=== END CALCULATION ===\n`);
      
      // Check if player died
      if (players[targetId].health <= 0) {
        // Reset health and respawn
        players[targetId].health = 100;
        players[targetId].armor = 0; // Reset armor on death
        
        // Get new random spawn position
        const newSpawnPoint = getRandomSpawnPoint();
        players[targetId].position = newSpawnPoint;
        
        // Notify all players of respawn
        io.emit('playerRespawned', {
          id: targetId,
          position: newSpawnPoint
        });
      }
      
      // Send health update to all players - ALWAYS include armor value
      const finalArmorValue = players[targetId].armor !== undefined ? players[targetId].armor : 0;
      console.log(`Sending health update with armor=${finalArmorValue} (${typeof finalArmorValue})`);
      
      // CRITICAL FIX: Explicitly create the complete update object with all required properties
      const healthUpdateObj = {
        id: targetId,
        health: players[targetId].health,
        armor: finalArmorValue
      };
      
      // Log the exact object being sent
      console.log(`SENDING HEALTH UPDATE: ${JSON.stringify(healthUpdateObj)}`);
      
      // Send the complete object
      io.emit('healthUpdate', healthUpdateObj);
    } else {
      console.log(`ERROR: Hit on non-existent player ${targetId}`);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove this player
    delete players[socket.id];
    
    // Notify all remaining players
    io.emit('playerDisconnected', socket.id);
  });
});

// Determine port
const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 