const router = require('express').Router();
const {authenticateDeveloperToken} = require('../middleware');
const firebaseStorage = require('firebase/storage');
const Fuse = require('fuse.js');

// Base URL: /api/rooms/...

const roomTemplate = {
     _id: "",
     name: "",
     description: "",
     creator_id: "",
     tags: [],
     created_at: new Date(0)
};

router.route("/room/:room_id/info")
     .get(authenticateDeveloperToken, async (req, res) => {
          try {
               const {room_id} = req.params;

               const {mongoClient} = require('../index');
               const db = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);

               const room_collection = db.collection("rooms");

               const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}}, {projection: {_id: 1, name: 1, description: 1, creator_id: 1, tags: 1, created_at: 1, visits: 1, homeSubroomId: 1}});
               if(room == null) return res.status(404).send({message: "room_not_found"});

               return res.status(200).json(room);
          } catch (ex) {
               res.sendStatus(500);
               throw ex;
          }
     });

router.route("/room/:room_id/subrooms/:subroom_id/download")
     .get(authenticateDeveloperToken, async (req, res) => {
          try {
               const {room_id, subroom_id} = req.params;

               const {mongoClient: client} = require('../index');
               const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

               const room_collection = db.collection("rooms");

               const room = await room_collection.findOne({_id: {$eq: room_id, $exists: true}});
               if(room == null) return res.status(404).send({message: "room_not_found"});
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

router.get("/search", async (req, res) => {
     const {mode, query} = req.query;
     const {mongoClient: client} = require('../index');

     const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
     const rooms_collection = db.collection("rooms");

     const all = await rooms_collection.find({}, {sort: {visits: 1}, projection: {_id: 1, name: 1, description: 1, creator_id: 1, tags: 1, created_at: 1, visits: 1, homeSubroomId: 1}}).toArray();

     switch(mode) {
          case "search":
               const fuse = new Fuse(all, {
                    includeScore: false,
                    keys: ["name"],
               });
               const result = fuse.search(query);

               var final = [];
               result.foreach(item => final.push(item.item));
               return res.status(200).json(final);
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