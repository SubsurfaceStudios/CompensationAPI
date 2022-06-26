const router = require('express').Router();
const middleware = require('../middleware');

//Check if a token is valid as developer.
router.get("/check", middleware.authenticateDeveloperToken, async (req, res) => {
    return res.status(200).send("This token is verified as Developer.");
});



module.exports = router;