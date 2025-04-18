const { spawn } = require('child_process');
const path = require('path');

// Start the Express server
console.log('Starting Express server...');
const expressServer = spawn('node', ['server/index.js'], {
  stdio: 'inherit',
  shell: true
});

// Wait a moment for Express to start
setTimeout(() => {
  // Start the Vite dev server
  console.log('Starting Vite dev server...');
  const viteServer = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true
  });
  
  // Handle Vite dev server exit
  viteServer.on('close', (code) => {
    console.log(`Vite dev server exited with code ${code}`);
    // Kill Express server when Vite exits
    expressServer.kill();
  });
}, 2000);

// Handle Express server exit
expressServer.on('close', (code) => {
  console.log(`Express server exited with code ${code}`);
  process.exit(code);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down servers...');
  expressServer.kill();
  process.exit(0);
}); 