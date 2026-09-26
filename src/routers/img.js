const router = require('express').Router();
const helpers = require('../helpers');
const middleware = require('../middleware');
const express = require('express');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const NodeCache = require('node-cache');

const config = helpers.config;
const { default: rateLimit } = require('express-rate-limit');
const { v7 } = require('uuid');

router.use(express.text({limit: config.images.max_size ?? "10mb"}));

router.use(express.urlencoded({extended: false}));

const imageMetadataTemplate = {
    _id: 'undefined',
    takenBy: {
        id: '0',
        nickname: 'DEVTEST',
        username: 'devtest'
    },
    takenInRoomId: '0',
    others: [ '0' ],
    room: {
        id: '0',
        creator: '0',
        name: 'Apartment'
    },
    takenOn: {
        unixTimestamp: 0,
        humanReadable: 'Thu, 01 Jan 1970'
    },
    social: {
        comments: [],
        votes: 0,
        tags: [
            'photo'
        ]
    },
    visibility: "public",
    blobUrl: "https://example.com"
};

const uploadRateLimit = rateLimit({
    'windowMs': 3600000,
    'max': config.images.upload_rate_limit,
    'legacyHeaders': true,
    'standardHeaders': true
});

const fetch_rate_limit = rateLimit({
    'windowMs': 60 * 1000,
    'max': config.images.fetch_rate_limit,
    'standardHeaders': true,
    'legacyHeaders': true
});

// 24 hour cache
const imgCache = new NodeCache({
    "deleteOnExpire": true,
    "stdTTL": 60 * 60 * 24
});

router.post("/upload", uploadRateLimit, middleware.authenticateToken, async (req, res) => {
    if((config.images.disable_upload ?? false) && !req.user.developer) return res.status(409).send({"message": "Access denied - image uploads have been disabled by the system administrator.", "code": "uploads_disabled"});
    try {
        var { others, room_id, tags } = req.query;
        if(!req.body) return res.status(400).send("You did not send encoded photo data.");
        if(typeof room_id != 'string') return res.status(400).send("Room ID not specified.");
        if(typeof others != 'string') others = '[]';
        if(typeof tags != 'string' || !(JSON.parse(tags) instanceof Array)) tags = '[ "photo" ]';

        var timestamp = Date.now();
        var TakenByData = await helpers.PullPlayerData(req.user.id);

        const db = require('../index').mongoClient.db(config.database.mongodb_database_name);

        var MetaData = imageMetadataTemplate;
        MetaData._id = v7();

        MetaData.takenBy.id = req.user.id;
        MetaData.takenBy.nickname = TakenByData.public.nickname;
        MetaData.takenBy.username = TakenByData.public.username;

        MetaData.takenOn.unixTimestamp = timestamp;
        MetaData.takenOn.humanReadable = new Date(timestamp).toUTCString();

        // TODO room implementation with photos

        MetaData.others = JSON.parse(others);
        MetaData.internalPathRef = `images/${MetaData._id}.jpg`;

        MetaData.takenInRoomId = room_id;
        MetaData.room.id = room_id;

        const filename = `${v7()}.jpg`;
        const url = `${config.images.domain}/${filename}`;
        MetaData.blobUrl = url;

        MetaData.social.tags = JSON.parse(tags);

        if (req.query.visibility == "unlisted") MetaData.visibility = "unlisted";

        // Push metadata to MongoDB

        // Switch to the Images collection.
        const collection = db.collection("images");

        collection.insertOne(MetaData);

        // Parse image
        const buff = Buffer.from(req.body, 'base64');


        // Upload image to S3-compatible storage.

        const uploadCommand = new PutObjectCommand({
            Key: filename,
            Bucket: config.images.s3_bucket,
            Body: buff,
            ContentType: "image/jpg"
        });
        await helpers.S3.send(uploadCommand);

        helpers.auditLog(`Image with ID ${MetaData._id} has been uploaded to the API. Moderator intervention advised to ensure SFW.\nPERMALINK:\n${url}`, true);

        // Finalize request
        res.status(200).send("Successfully uploaded image.");
    } catch (ex) {
        res.sendStatus(500);
        throw ex;
    }
});

