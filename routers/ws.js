const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { ignore } = require('nodemon/lib/rules');
require('dotenv').config();

const expressWs = require('express-ws')(router);

var OPEN_TETHER_DIRECTORY = {

};

/// Codes
/// KICKED
/// BANNED
/// NOTIFICATION RECIEVED
/// UNAUTHORIZED
/// DUPLICATE LOGIN

/* 
          if(Object.keys(OPEN_TETHER_DIRECTORY).includes(req.user.id)) {
               // This player is already tethered, deny the request
               ignore_connection_closed = true;
               ws.terminate();
          } 
          else // Record this client to the directory so we can talk to this websocket from anywhere in the script.
          {
               OPEN_TETHER_DIRECTORY[req.user.id] = ws;
               var data = helpers.PullPlayerData(req.user.id);
               data.presence.status = "online";
               helpers.PushPlayerData(req.user.id, data);
          }
 */
router.ws('/connect-tether', async (ws, req) => {
     var ignore_connection_closed = false;
     var user;
     ws.on('open', async () => {
          ignore_connection_closed = true;
     });
     ws.on('close', async () => {
          if(!ignore_connection_closed) {
               delete OPEN_TETHER_DIRECTORY[user.id];
               var data = helpers.PullPlayerData(user.id);
               data.presence.status = 'offline';
               helpers.PushPlayerData(user.id, data);
          }
     });
     ws.on('message', async (data, isBinary) => {
          data = data.toString();

          if(data.slice(0, 7) == "Bearer ") {
               var token = data.slice(7);

               try {
                    const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

                    const data = helpers.PullPlayerData(tokenData.id);
     
                    for (let index = 0; index < data.auth.bans.length; index++) {
                         const element = data.auth.bans[index];
                         
                         if(element.endTS > Date.now()) {
                              //user is banned
                              ws.send("BANNED");
                              ignore_connection_closed = true;
                              ws.terminate();
                         }
                    }
               } catch {
                    ws.send("UNAUTHORIZED");
                    ignore_connection_closed = true;
                    ws.terminate();
                    return;
               }
               
               if(Object.keys(OPEN_TETHER_DIRECTORY).includes(tokenData.id)) {
                    ws.send("DUPLICATE LOGIN");
                    ignore_connection_closed = true;
                    ws.terminate();
                    return;
               }

               OPEN_TETHER_DIRECTORY[tokenData.id] = ws;
               ignore_connection_closed = false;
               user = tokenData;

               var playerData = helpers.PullPlayerData(user.id);
               playerData.presence.status = "online";
               helpers.PushPlayerData(user.id, playerData);
          }
     });
});

function sendStringToClient(id, data) {
     if(!Object.keys(OPEN_TETHER_DIRECTORY).includes(id)) return false;
     OPEN_TETHER_DIRECTORY[id].send(data);
}

module.exports = {
     router: router,
     sendStringToClient: sendStringToClient
};