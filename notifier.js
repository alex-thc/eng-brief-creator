function notifyHTMLBody(project_doc, url) {
  return `
      <div>
      Team,
      <br/><br/>
      Congrats with closing a new PS Project (${project_doc.name}) for ${project_doc.account}. 
      Here's the opportunity name for your reference: <a href="https://mongodb.my.salesforce.com/${project_doc.opportunity._id}">${project_doc.opportunity.name}</a>.
      <br/><br/>
      Our friendly autobot has generated the <a href="${url}">Engagement Brief document for you to fill</a>.
      <br/>
      Please go ahead and fill in the information as soon as possible to make sure the delivery team can knock it out of the park!
      <br/> <br/>
      MongoDB Professional Services
      <br/>
    </div>`;
}

async function notifyBriefCreated(project_doc, url, user) {
  var toEmailList = [
  	project_doc.opportunity.owner_email,
  	project_doc.opportunity.engagement_manager_email,
  	project_doc.owner_email,
  	project_doc.project_manager_email,
  	project_doc.ps_ops_resource_email
  ];

  //toEmailList = ["alex@mongodb.com"];

  const emailParams = {
    origEmail: project_doc.owner_email,
    toEmail: toEmailList.join(','), 
    subject: "[ACTION] Engagement Brief. New PS Project for " + project_doc.account,
    html: notifyHTMLBody(project_doc, url)
  };

  await user.callFunction(
                'sendMail',
                emailParams,
            );
}

module.exports = { 
	notifyBriefCreated
	}