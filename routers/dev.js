const router = require('express').Router();
const { PullPlayerData, PushPlayerData } = require('../helpers');
const middleware = require('../middleware');

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

        data.econ.inventory[item_id] = count;

        await PushPlayerData(id, data);
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An unknown internal server error occured. Please try again later."
        });
        throw ex;
    }
});



module.exports = router;