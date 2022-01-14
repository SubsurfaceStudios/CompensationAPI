require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const sanitize = require('sanitize-filename');

const helpers = require('./helpers');
const middleware = require('./middleware');

const app = express();
app.set('trust proxy', 1);

var limiter = RateLimit({
     windowMs: 1*60*1000,
     max: 100,
     standardHeaders: true,
     legacyHeaders: false
});

app.use(limiter);

app.use(express.json({
     limit: '50mb'
}));
app.use(fileUpload({
     createParentPath: true,
     limit: '50mb'
}));

const config = require('./config.json');

const notificationTemplates = {
     invite: "invite",
     friendRequest: "friendRequest",
     messageRecieved: "messageRecieved"
}

//#region routers
app.use("/api/accounts", require("./routers/accounts"));
//#endregion

//#region endpoints

//Server test call
app.get("/", async (req, res) => {
     return res.status(200).send("Pong!");
});

//Check if a token is valid as developer.
app.get("/dev/check", middleware.authenticateDeveloperToken, async (req, res) => {
     return res.status(200).send("This token is verified as Developer.");
});

//Joke
app.get("/api/dingus", async(req, res) => {
     return res.status(200).send("You have ascended");
     //hmm
});





//Call to get a token from user account credentials.
app.post("/api/auth/login", (req, res) => {
     //so first things first we need to check the username and password
     //and if those are correct we generate a token

     const { username, password } = req.body;
     const userID = helpers.getUserID(username);
     if(userID == null) return res.status(404).send("User not found!");

     //now we read the correct user file for the authorization data
     const data = helpers.PullPlayerData(userID);


     const { HASHED_PASSWORD, salt } = data.auth;

     const externalHashed = bcrypt.hashSync(password, salt);

     if(externalHashed !== HASHED_PASSWORD) return res.status(403).send("Incorrect password!");

     for (let index = 0; index < data.auth.bans.length; index++) {
          const element = data.auth.bans[index];
          
          if(element.endTS > Date.now()) return res.status(403).send({
               message: "USER IS BANNED", 
               endTimeStamp: element.endTS, 
               reason: element.reason
          });
     }
     
     //User is authenticated, generate and send token.

     const developer = data.private.availableTags.includes("Developer");

     const user = {username: username, id: userID, developer: developer};

     const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });
     return res.status(200).json({ userID: userID, username: username, accessToken: accessToken});
});

//Call to create an account from a set of credentials.
app.post("/api/auth/create", async (req, res) => {
     var { username, nickname, password } = req.body;
     const id = getAccountCount();

     if(username == null || password == null) return res.status(400).send("Username or password empty or null.")
     if(nickname == null) nickname = username;

     const check = helpers.getUserID(username);

     if(check != null) return res.status(400).send("Account already exists with that username. Please choose a different username.");

     const data = helpers.PullPlayerData("ACCT_TEMPLATE");

     data.public.nickname = nickname;
     data.public.username = username;

     data.private.inventory.clothes.shirts = [0, 1];
     data.private.inventory.clothes.hairStyles = [0, 1];
     data.private.inventory.clothes.hairColors = [0, 1, 2];

     data.auth.username = username;

     const salt = bcrypt.genSaltSync(10);

     const HASHED_PASSWORD = bcrypt.hashSync(password, salt);

     data.auth.HASHED_PASSWORD = HASHED_PASSWORD;
     data.auth.salt = salt;

     const user = {username: username, id: id};

     const final = data;

     fs.writeFileSync(`./data/accounts/${id}.json`, JSON.stringify(final, null, "    "));
     res.sendStatus(200);
});

app.post("/api/auth/check", middleware.authenticateToken, async (req, res) => {
     return res.sendStatus(200);
});



//Get the global data associated with a KVP.
app.get("/api/global/:key", async (req, res) => {
     const { key } = req.params;

     const global = await JSON.parse(fs.readFileSync("./data/global/global.json"));

     if(!(key in global)) return res.status(404).send("ID not in global title data.");

     res.status(200).send(global[key]);
});


app.get("/api/notifications/get/", middleware.authenticateToken, async (req, res) => {
     const id = req.user.id;

     const data = helpers.PullPlayerData(id);

     if(data.notifications == null) return res.status(200).send("[]");

     res.status(200).json(data.notifications);
});















