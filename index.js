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

const { findOrCreateUser } = require('./userManagement.js');

const corsOptions = {
  origin: '*', // Allow all origins
  optionsSuccessStatus: 200 
};


const {OAuth2} = google.auth;

const app = express();

const port = config.server.port;

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
  // Use clientName to identify 
  const clientName = req.body.clientName;

  if (!clientName) {
      return res.status(400).send('Client name is required');
  }

  // Optionally, you can check if the client name already has an API key
  const pool = db.getPool();
  const [existing] = await pool.query('SELECT * FROM api_keys WHERE client_id = ?', [clientName]);
  if (existing.length > 0) {
      // Client already has an API key
      return res.status(409).send('An API key for this client already exists.');
  }

  // Generate the API key
  const apiKey = crypto.randomBytes(30).toString('hex');

  // Store the API key and client name in the database
  try {
      await pool.query('INSERT INTO api_keys (client_id, api_key) VALUES (?, ?)', [clientName, apiKey]);
      res.json({ message: "API Key generated successfully", apiKey: apiKey });
  } catch (error) {
      console.error('Failed to store API key:', error);
      res.status(500).send('Failed to generate API key');
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
  const { name } = req.body;

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
    const insertResult = await pool.query('INSERT INTO calendars (userId, name) VALUES (?, ?)', [userId, name]);

    // Use insertResult to get the new calendar ID
    //const calendarId = insertResult[0].insertId;

    // Respond with the success message 
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
app.post('/v1/:userId/calendars', apiKeyMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const { summary, location, description, start, end, timeZone, obs } = req.body;

  try {
    const pool = db.getPool();
    const [calendarsResult] = await pool.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendarsResult.length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendarsResult[0].id;

    const query = 'INSERT INTO events (calendarId, summary, location, description, startDateTime, endDateTime, timeZone, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [calendarId, summary, location, description, start, end, timeZone, obs || null]; // Use 'obs' from the request body or null if not provided

    const [insertResult] = await pool.query(query, values);
    const newEventId = insertResult.insertId;
    res.status(201).json({ message: "Event added successfully", calendarId: calendarId });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});


app.get('/v1/:userId/calendars/:eventId', apiKeyMiddleware, async (req, res) => {
  const { userId, eventId } = req.params;

  try {
    const pool = db.getPool();
    // Ensure the calendar for this user exists
    const [calendars] = await pool.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendars.length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendars[0].id;

    // Fetch the specific event with only the desired columns
    const [events] = await pool.query('SELECT summary, location, description, DATE_FORMAT(startDateTime, "%Y-%m-%d %H:%i:%s") AS startDateTime, DATE_FORMAT(endDateTime, "%Y-%m-%d %H:%i:%s") AS endDateTime FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    if (events.length === 0) {
      return res.status(404).send('Event not found for the given event ID.');
    }

    // If the event is found, return the specified fields
    res.json(events[0]); // Assuming you want to return the first (and should be the only) event found
  } catch (error) {
    console.error('Failed to retrieve event:', error);
    res.status(500).send('Failed to retrieve event');
  }
});



//permite pesquisa por calendario (permite pesquisa de eventos nesse calendario por datas ou localização )
app.get('/v1/calendars/:calendarId/', apiKeyMiddleware, async (req, res) => {
  const { calendarId } = req.params;
  const { startDate, beforeDate, afterDate, location } = req.query;

  try {
    const pool = db.getPool();
    let query = 'SELECT summary, location, description, DATE_FORMAT(startDateTime, "%Y-%m-%d %H:%i:%s") AS startDateTime, DATE_FORMAT(endDateTime, "%Y-%m-%d %H:%i:%s") AS endDateTime FROM events WHERE calendarId = ?';
    const queryParams = [calendarId];

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



// app.get('/v1/:userId/calendars/:calendarId', apiKeyMiddleware, async (req, res) => {
//   const { userId, eventId } = req.params;

//   try {
//     const pool = db.getPool();
//     // Ensure the calendar for this user exists
//     const [calendars] = await pool.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
//     if (calendars.length === 0) {
//       return res.status(404).send('Calendar not found for the given user ID.');
//     }
//     const calendarId = calendars[0].id;

//     // Fetch the specific event with only the desired columns
//     const [events] = await pool.query('SELECT summary, location, description, DATE_FORMAT(startDateTime, "%Y-%m-%d %H:%i:%s") AS startDateTime, DATE_FORMAT(endDateTime, "%Y-%m-%d %H:%i:%s") AS endDateTime FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
//     if (events.length === 0) {
//       return res.status(404).send('Event not found for the given event ID.');
//     }

//     // If the event is found, return the specified fields
//     res.json(events[0]); // Assuming you want to return the first (and should be the only) event found
//   } catch (error) {
//     console.error('Failed to retrieve event:', error);
//     res.status(500).send('Failed to retrieve event');
//   }
// });



//retirar event id e ir à coluna obs de eventos que tem o id do evento do Luis?
// Updates an existing event in the user's calendar
app.patch('/v1/:userId/calendars/:eventId', apiKeyMiddleware, async (req, res) => {
  const { userId, eventId } = req.params;
  const { summary, location, description, start, end, timeZone } = req.body;

  try {
    const pool = db.getPool();
    // Check if the calendar for the given user ID exists
    const calendarsResult = await pool.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendarsResult[0].length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendarsResult[0][0].id;

    // Check if the event exists in the user's calendar
    const eventResult = await pool.query('SELECT id FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    if (eventResult[0].length === 0) {
      return res.status(404).send(`Event with ID ${eventId} not found in the user's calendar.`);
    }

    // Proceed to update the event
    await pool.query(
      'UPDATE events SET summary = ?, location = ?, description = ?, startDateTime = ?, endDateTime = ?, timeZone = ? WHERE id = ? AND calendarId = ?',
      [summary, location, description, start, end, timeZone, eventId, calendarId]
    );
    res.json({ message: "Event updated successfully", eventId: eventId });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});





// Deletes an existing event from the user's calendar
app.delete('/v1/:userId/calendars/:eventId', apiKeyMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const eventId = req.params.eventId;

  try {
    const pool = db.getPool();
    // First, check if the calendar for the given user ID exists
    const calendarResult = await pool.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendarResult[0].length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendarResult[0][0].id;

    // Check if the event exists in the user's calendar
    const eventResult = await pool.query('SELECT id FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    if (eventResult[0].length === 0) {
      return res.status(404).send('Event not found in the user\'s calendar.');
    }

    // Proceed to delete the event
    await pool.query('DELETE FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    res.json({ message: "Event deleted successfully", eventId: eventId });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});





app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`);
});
