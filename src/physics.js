import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    // Create physics world
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.8, 0), // Earth gravity
      quatNormalizeSkip: 0, // Don't skip normalization
      quatNormalizeFast: false, // Don't use fast normalization
      allowSleep: true,
      solver: new CANNON.GSSolver(), // Gauss-Seidel solver
    });
    
    // Set up world parameters with improved collision detection
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 20; // Increased from default (10) for better collision resolution
    this.world.solver.tolerance = 0.001; // Decreased tolerance for more accurate solving
    this.world.defaultContactMaterial.contactEquationStiffness = 1e8; // Increased stiffness
    this.world.defaultContactMaterial.contactEquationRelaxation = 3; // Adjusted relaxation
    this.world.defaultContactMaterial.friction = 0.1;
    this.world.defaultContactMaterial.restitution = 0.3;
    
    // Define materials for different objects
    this.groundMaterial = new CANNON.Material('groundMaterial');
    this.playerMaterial = new CANNON.Material('playerMaterial');
    
    // Create contact material between player and ground
    const playerGroundContact = new CANNON.ContactMaterial(
      this.playerMaterial, 
      this.groundMaterial, 
      {
        friction: 0.4,
        restitution: 0.1
      }
    );
    
    // Add the contact material to the world
    this.world.addContactMaterial(playerGroundContact);
    
    // Collection to track bodies
    this.bodies = [];
    this.mountains = [];
    
    // Set up ground
    this.groundBody = null;
    
    console.log('Physics world initialized with materials and contacts');
  }
  
  createGround() {
    // Create a static ground plane
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0, // 0 = static
      type: CANNON.Body.STATIC,
      shape: groundShape,
      material: this.groundMaterial,
      collisionFilterGroup: 1, // Ground group
      collisionFilterMask: -1  // Collide with everything
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
    // Create a cylinder shape for the player with a wider base for stability
    const playerShape = new CANNON.Cylinder(
      radius * 1.2, // Bottom radius (wider)
      radius * 0.8, // Top radius (narrower)
      height, // Height
      12 // More segments for better collision
    );
    
    // Create the physics body
    const playerBody = new CANNON.Body({
      mass: 50, // Reduced from 70 to 50 for better acceleration
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: playerShape,
      material: this.playerMaterial,
      collisionFilterGroup: 2, // Player group
      collisionFilterMask: -1, // Collide with everything
      linearDamping: 0.6, // Reduced from 0.9 for less air resistance
      angularDamping: 0.9, // Prevent excessive rotation
      fixedRotation: true, // Prevent body from rotating
      allowSleep: false, // Never sleep
    });
    
    // Rotate the cylinder to stand upright
    const quatX = new CANNON.Quaternion();
    quatX.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    playerBody.quaternion.copy(quatX);
    
    // Enable Continuous Collision Detection (CCD)
    playerBody.ccdSpeedThreshold = 1; // The relative motion speed threshold for CCD to activate
    playerBody.ccdIterations = 10; // More iterations = better quality but more expensive
    
    // Set player properties on the body for easier identification in collisions
    playerBody.isPlayer = true;
    
    // Add to world
    this.world.addBody(playerBody);
    this.bodies.push({
      body: playerBody,
      mesh: null,
      type: 'player'
    });
    
    // Setup for jump detection - we'll use this to check collisions against mountains
    playerBody.addEventListener('collide', (e) => {
      // Check if collision is with ground or a mountain
      if ((e.body === this.groundBody) || this.mountains.includes(e.body)) {
        // Check if the contact normal is pointing upward (we're standing on it)
        if (e.contact && e.contact.ni) {
          // Dot product of normal and up vector
          const normalY = e.contact.ni.y;
          
          // If normal is pointing somewhat up (allowing for slopes)
          if (normalY > 0.5) {
            // Set property on the body that can be checked by the player class
            playerBody.canJump = true;
          }
        } else {
          // Fallback if normal information isn't available
          playerBody.canJump = true;
        }
      }
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