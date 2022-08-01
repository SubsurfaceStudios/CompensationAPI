const fs = require('node:fs');
const { stdin, stdout } = require('node:process');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: stdin,
    output: stdout
});

var template;
var depth = 0;

const answers = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "ban",
    "q"
];

function main() {
    rl.question("\n\n\n\n\n\nPlease select an option.\n\n1. (REMOVED) Legacy Updater\n2. Update MongoDB accounts.\n3. Migrate account data to MongoDB.\n4. Update all rooms.\n5. Update a specific room.\n6. Migrate item data to MongoDB.\n7. Purge audit logs.\nBan : Ban a player using their id and a duration.\n\n\nQ to quit.\n\n", async (res) => {
        if(!answers.includes(res)) {
            rl.write("Invalid or unavailable option.\n");
        } else {
            switch(res.toLowerCase()) {
            case "2": 
                currentAccountUpdater().then(() => console.log("DONE"), r => console.log(r));
                break;
            case "3":
                MigrateAllAccounts();
                break;
            case "4":
                room_updater(null);
                break;
            case "5":
                rl.question("Enter the ID of the room you want to update.\n\n", async (res) => {
                    room_updater(res);
                });
                break;
            case "6":
                migrateItems();
                break;
            case "7":
                fs.writeFileSync('./data/audit.json', "[]");
                main();
                break;
            case "ban":
                rl.question("Enter the ID of the player you want to ban.\n\n", async (id) => {
                    rl.question("Enter the duration of the ban in days.\n\n", async (duration) => {
                        rl.question("Enter the reason for the ban.\n\n", async (reason) => {
                            await BanPlayer(id, reason, duration);
                        });
                    });
                });
                break;
            case "q":
                process.exit(0);
            }
        }
    });
}

function MigrateAllAccounts() {
    if(!fs.existsSync("./data/accounts")) {
        console.log("No local account data to migrate - you are all clean!");
        main();
        return;
    }

    const { MongoClient } = require('mongodb');
     
    const uri = `mongodb+srv://CVRAPI%2DDIRECT:${process.env.MONGOOSE_ACCOUNT_PASSWORD}@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    client.connect(async (error, client) => {
        if(error) {
            console.log("Failed to connect to MongoDB.");
            console.error(error);
            process.exit(1);
        }

        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);

        const accounts_collection = db.collection("accounts");

        rl.write("Beginning account migration. Please ensure the API is not running at this time.\n\n");

        var accounts = fs.readdirSync('./data/accounts/');
        accounts = accounts.filter(item => item !== "ACCT_TEMPLATE.json");

        for(let i = 0; i < accounts.length; i++) {
            rl.write("Preparing account " + accounts[i].split(".")[0] + " for migration.\n\n");

            var item = await JSON.parse(fs.readFileSync(`./data/accounts/${accounts[i]}`));
            item._id = accounts[i].split(".")[0];

            rl.write("Read and prepared account " + item._id + "\n\n");

            await accounts_collection.replaceOne({_id: {$eq: item._id}}, item, {upsert: true});

            rl.write("Successfully pushed account " + item._id + "\n\n");
        }

        rl.write("Pushed all accounts to database successfully.\n");
        rl.write("Deleting local account data.\n");

        fs.rmSync('./data/accounts/', { recursive: true });

        rl.write("Done!");
        main();
    });
}

async function currentAccountUpdater() {
    const { MongoClient } = require('mongodb');
     
    const uri = `mongodb+srv://CVRAPI%2DDIRECT:${
        process.env.MONGOOSE_ACCOUNT_PASSWORD
    }@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    client.connect(async (error, client) => {
        if(error) return rl.write("Failed to connct to Mongo DB");

        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        var accounts = await db.collection("accounts").find({_id: {$ne: "ACCT_TEMPLATE"}}).toArray();
        template = await db.collection('accounts').findOne({_id: "ACCT_TEMPLATE"});
        const servers = db.collection("servers");

        var server = await servers.findOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}});
        if(typeof server != 'object') return rl.write("Failed to read official server.");

          
        for(let i = 0; i < accounts.length; i++) {
            var element = accounts[i];

            element = recursiveCheck(element, template);

            accounts[i] = element;

            if(!element.private.messaging_servers.includes("a8ec2c20-a4c7-11ec-896d-419328454766"))
                element.private.messaging_servers.push("a8ec2c20-a4c7-11ec-896d-419328454766");

            db.collection('accounts').replaceOne({_id: {$eq: element._id}}, element, {upsert: true});
               
            if(!Object.keys(server.users).includes(element._id)) {
                server.users[element._id] = {};
            }
        }

        console.log(await servers.updateOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}}, {$set: {users: server.users}}, {upsert: true}));
        main();
    });
}

// #region DEPRECATED OLD ACCOUNT UPDATER (LEGACY)

// function legacy_updater() {
//      rl.write("Connecting to MDB.\n");


//      const { MongoClient } = require('mongodb');
     
