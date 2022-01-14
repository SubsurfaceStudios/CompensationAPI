require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const RateLimit = require('express-rate-limit');
const sanitize = require('sanitize-filename');

const helpers = require('./helpers');
const middleware = require('./middleware');

const app = express();
app.set('trust proxy', 1);

var limiter = RateLimit({
     windowMs: 1*60*1000,
     max: 100,
     standardHeaders: true,
     legacyHeaders: false
});

app.use(limiter);

app.use(express.json({
     limit: '50mb'
}));
app.use(fileUpload({
     createParentPath: true,
     limit: '50mb'
}));

const config = require('./config.json');

const notificationTemplates = {
     invite: "invite",
     friendRequest: "friendRequest",
     messageRecieved: "messageRecieved"
}

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

app.listen(config.PORT, '0.0.0.0');
helpers.auditLog("Server Init");
console.log(`API is ready at http://localhost:${config.PORT}/ \n:D`);