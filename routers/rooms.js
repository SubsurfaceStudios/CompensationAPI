const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const {getBytes, getStorage, ref} = require('firebase/storage');

const OncePerHour = rateLimit.rateLimit({
     "windowMs": 1 * 60 * 60 * 1000,
     "max": 1,
     "message": "This endpoint is limited to only 1 request per hour. Please try again in 60 minutes.",
     "standardHeaders": true,
     "legacyHeaders": true
});

router.post("/create", OncePerHour, middleware.authenticateDeveloperToken, async (req, res) => {
     try {
          return res.sendStatus(501);
     } catch {
          return res.sendStatus(500);
     }
});

router.get("/:id/public-info", middleware.authenticateDeveloperToken, async (req, res) => {
     try {
          var {id} = req.params;
          const playerData = helpers.PullPlayerData(req.user.id);

          try {
               id = parseInt(id);
               if(isNaN(id)) return res.status(400).send({message: "Invalid room ID specifed."});
          } catch {
               return res.status(500).send({message: "Failed to parse room ID."});
          }

          const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
          var collection = db.collection("configuration");

          const RoomCount = await collection.findOne({_id: "RoomCount"}).count;
          if(id > RoomCount || id < 0) return res.status(400).send({message: "Room does not exist."});

          collection = db.collection("rooms");

          var room = await collection.findOne({_id: id});
          if(typeof room == 'undefined') return res.status(404).send({message: "Room does not exist or cannot be read from the database."});

          if(room.metadata.permissions[req.user.id] == "owner" || playerData.private.availableTags.includes("Developer") || playerData.private.availableTags.includes("Community Support Team")) return res.status(200).json(room.public);

          var permission = "everyone";
          if(room.metadata.permissions.includes(req.user.id)) permission = room.metadata.permissions[req.user.id];

          const playerPermissionsTable = room.metadata.permissionTable[permission];

          if(!playerPermissionsTable.viewInfo) return res.status(403).send({message: "You do not have permission to view information about this room."});

          res.status(200).json(room.public);
     } catch {
          return res.sendStatus(500);
     }
});

router.get("/:id/user-permissions", middleware.authenticateDeveloperToken, async (req, res) => {
     try {
          var {id} = req.params;
          const playerData = helpers.PullPlayerData(req.user.id);

          try {
               id = parseInt(id);
               if(isNaN(id)) return res.status(400).send({message: "Invalid room ID specifed."});
          } catch {
               return res.status(500).send({message: "Failed to parse room ID."});
          }

          const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
          var collection = db.collection("configuration");

          const RoomCount = await collection.findOne({_id: "RoomCount"}).count;
          if(id > RoomCount || id < 0) return res.status(400).send({message: "Room does not exist."});

          collection = db.collection("rooms");

          var room = await collection.findOne({_id: id});
          if(typeof room == 'undefined') return res.status(404).send({message: "Room does not exist or cannot be read from the database."});

          if(room.metadata.permissions[req.user.id] == "owner" || playerData.private.availableTags.includes("Developer") || playerData.private.availableTags.includes("Community Support Team")) return res.status(200).json(room.metadata.permissions);

          var permission = "everyone";
          if(room.metadata.permissions.includes(req.user.id)) permission = room.metadata.permissions[req.user.id];

          const playerPermissionsTable = room.metadata.permissionTable[permission];

          if(!playerPermissionsTable.editPermissions) return res.status(403).send({message: "You do not have permission to view information about this room."});

          res.status(200).json(room.metadata.permissions);
     } catch {
          res.sendStatus(500);
     }
});

router.get("/:id/permissions-table", middleware.authenticateDeveloperToken, async (req, res) => {
     try {
          var {id} = req.params;
          const playerData = helpers.PullPlayerData(req.user.id);

          try {
               id = parseInt(id);
               if(isNaN(id)) return res.status(400).send({message: "Invalid room ID specifed."});
          } catch {
               return res.status(500).send({message: "Failed to parse room ID."});
          }

          const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
          var collection = db.collection("configuration");

          const RoomCount = await collection.findOne({_id: "RoomCount"}).count;
          if(id > RoomCount || id < 0) return res.status(400).send({message: "Room does not exist."});

          collection = db.collection("rooms");

          var room = await collection.findOne({_id: id});
          if(typeof room == 'undefined') return res.status(404).send({message: "Room does not exist or cannot be read from the database."});

          if(room.metadata.permissions[req.user.id] == "owner" || playerData.private.availableTags.includes("Developer") || playerData.private.availableTags.includes("Community Support Team")) return res.status(200).json(room.metadata.permissionTable);

          var permission = "everyone";
          if(room.metadata.permissions.includes(req.user.id)) permission = room.metadata.permissions[req.user.id];

          const playerPermissionsTable = room.metadata.permissionTable[permission];

          if(!playerPermissionsTable.editPermissions) return res.status(403).send({message: "You do not have permission to view information about this room."});

          res.status(200).json(room.metadata.permissionTable);
     } catch {
          res.sendStatus(500);
     }
});

