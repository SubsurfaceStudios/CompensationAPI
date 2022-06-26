const router = require('express').Router();
const middleware = require('../middleware');
const config = require('../config.json');
const crypto = require('node:crypto');
const proc = require('node:child_process');

//Check if a token is valid as developer.
router.get("/check", middleware.authenticateDeveloperToken, async (req, res) => {
    return res.status(200).send("This token is verified as Developer.");
});


router.post("/update", async (req, res) => {
    if(!config.development_mode) return res.status(403).send({"code": "unauthorized", "message": "This is a production server, and therefore cannot be automatically restarted."});

    const sha256 = "sha256=" + crypto.createHmac('sha256', process.env.GITHUB_SECRET)
        .update(req.body)
        .digest('hex');
    const matches = crypto.timingSafeEqual(sha256, req.headers["X-Hub-Signature-256"]);
    if(!matches) return res.status(403).send({"code": "unauthorized", "message": "Wait a minute, you're not GitHub!"});


    proc.exec("git pull && npm i");
    res.sendStatus(200);
    process.exit(0);
});

module.exports = router;