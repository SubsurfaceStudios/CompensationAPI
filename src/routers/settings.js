const { PullPlayerData, PushPlayerData } = require('../helpers');
const { authenticateToken } = require('../middleware');

const router = require('express').Router();

router.get("/all", authenticateToken, async (req, res) => {
    try {
        let data = await PullPlayerData(req.user.id);

        if (typeof data.settings == 'undefined') return res.status(200).json({});

        return res.status(200).json(data.settings);
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "An internal server error occurred and we were unable to process your request. Please try again later or contact the API team."
        });
    } 
});

router.post("/:setting/set", authenticateToken, async (req, res) => {
    try {
        let { value } = req.body;
        let { setting } = req.params;
        
        if (typeof value != 'string') return res.status(400).json({
            code: "invalid_value",
            message: "Unable to set value of setting, value must be a string."
        });

        let data = await PullPlayerData(req.user.id);
        
        if (typeof data.settings == 'undefined') data.settings = {};

        data.settings[setting] = value;

        await PushPlayerData(req.user.id, data);

        return res.status(200).json({
            code: "success",
            message: "The operation was successful."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "An internal server error occurred and we were unable to process your request. Please try again later or contact the API team."
        });
    }
});

router.post("/flush", authenticateToken, async (req, res) => {
    try {
        if (typeof req.body != 'object') return res.status(400).json({
            code: "invalid_input",
            message: "Failed to flush settings - no valid body"
        });

        if (Array.isArray(req.body)) return res.status(400).json({
            code: "invalid_input",
            message: "Failed to flush settings - no valid body"
        });

        let data = await PullPlayerData(req.user.id);

        data.settings = req.body;

        await PushPlayerData(req.user.id, data);

        return res.status(200).json({
            code: "success",
            message: "Settings flushed successfully."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "An internal server error occurred and we were unable to process your request. Please try again later or contact the API team."
        });   
    }
});

module.exports = router;