//      const uri = `mongodb+srv://CVRAPI%2DDIRECT:${process.env.MONGOOSE_ACCOUNT_PASSWORD}@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
//      const client = new MongoClient(uri, {
//           useNewUrlParser: true,
//           useUnifiedTopology: true
//      });

//      client.connect(async (error, client) => {
//           if(error) {
//                console.log("Failed to connect to MongoDB.");
//                console.error(error);
//                process.exit(1);
//           }

//           const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
//           const servers = db.collection("servers");

//           var server = await servers.findOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}});

//           if(server == null) return rl.write("Failed to read official server.");

//           rl.question("Please enter the directory you want to read data from.\n", async (response) => {
//                var files = fs.readdirSync(response);
               
//                rl.question("Please enter the name of the template file. Name is in the read directory.\n\n", async (response_2) => {
//                     files = files.filter(item => item != 'ACCT_TEMPLATE.json');
          
//                     template = fs.readFileSync(`${response}/${response_2}`);
               
//                     template = JSON.parse(template);
               
//                     for (let index = 0; index < files.length; index++) {
//                          const element = files[index];
                         
//                          var file = fs.readFileSync(`${response}/${element}`);
//                          file = JSON.parse(file);
               
//                          file = recursiveCheck(file, template);

//                          if(!file.private.messaging_servers.includes("a8ec2c20-a4c7-11ec-896d-419328454766"))
//                               file.private.messaging_servers.push("a8ec2c20-a4c7-11ec-896d-419328454766");
               
//                          file = JSON.stringify(file, null, 4);
               
//                          fs.writeFileSync(`${response}/${element}`, file);

//                          if(!Object.keys(server.users).includes(element.split(".")[0])) {
//                               server.users[element.split(".")[0]] = {};
//                          }
//                     }

//                     console.log(await servers.updateOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}}, {$set: {users: server.users}}, {upsert: true}));
               
//                     process.exit(0);
//                });
//           });
//      });
// }

// #endregion

function recursiveCheck(object, _template) {
    depth++;
    console.log('\x1b[31m%s\x1b[0m', `Dropping to layer with depth of ${depth}.`);
    //Check if object is a non-dictionary type before continuing.
    console.log("Checking if object is an array.");
    if(
        Array.isArray(object) || !(
            typeof(object) == 'object'
        )
    ) {
        console.log("Object is a value or array, returning without mutation.");
        //If the object is not a dictionary, return without mutating.
        depth--;
        console.log('\x1b[36m%s\x1b[0m', `Returning to layer of depth ${depth}.`);
        return object;
    } else {
        console.log("Object is a KVP type, checking.");
        var templateKeys = Object.keys(_template);

        //If the object is empty, return without mutating.
        if(typeof templateKeys != 'object' || templateKeys?.length < 1) {
            console.log("Template for object is empty, returning without mutation.");
            depth--;
            console.log('\x1b[36m%s\x1b[0m', `Returning to layer of depth ${depth}.`);
            return object;
        }
          
        //Object has contents, and is a dictionary type.
        //Run a function on each key.

        console.log("Template contains data for object, checking keys.");
        for (let index = 0; index < templateKeys.length; index++) {
            //Get the key of the element we're currently checking.
            const key = templateKeys[index];
            console.log(`Checking template key ${key} against object.`);
            if(key in object) {
                console.log(`Object contains key ${key}, beginning search of key.`);
                object[key] = recursiveCheck(object[key], _template[key]);
            } else {
                console.log(`Object does not contain key from template, restoring data from template.`);
                object[key] = _template[key];
            }
        }
    }

    console.log("Object check complete, returning mutated object.");
    depth--;
    console.log('\x1b[36m%s\x1b[0m', `Returning to layer of depth ${depth}.`);
    return object;
}

