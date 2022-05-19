require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const helpers = require('./helpers');
const jwt = require('jsonwebtoken');
const firebaseAuth = require('firebase/auth');
const MatchmakingAPI = require('./routers/matchmaking');
const middleware = require('./middleware');

const WebSocketV2_MessageTemplate = {
     code: "string",
     data: {}
};

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
const RoomsAPI = require('./routers/rooms');
app.use("/api/rooms", RoomsAPI.Router);
// /api/messaging/*
const messaging = require('./routers/messages');
app.use("/api/messaging", messaging.router);


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



helpers.auditLog("Server Init", false);
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);

var ws_connected_clients = {};

const WebSocket = require('ws');
const wss_v1 = new WebSocket.Server({ noServer: true });
wss_v1.on('connection', async (ws) => {
     var ignore_connection_closed = false;
     var tokenData;

     console.log("User connected to websocket, awaiting authorization.");

     ws.on('message', async (data) => {
          data = data.toString('utf-8');
          console.log(data);
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

               if(Object.keys(ws_connected_clients).includes(tokenData.id)) {
                    ignore_connection_closed = true;
                    ws.send("DUPLICATE CONNECTION");
                    ws.terminate();
                    return;
               }

               ws_connected_clients[tokenData.id] = 
               {
                    socket: ws,
                    version: 1,
                    instanceId: null
               };
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
               const split = data.split(' ');
               switch(split[0]) {
                    case "LOG":
                         console.log(split.splice(0));
                         return;
                    case "PUT_ANALYTIC_VAL":
                         ws.send("ASSERT Feature not implemented.");
                         return;
                    case "BROADCAST_STRING":
                         if(!tokenData.developer) return;

                         split.splice(0);
                         wsv1_broadcastStringToAllClients(split.join(' '));
                         return;
                    case "SEND_STRING":
                         if(!tokenData.developer) return;

                         var user = split[1];
                         split.splice(0, 2);

                         wsv1_sendStringToClient(user, split.join(' '));
                         return;
               }
          }
     });

     ws.on('close', async () => {
          if(!ignore_connection_closed && typeof tokenData !== 'undefined') {
               var player_data = helpers.PullPlayerData(tokenData.id);
               player_data.presence.status = "offline";
               helpers.PushPlayerData(tokenData.id, player_data);
               delete ws_connected_clients[tokenData.id];
               console.log(`User ${tokenData.id} disconnected.`);
          } else if (typeof tokenData !== 'undefined') {
               // Handle leaving room in session
          }
     });
});

