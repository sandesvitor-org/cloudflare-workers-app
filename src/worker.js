const { App } = require("@octokit/app");

const appId = APP_ID;
const secret = WEBHOOK_SECRET;
const privateKey = [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3].join("\n") 

const APP_NAME = "cloudflare-worker";
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
    await handleBadDatabaseVerbs(octokit, payload, APP_NAME, BAD_VERBS);
  } catch(e){
    console.log(`Error on handling PR webhook [handleBadDatabaseVerbs]: ${e.message}`)
  }
});

app.webhooks.on("pull_request_review.submitted", async ({ octokit, payload }) => {
  const prURL = payload.pull_request.html_url;
  const prAuthor = payload.pull_request.user.login;
  const repo = payload.repository.name;

  console.log(`Webhook pull_request_review.submitted`)

  try {
    await handleDBAReview(octokit, payload);
  } catch(e){
    console.log(`Error on handling PR webhook [handleDBAReview]: ${e.message}`)
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
async function handleDBAReview(octokit, payload){
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.number;

  const pullRequestReviews = await getPullRequestReviews(octokit, {owner, repo, pull_number}).then(res => res.data)
  
  const botPullRequestReviews = await getPullRequestReviews(octokit, {owner, repo, pull_number}).then(res => res.data).filter(review => review.user.login === `${appName}[bot]`)
      .map(data => { return {review_id: data.id, file_path: data.body, state: data.state} })

  const pullRequestApprovals = pullRequestReviews.filter(review => review.state === 'APPROVED' && review.user.login === 'sandesvitor')

  // checking if DBA team approved PR (in this case return)
  if (pullRequestApprovals.length > 0){
    const botOpenReviews = botPullRequestReviews.filter(review => review.state === 'CHANGES_REQUESTED');
    
    console.info(`[DBA Review]: Pull Request approved by DBA team, dismissing reviews`)

    for (const review of botOpenReviews){
      await dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id: review.review_id, message: `Review ${review_id} dismiss due to DBA team PR approval`});
      console.info(`[DBA Review]: ${file.name}]: concluded dismissing review number [${review.review_id}]`)
    }

    console.info("Pull Request approved by DBA team, returning")
    return
  }
}

async function handleBadDatabaseVerbs(octokit, payload, appName, badVerbs){
  const commit_id = payload.pull_request.head.sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.number;
  const ref = payload.pull_request.head.ref;
  
  console.info(`[Getting PR informations]: getPullRequestReviews and getChangedFilesContentForPullRequest`)
  
  const pullRequestReviews = await getPullRequestReviews(octokit, {owner, repo, pull_number}).then(res => res.data)
  
  const botPullRequestReviews = await getPullRequestReviews(octokit, {owner, repo, pull_number}).then(res => res.data).filter(review => review.user.login === `${appName}[bot]`)
      .map(data => { return {review_id: data.id, file_path: data.body, state: data.state} })

  const pullRequestApprovals = pullRequestReviews.filter(review => review.state === 'APPROVED' && review.user.login === 'sandesvitor')
  
  const pullRequestChagedFilesContentArray = await getChangedFilesContentForPullRequest(octokit, {owner, repo, pull_number, ref});
  
  console.info(
    `[After PR informations]: getPullRequestReviews
    ${JSON.stringify(botPullRequestReviews)}`)
  
  console.info(
    `[After PR informations]: getChangedFilesContentForPullRequest
    ${JSON.stringify(pullRequestChagedFilesContentArray)}`)

  // looping through open reviews to dissmiss it if the file has been corrected but there is still a review opened for it
  for (const review of botPullRequestReviews){
    if (review.state === 'DISMISSED'){
      continue
    }

    const lingeringReviewArray = pullRequestChagedFilesContentArray.filter(file => file.name === review.file_path && review.state === 'CHANGES_REQUESTED')
        
    if (lingeringReviewArray.length === 0){
      console.info(`[Inside loop for review ${review.review_id} of file ${review.file_path}]: since this file has a open review, beggining to dismiss it`)
      await dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id: review.review_id, file_path: review.file_path});
      console.info(`[Inside loop for review ${review.review_id} of file ${review.file_path}]: concluded dismissing review`)
    }
  }

  // looping through files that have any diff compared to the main branch
  for (const file of pullRequestChagedFilesContentArray){
    const openReviewsForFile = botPullRequestReviews.filter(review => review.file_path === file.name && review.state !== 'CHANGES_REQUESTED');
    
    console.info(`[Inside loop for file ${file.name}]: Open review: ${JSON.stringify(openReviewsForFile)}`)

    // Checking with there is any naughty verb in PR changed files:
    if (badVerbs.some(verb => file.content.includes(verb)))
    {
      // Checking if we already have a review in PR linked to the file name (also, if said review is marked as 'DISMISSED', return check):
      if (openReviewsForFile.length > 0){
        console.info(`[Inside loop for file ${file.name}]: Ignoring and returning from function because file [${file.name}] review is already set`)
        continue;
      } 

      // If there is no review AND the file has some BAD VERBS, create a review:
      console.info(`[Inside loop for file ${file.name}]: Creating a review for file [${file.name}] due to forbidden verbs: [${badVerbs}]`)
      await postReviewCommentInPullRequest(octokit, {owner, repo, pull_number, commit_id, path: file.name});
      console.info(`[Inside loop for file ${file.name}]: Review created for file [${file.name}]`)
    } 
    else 
    {
      console.info(`[Inside loop for file ${file.name}]: this file DOES NOT have bad verbs`)
      
      if (openReviewsForFile.length === 0){
        console.info(`[Inside loop for file ${file.name}]: Ignoring and returning from function because file [${file.name}] has no bad verbs and no pending review`)
        continue;
      } 

      for (const review of openReviewsForFile){
        console.info(`[Inside loop for file ${file.name}]: since this file has a open review AND no bad verbs, beggining to dismiss of review number [${review.review_id}]`)
        await dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id: review.review_id, message: `Dismissing review for file ${file_path} due to resolved issue`});
        console.info(`[Inside loop for file ${file.name}]: concluded dismissing review number [${review.review_id}]`)
      }
    }
  }

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
    per_page: 100 // TO-DO: Fix pagination
  }).then(filesObject => filesObject.data)
    
  for(const fileBase64 of filesListBase64){
    let content = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: owner,
      repo: repo,
      path: fileBase64.filename,
      ref: ref
    })
      .then(response => {
        // content will be base64 encoded!
        return Buffer.from(response.data.content, 'base64').toString()
      })
    
    filesContent.push({name: fileBase64.filename, content: content})
  }

  return filesContent;
}
  
async function getPullRequestReviews(octokit, {owner, repo, pull_number}){
  return await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
      owner,
      repo,
      pull_number
  })
}
  
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

async function dismissReviewForPullRequest(octokit, {owner, repo, pull_number, review_id, message}){
  await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals', {
    owner,
    repo,
    pull_number,
    review_id,
    message
  })
}
