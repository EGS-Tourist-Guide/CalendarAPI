//http://localhost:3000/v1/login
//http://localhost:3000/
//http://localhost:3000/api-docs

//lsof -i :3000
//kill -9 12345
//exemplos teste endpoint create calendar
//curl -X POST http://localhost:3000/v1/1/
//  > -H "Content-Type: application/json" \
//  > -d '{"name":"My Personal Calendar","description":"This calendar is for tracking my personal events."}'

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { google } = require('googleapis');
const db = require('./database/database');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('api-docs.yml');
const cors = require('cors');
const config = require('./config/config.js'); 
const bcrypt = require('bcrypt');

const { findOrCreateUser } = require('./userManagement.js');

const corsOptions = {
  origin: '*', // Allow all origins
  optionsSuccessStatus: 200 
};


const {OAuth2} = google.auth;

const app = express();

app.use(express.static(__dirname + '/public'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(cors(corsOptions));
app.use(express.json());

// // At application start
db.connect().catch(err => {
  console.error('Failed to connect to the database:', err);
  process.exit(1); // Exit the app if the database connection fails
});



//identifies my application to Google's OAuth 2.0 server.
// allow my  application to authenticate users using Google's OAuth 2.0 server. 
const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

// retrieving user information from Google's OAuth 2.0 server using the provided access token
//OAuth 2.0 client is trying to access the user's info
//The user interacts with the OAuth 2.0 client by providing their credentials (such as username and password) 
//and granting permission to the client to access their resources.
async function fetchUserInfo(accessToken) {
  const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
      access_token: accessToken,
  });

  const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
  });

  try {
      const userInfoResponse = await oauth2.userinfo.get();
      return userInfoResponse.data; // This contains the user's profile information
  } catch (error) {
      console.error('Error fetching user information:', error);
      throw error; // Rethrow or handle as desired
  }
}


app.post('/generate-api-key', async (req, res) => {
  const { clientName, password } = req.body;

  if (!clientName || !password) {
    return res.status(400).send('Client name and password are required');
  }

  try {
    const pool = db.getPool();
    // Verificar se já existe um cliente com esse nome
    const [existingClient] = await pool.query('SELECT * FROM api_keys WHERE username = ?', [clientName]);
    if (existingClient.length > 0) {
      return res.status(409).send('Client already exists.');
    }

    // Gerar hash da senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Gerar a chave de API
    const apiKey = crypto.randomBytes(30).toString('hex');

    // Armazenar o nome do cliente (clientName), a senha hash, e a chave de API no banco de dados
    await pool.query('INSERT INTO api_keys (username, password, api_key) VALUES (?, ?, ?)', [clientName, hashedPassword, apiKey]);
    res.json({ message: 'Client registered successfully', apiKey: apiKey });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).send('Failed to register client');
  }
});



app.post('/retrieve-api-key', async (req, res) => {
  const { clientName, password } = req.body;

  if (!clientName || !password) {
    return res.status(400).send('Client name and password are required');
  }

  try {
    const pool = db.getPool();
    // Buscar o cliente pelo nome
    const [clients] = await pool.query('SELECT * FROM api_keys WHERE username = ?', [clientName]);
    if (clients.length === 0) {
      return res.status(404).send('Client not found');
    }

    const client = clients[0]; // Assumindo que usernames são únicos, pegamos o primeiro resultado

    // Verificar se a senha é correta
    const isValid = await bcrypt.compare(password, client.password); // Ajustado para usar a coluna correta
    if (!isValid) {
      return res.status(401).send('Invalid credentials');
    }

    // Se a senha for correta, retornar a chave de API
    res.json({ apiKey: client.api_key }); // Retorna a chave de API armazenada
  } catch (error) {
    console.error('Failed to retrieve API key:', error);
    res.status(500).send('Failed to retrieve API key');
  }
});



const apiKeyMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
      return res.status(401).json({ message: 'API Key is required' });
  }

  try {
      const pool = db.getPool();
      const [apiKeys] = await pool.query('SELECT api_key FROM api_keys WHERE api_key = ?', [apiKey]);
      
      if (apiKeys.length === 0) {
          return res.status(401).json({ message: 'Invalid API Key' });
      }

      next();
  } catch (error) {
      console.error('API Key validation failed:', error);
      res.status(500).send('Failed to validate API Key');
  }
};






// Redirect to Google's OAuth 2.0 server
app.get('/v1/login', (req, res) => {
  //console.log(`Current directory: ${process.cwd()}`);
  // enerates the URL to which the user will be redirected for authentication.
  //route that initiates the OAuth 2.0 authentication process 
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'],
    });
    res.redirect(url);
  } catch (error) {
    console.error('Error redirecting to OAuth server:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/oauth2callback', async (req, res) => {
  // This extracts the authorization code from the query parameters of the request (req.query.code). 
  //The code is then exchanged with Google's OAuth 2.0 server for access and refresh tokens.
  const {tokens} = await oauth2Client.getToken(req.query.code);
  
  //This sets the credentials (access token, refresh token, etc.) obtained from Google's OAuth 2.0 server to the OAuth2 client instance, 
  //allowing my application to make authorized requests on behalf of the user.
  oauth2Client.setCredentials(tokens);


  //After the user successfully authenticates with Google via OAuth, their OAuth tokens are obtained and stored.
  //Subsequently, the user's information is fetched and stored in the database.
  //Once this process is complete, a session can be created or updated to indicate that the user is authenticated, 
  //allowing them to access protected routes without needing to re-authenticate for subsequent requests during the session


  // Fetch user information using the tokens
  const userInfo = await fetchUserInfo(tokens.access_token); // retrieve the user's profile information using the access token obtained from Google's OAuth 2.0 server

  // Step 1: Save user info to `users` table or get existing user
  let user = await findOrCreateUser({
    googleId: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
});

  // // Step 2: Save OAuth tokens to `storeDB` table
  // await saveUserTokens({
  //     userId: user.id, // ID from `users` table
  //     accessToken: tokens.access_token,
  //     refreshToken: tokens.refresh_token,
  //     tokenExpiry: new Date(tokens.expiry_date).toISOString().slice(0, 19).replace('T', ' '),
      
  // });

    // Instead of sending the user data back as JSON, redirect to an intermediate page
    // The page will then handle redirecting back to the app with the necessary data
    // Redirecting to an intermediate page with user's ID as a parameter
    const deepLinkUrl = `/auth-success.html?userId=${user.id}`;
    res.redirect(deepLinkUrl);    

    //res.json({ message: 'Authentication successful!', token: user.id });
});


//Create a new calendar for the user
app.post('/v1/:userId/', apiKeyMiddleware, async (req, res) => {
  const userId = req.params.userId;

  try {
    const pool = db.getPool();

    const [existingCalendars] = await pool.query('SELECT * FROM calendars WHERE userId = ?', [userId]);

    if (existingCalendars.length > 0) {
      // Correctly handle the case where a calendar exists
      return res.status(400).json({
        message: "User already has a calendar.",
      });
    }

    // Proceed to insert a new calendar if none exists
    const [insertResult] = await pool.query('INSERT INTO calendars (userId) VALUES (?)', [userId]);

    // Use insertResult to get the new calendar ID
    const calendarId = insertResult.insertId;

    // Respond with the success message and the new calendar's ID
    res.status(201).json({
      message: "Calendar created successfully",
      calendarId: calendarId,
    });

  } catch (error) {
    console.error('Failed to create calendar:', error);
    res.status(500).send('Failed to create calendar');
  }
});




// Insere um novo evento no calendário do usuário
app.post('/v1/calendars/:calendarId/', apiKeyMiddleware, async (req, res) => {
  const calendarId = req.params.calendarId; // Use the calendarId from the route parameter
  const { summary, location, description, start, end, timeZone, obs } = req.body;

  try {
    const pool = db.getPool();

    // Directly insert the event using the provided calendarId, assuming validation or further checks are handled elsewhere
    const query = 'INSERT INTO events (calendarId, summary, location, description, startDateTime, endDateTime, timeZone, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [calendarId, summary, location, description, start, end, timeZone, obs || null]; // Use 'obs' from the request body or null if not provided

    const [insertResult] = await pool.query(query, values);
    const newEventId = insertResult.insertId;
    res.status(201).json({ message: "Event added successfully", newEventId: newEventId}); 
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});



//permite pesquisa por calendario (permite pesquisa de eventos nesse calendario por datas ou localização )
app.get('/v1/calendars/:calendarId/', apiKeyMiddleware, async (req, res) => {
  const { calendarId } = req.params;
  const { startDate, beforeDate, afterDate, location, eventId } = req.query;

  try {
    const pool = db.getPool();
    let query = 'SELECT summary, location, description, DATE_FORMAT(startDateTime, "%Y-%m-%d %H:%i:%s") AS startDateTime, DATE_FORMAT(endDateTime, "%Y-%m-%d %H:%i:%s") AS endDateTime FROM events WHERE calendarId = ?';
    const queryParams = [calendarId];

    if (eventId) {
      query += ' AND id = ?';
      queryParams.push(eventId);
    }

    if (startDate) {
      query += ' AND DATE(startDateTime) = ?';
      queryParams.push(startDate);
    }
    if (beforeDate) {
      query += ' AND DATE(endDateTime) < ?';
      queryParams.push(beforeDate);
    }
    if (afterDate) {
      query += ' AND DATE(startDateTime) > ?';
      queryParams.push(afterDate);
    }
    if (location) {
      query += ' AND location = ?';
      queryParams.push(location);
    }

    const [events] = await pool.query(query, queryParams);

    if (events.length === 0) {
      return res.status(404).send('No events found matching the criteria.');
    }

    res.json(events);
  } catch (error) {
    console.error('Failed to retrieve events:', error);
    res.status(500).send('Failed to retrieve events');
  }
});



//retirar event id e ir à coluna obs de eventos que tem o id do evento do Luis?
// Updates an existing event in the user's calendar
app.patch('/v1/calendars/:calendarId/', apiKeyMiddleware, async (req, res) => {
  const { calendarId } = req.params; // Assuming you are using calendarId
  const { eventId } = req.query; 
  const { summary, location, description, start, end, timeZone } = req.body;

  try {
    const pool = db.getPool();

    // Determine the condition based on whether eventId or obs is provided
    let condition = '';
    let parameters = [calendarId];
    if (eventId) {
      condition = 'id = ? AND calendarId = ?';
      parameters.unshift(eventId); // Add eventId to the beginning of the parameters array
    }
    else {
      return res.status(400).send('eventId must be provided.');
    }

    // Check if the event exists in the user's calendar
    const [eventResult] = await pool.query(`SELECT id FROM events WHERE ${condition}`, parameters);
    if (eventResult.length === 0) {
      return res.status(404).send(`Event not found in the user's calendar.`);
    }

    // Proceed to update the event
    const updateParameters = [summary, location, description, start, end, timeZone, ...parameters];
    await pool.query(
      `UPDATE events SET summary = ?, location = ?, description = ?, startDateTime = ?, endDateTime = ?, timeZone = ? WHERE ${condition}`,
      updateParameters
    );
    res.json({ message: "Event updated successfully", updatedEventId: eventResult[0].id });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});




// Deletes an existing event from the user's calendar
app.delete('/v1/calendars/:calendarId/', apiKeyMiddleware, async (req, res) => {
  const { calendarId } = req.params;
  const { eventId, obs } = req.query;

  if (!eventId) {
    return res.status(400).send('eventId');
  }

  try {
    const pool = db.getPool();

    let query, values;
    if (eventId) {
      query = 'DELETE FROM events WHERE id = ? AND calendarId = ?';
      values = [eventId, calendarId];
    } 

    const [result] = await pool.query(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).send('Event not found in the calendar.');
    }

    res.json({ message: "Event deleted successfully", eventId: eventId || obs });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});




const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening at http://localhost:${port}`);
});
