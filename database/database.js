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
  pool = mysql.createPool({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database
  });
  console.log('MySQL pool created.');


  try {
    const connection = await pool.getConnection();
    if (connection) {
      console.log('MySQL connection successful.');
      connection.release(); // It's important to release connections when done
    }
  } catch (error) {
    console.error('Error connecting to MySQL:', error);
    throw error; 
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
