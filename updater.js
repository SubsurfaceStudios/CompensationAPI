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
     "1",
     "3",
     "4",
     "5",
     "6"
]

function main() {
     rl.question("\n\n\n\n\n\nPlease select an option.\n\n1. Legacy Updater\n2. Current Updater (UNAVAILABLE)\n3. Account Migration\n4. Room Updater - Global\n5. Update a specific room.\n6. Migrate item data to MongoDB.\n\n", async (res) => {
          if(!answers.includes(res)) {
               rl.write("Invalid or unavailable option.\n");
               main();
          }

          switch(res) {
               case "1":
                    legacy_updater();
                    return;
               case "3":
                    MigrateAllAccounts();
                    return;
               case "4":
                    room_updater(null);
                    return;
               case "5":
                    rl.question("Enter the ID of the room you want to update.\n\n", async (res) => {
                         room_updater(res);
                    });
                    return;
               case "6":
                    migrateItems();
                    return
          }
     });
}

function MigrateAllAccounts() {
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
          accounts = accounts.filter(item => item != "ACCT_TEMPLATE.json");

          for(let i = 0; i < accounts.length; i++) {
               rl.write("Preparing account " + accounts[i].split(".")[0] + " for migration.\n\n");

               var item = await JSON.parse(fs.readFileSync(`./data/accounts/${accounts[i]}`));
               item._id = accounts[i].split(".")[0];

               rl.write("Read and prepared account " + item._id + "\n\n");


               if(await accounts_collection.findOne({_id: {$eq: item._id, $exists: true}}) == null) {
                    await accounts_collection.insertOne(item);
               } else {
                    await accounts_collection.replaceOne({_id: {$eq: item._id}}, item);
               }

               rl.write("Successfully pushed account " + item._id + "\n\n");
          }

          rl.write("Pushed all accounts to database successfully.\n");
          return;
     });
     return;
}

function legacy_updater() {
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
          }

          const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
          const servers = db.collection("servers");

          var server = await servers.findOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}});

          if(server == null) return rl.write("Failed to read official server.");

          rl.question("Please enter the directory you want to read data from.\n", async (response) => {
               var files = fs.readdirSync(response);
               
               rl.question("Please enter the name of the template file. Name is in the read directory.\n\n", async (response_2) => {
                    files = files.filter(item => item != 'ACCT_TEMPLATE.json');
          
                    template = fs.readFileSync(`${response}/${response_2}`);
               
                    template = JSON.parse(template);
               
                    for (let index = 0; index < files.length; index++) {
                         const element = files[index];
                         
                         var file = fs.readFileSync(`${response}/${element}`);
                         file = JSON.parse(file);
               
                         file = recursiveCheck(file, template);

                         if(!file.private.messaging_servers.includes("a8ec2c20-a4c7-11ec-896d-419328454766"))
                              file.private.messaging_servers.push("a8ec2c20-a4c7-11ec-896d-419328454766");
               
                         file = JSON.stringify(file, null, 4);
               
                         fs.writeFileSync(`${response}/${element}`, file);

                         if(!Object.keys(server.users).includes(element.split(".")[0])) {
                              server.users[element.split(".")[0]] = {};
                         }
                    }

                    console.log(await servers.updateOne({_id: {$eq: "a8ec2c20-a4c7-11ec-896d-419328454766", $exists: true}}, {$set: {users: server.users}}, {upsert: true}));
               
                    process.exit(0);
               });
          });
     });
}

function recursiveCheck(object, _template) {
     depth++;
     console.log('\x1b[31m%s\x1b[0m', `Dropping to layer with depth of ${depth}.`);
     //Check if object is a non-dictionary type before continuing.
     console.log("Checking if object is an array.")
     if(
          Array.isArray(object) || !(
               typeof(object) === 'object'
          )
     ) {
          console.log("Object is a value or array, returning without mutation.");
          //If the object is not a dictionary, return without mutating.
          depth--;
          console.log('\x1b[36m%s\x1b[0m', `Returning to layer of depth ${depth}.`);
          return object
     } else {
          console.log("Object is a KVP type, checking.")
          var templateKeys = Object.keys(_template);

          //If the object is empty, return without mutating.
          if(templateKeys == null || typeof(templateKeys) == 'undefined' || templateKeys.length < 1) {
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
          }
          
          const db = client.db(process.env.MONGOOSE_DATABASE_NAME);
          const rooms = db.collection("rooms");
          if(id != null) {
               var room = await rooms.findOne({_id: {$eq: id, $exists: true}});
               if(room == null) {
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
     if(typeof room.subrooms != 'object') room.subrooms = {
          "home": {
               "publicVersionId": 0,
               "maxPlayers": 20,
               "versions": [
                    {
                         "baseSceneIndex": 2,
                         "shortHandCommitMessage": "Initial Commit",
                         "longHandCommitMessage": "Initial Commit",
                         "author": "0",
                         "collaborators": []
                    }
               ]
          }
     };
     if(typeof room.homeSubroomId != 'string') room.homeSubroomId = "home";
     if(typeof room.rolePermissions != 'object') {
          room.rolePermissions = {
               "everyone": {
                    "viewAndJoin": true
               }
          };
     } else {
          for(let i = 0; i < Object.keys(room.rolePermissions).length; i++) {
               const key = Object.keys(room.rolePermissions)[i];
               var value = room.rolePermissions[key];

               if(typeof value.viewAndJoin != 'boolean') value.viewAndJoin = true;

               room.rolePermissions[key] = value;
          }
     }
     if(typeof room.userPermissions != 'object') room.userPermissions = {};

     return room;
}

function migrateItems() {
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

          const files = fs.readDirSync("./data/econ");

          const insert = files.filter(x => x != "ITEM_TEMPLATE.json").map(x => {
               const file = require(`./data/econ/${x}`);

               file._id = file.id; // yes this is stupid
               return file;
          });

          console.log(await items.insertMany(insert));
          console.log("Migration complete.");
     });
}

main();