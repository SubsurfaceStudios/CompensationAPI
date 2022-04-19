const router = require('express').Router();
const uuid = require('uuid');
const middleware = require('../middleware');

router.get("/:room_id/:subroom_id/public-instances", middleware.authenticateToken, async (req, res) => {
     try {     
          const {room_id, subroom_id} = req.params;

          const instances = await GetInstances(room_id);
          const filtered = instances.filter(item => item.SubroomId == subroom_id && item.MatchmakingMode == MatchmakingModes.Public);
          const mapped = filtered.map(item => {
               return {
                    instance_id: item.InstanceId,
                    ttl: item.TTL,
                    persistent: item.Persistent,
                    max_players: item.MaxPlayers,
                    players: item.Players.length,
               };
          })

          res.status(200).json(mapped);
     } catch (ex) {
          res.sendStatus(500);
          throw ex;
     }
});

router.get("/:room_id/:subroom_id/all-instances", middleware.authenticateDeveloperToken, async (req, res) => {
     try {     
          const {room_id, subroom_id} = req.params;

          const instances = await GetInstances(room_id);
          const filtered = instances.filter(item => item.SubroomId == subroom_id);
          const mapped = filtered.map(item => {
               return {
                    instance_id: item.InstanceId,
                    ttl: item.TTL,
                    persistent: item.Persistent,
                    max_players: item.MaxPlayers,
                    players: item.Players.length,
               };
          })

          res.status(200).json(mapped);
     } catch (ex) {
          res.sendStatus(500);
          throw ex;
     }
});



// yes this is literally just an enum
const MatchmakingModes = {
     Public: 0,
     Unlisted: 1,
     Private: 2,
     Locked: 3
};

// YES, I'M AWARE
// The fact that this system is entirely in-memory and therefore volatile is INTENTIONAL.
// By design, when the API goes down, all users are removed from the game due to their websockets disconnecting.
// This prevents failed API calls and cheating by faking a websocket connection.
// HOWEVER - This also means that instances created by Photon will slowly be removed from the room list when all users are disconnected.
// This means that the RoomSessions dictionary will be OUT OF DATE if it persists.
// Therefore, it is in memory. This allows for both faster read/writes, better class implementation, more intellisense options,
// and preventing the aforementioned persistence issues.

// "Well, just make it so Photon Instances never expire, and you can persist as long as you like"
// THIS IS A WASTE OF RESOURCES. It may also incur additional fees from Photon.
class RoomSession {
     // Options:
     // * public
     // * unlisted
     // * private
     // * locked
     RoomId = "0"; // The room the instance is in.
     SubroomId = "home"
     MatchmakingMode; // How players can access this instance. Private by default, meaning you cannot join unless you have an invite.
     Players; // The current players inside the instance.
     MaxPlayers; // The maximum number of players the instance can contain.
     Age; // Age of the instance.
     TTL;
     Persistent;
     FlaggedForRemoval;
     
     InstanceId;
     JoinCode;

     BeginEventLoop() {
          setInterval(this.EventLoop, 500);
          setInterval(this.AutomaticInstanceCleanup, this.TTL);
     }
     async EventLoop() {
          this.Age += 500;
     }
     AddPlayer(id) {
          if(typeof id !== 'string') throw new TypeError("Invalid User ID input in AddPlayer - Parameter 'id' must be a string.");
          if(!this.Players.includes(id)) this.Players.push(id);
     }
     RemovePlayer(id) {
          if(typeof id !== 'string') throw new TypeError("Invalid User ID input in RemovePlayer - Parameter 'id' must be a string.");
          var index = this.Players.findIndex(item => item == id);
          this.Players.splice(index);
     }
     AutomaticInstanceCleanup() {
          if(this.Persistent || this.Age < this.TTL) return;

          if(typeof this.Players == 'undefined') this.Players = [];
          if(this.Players.length < 1) {
               // Makes an instance unjoinable and begins the process of removing it.
               this.MatchmakingMode = MatchmakingModes.Locked;
               this.FlaggedForRemoval = true;
          }
     }
     ManualInstanceCleanup() {
          // Prevent weird behaviour with undefined instances.
          if(this.Players.length > 0) return;

          // Makes an instance unjoinable and begins the process of removing it.
          this.MatchmakingMode = MatchmakingModes.Locked;
          this.FlaggedForRemoval = true;
     }

