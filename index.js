require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { PORT } = require('./config.json');

const APP = express();
APP.use(express.json());

const config = require('./config.json');

//Server test call
APP.get("/", async (req, res) => {
     await res.status(200).send({ message: "Pong!"});
});

//Check if a token is valid as developer.
APP.get("/api/dev/check", authenticateDeveloperToken, async (req, res) => {
     res.status(200).send("This token is verified as Developer.");
});

//Joke
APP.get("/api/dingus", async(req, res) => {
     await res.status(200).send("You have ascended");
     //hmm
});

//Call to get the public account data of a user.
APP.get("/api/accounts/:id/public", async (req, res) => {
     const { id } = req.params;
     fs.exists(`./data/accounts/${id}.json`, async (e) => {
          if (e) {
               const json = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`))
               const { public, private, auth} = json; 
               res.status(200).send(public);
          } else {
               await res.status(404).send({ message: `Account with ID of ${id} not found. Please check your request for typos.` });
          }
     })
});

//(Authorized) Call to get the private account data of a user.
APP.get("/api/accounts/:id/private", authenticateToken, async(req, res) => {
     const { id } = req.params;
     if(req.user.id !== id) return res.status(403).send("Token user does not have access to the specified user's private data!");

     fs.exists(`./data/accounts/${id}.json`, async (e) => {
          if (e) {
               const json = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`))
               const { public, private, auth} = json; 
               res.status(200).send(private);
          } else {
               await res.status(404).send({ message: `Account with ID of ${id} not found. Please check your request for typos.` });
          }
     })
})

//Call to get a token from user account credentials.
APP.post("/api/auth/login", (req, res) => {
     //so first things first we need to check the username and password
     //and if those are correct we generate a token

     const { username, password } = req.body;
     const userID = getUserID(username);
     if(userID == null) return res.status(404).send("User not found!");

     //now we read the correct user file for the authorization data

     const file = fs.readFileSync(`./data/accounts/${userID}.json`);
     const { public, private, auth } = JSON.parse(file);


     const { HASHED_PASSWORD, salt } = auth;

     const externalHashed = bcrypt.hashSync(password, salt);

     if(externalHashed !== HASHED_PASSWORD) return res.status(403).send("Incorrect password!");
     
     //User is authenticated, generate and send token.

     const developer = private.availableTags.includes("Developer");

     const user = {username: username, id: userID, developer: developer};

     const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });
     return res.status(200).json({ userID: userID, username: username, accessToken: accessToken});
});

//Call to create an account from a set of credentials. ! No duplicate protection at present. !
APP.post("/api/auth/create", async (req, res) => {
     var { username, nickname, password } = req.body;
     const id = getAccountCount() + 1;

     if(username == null || password == null) return res.status(400).send("Username or password empty or null.")
     if(nickname == null) nickname = username;

     const template = fs.readFileSync("./data/accounts/ACCT_TEMPLATE.json");

     var {public, private, auth} = JSON.parse(template);

     public.nickname = nickname;
     public.username = username;

     private.inventory.clothes.shirts = [0, 1];
     private.inventory.clothes.hairStyles = [0, 1];
     private.inventory.clothes.hairColors = [0, 1, 2];

     auth.username = username;

     const salt = bcrypt.genSaltSync(10);

     const HASHED_PASSWORD = bcrypt.hashSync(password, salt);

     auth.HASHED_PASSWORD = HASHED_PASSWORD;
     auth.salt = salt;

     const user = {username: username, id: id};

     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "24h"});

     const final = {public: public, private: private, auth: auth};

     try
     {
          fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(final, null, "    "));
          res.sendStatus(200);
     }
     catch
     {
          res.sendStatus(500);
     }
});

//Call to get the first account with the specified username in the database, and return its ID.
APP.get("/api/accounts/:username/ID", async(req, res) => {
     const { username } = req.params;
     const id = getUserID(username)

     if(id == null) return res.status(404).send("User not present in database.");

     return res.status(200).send({ id: id, message: `User ${username} found in database with ID ${id}`});
});

APP.get("/api/global/:key", async (req, res) => {
     const { key } = req.params;

     const global = await JSON.parse(fs.readFileSync("./data/global/global.json"));

     if(!(key in global)) return res.status(404).send("ID not in global title data.");

     res.status(200).send(global[key]);
});

//#region Developer-only API calls

//Modify a user's currency balance.
APP.post("/api/accounts/:id/currency/modify", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id}.json`);
     if(!exists) return res.status(404).send("User not found!");

     var { public, private, auth } = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));

     if(!(private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

     private.currency += amount;

     const data = { public: public, private: private, auth: auth };

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(data, null, "     "));

     auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${[private.currency]}.`);

     res.status(200).send("Action successful.");
});

