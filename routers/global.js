const router = require('express').Router();
const middleware = require('../middleware');


router.route("/:key")
     .get(async (req, res) => {
          const { mongoClient } = require('../index');
          try {
               const { key } = req.params;
     
               const collection = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection("global");

               const doc = await collection.findOne({_id: {$eq: key, $exists: true}});

               if(doc == null) return res.status(404).send({message:"key_not_found"});
               if(key == "config") return res.status(200).json(doc.data);
               return res.status(200).send(`${doc.data}`);
          } catch {
               res.sendStatus(404);
          }
     })
     .post(middleware.authenticateDeveloperToken, async (req, res) => {
          const { mongoClient } = require('../index');
          try {
               const { key } = req.params;
               const { value } = req.body;

               const collection = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME).collection("global");

               collection.findOneAndUpdate({_id: key}, {data: value});

               return res.sendStatus(200);
          } catch (ex) {
               res.sendStatus(500);
               throw ex;
          }
     });
     
module.exports = router;