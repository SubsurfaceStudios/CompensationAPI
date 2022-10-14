const router = require('express').Router();
const { PullPlayerData, PushPlayerData } = require('../helpers');
const middleware = require('../middleware');
const config = require('../config.json');
const { execSync } = require('node:child_process');
const { authenticateTokenAndTag } = require('../middleware');

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
        let Authentication = req.headers.authorization.split(' ')[1];
        let key = config.development_mode ? process.env.DEV_PULL_SECRET : process.env.PRODUCTION_PULL_SECRET;

        if(Authentication.length != key.length || Authentication != key) return res.status(403).json({
            code: "invalid_secret",
            message: "You do not have authorization to pull changes."
        });

        execSync("git stash");
        execSync("git pull");
        execSync("npm i");

        res.status(200).json({
            code: "success",
            message: "The operation succeeded."
        });

        process.exit(0);
    } catch (ex) {
        res.status(500).json({
            code: "internal_server_error",
            message: "An internal server error occurred and we could not process your request."
        });
        throw ex;
    }
});

router.get("/quality-control/test-cases", authenticateTokenAndTag("QA Tester"), async (req, res) => {
    try {
        var { filter } = req.query;
        if (!filter) filter = "";

        const client = require('../index').mongoClient;

        const cases = client.db(process.env.MONGOOSE_DATABASE_NAME).collection("test_cases");

        const filters = filter.split("|");

        var collection_filter = {
            _id: { $exists: true },
            open: { $eq: true }
        };

        if (filters.includes("only_unassigned")) collection_filter.assignee = { $eq: null };
        if (filters.includes("assigned_to_me")) collection_filter.assignee = { $eq: req.user.id };

        if (filters.includes("include_closed")) delete collection_filter.open;

        var results = await cases.find(collection_filter).toArray();

        return res.status(200).json(results);
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we were unable to serve your request. Please inform the API team."
        });
        throw ex;
    }
});

router.post("/quality-control/test-case/:_id/relinquish", authenticateTokenAndTag("QA Tester"), async (req, res) => {
    try {
        const { _id } = req.params;

        const client = require('../index').mongoClient;

        const cases = client.db(process.env.MONGOOSE_DATABASE_NAME).collection("test_cases");

        var result = await cases.findOne(
            {
                _id: { $eq: _id, $exists: true }
            }
        );

        if (result == null) return res.status(404).json({
            code: "case_not_found",
            message: "Unable to find a test case with that ID."
        });

        if (result.assignee != req.user.id) return res.status(400).json({
            code: "not_assigned",
            message: "You are not assigned to this test case, and therefore cannot relinquish control of it."
        });

        await cases.updateOne(
            {
                _id: { $eq: _id, $exists: true }
            },
            {
                $set: {
                    assignee: null
                }
            }
        );

        return res.status(200).json({
            code: "success",
            message: "Successfully relinquished control of test case."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred. Please notify the API team immediately."
        });
        throw ex;
    }
});

router.post("/quality-control/test-case/:_id/assign-self", authenticateTokenAndTag("QA Tester"), async (req, res) => {
    try {
        const { _id } = req.params;

        const client = require('../index').mongoClient;

        const cases = client.db(process.env.MONGOOSE_DATABASE_NAME).collection("test_cases");

        var result = await cases.findOne(
            {
                _id: {$eq: _id, $exists: true}
            }
        );

        if (result == null) return res.status(404).json({
            code: "not_found" ,
            message: "Unable to locate test case with that ID."
        });

        if (result.assignee != null) return res.status(400).json({
            code: "already_assigned",
            message: "Somebody is already assigned to this test case."
        });

        await cases.updateOne(
            {
                _id: {$eq: _id, $exists: true}
            },
            {
                $set: {
                    assignee: req.user.id
                }
            }
        );

        return res.status(200).json({
            code: "success",
            message: "Successfully assigned self to test case."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we were unable to serve your request. Please alert the API team."
        });
        throw ex;
    }
});

router.post("/quality-control/test-case/:_id/set-status/:active", authenticateTokenAndTag("QA Tester"), async (req, res) => {
    try {
        const { _id, active } = req.params;

        const client = require('../index').mongoClient;

        const cases = client.db(process.env.MONGOOSE_DATABASE_NAME).collection("test_cases");

        var result = await cases.findOne(
            {
                _id: {$eq: _id, $exists: true}
            }
        );

        if (result.assignee != req.user.id && result.creator != req.user.id) return res.status(400).json({
            code: "not_assigned",
            message: "You are not assigned to this test case and you did not create it."
        });

        await cases.updateOne(
            {
                _id: { $eq: _id, $exists: true }
            },
            {
                $set: {
                    open: active == "open"
                }
            }
        );

        return res.status(200).json({
            code: "success",
            message: "Successfully set status of test case."
        })
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we could not serve your request. Please notify the API team."
        });
        throw ex;
    }
});

module.exports = router;