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
            // Log rotation to prevent disk from filling up
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: 'logs/error.log',
            out_file: 'logs/out.log',
            merge_logs: true,
            max_size: '10M',
            retain: 3,
            compress: true,
            env: {
                NODE_ENV: process.env.NODE_ENV || 'production',
                PORT: process.env.PORT || 3001,
            },
        },
    ],
};