const WebSocketServerV2 = new WebSocket.Server({noServer: true});
WebSocketServerV2.on('connection', (Socket) => {
     var ConnectedUserData = {
          uid: null,
          username: "",
          nickname: "",
          isAuthenticated: false,
          tags: [],
          isDeveloper: false,
          isCreativeToolsBetaProgramMember: false,
          matchmaking_InstanceId: null,
          matchmaking_RoomId: null,
          matchmaking_GlobalInstanceId: null
     };

     Socket.on('ping', async () => {
          Socket.pong();
     });

     Socket.on('message', async (data) => {
          try {
               var ParsedContent = JSON.parse(data.toString('utf-8'));
          } catch (ex) {
               var send = WebSocketV2_MessageTemplate;
               send.code = "throw_exception";
               send.data = {
                    text: "json_parse_failed"
               };

               Socket.send(send);
               throw ex;
          }

          if(typeof ParsedContent.code != 'string' || typeof ParsedContent.data != 'object') return;

          // begin parsing data

          switch(ParsedContent.code) {
               case "authenticate":
                    if(ConnectedUserData.isAuthenticated) return;
                    
                    if(typeof ParsedContent.data.token !== 'string') {

                         // eslint-disable-next-line no-redeclare
                         var send = WebSocketV2_MessageTemplate;
                         send.code = "authentication_failed";
                         send.data = {
                              reason: "no_token"
                         };

                         return Socket.close(4003, JSON.stringify(send, null, 5));
                    }

                    var {success, tokenData, playerData, reason} = middleware.authenticateToken_internal(ParsedContent.data.token);

                    
                    if(!success) {
                         // eslint-disable-next-line no-redeclare
                         var send = WebSocketV2_MessageTemplate;
                         send.code = "authentication_failed";
                         send.data = {
                              reason: reason
                         };

                         return Socket.close(4001, JSON.stringify(send, null, 5));
                    }

                    if(Object.keys(ws_connected_clients).includes(tokenData.id)) {
                         // eslint-disable-next-line no-redeclare
                         var send = WebSocketV2_MessageTemplate;
                         send.code = "authentication_failed";
                         send.data = {
                              reason: "duplicate_connection"
                         }

                         return Socket.close(4002, JSON.stringify(send, null, 5));
                    }

                    // all clear to clean up and proceed

                    ConnectedUserData.uid = tokenData.id;
                    ConnectedUserData.nickname = playerData.public.nickname;
                    ConnectedUserData.isAuthenticated = true;
                    ConnectedUserData.username = tokenData.username;
                    ConnectedUserData.isCreativeToolsBetaProgramMember = playerData.private.availableTags.includes("Creative Tools Beta Program Member");
                    ConnectedUserData.isDeveloper = tokenData.developer;
                    ConnectedUserData.tags = playerData.private.availableTags;

                    var final_send = WebSocketV2_MessageTemplate;
                    final_send.code = "authentication_success";
                    final_send.data = {
                         message: tokenData.id != "2" ? `Welcome back to Compensation VR.\nYou have ${playerData.notifications.length} unread notifications.` : `welcome back dumbfuck\nread your notifications you've got 9999.`
                    };

                    ws_connected_clients[ConnectedUserData.uid] = {
                         socket: Socket,
                         version: 2,
                         instanceId: null
                    };

                    console.log(`User "${ConnectedUserData.nickname}" / @${ConnectedUserData.username} with ID ${ConnectedUserData.uid} has connected.`);
                    return Socket.send(JSON.stringify(final_send, null, 5));
               case "join_or_create_matchmaking_instance":
                    if(!ConnectedUserData.isAuthenticated) return;
                    if(typeof ParsedContent.data.roomId !== 'string' || typeof ParsedContent.data.subroomId !== 'string') return;

                    var db = require('./index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
                    var collection = db.collection("rooms");

                    var room = await collection.findOne({_id: {$eq: ParsedContent.data.roomId, $exists: true}});
                    if(room == null) return;
                    if(!Object.keys(room.subrooms).includes(ParsedContent.data.subroomId)) return;


                    // leave current room
                    if(ConnectedUserData.matchmaking_InstanceId != null) {
                         try {
                              var instance = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
                              instance.RemovePlayer(ConnectedUserData.uid);
                              await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, instance);
                              ConnectedUserData.matchmaking_InstanceId = null;
                              ConnectedUserData.matchmaking_RoomId = null;
                         } catch (err) {
                              console.error(err);
                         }
                    }

                    var instances = await MatchmakingAPI.GetInstances(ParsedContent.data.roomId);
                    var filtered = instances.filter(instance => instance.Players < instance.MaxPlayers && instance.SubroomId == ParsedContent.data.subroomId && instance.MatchmakingMode == MatchmakingModes.Public);


                    // short circuit for if no instances are available to create a new one
                    if(filtered.length < 1) {
                         var subroom = room.subrooms[ParsedContent.data.subroomId];
                         // eslint-disable-next-line no-redeclare
                         var instance = await MatchmakingAPI.CreateInstance(ParsedContent.data.roomId, ParsedContent.data.subroomId, MatchmakingModes.Public, 300*1000, false, subroom.maxPlayers, null);
                         instance.AddPlayer(ConnectedUserData.uid);
                         MatchmakingAPI.SetInstance(ParsedContent.data.roomId, instance.InstanceId, instance);
                         
                         // eslint-disable-next-line no-redeclare
                         var send = WebSocketV2_MessageTemplate;
                         send.code = "join_or_create_photon_room";
                         send.data = {
                              name: instance.JoinCode,
                              baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                              spawn: subroom.versions[subroom.publicVersionId].spawn
                         };

                         Socket.send(JSON.stringify(send, null, 5));

                         ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
                         ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;
                         ConnectedUserData.matchmaking_RoomId = instance.RoomId;
                         return;
                    }

                    var final_selection;

                    var shortCircuit = false;
                    // short-circuit for rooms in the same global instance
                    for(let i = 0; i < filtered.length; i++) {
                         const element = filtered[i];
                         if(element.GlobalInstanceId != ConnectedUserData.matchmaking_GlobalInstanceId) continue;

                         // element has the same global instance id as the user, so we can short circuit this whole process to make sure they stay with their current nearby players.
                         shortCircuit = true;
                         final_selection = element;

                         // we can handle the rest of the join logic normally

                         console.log("short-circuit for same global instance");
                    }

                    // non-full, joinable & public instances exist, choose one
                    // this method will strive for the largest possible instance, within the bounds of the room's max players
                    // can change later but rn idgaf
                    if(!shortCircuit) {
                         final_selection = filtered.sort((a, b) => a.Players - b.Players)[0];
                    }

                    final_selection.AddPlayer(ConnectedUserData.uid);
                    await MatchmakingAPI.SetInstance(ParsedContent.data.roomId, final_selection.InstanceId, final_selection);

                    // eslint-disable-next-line no-redeclare
                    var send = WebSocketV2_MessageTemplate;
                    send.code = "join_or_create_photon_room";

                    // eslint-disable-next-line no-redeclare
                    var subroom = room.subrooms[ParsedContent.data.subroomId];
                    send.data = {
                         name: final_selection.JoinCode,
                         baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                         spawn: subroom.versions[subroom.publicVersionId].spawn
                    };

                    Socket.send(JSON.stringify(send, null, 5));

                    ConnectedUserData.matchmaking_InstanceId = final_selection.InstanceId;
                    ConnectedUserData.matchmaking_RoomId = final_selection.RoomId;
                    ConnectedUserData.matchmaking_GlobalInstanceId = final_selection.GlobalInstanceId;
                    return;
               case "create_public_matchmaking_instance":
                    if(!ConnectedUserData.isAuthenticated) return;
                    if(typeof ParsedContent.data.roomId !== 'string' || typeof ParsedContent.data.subroomId !== 'string') return;

                    // eslint-disable-next-line no-redeclare
                    var db = require('./index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
                    // eslint-disable-next-line no-redeclare
                    var collection = db.collection("rooms");

                    // eslint-disable-next-line no-redeclare
                    var room = await collection.findOne({_id: {$eq: ParsedContent.data.roomId, $exists: true}});
                    if(room == null) return;
                    if(!Object.keys(room.subrooms).includes(ParsedContent.data.subroomId)) return;

                    // eslint-disable-next-line no-redeclare
                    var instances = await MatchmakingAPI.GetInstances(ParsedContent.data.roomId);


                    // leave current room
                    if(ConnectedUserData.matchmaking_InstanceId != null) {
                         try {
                              var inst = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
                              inst.RemovePlayer(ConnectedUserData.uid);
                              await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, inst);
                              ConnectedUserData.matchmaking_InstanceId = null;
                              ConnectedUserData.matchmaking_RoomId = null;
                         } catch (err) {
                              console.error(err);
                         }
                    }

                    // eslint-disable-next-line no-redeclare
                    var subroom = room.subrooms[ParsedContent.data.subroomId];
                    // eslint-disable-next-line no-redeclare
                    var instance = await MatchmakingAPI.CreateInstance(ParsedContent.data.roomId, ParsedContent.data.subroomId, MatchmakingModes.Public, 300*1000, false, subroom.maxPlayers);
                    instance.AddPlayer(ConnectedUserData.uid);
                    MatchmakingAPI.SetInstance(ParsedContent.data.roomId, instance.InstanceId, instance);
                    
                    // eslint-disable-next-line no-redeclare
                    var send = WebSocketV2_MessageTemplate;
                    send.code = "join_or_create_photon_room";
                    send.data = {
                         name: instance.JoinCode,
                         baseSceneId: subroom.versions[subroom.publicVersionId].baseSceneIndex,
                         spawn: subroom.versions[subroom.publicVersionId].spawn
                    };

                    Socket.send(JSON.stringify(send, null, 5));

                    ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
                    ConnectedUserData.matchmaking_RoomId = ParsedContent.data.roomId;
                    ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;

                    return;
               case "matchmaking_reconnection_verify":
                    if(!ConnectedUserData.isAuthenticated) return;
                    if(typeof ParsedContent.data.room_id !== 'string' || typeof ParsedContent.data.join_code !== 'string') return;

                    // eslint-disable-next-line no-redeclare
                    var instance = await MatchmakingAPI.GetInstanceByJoinCode(ParsedContent.data.room_id, ParsedContent.data.join_code);
                    instance.AddPlayer(ConnectedUserData.uid);
                    
                    await MatchmakingAPI.SetInstance(ParsedContent.data.room_id, instance.InstanceId, instance);

                    ConnectedUserData.matchmaking_InstanceId = instance.InstanceId;
                    ConnectedUserData.matchmaking_RoomId = instance.RoomId;
                    ConnectedUserData.matchmaking_GlobalInstanceId = instance.GlobalInstanceId;
                    return;
               }
     });
     Socket.on('close', async () => {
          if(!ConnectedUserData.isAuthenticated) return;
          if(!Object.keys(ws_connected_clients).includes(ConnectedUserData.uid)) return;

          if(ws_connected_clients[ConnectedUserData.uid].version != 2) return;

          delete ws_connected_clients[ConnectedUserData.uid];
          console.log(`User "${ConnectedUserData.nickname}" / @${ConnectedUserData.username} with ID ${ConnectedUserData.uid} has disconnected.`);

          if(ConnectedUserData.matchmaking_InstanceId != null) {
               var instance = await MatchmakingAPI.GetInstanceById(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId);
               if(instance != null) {
                    instance.RemovePlayer(ConnectedUserData.uid);
                    await MatchmakingAPI.SetInstance(ConnectedUserData.matchmaking_RoomId, ConnectedUserData.matchmaking_InstanceId, instance);
               }
          }
     });
     Socket.on('error', (err) => {
          throw err;
     });
});

