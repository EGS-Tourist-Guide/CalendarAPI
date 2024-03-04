//http://localhost:3000/v1/login
//http://localhost:3000/
//http://localhost:3000/api-docs


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
const corsOptions = {
  origin: '*', // Allow all origins
  optionsSuccessStatus: 200 
};


const {OAuth2} = google.auth;

const app = express();
const port = 3000;
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




// Redirect to Google's OAuth 2.0 server
app.get('/v1/login', (req, res) => {
  // This method generates the URL to which the user will be redirected for authentication.
  //this code sets up a route that initiates the OAuth 2.0 authentication process with 
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

  // Step 2: Save OAuth tokens to `storeDB` table
  await saveUserTokens({
      userId: user.id, // ID from `users` table
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(tokens.expiry_date).toISOString().slice(0, 19).replace('T', ' '),
      
  });

  // const userToken = jwt.sign(
  //   { userId: user.id, email: user.email },
  //   process.env.JWT_SECRET,
  //   { expiresIn: '24h' } // Token expires in 24 hours; adjust as needed
  // );


    res.json({ message: 'Authentication successful!', token: user.id });
});



//Create a new calendar for the user
app.post('/v1/:userId/', async (req, res) => {
  const userId = req.params.userId;
  const { name, description } = req.body; //description for the calendar

  try {
    // First, check if the user already has a calendar
    const existingCalendars = await db.query('SELECT * FROM calendars WHERE userId = ?', [userId]);

    if (existingCalendars.length > 0) {
      // User already has a calendar, so decide how you want to handle this
      // For example, you could return a message indicating that a calendar already exists
      return res.status(400).json({
        message: "User already has a calendar.",
      });
    }

    // If no existing calendar for the user, proceed to create a new one
    const result = await db.query('INSERT INTO calendars (userId, name, description) VALUES (?, ?, ?)', [userId, name, description]);

    // Retrieve the ID of the newly created calendar
    const calendarId = result.insertId;

    // Respond with success message and the created calendar's ID
    res.status(201).json({
      message: "Calendar created successfully",
      calendarId: calendarId,
    });
  } catch (error) {
    console.error('Failed to create calendar:', error);
    res.status(500).send('Failed to create calendar');
  }
});






app.listen(port, () => {
  console.log(`API listening at http://localhost:${port}`);
});
