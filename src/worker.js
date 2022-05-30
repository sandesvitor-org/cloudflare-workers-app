const { App } = require("@octokit/app");
// const { handleBadDatabaseVerbs, handleTest } = require("./handlers/handle_bad_verbs");

const appId = APP_ID;
const secret = WEBHOOK_SECRET;
const privateKey = [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3].join("\n");

const APP_NAME = "cloudflare-worker[bot]";
const TEAM_REVIEWERS = ["dba-team"];
const BAD_VERBS = ["DELETE", "DROP", "ALTER"];
const PR_EVENTS = ["pull_request.opened", "pull_request.synchronize"]

const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret,
  },
});

app.webhooks.on(PR_EVENTS, async ({ octokit, payload }) => {
  // await handleBadDatabaseVerbs(octokit, payload, APP_NAME, BAD_VERBS, TEAM_REVIEWERS);
  await handleTest(octokit, payload);
});

addEventListener("fetch", (event) => {
  console.log(`[LOG] Inside event listener ${event.request.method} /`)
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

async function getPullRequestChangedFilesContent(octokit, {owner, repo, pull_number, ref}){
  let filesContent = []
  const filesListBase64 = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
    owner,
    repo,
    pull_number,
    per_page: 100
  }).then(filesObject => filesObject.data)
  
  for(let i =0; i < filesListBase64.length; i++){
    let content = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}',{
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

async function handleTest(octokit, payload){
  // const commit_id = payload.pull_request.head.sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.number;
  const ref = payload.pull_request.head.ref;

  const filesContentArray = await getPullRequestChangedFilesContent(octokit, {owner, repo, pull_number, ref});

  filesContentArray.forEach(async (file) => {
    await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo,
      pull_number,
      title: file.name,
      body: file.content,
      state: 'open',
      base: 'master'
    })
  })
}
