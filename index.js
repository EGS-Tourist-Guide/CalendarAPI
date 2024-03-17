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
const jwt = require('jsonwebtoken');
const express = require('express');
const {google} = require('googleapis');
const db = require('./database'); 
const swaggerUi = require('swagger-ui-express'); // Add this line to import swaggerUi
//const swaggerSpec = require('./swagger'); // Import swaggerSpec from swagger.js
const YAML = require('yamljs');
const swaggerDocument = YAML.load('api-docs.yml');
const {findOrCreateUser,saveUserTokens} = require('./userManagement'); 
const cors = require('cors');
const { calendar } = require('googleapis/build/src/apis/calendar');
const corsOptions = {
  origin: '*', // Allow all origins
  optionsSuccessStatus: 200 
};


const {OAuth2} = google.auth;

const app = express();
const port = 3000;
app.use(express.static(__dirname + '/public'));


app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));app.use(cors(corsOptions));
app.use(express.json());






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


const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key']; // API key is sent in the header
    const validApiKey = process.env.VALID_API_KEY; // API key stored in an environment variable

    if (!apiKey || apiKey !== validApiKey) {
        return res.status(401).json({ message: 'Invalid API Key' });
    }

    next(); 
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
    // Corrected query to check if the user already has a calendar
    const [existingCalendars] = await db.query('SELECT * FROM calendars WHERE userId = ?', [userId]);

    if (existingCalendars.length > 0) {
      // Correctly handle the case where a calendar exists
      return res.status(400).json({
        message: "User already has a calendar.",
      });
    }

    // Proceed to insert a new calendar if none exists
    const insertResult = await db.query('INSERT INTO calendars (userId, name) VALUES (?, ?)', [userId, name]);

    // Use insertResult to get the new calendar ID
    const calendarId = insertResult[0].insertId;

    // Respond with the success message and the new calendar's ID
    res.status(201).json({
      message: "Calendar created successfully",
      //calendarId: calendarId,
    });

  } catch (error) {
    console.error('Failed to create calendar:', error);
    res.status(500).send('Failed to create calendar');
  }
});





// Insere um novo evento no calendário do usuário
app.post('/v1/:userId/calendars', apiKeyMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const { summary, location, description, start, end, timeZone } = req.body;

  try {
    const calendarsResult = await db.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendarsResult[0].length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendarsResult[0][0].id;
    
    // Insere um novo evento, o MySQL irá autoincrementar o id
    const insertResult = await db.query(
      'INSERT INTO events (calendarId, summary, location, description, startDateTime, endDateTime, timeZone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [calendarId, summary, location, description, start, end, timeZone] 
    );
    const newEventId = insertResult[0].insertId;
    res.status(201).json({ message: "Event added successfully", eventId: newEventId });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});



// Updates an existing event in the user's calendar
app.patch('/v1/:userId/calendars/:eventId', apiKeyMiddleware, async (req, res) => {
  const { userId, eventId } = req.params;
  const { summary, location, description, start, end, timeZone } = req.body;

  try {
    // Check if the calendar for the given user ID exists
    const calendarsResult = await db.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendarsResult[0].length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendarsResult[0][0].id;

    // Check if the event exists in the user's calendar
    const eventResult = await db.query('SELECT id FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    if (eventResult[0].length === 0) {
      return res.status(404).send(`Event with ID ${eventId} not found in the user's calendar.`);
    }

    // Proceed to update the event
    await db.query(
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
    // First, check if the calendar for the given user ID exists
    const calendarResult = await db.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendarResult[0].length === 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendarResult[0][0].id;

    // Check if the event exists in the user's calendar
    const eventResult = await db.query('SELECT id FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    if (eventResult[0].length === 0) {
      return res.status(404).send('Event not found in the user\'s calendar.');
    }

    // Proceed to delete the event
    await db.query('DELETE FROM events WHERE id = ? AND calendarId = ?', [eventId, calendarId]);
    res.json({ message: "Event deleted successfully", eventId: eventId });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Failed to process request');
  }
});


app.get('/v1/:userId/calendars', apiKeyMiddleware, async (req, res) => {
  const userId = req.params.userId;

  try {
    // First, ensure the user has a calendar
    const calendars = await db.query('SELECT id FROM calendars WHERE userId = ?', [userId]);
    if (calendars[0].length=== 0) {
      return res.status(404).send('Calendar not found for the given user ID.');
    }
    const calendarId = calendars[0][0].id;

    // Query to select events from the database
    const events = await db.query('SELECT * FROM events WHERE calendarId = ?', [calendarId]);

    // If no events found, you can decide to return an empty array or a message
    if (events.length === 0) {
      return res.status(404).send('No events found for the given calendar.');
    }

    // Respond with the events
    res.json(events[0]);
  } catch (error) {
    console.error('Failed to retrieve events:', error);
    res.status(500).send('Failed to retrieve events');
  }
});


app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`);
});
