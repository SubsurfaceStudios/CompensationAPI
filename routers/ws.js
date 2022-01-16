const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const expressWs = require('ws')(router);

var OPEN_TETHER_DIRECTORY = {

};

/// Codes
/// KICKED
/// BANNED
/// NOTIFICATION RECIEVED

router.ws('/connect-tether', middleware.authenticateToken, async (ws, req) => {
     var ignore_connection_closed = false;
     ws.on('open', async () => {
          if(Object.keys(OPEN_TETHER_DIRECTORY).includes(req.user.id)) {
               // This player is already tethered, deny the request
               ignore_connection_closed = true;
               ws.terminate();
          } 
          else // Record this client to the directory so we can talk to this websocket from anywhere in the script.
               OPEN_TETHER_DIRECTORY[req.user.id] = ws;
     });
     ws.on('close', async () => {
          if(!ignore_connection_closed) delete OPEN_TETHER_DIRECTORY[req.user.id];
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