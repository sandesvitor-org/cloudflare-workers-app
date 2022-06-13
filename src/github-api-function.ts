import { App } from "@octokit/app";

export async function getChangedFilesContentForPullRequest(
  octokit: App["octokit"],
  { owner, repo, pull_number, ref }: any
): Promise<any[]> {
  let filesContent = [];
  const filesListBase64 = await octokit
    .request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
      owner,
      repo,
      pull_number,
      per_page: 100, // TO-DO: Fix pagination
    })
    .then((filesObject) => filesObject.data);

  for (const fileBase64 of filesListBase64) {
    let content = await octokit
      .request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: owner,
        repo: repo,
        path: fileBase64.filename,
        ref: ref,
      })
      .then((response: any) => {
        // content will be base64 encoded!
        return Buffer.from(response.data.content, "base64").toString();
      });

    filesContent.push({ name: fileBase64.filename, content: content });
  }

  return filesContent;
}

export async function getPullRequestReviews(
  octokit: App["octokit"],
  { owner, repo, pull_number }: any
): Promise<any> {
  return await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
    {
      owner,
      repo,
      pull_number,
    }
  );
}

export async function postReviewCommentInPullRequest(
  octokit: App["octokit"],
  { owner, repo, pull_number, commit_id, path }: any
): Promise<void> {
  await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
    {
      owner,
      repo,
      pull_number,
      commit_id,
      path: path,
      event: "REQUEST_CHANGES",
      body: path,
      comments: [
        {
          path: path,
          position: 1,
          //start_line: 1,
          //start_side: 1,
          body: `File ${path} have dangerous query verbs!`,
        },
      ],
    }
  );
}

export async function dismissReviewForPullRequest(
  octokit: App["octokit"],
  { owner, repo, pull_number, review_id, message }: any
): Promise<void> {
  await octokit.request(
    "PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals",
    {
      owner,
      repo,
      pull_number,
      review_id,
      message,
    }
  );
}

export async function getDBATeamMembers(
  octokit: App["octokit"],
  { owner, team_slug }: any
): Promise<string[]> {
  return await octokit
    .request("GET /orgs/{org}/teams/{team_slug}/members", {
      org: owner,
      team_slug,
    })
    .then((res) => res.data.map((memberData) => memberData.login));
}

export async function requestTeamReviewers(
  octokit: App["octokit"],
  { owner, repo, pull_number, team_reviewers }: any
): Promise<void> {
  await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
    {
      owner,
      repo,
      pull_number,
      team_reviewers,
    }
  );
}
