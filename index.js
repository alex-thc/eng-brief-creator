const CONFIG = require('./config-prod.json');
const gdrive = require('./gdrive');
const notifier = require('./notifier');
const Realm = require('realm-web');
var assert = require('assert');
const BSON = require('bson');

async function addToDocuments(dbCollection, project_id, url) {
    let doc = {
      'name' : 'Engagement Brief',
      '_id' : new BSON.ObjectID().toString(),
      'url' : url
    }

    dbCollection.updateOne({'_id':project_id},{'$push':{'documents':doc}})
}

async function process_request(token, dbCollection, user, fullDocument) {
    // let fullDocument = await dbCollection.findOne({ "_id" : "aCu2K000000kE4JSAU" });

    // var token = await gdrive.getOAuthServiceToken();
    console.log(`Processing request for PS Project: ${fullDocument.name}`);

    //create engagement brief
    let fileName = `Engagement Brief - ${fullDocument.name}`;
    let url = await gdrive.createBrief(token, fileName);
    console.log(`Created brief for project ${fullDocument.name}: ${url}`);

    //add url to the documents list
    await addToDocuments(dbCollection, fullDocument._id, url);

    //send a notification email
    await notifier.notifyBriefCreated(fullDocument, url, user);

    console.log("Done");
}

async function watcher(dbCollection, user) {
    console.log("Watcher start")
    const filter = {
          'fullDocument.region' : /^NA/
        }

    var token = await gdrive.getOAuthServiceToken();

    for await (let event of dbCollection.watch({filter})) {
        const {clusterTime, operationType, fullDocument} = event;
        //console.log(event);
        //console.log(event.fullDocument.documents)

        if (operationType === 'insert')
        {
            await process_request(token, dbCollection, user, fullDocument)
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

    const dbCollection = user
      .mongoClient('mongodb-atlas')
      .db('shf')
      .collection('psproject');

    let timerId = setTimeout(async function watchForUpdates() {
        timerId && clearTimeout(timerId);
        await watcher(dbCollection, user);
        timerId = setTimeout(watchForUpdates, 5000);
    }, 5000);

  }).catch((error) => {
    console.error("Failed to log into Realm", error);
  });