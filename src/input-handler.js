export class InputHandler {
  constructor() {
    // Key state tracking
    this.keys = {
      forward: false,  // Z on AZERTY, W on QWERTY
      backward: false, // S
      left: false,     // Q on AZERTY, A on QWERTY
      right: false,    // D
      jump: false,     // Space
      crouch: false,   // Ctrl
      sprint: false    // Shift
    };
    
    // Mouse state tracking
    this.mouse = {
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      leftButton: false,
      rightButton: false
    };
    
    // Mouse sensitivity
    this.mouseSensitivity = 0.002;
    
    // Setup event listeners
    this.setupKeyboardListeners();
    this.setupMouseListeners();
  }
  
  setupKeyboardListeners() {
    // Key down event
    document.addEventListener('keydown', (event) => {
      // Handle AZERTY and QWERTY layouts
      switch (event.code) {
        // Forward (W or Z)
        case 'KeyW':
        case 'KeyZ':
          this.keys.forward = true;
          break;
        // Backward (S)
        case 'KeyS':
          this.keys.backward = true;
          break;
        // Left (A or Q)
        case 'KeyA':
        case 'KeyQ':
          this.keys.left = true;
          break;
        // Right (D)
        case 'KeyD':
          this.keys.right = true;
          break;
        case 'Space':
          this.keys.jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          this.keys.crouch = true;
          break;
      }
      
      // Debug: Log key presses
      console.log(`Key pressed: ${event.code}, key state:`, {...this.keys});
    });
    
    // Key up event
    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        // Forward (W or Z)
        case 'KeyW':
        case 'KeyZ':
          this.keys.forward = false;
          break;
        // Backward (S)
        case 'KeyS':
          this.keys.backward = false;
          break;
        // Left (A or Q)
        case 'KeyA':
        case 'KeyQ':
          this.keys.left = false;
          break;
        // Right (D)
        case 'KeyD':
          this.keys.right = false;
          break;
        case 'Space':
          this.keys.jump = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          this.keys.crouch = false;
          break;
      }
    });
  }
  
  setupMouseListeners() {
    // Pointer lock API to capture mouse
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.addEventListener('click', () => {
        gameContainer.requestPointerLock();
      });
    }
    
    // Mouse movement
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement) {
        // Store mouse movement delta
        this.mouse.dx = event.movementX || 0;
        this.mouse.dy = event.movementY || 0;
        
        // Debug mouse movement
        if (Math.abs(this.mouse.dx) > 0.5) {
          console.log(`Mouse X movement: ${this.mouse.dx}`);
        }
        
        // Accumulate total position (might be useful for some calculations)
        this.mouse.x += this.mouse.dx;
        this.mouse.y += this.mouse.dy;
      }
    });
    
    // Mouse buttons
    document.addEventListener('mousedown', (event) => {
      if (document.pointerLockElement) {
        if (event.button === 0) {
          this.mouse.leftButton = true;
        } else if (event.button === 2) {
          this.mouse.rightButton = true;
        }
      }
    });
    
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.mouse.leftButton = false;
      } else if (event.button === 2) {
        this.mouse.rightButton = false;
      }
    });
    
    // Prevent context menu on right click
    document.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
  }
  
  // Reset mouse delta at the end of each frame
  resetMouseDelta() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }
} 