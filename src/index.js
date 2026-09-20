const express = require('express');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const helpers = require('./helpers');
const config = helpers.config;

const WebSocketV2_MessageTemplate = {
    code: "string",
    data: {}
};
exports.WebSocketV2_MessageTemplate = WebSocketV2_MessageTemplate;

const app = express();
app.set('trust proxy', 1);

var GlobalLimiter = RateLimit({
    windowMs: 1*60*1000,
    max: 250,
    standardHeaders: true,
    legacyHeaders: false
});

app.use(GlobalLimiter);

app.use(express.json({
    limit: '50mb'
}));
app.use(fileUpload({
    createParentPath: true,
    limit: '50mb'
}));

//#region routers

// /api/accounts/*
app.use("/api/accounts", require("./routers/accounts"));
// /api/auth/*
app.use("/api/auth", require('./routers/auth'));
// /dev/*
app.use("/dev", require('./routers/dev'));
// /api/global/*
app.use("/api/global", require('./routers/global'));
// /api/notifications/*
app.use("/api/notifications", require('./routers/notifications'));
// /img/*
app.use("/img", require('./routers/img'));
// /api/analytics/*
app.use("/api/analytics", require('./routers/analytics'));
// /api/social/*
app.use("/api/social", require('./routers/social'));
// /api/econ/*
const econ = require('./routers/econ');
app.use("/api/econ", econ.router);
// /api/matchmaking/*
const matchmaking = require('./routers/matchmaking');
app.use("/api/matchmaking", matchmaking.router);
// /api/rooms/*
const RoomsAPI = require('./routers/rooms');
app.use("/api/rooms", RoomsAPI.Router);
// /api/messaging/*
const messaging = require('./routers/messages');
app.use("/api/messaging", messaging.router);
// /api/settings/*
app.use("/api/settings", require('./routers/settings'));


//#endregion

//#region Miscellaneous Endpoints

//Server test call
app.get("/", async (req, res) => {
    return res.status(200).send("Pong!");
});


//Joke
app.get("/api/dingus", async(req, res) => {
    return res.status(200).send("You have ascended");
    //hmm
});

//#endregion

const server = app.listen(config.port ?? 8080, '0.0.0.0');

const { MongoClient } = require('mongodb');

const uri = config.database.mongodb_connection_string;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

client.connect().then(async (client) => {
    if (!client) {
        console.error(`Failed to connect to MongoDB - fatal\n`);
        helpers.auditLog(`Failed to connect to MongoDB - fatal\n`, false);
        process.exit(1);
    }
    
    console.log("MongoDB Connection Established.");
    server.on("upgrade", (request, socket, head) => {
        console.log(`WebSocket request made to ${request.url}, handling.`);
        
        switch (request.url) {
            case "/ws-v2":
                WebSocketServerV2.handleUpgrade(request, socket, head, (ws) => {
                    WebSocketServerV2.emit('connection', ws, request);
                });
                return;
            case "/messaging-gateway":
                MessagingGatewayServerV1.handleUpgrade(request, socket, head, (ws) => {
                    MessagingGatewayServerV1.emit('connection', ws, request);
                });
                return;
            default:
                socket.destroy();
                return;
        }
    });
    console.log('WebSockets initialized.');
    
    module.exports = {
        mongoClient: client,
        WebSocketV2_MessageTemplate: WebSocketV2_MessageTemplate
    };

    const { WebSocketServerV2 } = require("./routers/ws/WebSocketServerV2");
    const { MessagingGatewayServerV1 } = require("./routers/ws/MessagingGatewayServerV1");

    exports.MessagingGatewayServerV1 = MessagingGatewayServerV1;
    exports.WebSocketServerV2 = WebSocketServerV2;

    helpers.auditLog(`Server Init, API is ready at http://127.0.0.1:${config.port ?? 8080}/ \n:D`, false);
    
    process.on('beforeExit', () => {
        helpers.auditLog("Server exit.", false);
    });
                    
    process.on('uncaughtException', (exception) => {
        helpers.auditLog(`Uncaught exception in server.\nException:\n\`\`\`${exception}\`\`\``, false);
        console.error(exception);
    });

    process.on('SIGINT', () => {
        helpers.auditLog("Server killed from command line. Exiting in 0.25 seconds. (250ms)", false);
        
        setTimeout(() => process.exit(), 250);
    });
});