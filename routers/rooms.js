const router = require('express').Router();
const {authenticateDeveloperToken, authenticateToken, authenticateToken_internal, authenticateToken_optional} = require('../middleware');
const firebaseStorage = require('firebase/storage');
const Fuse = require('fuse.js');

// Base URL: /api/rooms/...

const roomTemplate = {
     _id: "undefined_room",
     name: "undefined_room",
     description: "This room is a blank canvas. Make it into whatever you like!",
     creator_id: "16",
     tags: [],
     created_at: new Date(0),
     homeSubroomId: "home",
     subrooms: {},
     userPermissions: {},
     rolePermissions: {
          everyone: {
               viewAndJoin: false
          }
     }
};

router.route("/room/:room_id/info")
     .get(authenticateToken_optional, async (req, res) => {
          try {
               const {room_id} = req.params;

               const {mongoClient} = require('../index');
               const db = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

               const room_collection = db.collection("rooms");

               const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}});
               if(room == null) return res.status(404).send({message: "room_not_found"});

               const userPermissions = room.userPermissions;
               const rolePermissions = room.rolePermissions;

               if(typeof req.user != 'undefined') {
                    const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
                    const permissions = rolePermissions[role];

                    if(!permissions.viewAndJoin && req.user.id != room.creator_id) return res.status(403).send({message: "invalid_permissions"});
               } else {
                    const permissions = rolePermissions.everyone;

                    if(!permissions.viewAndJoin) return res.status(403).send({message: "invalid_permissions"});
               }

               // refetch the room using projection so we're not exposing permissions and subroom data to the user
               const room_visible = await room_collection.findOne({_id: {$eq: room_id, $exists: true}}, {projection: {_id: 1, name: 1, description: 1, creator_id: 1, tags: 1, created_at: 1, visits: 1, homeSubroomId: 1}});
               return res.status(200).json(room_visible);
          } catch (ex) {
               res.sendStatus(500);
               throw ex;
          }
     });

router.route("/room/:room_id/subrooms/:subroom_id/download")
     .get(authenticateToken, async (req, res) => {
          try {
               const {room_id, subroom_id} = req.params;

               const {mongoClient: client} = require('../index');
               const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

               const room_collection = db.collection("rooms");

               const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}});
               if(room == null) return res.status(404).send({message: "room_not_found"});

               // check permissions before checking the subroom, so that you can't figure out subroom names using API spam
               const userPermissions = room.userPermissions;
               const rolePermissions = room.rolePermissions;

               const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
               const permissions = rolePermissions[role];

               if(!permissions.viewAndJoin && req.user.id != room.creator_id) return res.status(403).send({message: "invalid_permissions"});
               
               if(!Object.keys(room.subrooms).includes(subroom_id)) return res.status(404).send({message: "subroom_not_found"});

               const subroom = room.subrooms[subroom_id];

               const storage = firebaseStorage.getStorage();
               const ref = firebaseStorage.ref(storage, `/rooms/${room_id}/subrooms/${subroom_id}/saves/${subroom.publicVersionId}.json`);

               var arrayBuffer = await firebaseStorage.getBytes(ref);
               var buffer = Buffer.from(arrayBuffer);
               
               res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Length': buffer.length
               });
               return res.end(buffer);
          } catch (ex) {
               res.sendStatus(500);
               throw ex;
          }
     });

router.get("/search", authenticateToken_optional, async (req, res) => {
     const {mode, query} = req.query;
     const {mongoClient: client} = require('../index');

     const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
     const rooms_collection = db.collection("rooms");

     var all = await rooms_collection.find({}, {sort: {visits: 1}, projection: {_id: 1, name: 1, description: 1, creator_id: 1, tags: 1, created_at: 1, visits: 1, homeSubroomId: 1}}).toArray();
     all = all.filter(item => {
          const userPermissions = item.userPermissions;
          const rolePermissions = item.rolePermissions;

          if(typeof req.user != 'undefined') {
               const role = Object.keys(userPermissions).includes(req.user.id) ? userPermissions[req.user.id] : "everyone";
               const permissions = rolePermissions[role];
               return permissions.viewAndJoin;
          } else {
               const permissions = rolePermissions.everyone;
               return permissions.viewAndJoin;
          }
     });

     switch(mode) {
          case "search":
               const fuse = new Fuse(all, {
                    includeScore: false,
                    keys: ["name"],
               });
               const result = fuse.search(query);

               return res.status(200).json(result.map(item => item.item));
          case "originals":
               return res.status(200).json(all.filter(room => room.creator_id == "16"));
          case "most-visited":
               return res.status(200).json(all);
          default:
               return res.status(400).json({message: "invalid_mode"});
     }
});

module.exports = {
     Router: router
};