const MessagingGatewayServerV1 = new WebSocket.Server({noServer: true});
MessagingGatewayServerV1.on('connection', async (stream) => {
     var ClientData = {
          uid: null,
          username: "",
          nickname: "",
          isAuthenticated: false,
          tags: [],
          isDeveloper: false,
          isCreativeToolsBetaProgramMember: false
     };
     const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
     const server_collection = db.collection("servers");
     const message_collection = db.collection("messages");

     stream.on('ping', async () => {
          stream.pong();
     })

     stream.on('message', async (data) => {
          try {
               var ParsedContent = JSON.parse(data.toString('utf-8'));
          } catch (ex) {
               var send = WebSocketV2_MessageTemplate;
               send.code = "throw_exception";
               send.data = {
                    text: "json_parse_failed"
               };

               stream.send(send);
               throw ex;
          }

          if(typeof ParsedContent.code != 'string' || typeof ParsedContent.data != 'object') return;

          // begin parsing data

          switch(ParsedContent.code) {
               case "authenticate":
                    if(ClientData.isAuthenticated) return;
                    
                    if(typeof ParsedContent.data.token !== 'string') {
                         // eslint-disable-next-line no-redeclare
                         var send = WebSocketV2_MessageTemplate;
                         send.code = "authentication_failed";
                         send.data = {
                              reason: "no_token"
                         };

                         return stream.close(4003, JSON.stringify(send, null, 5));
                    }

                    var {success, tokenData, playerData, reason} = middleware.authenticateToken_internal(ParsedContent.data.token);
                    
                    if(!success) {
                         // eslint-disable-next-line no-redeclare
                         var send = WebSocketV2_MessageTemplate;
                         send.code = "authentication_failed";
                         send.data = {
                              reason: reason
                         };

                         return stream.close(4001, JSON.stringify(send, null, 5));
                    }

                    // all clear to clean up and proceed

                    ClientData.uid = tokenData.id;
                    ClientData.nickname = playerData.public.nickname;
                    ClientData.isAuthenticated = true;
                    ClientData.username = tokenData.username;
                    ClientData.isCreativeToolsBetaProgramMember = playerData.private.availableTags.includes("Creative Tools Beta Program Member");
                    ClientData.isDeveloper = tokenData.developer;
                    ClientData.tags = playerData.private.availableTags;

                    // eslint-disable-next-line no-redeclare
                    var send = WebSocketV2_MessageTemplate;
                    send.code = "authentication_confirmed";
                    send.data = {};
                    
                    // confirms connection
                    stream.send(JSON.stringify(send, null, 5));
          }
          

     });

     stream.on('message_sent', async (server_id, channel_id, message_id) => {
          if(!ClientData.isAuthenticated) return;

          const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
          if(server_data == null) return;
          if(!Object.keys(server_data.users).includes(ClientData.uid)) return;

          const message_content = await message_collection.findOne({_id: {$eq: message_id, $exists: true}});
          if(message_content == null) return;

          const send = {
               code: "message_sent",
               data: {
                    server_id: server_id,
                    channel_id: channel_id,
                    message_id: message_id,
                    message_content: message_content
               }
          };

          stream.send(JSON.stringify(send, null, 5));
     });

     stream.on('message_deleted', async (server_id, channel_id, message_id) => {
          if(!ClientData.isAuthenticated) return;

          const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
          if(server_data == null) return;
          if(!Object.keys(server_data.users).includes(ClientData.uid)) return;

          const send = {
               code: "message_deleted",
               data: {
                    server_id: server_id,
                    channel_id: channel_id,
                    message_id: message_id
               }
          };

          stream.send(JSON.stringify(send, null, 5));
     });

     stream.on('message_edited', async (server_id, channel_id, message_id) => {
          if(!ClientData.isAuthenticated) return;

          const server_data = await server_collection.findOne({_id: {$eq: server_id, $exists: true}});
          if(server_data == null) return;
          if(!Object.keys(server_data.users).includes(ClientData.uid)) return;

          const message_data = await message_collection.findOne({_id: {$eq: message_id, $exists: true}});
          if(message_data == null) return;

          const send = {
               code: "message_edited",
               data: {
                    server_id: server_id,
                    channel_id: channel_id,
                    message_id: message_id,
                    message_content: message_data
               }
          };

          stream.send(JSON.stringify(send, null, 5));
     });
});