     constructor(RoomId, SubroomId, MatchmakingMode, TTL, Persistent, MaxPlayers) {
          this.RoomId = RoomId;
          this.SubroomId = SubroomId;
          this.MatchmakingMode = MatchmakingMode;
          this.Players = [];
          this.MaxPlayers = MaxPlayers;
          this.Age = 0;
          this.TTL = TTL;
          this.Persistent = Persistent;
          this.FlaggedForRemoval = false;

          this.InstanceId = uuid.v1();
          this.JoinCode = `CVR_ROOM.${this.RoomId}.INSTANCE.${this.InstanceId}`;

          setTimeout(() => this.BeginEventLoop(), 50);
     }
}

var RoomInstances = Object.create(null);

setInterval(CleanupInstances, 300 * 1000);

async function CleanupInstances() {
     console.log("Initiating automatic instance cleanup.");
     var CleanedInstances = 0;
     for(let RoomIdIndex = 0; RoomIdIndex < Object.keys(RoomInstances).length; RoomIdIndex++) {
          var RoomId = RoomInstances[RoomIdIndex];
          RoomId = RoomId.filter(item => {
               if(item.FlaggedForRemoval) {
                    console.log(`Removed flagged instance of room ${item.RoomId} with id ${item.InstanceId} and join code ${item.JoinCode}`);
                    CleanedInstances++;
                    return false;
               }
               return true;
          });
     }
     console.log(`Finished cleanup of instances, cleared ${CleanedInstances} instances in total.`);
}

async function GetInstances(RoomId) {
     if(RoomId == null) {
          var instances = [];
          Object.keys(RoomInstances).forEach(element => {
               instances.push(RoomInstances[element]);
          });
          return instances;
     }
     if(!Object.keys(RoomInstances).includes(RoomId)) return [];
     return RoomInstances[RoomId];
}

async function GetInstanceById(RoomId, InstanceId) {
     return RoomInstances[RoomId].find(item => item.InstanceId == InstanceId);
}

async function GetInstanceByJoinCode(RoomId, JoinCode) {
     return RoomInstances[RoomId].find(item => item.JoinCode == JoinCode);
}

async function SetInstances(RoomId, InstanceList) {
     RoomInstances[RoomId] = InstanceList;
}

async function SetInstance(RoomId, InstanceId, Instance) {
     if(!Object.keys(RoomInstances).includes(RoomId)) RoomInstances[RoomId] = [];

     var index = RoomInstances[RoomId].findIndex(item => item.InstanceId == InstanceId);
     if(index < 0) RoomInstances[RoomId].push(Instance);
     else RoomInstances[RoomId][index] = Instance;
}

async function CreateInstance(RoomId, SubroomId, MatchmakingMode, TTL, Persistent, MaxPlayers) {
     if(!Object.keys(RoomInstances).includes(RoomId)) RoomInstances[RoomId] = [];

     const room = new RoomSession(RoomId, SubroomId, MatchmakingMode, TTL, Persistent, MaxPlayers);
     RoomInstances[RoomId].push(room);

     console.log(`New instance of room ${RoomId} created with InstanceId of ${room.InstanceId} and a join code of ${room.JoinCode}`);
     return room;
}

module.exports = {
     router: router,
     MatchmakingModes: MatchmakingModes,
     GetInstances: GetInstances,
     GetInstanceById: GetInstanceById,
     GetInstanceByJoinCode: GetInstanceByJoinCode,
     SetInstances: SetInstances,
     SetInstance: SetInstance,
     CreateInstance: CreateInstance
};