module.exports = {
    apps: [
        {
            name: process.env.PM2_APP_NAME || 'autograde-backend',
            script: 'index.js',
            cwd: __dirname,
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: process.env.NODE_ENV || 'production',
                PORT: process.env.PORT || 3001,
            },
        },
    ],
};