server.on("upgrade", (request, socket, head) => {
     console.log(`WebSocket request made to ${request.url}, handling.`);

     switch(request.url) {
          case "/ws":
               wss_v1.handleUpgrade(request, socket, head, (ws) => {
                    wss_v1.emit('connection', ws, request);
               });
               return;
          case "/ws-v2":
               WebSocketServerV2.handleUpgrade(request, socket, head, (ws) => {
                    WebSocketServerV2.emit('connection', ws, request);
               });
               return;
          case "/messaging-gateway":
               MessagingGatewayServerV1.handleUpgrade(request, socket, head, (ws) => {
                    MessagingGatewayServerV1.emit('connection', ws, request);
               });
               return;
          default:
               socket.destroy();
               return;
     }
});

console.log("Initialized WebSockets v1 and v2.");


function wsv1_sendStringToClient(id, data) {
     if(!Object.keys(ws_connected_clients).includes(id)) return;

     const client = ws_connected_clients[id];

     client.socket.send(data);
}

function wsv1_broadcastStringToAllClients(data) {
     for (let index = 0; index < Object.keys(ws_connected_clients).length; index++) {
          const element = ws_connected_clients[Object.keys(ws_connected_clients)[index]];
          element.socket.send(data);          
     }
}

function getClients() {
     return ws_connected_clients;
}