//Set a user's currency balance.
APP.post("/api/accounts/:id/currency/set", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id}.json`);
     if(!exists) return res.status(404).send("User not found!");

     var { public, private, auth } = JSON.parse(fs.readFileSync(`./data/accounts/${id}.json`));

     if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

     private.currency = amount;

     const data = { public: public, private: private, auth: auth };

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(data, null, "     "));

     auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`);

     res.status(200).send("Action successful.");
});

//Ban a user's account
APP.post("/api/accounts/:id/ban", authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     const { reason, duration } = req.body;
     const moderator = req.user;

     const data = fs.readFileSync(`./data/accounts/${id}.json`);

     var {public, private, auth} = await JSON.parse(data);

     const endTS = Date.now() + (duration * 1000 * 60) //convert duration from hours to a unix timestamp
     
     const ban = {
          reason: reason,
          endTS: endTS,
          moderator: moderator.id
     };

     await auth.bans.push(ban);

     const final = {public: public, private: private, auth: auth};
     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(final, null, "    "));

     auditLog(`!DEVELOPER ACTION! User ${id} was banned for ${duration} hours by moderator ${moderator.username}.`)
     res.status(200).send();
});

APP.post("/api/global/:key", authenticateDeveloperToken, async (req, res) => {
     const { key } = req.params;
     const { value } = req.body;

     var global = await JSON.parse(fs.readFileSync("./data/global/global.json"));

     global[key] = value;

     fs.writeFileSync("./data/global/global.json", JSON.stringify(global, null, "    "));
     auditLog(`!DEVELOPER ACTION! Developer ${req.user.username} with ID ${req.user.id} updated GLOBAL title data with key ${key}.`);
     res.status(200).send();
});

//#endregion


//#region Functions
function getUserID(username) {
     const files = fs.readdirSync('./data/accounts/');

     var id = null;
     for (let index = 0; index < files.length; index++) {
          const element = files[index];
          
          const { public, private, auth} = JSON.parse(fs.readFileSync(`./data/accounts/${element}`))

          const username2 = auth.username;
          if(username2 == username) {
               id = element.split(".")[0];
               break; 
          }
     }
     return id;
}

function getAccountCount() {
     const files = fs.readdirSync('./data/accounts/');
     return files.length - 1;
}

function authenticateToken(req, res, next) {
     const authHeader = req.headers['authorization'];
     const token = authHeader && authHeader.split(" ")[1];

     if(token == null) return res.sendStatus(401);

     //then we need to authenticate that token in this middleware and return a user
     try
     {
          const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
          req.user = tokenData;

          const data = JSON.parse(tokenData)
          const {public, private, auth} = JSON.parse(fs.readFileSync(`./data/accounts/${data.id}.json`));

          for (let index = 0; index < auth.bans.length; index++) {
               const element = auth.bans[index];
               
               if(element.endTS > Date.now) return res.status(403).send({
                    message: "USER IS BANNED", 
                    endTimeStamp: endTS, 
                    reason: element.reason
               });
          }
          next();
     }
     catch
     {
          return res.status(403).send("Invalid or expired authorization token.")
     }
}

function authenticateDeveloperToken(req, res, next) {
     const authHeader = req.headers['authorization'];
     const token = authHeader && authHeader.split(" ")[1];

     if(token == null) return res.sendStatus(401);

     //then we need to authenticate that token in this middleware and return a user
     try
     {
          const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
          req.user = tokenData;

          const data = JSON.parse(tokenData);
          const {public, private, auth} = JSON.parse(fs.readFileSync(`./data/accounts/${data.id}.json`));

          for (let index = 0; index < auth.bans.length; index++) {
               const element = auth.bans[index];
               
               if(element.endTS > Date.now) return res.status(403).send({
                    message: "USER IS BANNED", 
                    endTimeStamp: endTS, 
                    reason: element.reason
               });
               console.log(element);
          }

          if(!tokenData.developer) return res.status(403).send("Provided token is not owned by a developer!");

          next();
     }
     catch
     {
          return res.status(403).send("Invalid or expired authorization token.")
     }
}

function auditLog(message) {
     const file = fs.readFileSync("./data/audit.json");
     var data = JSON.parse(file);

     const ts = Date.now();

     const log = `${ts} - ${message}`;

     data.push(log);
     const final = JSON.stringify(data, null, "   ");
     fs.writeFileSync("./data/audit.json", final);
}
//#endregion

APP.listen(PORT, '0.0.0.0');
auditLog("Server Init");