import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    // Create physics world
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.8, 0) // Earth gravity
    });
    
    // Set up world parameters
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.1;
    this.world.defaultContactMaterial.restitution = 0.3;
    
    // Collection to track bodies
    this.bodies = [];
    
    // Set up ground
    this.groundBody = null;
    
    console.log('Physics world initialized');
  }
  
  createGround() {
    // Create a static ground plane
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0, // 0 = static
      type: CANNON.Body.STATIC,
      shape: groundShape,
      material: new CANNON.Material({
        friction: 0.3,
        restitution: 0.3
      })
    });
    
    // Rotate to be horizontal (facing up)
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    
    // Add to world
    this.world.addBody(this.groundBody);
    this.bodies.push({
      body: this.groundBody,
      mesh: null,
      type: 'ground'
    });
    
    return this.groundBody;
  }
  
  createPlayerBody(position, radius, height) {
    // Create a capsule shape for the player
    const playerShape = new CANNON.Cylinder(
      radius, // Top radius
      radius, // Bottom radius
      height, // Height
      8 // Number of segments
    );
    
    const playerBody = new CANNON.Body({
      mass: 50, // Reduced from 70 to 50 for better acceleration
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: playerShape,
      material: new CANNON.Material({
        friction: 0.05, // Reduced friction for smoother movement
        restitution: 0.0
      }),
      linearDamping: 0.6, // Reduced from 0.9 for less air resistance (faster movement)
      angularDamping: 0.9 // Prevent excessive rotation
    });
    
    // Add to world
    this.world.addBody(playerBody);
    this.bodies.push({
      body: playerBody,
      mesh: null,
      type: 'player'
    });
    
    return playerBody;
  }
  
  update(deltaTime) {
    // Step the physics simulation
    // Convert delta time from seconds to fixed timestep
    const fixedTimeStep = 1.0 / 60.0; // 60 Hz
    const maxSubSteps = 3;
    
    this.world.step(fixedTimeStep, deltaTime, maxSubSteps);
  }
  
  // Link a physics body with its corresponding Three.js mesh
  linkBodyToMesh(body, mesh, type = 'object') {
    for (const item of this.bodies) {
      if (item.body === body) {
        item.mesh = mesh;
        item.type = type;
        return;
      }
    }
    
    // If not found, add it
    this.bodies.push({
      body: body,
      mesh: mesh,
      type: type
    });
  }
  
  // Update all linked mesh positions based on physics
  updateMeshes() {
    for (const item of this.bodies) {
      if (item.mesh && item.body) {
        // Copy position
        item.mesh.position.x = item.body.position.x;
        item.mesh.position.y = item.body.position.y;
        item.mesh.position.z = item.body.position.z;
        
        // Copy rotation (convert Cannon quaternion to Three.js quaternion)
        item.mesh.quaternion.set(
          item.body.quaternion.x,
          item.body.quaternion.y,
          item.body.quaternion.z,
          item.body.quaternion.w
        );
      }
    }
  }
  
  // Apply a force to a body
  applyForce(body, force, worldPoint) {
    body.applyForce(force, worldPoint || body.position);
  }
  
  // Apply an impulse to a body
  applyImpulse(body, impulse, worldPoint) {
    body.applyImpulse(impulse, worldPoint || body.position);
  }
  
  // Set velocity directly
  setLinearVelocity(body, velocity) {
    body.velocity.set(velocity.x, velocity.y, velocity.z);
  }
} 