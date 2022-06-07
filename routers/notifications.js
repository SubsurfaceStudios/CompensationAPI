const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');



router.get("/get/", middleware.authenticateToken, async (req, res) => {
    const id = req.user.id;

    const data = await helpers.PullPlayerData(id);

    if(typeof data.notifications !== 'object') return res.status(200).send("[]");

    res.status(200).json(data.notifications);
});

module.exports = router;