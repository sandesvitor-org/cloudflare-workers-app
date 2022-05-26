module.exports = {
  handleBadDatabaseVerbs
}

//
// Handlers
//

async function handleBadDatabaseVerbs(octokit, payload, appName, badVerbs){
  const commit_id = payload.pull_request.head.sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.number;
  const ref = payload.pull_request.head.ref;
  // const prURL = payload.pull_request.html_url;
  // const prAuthor = payload.pull_request.user.login;

  const botPullRequestReviewsIDsArray = await getPullRequestReviews(octokit, {owner, repo, pull_number, app_name: appName});
  const filesContentArray = await getPullRequestChangedFilesContent(octokit, {owner, repo, pull_number, ref});
  
  filesContentArray.forEach(file => {
    const openReviewsForFile = botPullRequestReviewsIDsArray.filter(review => review.file_path == file.name && review.state !== 'DISMISSED')
    
    // Checking with there is any naughty verb in PR changed files:
    if (badVerbs.some(verb => file.content.includes(verb)))
    {
      // Checking if we already have a review in PR linked to the file name (also, if said review is marked as 'DISMISSED', return check):
      if (openReviewsForFile.length > 0){
        console.info(`Ignoring file [${file.name}] because a review is already set for it`)
        return
      } 

      // If there is no review AND the file has some BAD VERBS, create a review:
      postReviewCommentInPullRequest(octokit, {owner, repo, pull_number, commit_id, path: file.name});
      requestReviewerForPullRequest(octokit, {owner, repo, pull_number, team_reviewers: [TEAM_REVIEWER]});
      console.info(`Creating a review for file [${file.name}] due to forbidden verbs: [${badVerbs}]`);
    } 
    else 
    {
      openReviewsForFile.forEach(review => {
          console.info(`Dismissing review [${review.review_id}] for file [${file.name}]`);
          dismissReviewForPR(octokit, {owner, repo, pull_number, review_id: review.review_id});
        });
      console.info(`Ignoring changed file [${file.name}], nothing wrong with it =)`);
    }
  })
}


//
// Github API functions
//

async function getPullRequestChangedFilesContent(octokit, {owner, repo, pull_number, ref}){
  let filesContent = []
  const filesListBase64 = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
    per_page: 100
  }).then(filesObject => filesObject.data)
  
  for(let i =0; i < filesListBase64.length; i++){
    let content = await octokit.repos.getContent({
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
  return await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number,
  }).then(res => res.data.filter(review => review.user.login == app_name).map(data => { 
    return {review_id: data.id, file_path: data.body, state: data.state} 
  }));
}
  
async function requestReviewerForPullRequest(octokit, {owner, repo, pull_number, team_reviewers}){
  await octokit.pulls.requestReviewers({
    owner,
    repo,
    pull_number,
    reviewers: team_reviewers
  })
}
  
async function postReviewCommentInPullRequest(octokit, {owner, repo, pull_number, commit_id, path}){
  await octokit.pulls.createReview({
    owner: owner,
    repo: repo,
    pull_number: pull_number,
    commit_id: commit_id,
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

async function dismissReviewForPR(octokit, {owner, repo, pull_number, review_id}){
  octokit.pulls.dismissReview({
    owner,
    repo,
    pull_number,
    review_id,
    message: "Dismissing review due to resolved BAD VERBS"
  });
}
