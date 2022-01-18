const fs = require('node:fs');
const { stdin, stdout } = require('node:process');
const readline = require('readline');

const rl = readline.createInterface({
     input: stdin,
     output: stdout
});

var template;
var depth = 0;

rl.question("Please enter the directory you want to read data from.\n", async (response) => {
     var files = fs.readdirSync(response);
     
     rl.question("Please enter the name of the template file. Name is in the read directory.", async (response_2) => {
          files = files.filter(item => item != 'ACCT_TEMPLATE.json');

          template = fs.readFileSync(`${response}/${response_2}`);
     
          template = JSON.parse(template);
     
          for (let index = 0; index < files.length; index++) {
               const element = files[index];
               
               var file = fs.readFileSync(`${response}/${element}`);
               file = JSON.parse(file);
     
               file = recursiveCheck(file, template);
     
               file = JSON.stringify(file, null, 4);
     
               fs.writeFileSync(`${response}/${element}`, file);
          }
     
          process.exit(0);
     });
});

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