import io from 'socket.io-client';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default class NetworkManager {
  constructor(scene, camera, player, physicSystem) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.physicSystem = physicSystem;
    this.socket = null;
    this.connected = false;
    this.playerModels = {};
    this.playerBodies = {};
    this.modelLoader = new GLTFLoader();
    
    // Model and animations
    this.playerModelPath = '/models/character.glb';
    this.gunFlash = null;
    this.bulletTrails = [];
  }
  
  connect(serverUrl = 'http://localhost:3000') {
    // Connect to the server
    this.socket = io(serverUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    });
    
    // Set up connection event listeners
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      
      // Request initial health update
      this.socket.emit('requestHealthUpdate');
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connected = false;
      
      // Clean up player models when disconnected
      this.cleanupPlayerModels();
    });
    
    // Set up game event listeners
    this.setupGameEventListeners();
  }
  
  setupGameEventListeners() {
    // Handle current players on initial connect
    this.socket.on('currentPlayers', (players) => {
      // Create models for all existing players
      Object.values(players).forEach(playerData => {
        // Don't create a model for ourselves
        if (playerData.id !== this.socket.id) {
          this.createPlayerModel(playerData);
        }
      });
    });
    
    // Handle new player joining
    this.socket.on('newPlayer', (playerData) => {
      this.createPlayerModel(playerData);
    });
    
    // Handle player movement updates
    this.socket.on('playerMoved', (playerData) => {
      this.updatePlayerModel(playerData);
    });
    
    // Handle player disconnection
    this.socket.on('playerDisconnected', (playerId) => {
      this.removePlayerModel(playerId);
    });
    
    // Handle shots from other players
    this.socket.on('shotFired', (shotData) => {
      this.visualizeShot(shotData);
    });
    
    // Handle health updates
    this.socket.on('healthUpdate', (data) => {
      // Update our player's health if it's us
      if (data.id === this.socket.id) {
        if (this.player.health > data.health && data.health < 50) {
          console.log(`Health reduced to ${data.health}`);
        }
        
        this.player.health = data.health;
        this.player.armor = data.armor || 0;
        
        // Update UI
        this.player.updateHealthDisplay();
        this.player.updateArmorDisplay();
      }
    });
    
    // Handle frag updates
    this.socket.on('fragUpdate', (data) => {
      if (data.id === this.socket.id) {
        console.log(`You got a frag! Total: ${data.frags}`);
      }
    });
    
    // Handle player respawn
    this.socket.on('playerRespawned', (data) => {
      if (data.id === this.socket.id) {
        // Set our player's position to the respawn point
        this.player.respawnAtPosition(data.position);
      } else {
        // Update other player models
        if (this.playerModels[data.id]) {
          this.playerModels[data.id].position.copy(data.position);
          
          // Update the physics body if exists
          if (this.playerBodies[data.id]) {
            this.playerBodies[data.id].position.copy(data.position);
          }
        }
      }
    });
  }
  
  sendMovementUpdate() {
    if (!this.connected || !this.socket) return;
    
    // Get current player position and rotation
    const position = this.player.mesh.position.clone();
    const rotation = {
      x: this.camera.rotation.x,
      y: this.camera.rotation.y,
      z: this.camera.rotation.z
    };
    
    // Send the update to the server
    this.socket.emit('playerMovement', {
      position,
      rotation
    });
  }
  
  sendShot(origin, direction, endPoint) {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('shotFired', {
      origin,
      direction,
      endPoint
    });
  }
  
  sendHit(targetId, damage) {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('playerHit', {
      targetId,
      damage
    });
  }
  
  requestArmorUpdate(value) {
    if (!this.connected || !this.socket) return;
    
    this.socket.emit('armorPickup', value);
  }

  // Create and manage player models
  createPlayerModel(playerData) {
    // Create a temporary cylinder as a placeholder
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const model = new THREE.Mesh(geometry, material);
    
    // Set initial position
    model.position.copy(playerData.position);
    
    // Add to scene and store reference
    this.scene.add(model);
    this.playerModels[playerData.id] = model;
    
    // Create a physics body for hit detection
    const body = this.physicSystem.createPlayerBody(model, playerData.id);
    this.playerBodies[playerData.id] = body;
    
    // Load the actual player model (will replace the cylinder when loaded)
    this.loadPlayerModel(playerData.id);
  }
  
  loadPlayerModel(playerId) {
    this.modelLoader.load(this.playerModelPath, (gltf) => {
      const model = gltf.scene;
      
      // Scale and adjust the model
      model.scale.set(0.5, 0.5, 0.5);
      model.position.copy(this.playerModels[playerId].position);
      
      // Replace the placeholder with the real model
      this.scene.remove(this.playerModels[playerId]);
      this.scene.add(model);
      this.playerModels[playerId] = model;
      
      // Update the physics body to match the new model
      if (this.playerBodies[playerId]) {
        this.playerBodies[playerId].mesh = model;
      }
    });
  }
  
  updatePlayerModel(playerData) {
    const model = this.playerModels[playerData.id];
    
    if (model) {
      // Update position
      model.position.copy(playerData.position);
      
      // Update rotation if applicable
      if (playerData.rotation) {
        model.rotation.set(
          playerData.rotation.x,
          playerData.rotation.y,
          playerData.rotation.z
        );
      }
      
      // Update the physics body
      if (this.playerBodies[playerData.id]) {
        this.playerBodies[playerData.id].position.copy(playerData.position);
      }
    }
  }
  
  removePlayerModel(playerId) {
    // Remove the model from the scene
    if (this.playerModels[playerId]) {
      this.scene.remove(this.playerModels[playerId]);
      delete this.playerModels[playerId];
    }
    
    // Remove the physics body
    if (this.playerBodies[playerId]) {
      this.physicSystem.removeBody(this.playerBodies[playerId]);
      delete this.playerBodies[playerId];
    }
  }
  
  cleanupPlayerModels() {
    // Remove all player models
    Object.keys(this.playerModels).forEach(playerId => {
      this.removePlayerModel(playerId);
    });
  }
  
  visualizeShot(shotData) {
    // Create a temporary muzzle flash
    const flashGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(shotData.origin);
    this.scene.add(flash);
    
    // Remove the flash after a short time
    setTimeout(() => {
      this.scene.remove(flash);
    }, 100);
    
    // Create a bullet trail
    const startPoint = new THREE.Vector3().copy(shotData.origin);
    const endPoint = new THREE.Vector3().copy(shotData.endPoint);
    
    const direction = new THREE.Vector3()
      .subVectors(endPoint, startPoint)
      .normalize();
    
    const length = startPoint.distanceTo(endPoint);
    
    const trailGeometry = new THREE.BufferGeometry().setFromPoints([
      startPoint,
      endPoint
    ]);
    
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5
    });
    
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(trail);
    
    // Add to active trails
    this.bulletTrails.push({
      mesh: trail,
      createdAt: Date.now()
    });
  }
  
  update() {
    // Send movement updates at a reasonable rate
    this.sendMovementUpdate();
    
    // Cleanup old bullet trails
    const now = Date.now();
    const trailLifetime = 200; // milliseconds
    
    this.bulletTrails = this.bulletTrails.filter(trail => {
      if (now - trail.createdAt > trailLifetime) {
        this.scene.remove(trail.mesh);
        return false;
      }
      
      // Fade out the trail
      const age = now - trail.createdAt;
      const opacity = 1 - (age / trailLifetime);
      trail.mesh.material.opacity = opacity;
      
      return true;
    });
  }
} 