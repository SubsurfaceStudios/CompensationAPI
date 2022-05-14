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
     AgeWithoutPlayer;
     TTL;
     Persistent;
     FlaggedForRemoval;
     
     InstanceId;
     JoinCode;

     GlobalInstanceId;

     BeginEventLoop() {
          setInterval(this.EventLoop, 500);
          setInterval(this.AutomaticInstanceCleanup, this.TTL);
     }
     async EventLoop() {
          this.Age += 500;

          // TTL
          this.AgeWithoutPlayer = this.Players.length > 0 ? 0 : this.AgeWithoutPlayer + 500;
     }
     AddPlayer(id) {
          if(typeof id !== 'string') throw new TypeError("Invalid User ID input in AddPlayer - Parameter 'id' must be a string.");
          if(!this.Players.includes(id)) this.Players.push(id);
     }
     RemovePlayer(id) {
          if(typeof id !== 'string') throw new TypeError("Invalid User ID input in RemovePlayer - Parameter 'id' must be a string.");
          var index = this.Players.indexOf(id);
          this.Players.splice(index);
     }
     AutomaticInstanceCleanup() {
          // damn i really messed up how TTL should work originally haha
          if(this.Persistent || this.AgeWithoutPlayer < this.TTL) return;

          if(typeof this.Players == 'undefined') this.Players = [];
          if(this.Players.length < 1) {
               // Makes an instance unjoinable and begins the process of removing it.
               this.InstanceCleanup();
          }
     }
     InstanceCleanup() {
          // Prevent weird behaviour with undefined instances.
          if(this.Players.length > 0) return;

          // Makes an instance unjoinable and begins the process of removing it.
          this.MatchmakingMode = MatchmakingModes.Locked;
          this.FlaggedForRemoval = true;

          if(typeof GlobalRoomInstances[RoomId] != 'object') return;
          if(typeof GlobalRoomInstances[RoomId][this.GlobalInstanceId] != 'object') return;

          // this is a monstrosity but ah well
          delete GlobalRoomInstances[this.RoomId][this.GlobalInstanceId][this.SubroomId];

          console.log(`CLEANUP OF INSTANCE ${this.InstanceId}`);
     }

     constructor(RoomId, SubroomId, MatchmakingMode, TTL, Persistent, MaxPlayers, GlobalInstanceId = null) {
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

          // global instance handling
          this.GlobalInstanceId = GlobalInstanceId == null ? uuid.v1() : GlobalInstanceId;

          if(typeof GlobalRoomInstances[RoomId] != 'object') GlobalRoomInstances[RoomId] = {};

          if(typeof GlobalRoomInstances[RoomId][this.GlobalInstanceId] != 'object') 
               GlobalRoomInstances[RoomId][this.GlobalInstanceId] = {SubroomId: this.InstanceId};
          else 
               GlobalRoomInstances[RoomId][this.GlobalInstanceId][SubroomId] = this.InstanceId;

          setTimeout(() => this.BeginEventLoop(), 50);
     }
}

var SubroomInstances = Object.create(null);

// please don't judge me i am very confused and don't feel like drawing this on paper
const figuring_out_my_life = {
     // first layer is room ids
     "4b7d3810-be88-11ec-b306-43a037ec5b07": { // apartment
          // second layer is global room instance ids
          "hahahahahhahahaha i am going batshit insane": {
               // third layer is subroom ids mapped to instance ids
               "home": "49555110-d3a7-11ec-aee1-3f535ae7f63a"
               // now if we try to join the 'home' subroom in the Apartment while in the apartment, we will be taken here.
               // if the instance is full, we will create a new global room instance.
          }
     }
};

// this will mock the data structure above, but at runtime
var GlobalRoomInstances = Object.create(null);

setInterval(CleanupInstances, 300 * 1000);

async function CleanupInstances() {
     for(let RoomIdIndex = 0; RoomIdIndex < Object.keys(SubroomInstances).length; RoomIdIndex++) {
          var RoomId = Object.keys(SubroomInstances)[RoomIdIndex];
          
          var instances = SubroomInstances[RoomId];
          instances = instances.filter(item => !item.FlaggedForRemoval);
          SubroomInstances[RoomId] = instances;
     }
}

async function GetInstances(RoomId) {
     if(RoomId == null) {
          var instances = [];
          Object.keys(SubroomInstances).forEach(element => {
               instances.push(SubroomInstances[element]);
          });
          return instances;
     }
     if(!Object.keys(SubroomInstances).includes(RoomId)) return [];
     return SubroomInstances[RoomId];
}

async function GetInstanceById(RoomId, InstanceId) {
     return SubroomInstances[RoomId].find(item => item.InstanceId == InstanceId);
}

async function GetInstanceByJoinCode(RoomId, JoinCode) {
     return SubroomInstances[RoomId].find(item => item.JoinCode == JoinCode);
}

async function SetInstances(RoomId, InstanceList) {
     SubroomInstances[RoomId] = InstanceList;
}

async function SetInstance(RoomId, InstanceId, Instance) {
     if(!Object.keys(SubroomInstances).includes(RoomId)) SubroomInstances[RoomId] = [];

     var index = SubroomInstances[RoomId].findIndex(item => item.InstanceId == InstanceId);
     if(index < 0) SubroomInstances[RoomId].push(Instance);
     else SubroomInstances[RoomId][index] = Instance;
}

async function CreateInstance(RoomId, SubroomId, MatchmakingMode, TTL, Persistent, MaxPlayers) {
     if(!Object.keys(SubroomInstances).includes(RoomId)) SubroomInstances[RoomId] = [];

     const room = new RoomSession(RoomId, SubroomId, MatchmakingMode, TTL, Persistent, MaxPlayers);
     SubroomInstances[RoomId].push(room);

     console.log(`New instance of room ${RoomId} created with InstanceId of ${room.InstanceId} and a join code of ${room.JoinCode}`);
     return room;
}

module.exports = {
     router: router,
     MatchmakingModes: MatchmakingModes,
     SubroomInstances: SubroomInstances,
     GlobalRoomInstances: GlobalRoomInstances,
     GetInstances: GetInstances,
     GetInstanceById: GetInstanceById,
     GetInstanceByJoinCode: GetInstanceByJoinCode,
     SetInstances: SetInstances,
     SetInstance: SetInstance,
     CreateInstance: CreateInstance
};