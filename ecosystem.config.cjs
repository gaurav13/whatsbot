module.exports = {
  apps: [
    {
      name: 'wbot',
      script: 'index.js',
      cwd: '/home/whatsappmessage/whatsapp-bot',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
        COOKIE_SECURE: 'true',
      },
    },
  ],
};
