const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');



router.get("/get/", middleware.authenticateToken, async (req, res) => {
    const id = req.user.id;

    const data = await helpers.PullPlayerData(id);
    var copiedNotifications = data.notifications;

    const now = Date.now();
    data.notifications = copiedNotifications.filter(x => {
        switch(x.template) {
            case "invite": 
                if(parseInt(x.parameters.sentAt) + (5 * 60 * 1000) < now) return false;
                return true;
            default:
                return true;
        }
    });
    if(data.notifications != copiedNotifications) await helpers.PushPlayerData(id, data);

    res.status(200).json(data.notifications);
});

module.exports = router;