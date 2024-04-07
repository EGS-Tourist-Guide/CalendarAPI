// const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: 'password', 
//   database: 'storeDB'
// });


// module.exports = pool;


require('dotenv').config(); 
const mysql = require('mysql2/promise');
const config = require('../config/config');

let pool;

const connect = async () => {
  let retries = 3; // Number of retries
  while (retries > 0) {
    try {
      pool = mysql.createPool({
        host: config.database.host || 'localhost',
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        port: '3306'
      });
      console.log('MySQL pool created.');
      
      const connection = await pool.getConnection();
      if (connection) {
        console.log('MySQL connection successful.');
        connection.release();
        return; // Return if connection successful
      }
    } catch (error) {
      console.error('Error connecting to MySQL:', error);
      retries--;
      if (retries === 0) {
        throw new Error('Failed to connect to MySQL after multiple retries.');
      }
      console.log(`Retrying connection... ${retries} retries left.`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before retrying
    }
  }
};


const disconnect = async () => {
  if (pool) {
    await pool.end();
    console.log('MySQL pool has been closed.');
  }
};

// Getter for the pool, ensures you're always using the initialized pool
const getPool = () => {
  if (!pool) {
    throw new Error("Database pool has not been initialized. Call 'connect()' first.");
  }
  return pool;
};

module.exports = { connect, disconnect, getPool };