function room_updater(id) {
    rl.write("Connecting to MDB.\n");
    const { MongoClient } = require('mongodb');
     
    const uri = `mongodb+srv://CVRAPI%2DDIRECT:${process.env.MONGOOSE_ACCOUNT_PASSWORD}@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    client.connect(async (error, client) => {
        if(error) {
            console.log("Failed to connect to MongoDB.");
            console.error(error);
            process.exit(1);
            return;
        }
          
        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        const rooms = db.collection("rooms");
        if(id !== null) {
            var room = await rooms.findOne({_id: {$eq: id, $exists: true}});
            if(room === null) {
                console.log("room does not exist");
                return;
            }
            room = await updateRoom(room);

            console.log(room);
            console.log("Updated room, writing to database.");

            console.log(await rooms.updateOne({_id: {$eq: id, $exists: true}}, {$set: room}, {upsert: true}));
            return;
        }

        const rooms_array = await rooms.find().toArray();

        console.log("Beginning room update. This is a long and intensive operation.");
        for (let index = 0; index < rooms_array.length; index++) {
            rooms_array[index] = await updateRoom(rooms_array[index]);
        }

        console.log("Writing updated rooms to database.");

        for(let index = 0; index < rooms_array.length; index++) {
            console.log(await rooms.updateOne({_id: {$eq: rooms_array[index]._id, $exists: true}}, {$set: rooms_array[index]}, {upsert: true}));
        }

        main();
    });
}

async function updateRoom(room) {
    console.log(`Updating room - _id = \`${room._id}\`.`);

    if(typeof room.name != 'string') room.name = "undefinedRoom";
    if(typeof room.description != 'string') room.description = "Automatically generated room description during room update.";
    if(typeof room.creator_id != 'string') room.creator_id = "0";
    if(typeof room.tags != 'object') room.tags = [];
    if(typeof room.created_at != 'number') room.created_at = Date.now();
    if(typeof room.visits != 'number') room.visits = 0;
    if(typeof room.subrooms != 'object') {
        room.subrooms = {
            "home": {
                "publicVersionId": 0,
                "maxPlayers": 20,
                "versions": [
                    {
                        "baseSceneIndex": 9,
                        "spawn": {
                            "position": {
                                x: 0,
                                y: 0,
                                z: 0
                            },
                            "rotation": {
                                x: 0,
                                y: 0,
                                z: 0,
                                w: 1
                            }
                        },
                        "shortHandCommitMessage": "Initial Commit",
                        "longHandCommitMessage": "Initial Commit",
                        "author": "2",
                        "collaborators": [],
                        "associated_file": false
                    }
                ]
            }
        };
    } else {
        for(let i = 0; i < Object.keys(room.subrooms).length; i++) {
            const key = Object.keys(room.subrooms)[i];
            var value = room.subrooms[key];

            if(typeof value.associated_file == 'boolean') delete value.associated_file;
            for (let index = 0; index < value.versions.length; index++) {
                const element = value.versions[index];
                if(typeof element.associated_file != 'boolean') element.associated_file = false;
                value.versions[index] = element;
            }
            room.subrooms[key] = value;
        }
    }
    if(typeof room.homeSubroomId != 'string') room.homeSubroomId = "home";
    if(typeof room.rolePermissions != 'object') {
        room.rolePermissions = {
            "everyone": {
                "viewAndJoin": true,
                "createVersions": false,
                "setPublicVersion": false,
                "viewSettings": false,
                "viewPermissions": false,
                "managePermissions": false,
                "useCreationTool": false,
                "mutePlayers": false,
                "kickPlayers": false
            }
        };
    } else {
        for(let i = 0; i < Object.keys(room.rolePermissions).length; i++) {
            const key = Object.keys(room.rolePermissions)[i];
            var value = room.rolePermissions[key];

            if(typeof value.viewAndJoin != 'boolean') value.viewAndJoin = true;
            if(typeof value.createVersions != 'boolean') value.createVersions = false;
            if(typeof value.setPublicVersion != 'boolean') value.setPublicVersion = false;
            if(typeof value.viewSettings != 'boolean') value.viewSettings = false;
            if(typeof value.viewPermissions != 'boolean') value.viewPermissions = false;
            if(typeof value.managePermissions != 'boolean') value.managePermissions = false;
            if(typeof value.useCreationTool != 'boolean') value.useCreationTool = false;
            if(typeof value.mutePlayers != 'boolean') value.mutePlayers = false;
            if(typeof value.kickPlayers != 'boolean') value.kickPlayers = false;

            room.rolePermissions[key] = value;
        }
    }
    if(typeof room.userPermissions != 'object') room.userPermissions = {};

    return room;
}

function migrateItems() {
    if(!fs.existsSync("./data/econ/")) {
        console.log("No economy data - you are all clean!");
        main();
        return;
    }

    console.log("Connecting to MDB...\n");
    const { MongoClient } = require('mongodb');
     
    const uri = `mongodb+srv://CVRAPI%2DDIRECT:${process.env.MONGOOSE_ACCOUNT_PASSWORD}@cluster0.s1qwk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    client.connect(async (error, client) => {
        if(error) return console.error(error);
        console.log("Connected.\nBeginning migration...");

        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        const items = db.collection("items");

        const files = fs.readdirSync("./data/econ");

        const insert = files.filter(x => x !== "ITEM_TEMPLATE.json").map(x => {
            const file = require(`./data/econ/${x}`);

            file._id = file.id; // yes this is stupid
            return file;
        });

        console.log(await items.insertMany(insert));
        console.log("Migration complete.");

        console.log("Cleaning up old data...");
        fs.rmSync("./data/econ", {recursive: true});
        console.log("Old data deleted.");

        main();
    });
}

async function BanPlayer(id, reason, duration) {

    const { MongoClient } = require('mongodb');

    const uri = process.env.MONGOOSE_CONNECTION_STRING;

    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    client.connect(async (error, client) => {
        if(error) return console.error(error);

        const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
        const data = await db.collection("accounts").findOne({_id: {$eq: id, $exists: true}});
        if(data === null) {
            console.log("FAILED - Account does not exist.");
            main();
            return;
        }

        const endTS = Date.now() + (duration * 60 * 24); //convert duration from days to a unix timestamp
          
        const ban = {
            reason: reason,
            endTS: endTS
        };
     
        data.auth.bans.push(ban);

        await db.collection('accounts').replaceOne({_id: {$eq: id, $exists: true}}, data, {upsert: true});

        main();
    });

}

main();