import { App } from "@octokit/app"


//##########################################################################################
//Ignoring the lines bellow due to its behaviour in CLoudflare Workers
// @ts-ignore
const appId: any = APP_ID;
// @ts-ignore
const secret: any = WEBHOOK_SECRET;
// @ts-ignore
const privateKey: any = [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3].join("\n");
//##########################################################################################


const APP_NAME: String = "cloudflare-worker[bot]";
const TEAM_REVIEWERS: Array<String> = ["dba-team"];
const BAD_VERBS: Array<String> = ["DELETE", "DROP", "ALTER"];
const PR_EVENTS: any = ["pull_request.opened", "pull_request.synchronize"]

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

addEventListener("fetch", (event: any) => {
  console.log(`[LOG] Inside event listener ${event.request.method} /`)
  event.respondWith(handleRequest(event.request));
});

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request: any) {
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
  } catch (error: any) {
    app.log.error(error);

    return new Response(`{ "error": "${error.message}" }`, {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function handleTest(octokit: any, payload: any){
  const commit_id = payload.pull_request.head.sha;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.number;
  const ref = payload.pull_request.head.ref;

  // const filesContentArray = await getPullRequestChangedFilesContent(octokit, {owner, repo, pull_number, ref});

  await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number,
    title: "TYPESCRIPT",
    body: "# JOAIPJDOPAD",
    state: 'open',
    base: 'master'
  })

  // filesContentArray.forEach(async (file) => {
  //   await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
  //     owner,
  //     repo,
  //     pull_number,
  //     title: file.name,
  //     body: file.content,
  //     state: 'open',
  //     base: 'master'
  //   })
  // })
}