router.get("/:id/subrooms", middleware.authenticateDeveloperToken, async (req, res) => {
     try {
          var {id} = req.params;
          const playerData = helpers.PullPlayerData(req.user.id);

          try {
               id = parseInt(id);
               if(isNaN(id)) return res.status(400).send({message: "Invalid room ID specifed."});
          } catch {
               return res.status(500).send({message: "Failed to parse room ID."});
          }

          const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
          var collection = db.collection("configuration");

          const RoomCount = await collection.findOne({_id: "RoomCount"}).count;
          if(id > RoomCount || id < 0) return res.status(400).send({message: "Room does not exist."});

          collection = db.collection("rooms");

          var room = await collection.findOne({_id: id});
          if(typeof room == 'undefined') return res.status(404).send({message: "Room does not exist or cannot be read from the database."});

          if(room.metadata.permissions[req.user.id] == "owner" || playerData.private.availableTags.includes("Developer") || playerData.private.availableTags.includes("Community Support Team")) return res.status(200).json(room.metadata.subrooms);

          var permission = "everyone";
          if(room.metadata.permissions.includes(req.user.id)) permission = room.metadata.permissions[req.user.id];

          const playerPermissionsTable = room.metadata.permissionTable[permission];

          if(!playerPermissionsTable.join) return res.status(403).send({message: "You do not have permission to view information about this room."});

          res.status(200).json(room.metadata.subrooms);
     } catch {
          res.sendStatus(500);
     }
});

router.get("/:roomId/subrooms/:subroomId/download-public-version", middleware.authenticateDeveloperToken, async (req, res) => {
     try { 
          var {roomId, subroomId} = req.params;
          const room = GetRoomData(roomId);
          if(room == null) return res.status(404).send({message: "Room does not exist."});

          const userPermissions = room.metadata.permissions;
          const permissionsTable = room.metadata.permissionsTable;

          var localUserPermissionsKey = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
          const localUserPermissionsValue = permissionsTable[localUserPermissionsKey];

          if(!localUserPermissionsValue.join) return res.status(403).send({message: "You do not have access to that room."});

          if(!room.metadata.subrooms.includes(subroomId)) return res.status(404).send({message: "Subroom not found."});

          const subroom = room.metadata.subrooms[subroomId];
          const versionId = subroom.currentVersionId;

          if(typeof subroom.versions[versionId].filename !== 'string') return res.status(204).send({message: "This room does not have any custom room data to send. Load the base scene as-is."});

          const pathRefString = subroom.versionFolderPath + subroom.versions[versionId].filename;

          const storage = getStorage();
          const pathRef = ref(storage, pathRefString);

          const bytes = await getBytes(pathRef);

          const buffer = Buffer.from(bytes);

          res.writeHead(200, {
               'Content-Type': 'application/json',
               'Content-Length': buffer.length
          });
          return res.end(buffer);
     } catch (ex) {
          console.log(ex);
          return res.sendStatus(500);
     }
})

async function GetRoomData(RoomId) {
     try {
          RoomId = parseInt(RoomId);
          if(isNaN(RoomId)) return null;
     } catch {
          return null;
     }

     const db = require('../index').mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
     var collection = db.collection("configuration");
     const RoomCount = await collection.findOne({_id: "RoomCount"}).count;
     if(RoomId > RoomCount || RoomId < 0) return null;

     collection = db.collection("rooms");
     var room = await collection.findOne({_id: RoomId});

     
     if(typeof room == 'undefined') return null;
     return room;
}

module.exports = {
     router: router,
     GetRoomData: GetRoomData
};