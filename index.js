require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const helpers = require('./helpers');
const firebaseAuth = require('firebase/auth');

const WebSocketV2_MessageTemplate = {
    code: "string",
    data: {}
};
exports.WebSocketV2_MessageTemplate = WebSocketV2_MessageTemplate;

const app = express();
app.set('trust proxy', 1);

var GlobalLimiter = RateLimit({
    windowMs: 1*60*1000,
    max: 100,
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

const config = require('./config.json');

//#region routers

var ws_connected_clients = Object.create(null);
exports.ws_connected_clients = ws_connected_clients;
exports.getClients = () => ws_connected_clients;

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

const server = app.listen(config.PORT, '0.0.0.0');



helpers.auditLog("Server Init", false);
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);


const { MongoClient } = require('mongodb');

const uri = process.env.MONGOOSE_CONNECTION_STRING;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

client.connect(async (error) => {
    if(error) {
        console.error(`Failed to connect to MongoDB - fatal\n` + error);
        helpers.auditLog(`Failed to connect to MongoDB - fatal\n` + error, false);
        process.exit(1);
    }
    
    console.log("MongoDB Connection Established.");
    
    require('firebase/app').initializeApp(require('./env').firebaseConfig);
    
    const auth = firebaseAuth.getAuth();
    
    const firebaseAuthUser = await firebaseAuth.signInWithEmailAndPassword(auth, process.env.FIREBASE_EMAIL, process.env.FIREBASE_API_SECRET);
    
    if(typeof firebaseAuthUser.user.uid === 'undefined') {
        helpers.auditLog('Failed to connect to Firebase - fatal');
        console.error('Failed to connect to Firebase - fatal');
        process.exit(1);
    }
    
    console.log('Firebase Connection Established.');
    server.on("upgrade", (request, socket, head) => {
        console.log(`WebSocket request made to ${request.url}, handling.`);
        
        switch(request.url) {
            case "/ws":
                wss_v1.handleUpgrade(request, socket, head, (ws) => {
                    wss_v1.emit('connection', ws, request);
                });
                return;
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
    const { wss_v1 } = require("./routers/ws/WebSocketServerLegacy");

    exports.MessagingGatewayServerV1 = MessagingGatewayServerV1;
    exports.WebSocketServerV2 = WebSocketServerV2;
    exports.wss_v1 = wss_v1;
    
    process.on('beforeExit', () => {
        helpers.auditLog("Server exit.", false);
    });
                    
    process.on('uncaughtException', (exception) => {
        helpers.auditLog(`Uncaught exception in server.\nException: \`\`\`${exception}\`\`\``, false);
        console.error(exception);
    });

    process.on('SIGINT', () => {
        var Instances = matchmaking.GetInstances("*");
        
        if(Instances.length > 1) { // Maximum length of ONE because of the default instance for intellisense testing.
            console.log("Server kill command rejected - there are players online with instances active.\nWait for the instances to close or use SIGKILL / SIGTERM");
            return;
        }
        
        helpers.auditLog("Server killed from command line. Exiting in 0.25 seconds. (250ms)", false);
        
        setTimeout(() => process.exit(), 250);
    });
});