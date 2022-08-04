const router = require('express').Router();
const { PullPlayerData, PushPlayerData } = require('../helpers');
const middleware = require('../middleware');
const config = require('../config.json');
const { timingSafeEqual } = require('node:crypto');
const { execSync } = require('node:child_process');

//Check if a token is valid as developer.
router.get("/check", middleware.authenticateDeveloperToken, async (req, res) => {
    return res.status(200).send("This token is verified as Developer.");
});

router.post("/accounts/:id/inventory-item", middleware.authenticateDeveloperToken, async (req, res) => {
    try {
        const {id} = req.params;
        const {item_id, count} = req.body;

        if(typeof count != 'number') 
            return res.status(400).json({
                code: "invalid_input",
                message: "Parameter `count` not specified or not an integer."
            });
        if(typeof item_id != 'string')
            return res.status(400).json({
                code: "invalid_input",
                message: "Parameter `item_id` not specified or not a string."
            });

        let data = await PullPlayerData(id);
        if(data == null) 
            return res.status(404).json({
                code: "not_found",
                message: "No account exists with that ID."
            });

            
        if(count < 1) delete data.econ.inventory[item_id];
        else data.econ.inventory[item_id] = count;

        await PushPlayerData(id, data);

        res.status(200).json({
            code: "success",
            message: "The operation was successful."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An unknown internal server error occured. Please try again later."
        });
        throw ex;
    }
});

router.post("/pull-origin", async (req, res) => {
    try {
        let Authentication = req.headers.authorization;
        let key = config.development_mode ? process.env.DEV_PULL_SECRET : process.env.PRODUCTION_PULL_SECRET;

        let success = timingSafeEqual(Buffer.from(key), Buffer.from(Authentication));

        if(!success) return res.status(403).json({
            code: "invalid_secret",
            message: "You do not have authorization to pull changes."
        });

        execSync("git pull");

        return res.status(200).json({
            code: "success",
            message: "The operation succeeded."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "An internal server error occurred and we could not process your request."
        });
        throw ex;
    }
});



module.exports = router;