const CONFIG = require('./config-prod.json');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

service_json = {
  "private_key": CONFIG.private_key,
  "client_email": CONFIG.client_email,
  "client_id": CONFIG.client_id
}

async function getOAuthServiceToken() {
  var private_key = service_json.private_key; // private_key of JSON file retrieved by creating Service Account
  var client_email = service_json.client_email; // client_email of JSON file retrieved by creating Service Account
  var scopes = ["https://www.googleapis.com/auth/drive"]; // Scopes
  
  
  var url = "https://www.googleapis.com/oauth2/v3/token";

  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss: client_email,
    scope: scopes.join(" "),
    aud: url,
    exp: now + 3600,
    iat: now,
  };
  var token = jwt.sign(claim, private_key, { algorithm: 'RS256' });
  
  var p = {
      assertion: token,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
  };
  const params = new URLSearchParams(p);

  var res = await fetch(url, { method: 'POST', body: params });
  var json = await res.json();
  
  return json.access_token;
}

function convertIdToUrl(id) {
	return `https://docs.google.com/document/d/${id}`
}

async function createBrief(token, fileName) {
  var url = null;

  let id = await makeServiceTemplateCopy(token, CONFIG.templateDocId, fileName);
  id = await moveFileToSharedFolder(token, id, CONFIG.targetFolderId);
  await enableAllUsersWrite(token, id);

  url = convertIdToUrl(id);

  return url;
}

async function makeServiceTemplateCopy(token, templateId, name) {
  
  //create a copy
  var u = "https://www.googleapis.com/drive/v3/files/" + templateId + "/copy?access_token=" + token + "&supportsAllDrives=true&supportsTeamDrives=true";
  var data = {
    'name': name,
    'parents' : ['root'],
  };
  var options = {
    'method' : 'post',
    'headers': { 'Content-Type': 'application/json' },
    // Convert the JavaScript object to a JSON string.
    'body' : JSON.stringify(data)
  };
  var r = await fetch(u, options)
  var j = await r.json();
  if (j.error) {
    console.log(`Error creating a copy: `,j)
    throw j.error;
  }

  return j.id;
}

async function moveFileToSharedFolder(token, fileId, folderId) {
  
  var u = "https://www.googleapis.com/drive/v3/files/" + fileId + "/?access_token=" + token + "&supportsAllDrives=true&supportsTeamDrives=true" +
    "&addParents=" + folderId;
  var data = {
    'addParents': folderId
  };
  var options = {
    'method' : 'patch',
    'headers': { 'Content-Type': 'application/json' },
    // Convert the JavaScript object to a JSON string.
    'body' : JSON.stringify(data)
  };
  var r = await fetch(u, options)
  var j = await r.json();
  if (j.error) {
    console.log(`Error moving to the shared folder: `,j)
    throw j.error;
  }

  return j.id;
}

async function enableAllUsersWrite(token, docId) {
  
  u = "https://www.googleapis.com/drive/v3/files/" + docId + "/permissions?access_token=" + token + "&sendNotificationEmail=false" +
    "&supportsAllDrives=true&supportsTeamDrives=true";
  
  var data = {
    'role': 'writer',
    'type':'domain',
    'domain': '10gen.com'
  };
  var options = {
    'method' : 'post',
    'headers': { 'Content-Type': 'application/json' },
    // Convert the JavaScript object to a JSON string.
    'body' : JSON.stringify(data)
  };
  
  var r = await fetch(u, options)
  var j = await r.json();
  if (j.error) {
    console.log(`Error moving to the shared folder: `,j)
    throw j.error;
  }
}

module.exports = { 
	getOAuthServiceToken, createBrief
	}