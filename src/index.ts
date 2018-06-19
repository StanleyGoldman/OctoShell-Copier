import * as Octokit from '@octokit/rest';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as Git from 'nodegit';
import * as tmp from 'tmp';

// tslint:disable-next-line:no-var-requires
require('dotenv').config();

if (process.argv.length !== 3) {
    console.log(`${chalk.red('Missing Arguments')}: [destinationAccount]`);
    process.exit(1);
}

const destinationAccount = process.argv[2];

const octokit = new Octokit({
    timeout: 0,
    headers: {
    }
});

const tokenUser = process.env.OCTOKIT_USER;
if (!tokenUser) {
    console.log(`${chalk.red('Missing Envionrment Variable')}: OCTOKIT_USER`);
    process.exit(1);
}

const token = process.env.OCTOKIT_TOKEN;
if (!tokenUser) {
    console.log(`${chalk.red('Missing Envionrment Variable')}: OCTOKIT_TOKEN`);
    process.exit(1);
}

octokit.authenticate({
    type: 'token',
    token
});

const getOctokitUser = async () => {
    const operator = await octokit.users.get({});
    return operator.data.login as string;
};

const deleteRepoIfExists = async (owner: string, repo: string) => {
    let gitRepo: Octokit.AnyResponse;

    try {
        gitRepo = await octokit.repos.get({ owner, repo });
    } catch (err) {
        return;
    }

    if (gitRepo) {
        await octokit.repos.delete({ owner, repo });
    }
};

const createPullRequest = async (owner, repo, pullRequest) => {
    const destPullRequest = await octokit.pullRequests.create({
        owner,
        repo,
        title: pullRequest.title,
        body: pullRequest.body,
        head: pullRequest.head.ref,
        base: pullRequest.base.ref
    });

    console.log(`${chalk.blue('Copied pullRequest')} #${pullRequest.number} to #${destPullRequest.data.number}`);
};

const createIssue = async (owner, repo, issue) => {
    const destIssue = await octokit.issues.create({
        owner,
        repo,
        title: issue.title,
        body: issue.body
    });

    console.log(`${chalk.blue('Copied issue')} #${issue.number} to #${destIssue.data.number}`);
};

const remoteRefRegex = new RegExp('^refs\/remotes\/origin\/(.*)$');
const headRefRegex = new RegExp('^refs\/heads\/(.*)$');

(async () => {
    const sourceOwner = 'StanleyGoldman';
    const sourceRepo = 'OctoShell';

    const sourceRepoDetails = await octokit.repos.get({ owner: sourceOwner, repo: sourceRepo });
    console.log(`${chalk.blue('Copying')} ${sourceRepoDetails.data.html_url}`);

    const owner = await getOctokitUser();
    const repo = `OctoShell-${destinationAccount}`;
    const repoPath = `${owner}/${repo}`;

    await deleteRepoIfExists(owner, repo);
    console.log(`${chalk.blue('Deleted')} ${repoPath}`);

    const repoCreateParams: Octokit.ReposCreateParams = {
        name: repo,
        private: true
    };

    const repoDetails = await octokit.repos.create(repoCreateParams);
    console.log(`${chalk.blue('Created')} ${owner}/${repo}`);

    const tempDir = tmp.dirSync();
    console.log(`${chalk.blue('Cloning')} to ${tempDir.name}`);

    const gitRepo = await Git.Clone.clone(`https://github.com/${sourceOwner}/${sourceRepo}.git`, tempDir.name);
    console.log(`${chalk.blue('Cloned')} to ${tempDir.name}`);

    let refs: string[] = await Git.Reference.list(gitRepo);
    for (const ref of refs) {
        const refMatch = ref.match(remoteRefRegex);
        if (refMatch) {
            const branchName = refMatch[1];
            if (branchName !== 'master') {
                const branchReference = await gitRepo.getBranch(ref);
                await gitRepo.createBranch(branchName, branchReference.target(), false, null, null);
                console.log(`${chalk.blue('Checkout')} ${branchName}`);
            }
        }
    }

    gitRepo.checkoutBranch('master');
    console.log(`${chalk.blue('Checkout')} master`);

    gitRepo.refreshIndex();

    refs = await Git.Reference.list(gitRepo);
    const localBranches = refs.filter((ref) => ref.match(headRefRegex));

    await Git.Remote.delete(gitRepo, 'origin');
    const remote = await Git.Remote.create(gitRepo, 'origin', repoDetails.data.clone_url);

    await remote.push(localBranches, {
        callbacks: {
            credentials: (url, userName) => {
                return Git.Cred.userpassPlaintextNew(tokenUser, token);
            }
        }
    });
    console.log(`${chalk.blue('Pushed')}`);

    gitRepo.free();

    await fs.remove(tempDir.name);
    console.log(`${chalk.blue('Deleted')} ${tempDir.name}`);

    const getIssuesResponse = await octokit.issues.getForRepo({
        owner: sourceOwner,
        state: 'open',
        repo: sourceRepo,
    });

    // tslint:disable-next-line:no-any
    const issues = (getIssuesResponse.data as any[])
        .filter((item) => !item.pull_request)
        .sort((item) => item.number)
        .map((issue) => ({
            index: issue.numer,
            getPromise: () => createIssue(owner, repo, issue)
        }));

    const getPullRequestsResponse = await octokit.pullRequests.getAll({
        owner: sourceOwner,
        state: 'open',
        repo: sourceRepo
    });

    // tslint:disable-next-line:no-any
    const pullRequests = (getPullRequestsResponse.data as any[])
        .sort((item) => item.number)
        .map((pullRequest) => ({
            index: pullRequest.numer,
            getPromise: () => createPullRequest(owner, repo, pullRequest)
        }));

    const copyOperations = [...issues, ...pullRequests]
        .sort((operation) => operation.index);

    for (const copyOperation of copyOperations) {
        await copyOperation.getPromise();
    }

    await octokit.repos.addCollaborator({ owner, repo, username: destinationAccount, permission: 'admin' });
    console.log(`${chalk.blue('Invited')} ${destinationAccount}`);

    console.log(`${chalk.blue('Completed')} ${repoDetails.data.html_url}`);
})().then(() => {
    console.log(`${chalk.blue('Finished')}`);
}).catch((err) => {
    console.log(`${chalk.redBright('Error:')} ${err}`);
});