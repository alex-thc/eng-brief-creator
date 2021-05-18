const CONFIG = require('./config-prod.json');
const gdrive = require('./gdrive');
const notifier = require('./notifier');
const Realm = require('realm-web');
var assert = require('assert');
const BSON = require('bson');
const yargs = require('yargs');

const argv = yargs
    .command('send', 'Send brief manually', {
        id: {
            alias: 'i',
            description: 'the project id',
            type: 'string',
        }
    })
    .help()
    .alias('help', 'h')
    .argv;


async function addToDocuments(dbCollection, project_id, url) {
    let doc = {
      'name' : 'Engagement Brief',
      '_id' : new BSON.ObjectID().toString(),
      'url' : url
    }

    dbCollection.updateOne({'_id':project_id},{'$push':{'documents':doc}})
}

async function test(psprojCollection, user, pid) {
    var token = await gdrive.getOAuthServiceToken();
    await process_request(token, psprojCollection, null, user, {type: "manual_override", project_id : pid});
}

async function updateRequest(dbCollection,request,setter) {
  return dbCollection.updateOne({"_id" : request._id},
              {"$set":setter});
}

async function process_request(token, psprojCollection, reqsCollection, user, request) {

  try {
    //get project doc
    const fullDocument = await psprojCollection.findOne({_id: request.project_id});
    if (!fullDocument)
      throw(`No document found using id ${request.project_id}`);

    console.log(`Processing request for PS Project: ${fullDocument.name}`);

    // //create engagement brief
    // let fileName = `Engagement Brief - ${fullDocument.name}`;
    // let url = await gdrive.createBrief(token, fileName);
    // console.log(`Created brief for project ${fullDocument.name}: ${url}`);

    // //add url to the documents list
    // await addToDocuments(dbCollection, fullDocument._id, url);

    // //send a notification email
    // await notifier.notifyBriefCreated(fullDocument, url, user);

    if (request.type !== "manual_override")
      await updateRequest(reqsCollection,request,{"status":"Finished","ts.finished":new Date()});
    console.log("Done");

  } catch(error) {
    console.error("Failed generaing brief:", error);
    if (request.type !== "manual_override")
      await updateRequest(reqsCollection,request,{"status":"Error","error":error.toString(),"ts.finished":new Date()});
  }
}

// old version for watching the psproject collection
//
// async function watcher(dbCollection, user) {
//     console.log("Watcher start")
//     const filter = {
//           'fullDocument.region' : /^NA/
//         }

//     var token = await gdrive.getOAuthServiceToken();

//     for await (let event of dbCollection.watch({filter})) {
//         const {clusterTime, operationType, fullDocument} = event;
//         //console.log(event);
//         //console.log(event.fullDocument.documents)

//         if (operationType === 'insert')
//         {
//             await process_request(token, dbCollection, user, fullDocument)
//         }
//     }
//   }

async function workLoop(user,token,psprojCollection,reqsCollection) {
  console.log("Workloop start")

  const query = { "status": "New" };
  const update = {
    "$set": {
      "status": "In Progress",
      "ts.started" : new Date()
    }
  };
  const options = { returnNewDocument: true, sort: {"ts.created":-1} };

  while(true) {
    let doc = await reqsCollection.findOneAndUpdate(query, update, options);
    if (!doc)
      return null;
    await process_request(token, psprojCollection, reqsCollection, user, doc);
  }
}

async function watcher(user,token,psprojCollection,reqsCollection) {
    console.log("Watcher start")
    for await (let event of reqsCollection.watch()) {
        const {clusterTime, operationType, fullDocument} = event;

        if ((operationType === 'insert') && event.fullDocument.status === "New") {
            const request = event.fullDocument;

            let res = await reqsCollection.updateOne({"_id" : request._id, "status": "New"},
              {"$set":{"status": "In Progress", "ts.started" : new Date()}});
            if (res.modifiedCount > 0)
            {
              await process_request(token, psprojCollection, reqsCollection, user, request);
            } else {
              console.log(`Watcher: someone else picked up the request ${request._id}`)
            }
        }
    }
  }

const realmApp = new Realm.App({ id: CONFIG.realmAppId });
const realmApiKey = CONFIG.realmApiKey;

async function loginApiKey(apiKey) {
  // Create an API Key credential
  const credentials = Realm.Credentials.apiKey(apiKey);
  // Authenticate the user
  const user = await realmApp.logIn(credentials);
  // `App.currentUser` updates to match the logged in user
  assert(user.id === realmApp.currentUser.id)
  return user
}

loginApiKey(realmApiKey).then(user => {
    console.log("Successfully logged in to Realm!");

    const psprojCollection = user
      .mongoClient('mongodb-atlas')
      .db('shf')
      .collection('psproject');

    if (argv._.includes('send') && argv.id) {
      test(psprojCollection, user, argv.id); 
      return;
    }

    const reqsCollection = user
      .mongoClient('mongodb-atlas')
      .db('ebrief')
      .collection('requests');

    let timerId = setTimeout(async function watchForUpdates() {
        timerId && clearTimeout(timerId);

        const token = await gdrive.getOAuthServiceToken();

        await workLoop(user,token,psprojCollection,reqsCollection);
        await watcher(user,token,psprojCollection,reqsCollection);
        timerId = setTimeout(watchForUpdates, 5000);
    }, 5000);

  }).catch((error) => {
    console.error("Failed to log into Realm", error);
  });