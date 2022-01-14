const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const BadWordList = JSON.parse(require('../data/external/badwords-master/array.json'));
const sanitize = require('sanitize-filename');

app.get("/get/", middleware.authenticateToken, async (req, res) => {
     const id = req.user.id;

     const data = helpers.PullPlayerData(id);

     if(data.notifications == null) return res.status(200).send("[]");

     res.status(200).json(data.notifications);
});

module.exports = router;