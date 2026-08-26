module.exports = {
  apps: [
    {
      name: "unitw",
      script: "npx",
      args: "http-server ./dist/unitwise-ng/browser -p 4200 --proxy http://localhost:4200? --spa",
      instances: "1",
      autorestart: true,
      watch: false,
      env: {
        // NODE_ENV: "production"
      }
    }
  ]
};
