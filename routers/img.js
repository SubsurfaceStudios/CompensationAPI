const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');

router.post("/upload/:others/:roomId/:roomName", middleware.authenticateToken, async (req, res) => {
     var timestamp = Date.now();
     var dir = fs.readdirSync("./data/images/");
     
     var {others, roomName, roomId} = req.params;

     if(!others) others = "[]";
     others = JSON.parse(others);

     if(!req.files)
          return res.status(400).send("Request does not contain any files.");
     
     if(!Array.isArray(req.files)) 
     {   
          return res.status(400).send("Failed to parse files.");
     }
     var filesSafe = Array.from(req.files);

     if(filesSafe.length > 1)
          return res.status(400).send("You can only upload one image at a time.");
     var file = filesSafe.img;

     if(file.mimetype !== "image/png")
          return res.status(400).send("Sent file is not an image!");
          
     const filename = `${Math.floor(dir.length / 2) + 1}`;

     const authordata = helpers.PullPlayerData(req.user.id);

     var dotfiledata = {
          AuthorId: req.user.id,
          UploadTime: timestamp,
          TaggedPlayers: others,
          AuthorUsername: authordata.public.username,
          AuthorNickname: authordata.public.nickname,
          RoomName: roomName,
          RoomId: roomId,
          PhotoId: `${filename}`,
          UploadTimePrettyPrint: Date.now().toLocaleString(),
          privacy: 'public'
     };

     if(!fs.existsSync(`data/images/${filename}.png`)) {
          file.mv(`data/images/${filename}.png`);
          fs.writeFileSync(`data/images/.${filename}`, JSON.stringify(dotfiledata));
          return res.status(200).send();
     }
     res.sendStatus(500);
});

router.get("/:id/info", async (req, res) => {
     const {id} = req.params;
     let id_clean = sanitize(id);
     if(!fs.existsSync(`data/images/.${id_clean}`)) return res.status(404).send("Image with that ID does not exist.");
     res.status(200).send(fs.readFileSync(`data/images/.${id_clean}`));
});

router.get("/:id", async (req, res) => {
     const {id} = req.params;
     let id_clean = sanitize(id);
     if(!fs.existsSync(`data/images/${id_clean}.png`)) return res.status(404).send("Image with that ID does not exist.");
     res.sendFile(`${__dirname}/data/images/${id_clean}.png`);
});

module.exports = router;