app.post("/img/upload/:others/:roomId/:roomName", middleware.authenticateToken, async (req, res) => {
     var timestamp = Date.now();
     var dir = fs.readdirSync("./data/images/");
     
     var {others, roomName, roomId} = req.params;

     if(!others) others = "[]";
     others = JSON.parse(others);

     if(!req.files)
          return res.status(400).send("Request does not contain any files.");
     
     if(!Array.isArray(req.files)) 
     {   
          return res.status(400).send("Failed to parse files.");
     }
     var filesSafe = Array.from(req.files);

     if(filesSafe.length > 1)
          return res.status(400).send("You can only upload one image at a time.");
     var file = filesSafe.img;

     if(file.mimetype !== "image/png")
          return res.status(400).send("Sent file is not an image!");
          
     const filename = `${Math.floor(dir.length / 2) + 1}`;

     const authordata = helpers.PullPlayerData(req.user.id);

     var dotfiledata = {
          AuthorId: req.user.id,
          UploadTime: timestamp,
          TaggedPlayers: others,
          AuthorUsername: authordata.public.username,
          AuthorNickname: authordata.public.nickname,
          RoomName: roomName,
          RoomId: roomId,
          PhotoId: `${filename}`,
          UploadTimePrettyPrint: Date.now().toLocaleString(),
          privacy: 'public'
     };

     if(!fs.existsSync(`data/images/${filename}.png`)) {
          file.mv(`data/images/${filename}.png`);
          fs.writeFileSync(`data/images/.${filename}`, JSON.stringify(dotfiledata));
          return res.status(200).send();
     }
     res.sendStatus(500);
});

app.get("/img/:id/info", async (req, res) => {
     const {id} = req.params;
     let id_clean = sanitize(id);
     if(!fs.existsSync(`data/images/.${id_clean}`)) return res.status(404).send("Image with that ID does not exist.");
     res.status(200).send(fs.readFileSync(`data/images/.${id_clean}`));
});

app.get("/img/:id", async (req, res) => {
     const {id} = req.params;
     let id_clean = sanitize(id);
     if(!fs.existsSync(`data/images/${id_clean}.png`)) return res.status(404).send("Image with that ID does not exist.");
     res.sendFile(`${__dirname}/data/images/${id_clean}.png`);
})

app.get("/api/social/imgfeed", async (req, res) => {
     try {
          var {count, offset, order} = req.body;
          if(typeof(count) == 'undefined' || typeof(offset) == 'undefined' || typeof(order) == 'undefined') return res.status(400).send("Insufficient data in request JSON body. Required parameters are 'count', 'offset', and 'order'.");

          var files = fs.readdirSync("data/images");
          if(files.length < 1) return res.status(400).send("No photos available.")
          files = files.filter((item => item.substring(0, 1) == '.'));
          if(order == 0)
               files = files.reverse();

          if(count > files.length - offset) count = files.length - offset;
          if(count < 1) count = 1;

          var filesArray = [];
          let i;
          for(i = offset + 1; i < count; i++)
               filesArray.push(helpers.PullPlayerData(i));
          
          res.status(200).json(filesArray);
     } catch (exception) {
          console.error(exception);
          return res.sendStatus(500);
     }
     
});

app.get("/api/social/takenby", async (req, res) => {
     var {user} = req.body;
     if(typeof(user) == 'undefined') return res.status(400).send("Request body does not contain the required parameter of 'user'");
     var dir = fs.readdirSync("data/images");

     if(dir.length < 1) return res.status(500).send("No images available on the API.");
     
     const playerdata = helpers.PullPlayerData(user);
     if(playerdata == null) return res.status(404).send("User does not exist!");

     dir = dir.filter((item => item.substring(0, 1) == '.'));
     dir = dir.map((item => JSON.parse(fs.readFileSync(`data/images/${item}`))));

     var playerTakenPhotos = dir.filter((item => item.AuthorId == user));
     
     if(playerTakenPhotos.length < 1) return res.status(404).send("Player has not taken or uploaded any photos.");

     return res.status(200).json(playerTakenPhotos);
});

