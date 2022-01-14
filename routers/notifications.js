const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const fs = require('fs');
const BadWordList = JSON.parse(fs.readFileSync('./data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');



router.get("/get/", middleware.authenticateToken, async (req, res) => {
     const id = req.user.id;

     const data = helpers.PullPlayerData(id);

     if(data.notifications == null) return res.status(200).send("[]");

     res.status(200).json(data.notifications);
});

module.exports = router;