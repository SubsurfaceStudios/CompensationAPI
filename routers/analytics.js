const router = require('express').Router();
const { PullPlayerData } = require('../helpers');
const { authenticateToken } = require('../middleware');
const { GetInstances } = require('./matchmaking');
const { readFileSync } = require('node:fs');
const RSA = require('node-rsa');
const cfg = require('../config.json');

const EXCEPTION_LOGGING_PUBLIC_KEY = new RSA().importKey(readFileSync(cfg.exception_logging_publickey_path).toString('utf-8'), cfg.exception_logging_publickey_format);

router.get("/account-count", async (req, res) => {
    const {mongoClient} = require('../index');
    const db = mongoClient.db(process.env.MONGOOSE_DATABASE_NAME);
    const size = await db.collection("accounts").countDocuments({});
    res.status(200).send(`${size}`);
});

router.get("/online-count", async (req, res) => {
    const clients = Object.keys(require('./ws/WebSocketServerV2').ws_connected_clients);
    res.status(200).send(`${clients.length}`);
});

router.get("/instance-count", async (req, res) => {
    const instances = await GetInstances(null);
    res.status(200).send(`${instances.length}`);
});

router.put("/exception-report", authenticateToken, async (req, res) => {
    let data = await PullPlayerData(req.user.id);
    if (data.settings.ALLOW_EXCEPTION_REPORTING !== "PERMIT") {
        res
            .setHeader("Link", "https://api.compensationvr.tk; rel=\"blocked-by\"")
            .status(451)
            .json({
                code: "denied_for_privacy_reasons",
                message: "Your settings do not currently permit us to accept automatic exception reports. The request has been blocked and no relevant information was logged besides a serverside stack trace for our team to investigate why this is occurring."
            });
        throw new Error("Exception report attempted when user does not permit automatic exception reporting - this is a privacy violation.");
    }

    try {
        const exception_data = {
            message: req.body.message,
            stack_trace: req.body.stack_trace
        };

        if (data.settings.EXCEPTION_REPORTING_DONT_ANONYMIZE === "true") {
            exception_data.PLAYER_ID = req.user.id;
        }

        const encrypted = EXCEPTION_LOGGING_PUBLIC_KEY.encrypt(JSON.stringify(exception_data), 'buffer');

        const client = require('../index').mongoClient;
        await client
            .db(process.env.MONGOOSE_DATABASE_NAME)
            .collection('exception_reports')
            .insertOne({
                data: encrypted
            });
        
        return res.status(200).json({
            code: "success",
            message: "Operation successful. Thank you for the report."
        });
    } catch (ex) {
        res.status(500).json({
            code: "internal_error",
            message: "An internal server error occurred and we were unable to serve your request. Please contact the API team at your next convenience."
        });
        throw ex;
    }
});

module.exports = router;