app.get("/api/social/takenwith", async (req, res) => {
     var {user} = req.body;
     if(typeof(user) == 'undefined') return res.status(400).send("Request body does not contain the required parameter of 'user'");
     var dir = fs.readdirSync("data/images");

     if(dir.length < 1) return res.status(500).send("No images available on the API.");
     
     const playerdata = helpers.PullPlayerData(user);
     if(playerdata == null) return res.status(404).send("User does not exist!");

     dir = dir.filter((item => item.substring(0, 1) == '.'));
     dir = dir.map((item => JSON.parse(fs.readFileSync(`data/images/${item}`))));

     var playerTaggedPhotos = dir.filter((item => item.TaggedPlayers.includes(user)));
     
     if(playerTaggedPhotos.length < 1) return res.status(404).send("Player has not been tagged in any photos.");

     return res.status(200).json(playerTaggedPhotos);
});

app.post("/api/social/friend-request", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     target = target.toString();

     var sendingData = helpers.PullPlayerData(req.user.id);
     var recievingData = helpers.PullPlayerData(target);

     if(helpers.ArePlayersAnyFriendType(req.user.id, target)) return res.status(400).send("You are already friends with this player.");
     if(sendingData.private.friendRequestsSent.includes(target)) return res.status(400).send("You have already sent a friend request to this player, duplicate requests are not permitted.");

     helpers.NotifyPlayer(target, notificationTemplates.friendRequest, {
          "sendingPlayer": req.user.id,
          "headerText": `Friend Request`,
          "bodyText": `Hey there ${recievingData.public.nickname}! ${sendingData.public.nickname} has sent you a friend request! Press the "Profile" button to see their profile. Press "Accept" to become friends with them, or press "Ignore" to decline the request!`,
          "continueText": `Accept`,
          "cancelText": "Ignore"
     });

     res.status(200).send("Successfully sent friend request to player!");
     sendingData.private.friendRequestsSent.push(target);
     helpers.PushPlayerData(req.user.id, sendingData);
});

app.post("/api/social/accept-request", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     target = target.toString();

     var recievingData = helpers.PullPlayerData(req.user.id);

     if(helpers.ArePlayersAnyFriendType(req.user.id, target)) return res.status(400).send("You are already friends with this player.")
     var filteredNotifications = recievingData.notifications.filter(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
     
     if(filteredNotifications.length < 1) return res.status(400).send("You do not have any friend requests from this player. Ask them to send you one.");

     for (let index = 0; index < filteredNotifications.length; index++) {
          let itemIndex = recievingData.notifications.findIndex(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
          recievingData.notifications.splice(itemIndex);
     }

     helpers.PushPlayerData(req.user.id, recievingData);

     helpers.AddAcquaintance(req.user.id, target, true);

     res.status(200).send("Successfully added acquaintance.");

     var sendingData = helpers.PullPlayerData(target);
     
     var index = sendingData.private.friendRequestsSent.findIndex(item => item == req.user.id);
     if(index >= 0) sendingData.private.friendRequestsSent.splice(index);
     helpers.PushPlayerData(target, sendingData);
});

app.get("/api/social/sent-requests", middleware.authenticateToken, async (req, res) => {
     var data = helpers.PullPlayerData(req.user.id);
     res.status(200).json(data.private.friendRequestsSent);  
});

app.post("/api/social/make-acquaintance", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveFriend(sender, target, false);
     helpers.RemoveFavoriteFriend(sender, target, false);

     helpers.AddAcquaintance(sender, target, false);
     res.sendStatus(200);
});

app.post("/api/social/make-friend", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveAcquaintance(sender, target, false);
     helpers.RemoveFavoriteFriend(sender, target, false);

     helpers.AddFriend(sender, target, false);
     res.sendStatus(200);
});

app.post("/api/social/make-favorite-friend", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveAcquaintance(sender, target, false);
     helpers.RemoveFriend(sender, target, false);

     helpers.AddFavoriteFriend(sender, target, false);
     res.sendStatus(200);
});

app.post("/api/social/remove-friend", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     var sender = req.user.id;

     if(!helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are not acquaintances, friends, or favorite friends with this user.");

     helpers.RemoveAcquaintance(sender, target, true);
     helpers.RemoveFriend(sender, target, true);
     helpers.RemoveFavoriteFriend(sender, target, true);
     res.sendStatus(200);
});