router.get('/:id/embed', (req, res) => {
    // copied from /:id endpoint
    let {id} = req.params;
    if(typeof id != 'string') return res.status(400).send("You did not specify an image ID.");

    // template for embed page
    let html = `<!DOCTYPE html>
     <html lang="en">
     <head>
     <meta charset="UTF-8">
     <meta content="Compensation Social" property="og:title">
     <meta content="###img###" property="og:image">
     <meta content="Taken by ###nick### (@###user###) on ###time###.\n###tags###" property="og:description">
     <meta name="theme-color" content="#9702f4">
     <meta name="twitter:card" content="summary_large_image">
     <meta http-equiv="refresh" content="0; URL=###img###">
     </head>
     </html>`;

    const db = require('../index').mongoClient.db(config.database.mongodb_database_name);
    var collection = db.collection("images");

    collection.findOne({_id: id}).then(doc => {
        if (!doc) return res.status(404).send("There's no image with this ID"); 

        // this is kind of ugly but still much better than what i had previously
        for (let [match, replacement] of Object.entries({
            '###nick###': doc.takenBy.nickname,
            '###user###': doc.takenBy.username,
            '###time###': doc.takenOn.humanReadable,
            '###tags###': doc.social.tags.map(e => '#' + e).join(' '),
            '###img###': doc.blobUrl
        })) {
            // escape html to prevent xss
            replacement = replacement.replaceAll(/&/g, "&amp;")
                .replaceAll(/</g, "&lt;")
                .replaceAll(/>/g, "&gt;")
                .replaceAll(/"/g, "&quot;")
                .replaceAll(/'/g, "&#039;"); // html 4 doesn't support &apos; which is why we use &39; instead
               
            html = html.replaceAll(match, replacement);
        }

        return res.status(200).send(html);
    }, err => {
        res.status(500).send("Failed to retrieve image data.");
        throw err;
    });
});

router.get("/:id/info", async (req, res) => {
    if((config.images.disable_fetch ?? false) && !req.user.developer) return res.status(500).send({"message": "Access denied - image fetching is disabled."});
    var {id} = req.params;
    if(typeof id != 'string') return res.status(400).send("You did not specify an image ID.");

    const db = require('../index').mongoClient.db(config.database.mongodb_database_name);
    var collection = db.collection("images");

    try {
        var doc = await collection.findOne({_id: id});
        return res.status(200).json(doc);
    } catch (ex) {
        res.status(500).send("Failed to retrieve image data.");
        throw ex;
    }
});

router.get("/:id", fetch_rate_limit, async (req, res) => {
    try {
        if((config.images.disable_fetch ?? false) && !req.user.developer) return res.status(500).send("Image fetching has been disabled by the system administrator.");
        // Setup of parameters
        var {id} = req.params;
        var {base64} = req.query;

        // Guard Clauses
        if (typeof id != 'string') {
            return res.status(400).json({
                code: "no_image_id",
                message: "You did not specify an image ID."
            });
        }

        // Open database
        const db = require('../index').mongoClient.db(config.database.mongodb_database_name);

        // Switch collection to image data.
        const collection = db.collection("images");

        var ImageInfo = await collection.findOne({_id: {$exists: true, $eq: id}});
        if(ImageInfo == null) return res.status(404).send({code: "image_not_found", message: "That image does not exist."});

        if (typeof base64 == 'undefined' || base64 !== 'true') {
            var ImageBuffer;

            if (!imgCache.has(id) || (config.images.disable_caching ?? false)) {
                const imageResponse = await fetch(ImageInfo.blobUrl);
                ImageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            } else {
                ImageBuffer = imgCache.get(id);
            }
               
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': ImageBuffer.length,
                'Cache-Control': 'public, max-age=604800'
            });
            res.end(ImageBuffer);

            if(!imgCache.has(id) && !(config.images.disable_caching ?? false)) {
                imgCache.set(id, ImageBuffer);
                console.log(`Request submitted for uncached image ${id}, cached.`);
            } else console.log(`Request submitted for cached image ${id}.`);
        } else {
            // eslint-disable-next-line no-redeclare
            var ImageBuffer;
            if(!imgCache.has(id) || (config.images.disable_caching ?? false)) {
                const imageResponse = await fetch(ImageInfo.blobUrl);
                ImageBuffer = await imageResponse.arrayBuffer();
            } else {
                ImageBuffer = imgCache.get(id);
            }
            var ImageBase64String = Buffer.from(ImageBuffer).toString('base64');

            res.status(200).contentType('text/plain').send(ImageBase64String);
            if(!imgCache.has(id) && !(config.images.disable_caching ?? false)) {
                imgCache.set(id, ImageBuffer);
                console.log(`Request submitted for uncached image ${id}, cached.`);
            } else console.log(`Request submitted for cached image ${id}.`);
        }
    } catch (ex) {
        res.status(500).send("Failed to retrieve image.");
        throw ex;
    }
});

module.exports = router;