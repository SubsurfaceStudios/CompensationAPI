require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const helpers = require('./helpers');
const jwt = require('jsonwebtoken');
const firebaseAuth = require('firebase/auth');

const app = express();
app.set('trust proxy', 1);

var GlobalLimiter = RateLimit({
     windowMs: 1*60*1000,
     max: 100,
     standardHeaders: true,
     legacyHeaders: false
});

app.use(GlobalLimiter);

app.use(express.json({
     limit: '50mb'
}));
app.use(fileUpload({
     createParentPath: true,
     limit: '50mb'
}));

const config = require('./config.json');

//#region routers

// /api/accounts/*
app.use("/api/accounts", require("./routers/accounts"));
// /api/auth/*
app.use("/api/auth", require('./routers/auth'));
// /dev/*
app.use("/dev", require('./routers/dev'));
// /api/global/*
app.use("/api/global", require('./routers/global'));
// /api/notifications/*
app.use("/api/notifications", require('./routers/notifications'));
// /img/*
app.use("/img", require('./routers/img'));
// /api/analytics/*
app.use("/api/analytics", require('./routers/analytics'));
// /api/social/*
app.use("/api/social", require('./routers/social'));
// /api/econ/*
const econ = require('./routers/econ');
app.use("/api/econ", econ.router);
// /api/matchmaking/*
const matchmaking = require('./routers/matchmaking')
app.use("/api/matchmaking", matchmaking.router);
// /api/rooms/*
app.use("/api/rooms", require('./routers/rooms'));

//#endregion

//#region Miscellaneous Endpoints

//Server test call
app.get("/", async (req, res) => {
     return res.status(200).send("Pong!");
});

//Joke
app.get("/api/dingus", async(req, res) => {
     return res.status(200).send("You have ascended");
     //hmm
});



//#endregion

const server = app.listen(config.PORT, '0.0.0.0');
helpers.auditLog("Server Init");
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);

var ws_connnected_clients = {};

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: server, path: '/ws', 'handleProtocols': true, 'skipUTF8Validation': true },()=>{    
     console.log('server started')
});
wss.on('connection', async (ws, request) => {
     var ignore_connection_closed = false;
     var tokenData;
     var location;

     console.log("User connected to websocket, awaiting authorization.");

     ws.on('message', async (data) => {
          data = data.toString('utf-8');
          if(data.slice(0, 7) == "Bearer " && typeof tokenData === 'undefined') {
               var token = data.slice(7);
               try {
                    tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

                    const playerData = helpers.PullPlayerData(tokenData.id);

                    for (let index = 0; index < playerData.auth.bans.length; index++) {
                         const element = playerData.auth.bans[index];
                         
                         if(element.endTS > Date.now()) {
                              //user is banned
                              ws.send("BANNED");
                              ignore_connection_closed = true;
                              ws.terminate();
                              return;
                         }
                    }
               } catch (ex) {
                    ws.send("UNAUTHORIZED");
                    ws.terminate();
                    return;
               }

               if(Object.keys(ws_connnected_clients).includes(tokenData.id)) {
                    ws.send("DUPLICATE CONNECTION");
                    ws.terminate();
                    return;
               }

               ws_connnected_clients[tokenData.id] = ws;
               console.log(`User ${tokenData.id} has authenticated and is now connected.`);

               var presenceData = helpers.PullPlayerData(tokenData.id);
               presenceData.presence.status = "online";
               if(presenceData.econ.previous_daily_redeemed < (Date.now() - 86400000)) {
                    // Daily login rewards.
                    presenceData.econ.currency += 100;
                    presenceData.econ.previous_daily_redeemed = Date.now();
               }
               helpers.PushPlayerData(tokenData.id, presenceData);
               ws.send("AUTHORIZED");

          } else if (typeof tokenData !== 'undefined') {
               const split = data.toString().split(' ');
               switch(split[0]) {
                    // handle client input
                    case "JOIN":
                         ws.send("ASSERT Feature not implemented, how are you accessing this :face_with_raised_eyebrow:");
                         return;
                    case "LOG":
                         split = split.splice(0);
                         console.log(split.join(' '));
                         return;
                    case "PUT_ANALYTIC_VAL":
                         ws.send("ASSERT Feature not implemented.");
                         return;
               }
          }
     });

     ws.on('close', async (data) => {
          if(!ignore_connection_closed && typeof tokenData !== 'undefined') {
               var data = helpers.PullPlayerData(tokenData.id);
               data.presence.status = "offline";
               helpers.PushPlayerData(tokenData.id, data);
               delete ws_connnected_clients[tokenData.id];
               console.log(`User ${tokenData.id} disconnected.`);
          } else if (typeof tokenData !== 'undefined') {
               // Handle leaving room in session
          }
     });

     ws.send();
})
wss.on('listening',()=>{
     console.log("WS system online.");
});

function sendStringToClient(id, data) {
     if(!Object.keys(ws_connnected_clients).includes(id)) return;
     ws_connnected_clients[id].send(data);
}

const { MongoClient } = require('mongodb');

const uri = `mongodb+srv://CVRAPI%2DDIRECT:${process.env.MONGOOSE_ACCOUNT_PASSWORD}@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
     useNewUrlParser: true,
     useUnifiedTopology: true
});

client.connect(async (error, result) => {
     if(error) {
          console.error(`Failed to connect to MongoDB - fatal\n` + error);
          helpers.auditLog(`Failed to connect to MongoDB - fatal\n` + error);
          process.exit(1);
     }

     console.log("MongoDB Connection Established.");

     require('firebase/app').initializeApp(require('./env').firebaseConfig);

     const auth = firebaseAuth.getAuth();

     const firebaseAuthUser = await firebaseAuth.signInWithEmailAndPassword(auth, process.env.FIREBASE_EMAIL, process.env.FIREBASE_API_SECRET);

     if(typeof firebaseAuthUser.user.uid == 'undefined') {
          auditLog('Failed to connect to Firebase - fatal');
          console.error('Failed to connect to Firebase - fatal');
          process.exit(1);
     }

     console.log('Firebase Connection Established.');

     module.exports = {
          sendStringToClient: sendStringToClient,
          mongoClient: client
     };
     
     process.on('beforeExit', function () {
          helpers.auditLog("Server exit.");
     });
     
     process.on('uncaughtException', function (exception) {
          helpers.auditLog(`Uncaught exception in server.\nException: \`\`\`${exception}\`\`\``);
          console.error(exception);
     });
     
     process.on('SIGINT', function () {
          var Instances = matchmaking.GetInstances("*");

          if(Instances.length > 1) { // Maximum length of ONE because of the default instance for intellisense testing.
               console.log("Server kill command rejected - there are players online with instances active.\nWait for the instances to close or use SIGKILL / SIGTERM");
               return;
          }

          helpers.auditLog("Server killed from command line. Exiting in 0.25 seconds. (250ms)")
     
          setTimeout(() => process.exit(), 250);
     });
});