app.post("/api/social/decline-request", middleware.authenticateToken, async (req, res) => {
     var {target} = req.body;
     if(!target) return res.status(400).send("You did not specify a target!");
     target = target.toString();
     const sender = req.user.id;

     if(helpers.ArePlayersAnyFriendType(sender, target)) return res.status(400).send("You are already acquaintances, friends, or favorite friends with this player!");

     var sendingData = helpers.PullPlayerData(target);
     if(sendingData == null) return res.status(404).send("That user does not exist!");

     var recievingData = helpers.PullPlayerData(sender);
     
     if(!sendingData.private.friendRequestsSent.includes(sender)) return res.status(400).send("You do not have a pending friend request from this player!");

     while(sendingData.private.friendRequestsSent.includes(sender)) {
          const index = sendingData.private.friendRequestsSent.findIndex(item => item == sender);
          sendingData.private.friendRequestsSent.splice(index);
     }
     helpers.PushPlayerData(target, sendingData);

     var temp = recievingData.notifications.filter(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
     for (let index = 0; index < temp.length; index++) {
          let itemIndex = recievingData.notifications.findIndex(item => item.template == notificationTemplates.friendRequest && item.parameters.sendingPlayer == target);
          if(itemIndex >= 0) recievingData.notifications.splice(itemIndex);
          else break;
     }

     helpers.PushPlayerData(sender, recievingData);
     res.status(200).send("Declined friend request.");
});

app.get("/api/social/acquaintances", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.acquaintances.length; index++) {
          const element = data.private.acquaintances[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

app.get("/api/social/friends", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.friends.length; index++) {
          const element = data.private.friends[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

app.get("/api/social/favorite-friends", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);
     var dictionary = {};
     for (let index = 0; index < data.private.favoriteFriends.length; index++) {
          const element = data.private.favoriteFriends[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

app.get("/api/social/all-friend-types", middleware.authenticateToken, async (req, res) => {
     const data = helpers.PullPlayerData(req.user.id);

     const array1 = helpers.MergeArraysWithoutDuplication(data.private.acquaintances, data.private.friends);
     const all = helpers.MergeArraysWithoutDuplication(array1, data.private.favoriteFriends);

     var dictionary = {};
     for (let index = 0; index < all.length; index++) {
          const element = all[index];
          let player = helpers.PullPlayerData(element);
          dictionary[element] = player.public;
     }
     return res.status(200).json(dictionary);
});

//#endregion


//#region analytics
app.get("/api/analytics/accountCount", async (req, res) => {
     var files = fs.readdirSync("data/accounts");
     res.status(200).send(`${files.length - 1}`);
});
//#endregion

//#region Developer-only API calls

//Modify a user's currency balance.
app.post("/api/accounts/:id/currency/modify", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = helpers.PullPlayerData(id_clean);

     if(!(data.private.currency + amount >= 0)) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency += amount;

     helpers.PushPlayerData(id_clean, data)

     helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} modified user ${id}'s currency balance by ${amount}, with a final balance of ${data.private.currency}.`);

     res.status(200).send("Action successful.");
});

//Set a user's currency balance.
app.post("/api/accounts/:id/currency/set", middleware.authenticateDeveloperToken, async (req, res) => {
     const { id } = req.params;
     let id_clean = sanitize(id);
     const { amount } = req.body;

     const exists = fs.existsSync(`./data/accounts/${id_clean}.json`);
     if(!exists) return res.status(404).send("User not found!");

     let data = helpers.PullPlayerData(id_clean);

     if(amount < 0) return res.status(400).send("Final currency amount cannot be less than 0.");

     data.private.currency = amount;

     helpers.PushPlayerData(id_clean, data);

     helpers.auditLog(`!DEVELOPER ACTION! User ${req.user.username} with ID ${req.user.id} set user ${id}'s currency to ${amount}.`);

     res.status(200).send("Action successful.");
});



app.post("/api/global/:key", middleware.authenticateDeveloperToken, async (req, res) => {
     const { key } = req.params;
     const { value } = req.body;

     var global = await JSON.parse(fs.readFileSync("./data/global/global.json"));

     global[key] = value;

     fs.writeFileSync("./data/global/global.json", JSON.stringify(global, null, "    "));
     helpers.auditLog(`!DEVELOPER ACTION! Developer ${req.user.username} with ID ${req.user.id} updated GLOBAL title data with key ${key}.`);
     res.status(200).send();
});


//#endregion

//#region Functions




//#endregion

//#region Helper Functions

//#endregion


app.listen(config.PORT, '0.0.0.0');
helpers.auditLog("Server Init");
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);
