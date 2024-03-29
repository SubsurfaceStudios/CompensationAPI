const helpers = require('./helpers');
const jwt = require('jsonwebtoken');

module.exports = {
    authenticateToken: authenticateToken,
    authenticateDeveloperToken: authenticateDeveloperToken,
    authenticateToken_internal: authenticateToken_internal,
    authenticateToken_optional: authenticateToken_optional,
    authenticateTokenAndTag: authenticateTokenAndTag
};

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];

    if(typeof token != 'string') return res.sendStatus(401);

    //then we need to authenticate that token in this middleware and return a user
    try
    {
        const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        req.user = tokenData;

        const data = await helpers.PullPlayerData(tokenData.id);

        for (let index = 0; index < data.auth.bans.length; index++) {
            const element = data.auth.bans[index];
               
            if(element.endTS > Date.now()) return res.status(403).send({
                message: "USER IS BANNED", 
                endTimeStamp: element.endTS, 
                reason: element.reason
            });
        }
        next();
    }
    catch
    {
        return res.status(403).send("Invalid or expired authorization token.");
    }
}

async function authenticateToken_optional(req, res, next) {
    const authHeader = req.headers['authorization'];

    if(typeof authHeader != 'string') return next();
    return authenticateToken(req, res, next);
}

async function authenticateDeveloperToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];

    if(typeof token != 'string') return res.sendStatus(401);

    //then we need to authenticate that token in this middleware and return a user
    try
    {
        const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        req.user = tokenData;

        const data = await helpers.PullPlayerData(tokenData.id);

        for (let index = 0; index < data.auth.bans.length; index++) {
            const element = data.auth.bans[index];
               
            if(element.endTS > Date.now()) return res.status(403).send({
                message: "USER IS BANNED", 
                endTimeStamp: element.endTS, 
                reason: element.reason
            });
            console.log(element);
        }

        if(!tokenData.developer) return res.status(403).send("Provided token is not owned by a developer!");

        next();
    }
    catch
    {
        return res.status(403).send("Invalid or expired authorization token.");
    }
}

function authenticateTokenAndTag(tag) {
    return async (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(" ")[1];

        if (typeof token != 'string') return res.sendStatus(401);

        try {
            const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            req.user = tokenData;

            const data = await helpers.PullPlayerData(tokenData.id);

            for (let index = 0; index < data.auth.bans.length; index++) {
                const element = data.auth.bans[index];
                
                if (element.endTS > Date.now()) return res.status(403).send({
                    message: "USER IS BANNED",
                    endTimeStamp: element.endTS,
                    reason: element.reason
                });
                console.log(element);
            }

            if (!data?.private?.availableTags?.includes(tag)) return res.status(403).send("No requisite permissions.");

            next();
        }
        catch
        {
            return res.status(403).send("Invalid or expired authorization token.");
        }
    };
}

async function authenticateToken_internal(token) {
    if(typeof token != 'string') return {success: false, tokenData: null, playerData: null, reason: "no_token"};

    //then we need to authenticate that token in this middleware and return a user
    try
    {
        const tokenData = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        const playerData = await helpers.PullPlayerData(tokenData.id);
        if(playerData === null) return {success: false, tokenData: tokenData, playerData: null, reason: "player_not_found"};

        for (let index = 0; index < playerData.auth.bans.length; index++) {
            const element = playerData.auth.bans[index];
               
            if(element.endTS > Date.now()) return {success: false, tokenData: tokenData, playerData: playerData, reason: "player_banned"};
        }
        return {success: true, tokenData: tokenData, playerData: playerData, reason: "success"};
    }
    catch
    {
        return {success: false, tokenData: null, playerData: null, reason: "invalid_token"};
    }
}