const { MongoClient } = require('mongodb');
const { MatchmakingModes } = require('./routers/matchmaking');

const uri = `mongodb+srv://CVRAPI%2DDIRECT:${process.env.MONGOOSE_ACCOUNT_PASSWORD}@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
     useNewUrlParser: true,
     useUnifiedTopology: true
});

client.connect(async (error) => {
     if(error) {
          console.error(`Failed to connect to MongoDB - fatal\n` + error);
          helpers.auditLog(`Failed to connect to MongoDB - fatal\n` + error, false);
          process.exit(1);
     }

     console.log("MongoDB Connection Established.");

     require('firebase/app').initializeApp(require('./env').firebaseConfig);

     const auth = firebaseAuth.getAuth();

     const firebaseAuthUser = await firebaseAuth.signInWithEmailAndPassword(auth, process.env.FIREBASE_EMAIL, process.env.FIREBASE_API_SECRET);

     if(typeof firebaseAuthUser.user.uid == 'undefined') {
          helpers.auditLog('Failed to connect to Firebase - fatal');
          console.error('Failed to connect to Firebase - fatal');
          process.exit(1);
     }

     console.log('Firebase Connection Established.');

     module.exports = {
          sendStringToClient: wsv1_sendStringToClient,
          mongoClient: client,
          getClients: getClients,
          MessagingGatewayServerV1: MessagingGatewayServerV1
     };
     
     process.on('beforeExit', function () {
          helpers.auditLog("Server exit.", false);
     });
     
     process.on('uncaughtException', function (exception) {
          helpers.auditLog(`Uncaught exception in server.\nException: \`\`\`${exception}\`\`\``, false);
          console.error(exception);
     });
     
     process.on('SIGINT', function () {
          var Instances = matchmaking.GetInstances("*");

          if(Instances.length > 1) { // Maximum length of ONE because of the default instance for intellisense testing.
               console.log("Server kill command rejected - there are players online with instances active.\nWait for the instances to close or use SIGKILL / SIGTERM");
               return;
          }

          helpers.auditLog("Server killed from command line. Exiting in 0.25 seconds. (250ms)", false)
     
          setTimeout(() => process.exit(), 250);
     });
});