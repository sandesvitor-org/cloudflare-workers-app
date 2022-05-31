const { App } = require("@octokit/app");

const appId = APP_ID;
const secret = WEBHOOK_SECRET;
const privateKey = [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3].join("\n") 

const APP_NAME = "cloudflare-worker";
const TEAM_REVIEWERS = ["sandesvitor-org/dba-team"];
const BAD_VERBS = ["DELETE", "DROP", "ALTER"];
const PR_EVENTS = ["pull_request.opened", "pull_request.synchronize"];

const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret,
  },
});

/* 
 * ##########################################################################################
 * 
 * IMPLEMENTING WEBHOOKS
 * 
 * ##########################################################################################
*/

app.webhooks.on(PR_EVENTS, async ({ octokit, payload }) => {
  const prURL = payload.pull_request.html_url;
  const prAuthor = payload.pull_request.user.login;
  const repo = payload.repository.name;

  console.log(`Webhook primary info: repo [${repo}]; URL [${prURL}]; author [${prAuthor}]`)

  try {
    await handleBadDatabaseVerbs(octokit, payload, APP_NAME, BAD_VERBS, TEAM_REVIEWERS);
  } catch(e){
    console.log(`Error in handle PR webhook: ${e.message}`)
  }
});

addEventListener("fetch", (event) => {
  console.log(`[LOG] Inside event listener ${event.request.method} /`);
  event.respondWith(handleRequest(event.request));
});

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request) {
  if (request.method === "GET") {
    const { data } = await app.octokit.request("GET /app");

    return new Response(
      `<h1>Cloudflare Worker do Sandes</h1>
<p>Installation count: ${data.installations_count}</p>
<p><a href="https://github.com/apps/cloudflare-worker">Install</a> | <a href="https://github.com/sandesvitor-org/cloudflare-workers-app/#readme">source code</a></p>`,
      {
        headers: { "content-type": "text/html" },
      }
    );
  }

  const id = request.headers.get("x-github-delivery");
  const name = request.headers.get("x-github-event");
  const payload = await request.json();

  try {
    // TODO: implement signature verification
    // https://github.com/gr2m/cloudflare-worker-github-app-example/issues/1
    await app.webhooks.receive({
      id,
      name,
      payload,
    });

    return new Response(`{ "ok": true }`, {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    app.log.error(error);

    return new Response(`{ "error": "${error.message}" }`, {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}


/* 
 * ##########################################################################################
 * 
 * IMPLEMENTING CUSTOM HANDLERS
 * 
 * ##########################################################################################
*/
async function handleBadDatabaseVerbs(octokit, payload, appName, badVerbs, teamReviewrs){
  const commit_id = payload.pull_request.head.sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.number;
  const ref = payload.pull_request.head.ref;
  
  console.log(`[Getting PR informations]: getPullRequestReviews and getChangedFilesContentForPullRequest`)
  const botPullRequestReviewsIDsArray = await getPullRequestReviews(octokit, {owner, repo, pull_number, app_name: appName});
  const filesContentArray = await getChangedFilesContentForPullRequest(octokit, {owner, repo, pull_number, ref});
  console.log(
    `[After PR informations]: getPullRequestReviews
    ${JSON.stringify(botPullRequestReviewsIDsArray)}`
  );
  console.log(
    `[After PR informations]: getChangedFilesContentForPullRequest
    ${JSON.stringify(filesContentArray)}`
  );

  for (file of filesContentArray){
    const openReviewsForFile = botPullRequestReviewsIDsArray.filter(review => review.file_path === file.name && review.state !== 'DISMISSED');
    
    console.log(`[Inside loop for file ${file.name}]: Open review: ${JSON.stringify(openReviewsForFile)}`);

    // Checking with there is any naughty verb in PR changed files:
    if (badVerbs.some(verb => file.content.includes(verb)))
    {
      // Checking if we already have a review in PR linked to the file name (also, if said review is marked as 'DISMISSED', return check):
      if (openReviewsForFile.length > 0){
        console.log(`[Inside loop for file ${file.name}]: Ignoring file [${file.name}] because a review is already set for it and returning from funtion...`);
        continue;
      } 

      // If there is no review AND the file has some BAD VERBS, create a review:
      await postReviewCommentInPullRequest(octokit, {owner, repo, pull_number, commit_id, path: file.name});
      console.log(`[Inside loop for file ${file.name}]: Creating a review for file [${file.name}] due to forbidden verbs: [${badVerbs}]`);
    } 
    else 
    {
      console.log(`[Inside loop for file ${file.name}]: this file DOES NOT have bad verbs`)
      
      if (openReviewsForFile.length === 0){
        console.log(`[Inside loop for file ${file.name}]: Ignoring file [${file.name}] because he has no bad verbs and no review pending and returning from function`);
        continue;
      } 

      for (let j = 0; j < openReviewsForFile.length; j++){
        console.log(`[Inside loop for file ${file.name}]: beggining to dismmiss of review nº [${openReviewsForFile[j].review_id}] for file [${openReviewsForFile[j].file_path}]`);
        await dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id: openReviewsForFile[i].review_id, file_path: openReviewsForFile[i].file_path});
        console.log(`[Inside loop for file ${file.name}]: concluded dismiss of review nº [${openReviewsForFile[j].review_id}] for file [${openReviewsForFile[j].file_path}]`);
      }
    }
  }
  // filesContentArray.forEach(async (file) => {
  //   const openReviewsForFile = botPullRequestReviewsIDsArray.filter(review => review.file_path === file.name && review.state !== 'DISMISSED')
    
  //   console.log(`[Inside loop for file ${file.name}]: Open review: ${JSON.stringify(openReviewsForFile)}`)

  //   // Checking with there is any naughty verb in PR changed files:
  //   if (badVerbs.some(verb => file.content.includes(verb)))
  //   {
  //     // Checking if we already have a review in PR linked to the file name (also, if said review is marked as 'DISMISSED', return check):
  //     if (openReviewsForFile.length > 0){
  //       console.log(`[Inside loop for file ${file.name}]: Ignoring file [${file.name}] because a review is already set for it and returning from funtion...`)
  //       return
  //     } 

  //     // If there is no review AND the file has some BAD VERBS, create a review:
  //     await postReviewCommentInPullRequest(octokit, {owner, repo, pull_number, commit_id, path: file.name});
  //     console.log(`[Inside loop for file ${file.name}]: Creating a review for file [${file.name}] due to forbidden verbs: [${badVerbs}]`);
  //   } 
  //   else 
  //   {
  //     console.log(`[Inside loop for file ${file.name}]: this file DOES NOT have bad verbs`)
      
  //     if (openReviewsForFile.length === 0){
  //       console.log(`[Inside loop for file ${file.name}]: Ignoring file [${file.name}] because he has no bad verbs and no review pending and returning from function`)
  //       return
  //     } 

  //     for (let i = 0; i < openReviewsForFile.length; i++){
  //       console.log(`[Inside loop for file ${file.name}]: beggining to dismmiss review [${openReviewsForFile[i].review_id}] for [${openReviewsForFile[i].file_path}]`);
  //       await dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id: openReviewsForFile[i].review_id, file_path: openReviewsForFile[i].file_path});
  //       console.log(`[Inside loop for file ${file.name}]: concluded dismiis review [${openReviewsForFile[i].review_id}] for file [${openReviewsForFile[i].file_path}]`);
  //     }
  //   }
  // })

  console.log("End of PR bad verbs handler")
}


/* 
 * 
 * ##########################################################################################
 * 
 * GITHUB API FUNCTIONS
 * 
 * ##########################################################################################
 * 
*/
async function getChangedFilesContentForPullRequest(octokit, {owner, repo, pull_number, ref}){
  let filesContent = []
  const filesListBase64 = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
    owner,
    repo,
    pull_number,
    per_page: 100
  })
    .then(filesObject => filesObject.data)
    
  for(let i = 0; i < filesListBase64.length; i++){
    let content = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: owner,
      repo: repo,
      path: filesListBase64[i].filename,
      ref: ref
    })
      .then(response => {
        // content will be base64 encoded!
        return Buffer.from(response.data.content, 'base64').toString()
      })
    
    filesContent.push({name: filesListBase64[i].filename, content: content})
  }

  return filesContent;
}
  
async function getPullRequestReviews(octokit, {owner, repo, pull_number, app_name}){
  return await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
      owner,
      repo,
      pull_number
  })
    .then(res => res.data.filter(review => review.user.login === `${app_name}[bot]`).map(data => { 
      return {review_id: data.id, file_path: data.body, state: data.state} 
    }))
}
  
// async function requestReviewerForPullRequest(octokit, {owner, repo, pull_number, team_reviewers}){
//   await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
//     owner,
//     repo,
//     pull_number,
//     team_reviewers
//   })
// }
  
async function postReviewCommentInPullRequest(octokit, {owner, repo, pull_number, commit_id, path}){
  await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
    owner,
    repo,
    pull_number,
    commit_id,
    path: path,
    event: 'REQUEST_CHANGES',
    body: path,
    comments: [
      {
        path: path,
        position: 1,
        //start_line: 1,
        //start_side: 1,
        body: `File ${path} have dangerous query verbs!`
      }
    ]
  });
}

async function dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id, file_path}){
  await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals', {
    owner,
    repo,
    pull_number,
    review_id,
    message: `Dismissing review for file ${file_path} due to resolved issue`
  })
}
