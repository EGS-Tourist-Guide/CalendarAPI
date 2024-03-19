const config = {
    database: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
    },
    server: {
        port: parseInt(process.env.SERVICE_API_PORT, 10) || 3000,
    }
};

module.exports = config;
