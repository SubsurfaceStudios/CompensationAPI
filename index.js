require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const helpers = require('./helpers');
const jwt = require('jsonwebtoken');

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

     ws.on('message', async (data) => {
          data = data.toString('utf-8');
          if(data.slice(0, 7) == "Bearer " && tokenData == null){
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
               var presenceData = helpers.PullPlayerData(tokenData.id);
               presenceData.presence.status = "online";
               helpers.PushPlayerData(tokenData.id, presenceData);
               ws.send("AUTHORIZED");
          }
     });

     ws.on('close', async (data) => {
          if(!ignore_connection_closed && tokenData != null) {
               var data = helpers.PullPlayerData(tokenData.id);
               data.presence.status = "offline";
               helpers.PushPlayerData(tokenData.id, data);
               delete ws_connnected_clients[tokenData.id];
          }
     });

     ws.send()
     
     console.log("connected");
})
wss.on('listening',()=>{
     console.log("WS system online.");
});

function sendStringToClient(id, data) {
     if(!Object.keys(ws_connnected_clients).includes(id)) return;
     ws_connnected_clients[id].send(data);
}

module.exports = {
     sendStringToClient: sendStringToClient
};

process.on('beforeExit', function () {
     helpers.auditLog("Server exit.");
});

process.on('uncaughtException', function (exception) {
     helpers.auditLog(`Uncaught exception in server.\nException: \`\`\`${exception}\`\`\`\nExiting process in 2 seconds. (2000ms)`);
     console.error(exception);
     setTimeout(() => process.exit(), 2000);
});

process.on('SIGINT', function () {
     helpers.auditLog("Server killed from command line. Exiting in 0.25 seconds. (250ms)")

     setTimeout(() => process.exit(), 250);
});