const { App } = require("@octokit/app");
const { handleBadDatabaseVerbs } = require("./handlers/handle_bad_verbs");

// wrangler secret put APP_ID
const appId = APP_ID;

// wrangler secret put WEBHOOK_SECRET
const secret = WEBHOOK_SECRET;

const APP_NAME = "cloudflare-worker[bot]";
const BAD_VERBS = ["DELETE", "DROP", "ALTER"];
const PR_EVENTS = ["pull_request.opened", "pull_request.edit", "pull_request.synchronize"]

// The private-key.pem file from GitHub needs to be transformed from the
// PKCS#1 format to PKCS#8, as the crypto APIs do not support PKCS#1:
//
//     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private-key.pem -out private-key-pkcs8.pem
//
// The private key is too large, so we split it up across 3 keys.
// You can split up the *.pem file into 3 equal parts with
//
//     split -l 10 private-key-pkcs8.pem
//
// Then set the priveat keys
//
//     cat xaa | wrangler secret put PRIVATE_KEY_1
//     cat xab | wrangler secret put PRIVATE_KEY_2
//     cat xac | wrangler secret put PRIVATE_KEY_3
//
const privateKey = [PRIVATE_KEY_1, PRIVATE_KEY_2, PRIVATE_KEY_3].join("\n");

// instantiate app
// https://github.com/octokit/app.js/#readme
const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret,
  },
});

app.webhooks.on(PR_EVENTS, async ({ octokit, payload }) => {
  await handleBadDatabaseVerbs(octokit, payload, APP_NAME, BAD_VERBS)
});

addEventListener("fetch", (event) => {
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
      `<h1>Cloudflare Worker Example GitHub app</h1>
<p>Installation count: ${data.installations_count}</p>
    
<p><a href="https://github.com/apps/cloudflare-worker-example">Install</a> | <a href="https://github.com/gr2m/cloudflare-worker-github-app-example/#readme">source code</a></p>`,
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
