"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Octokit = require("@octokit/rest");
const chalk_1 = require("chalk");
const fs = require("fs-extra");
const Git = require("nodegit");
const tmp = require("tmp");
// tslint:disable-next-line:no-var-requires
require('dotenv').config();
if (process.argv.length !== 3) {
    console.log(`${chalk_1.default.red('Missing Arguments')}: [destinationAccount]`);
    process.exit(1);
}
const destinationAccount = process.argv[2];
const octokit = new Octokit({
    timeout: 0,
    headers: {}
});
const tokenUser = process.env.OCTOKIT_USER;
if (!tokenUser) {
    console.log(`${chalk_1.default.red('Missing Envionrment Variable')}: OCTOKIT_USER`);
    process.exit(1);
}
const token = process.env.OCTOKIT_TOKEN;
if (!tokenUser) {
    console.log(`${chalk_1.default.red('Missing Envionrment Variable')}: OCTOKIT_TOKEN`);
    process.exit(1);
}
octokit.authenticate({
    type: 'token',
    token
});
const getOctokitUser = () => __awaiter(this, void 0, void 0, function* () {
    const operator = yield octokit.users.get({});
    return operator.data.login;
});
const deleteRepoIfExists = (owner, repo) => __awaiter(this, void 0, void 0, function* () {
    let gitRepo;
    try {
        gitRepo = yield octokit.repos.get({ owner, repo });
    }
    catch (err) {
        return;
    }
    if (gitRepo) {
        yield octokit.repos.delete({ owner, repo });
    }
});
const createPullRequest = (owner, repo, pullRequest) => __awaiter(this, void 0, void 0, function* () {
    const destPullRequest = yield octokit.pullRequests.create({
        owner,
        repo,
        title: pullRequest.title,
        body: pullRequest.body,
        head: pullRequest.head.ref,
        base: pullRequest.base.ref
    });
    console.log(`${chalk_1.default.blue('Copied pullRequest')} #${pullRequest.number} to #${destPullRequest.data.number}`);
});
const createIssue = (owner, repo, issue) => __awaiter(this, void 0, void 0, function* () {
    const destIssue = yield octokit.issues.create({
        owner,
        repo,
        title: issue.title,
        body: issue.body
    });
    console.log(`${chalk_1.default.blue('Copied issue')} #${issue.number} to #${destIssue.data.number}`);
});
const remoteRefRegex = new RegExp('^refs\/remotes\/origin\/(.*)$');
const headRefRegex = new RegExp('^refs\/heads\/(.*)$');
(() => __awaiter(this, void 0, void 0, function* () {
    const sourceOwner = 'StanleyGoldman';
    const sourceRepo = 'OctoShell';
    const sourceRepoDetails = yield octokit.repos.get({ owner: sourceOwner, repo: sourceRepo });
    console.log(`${chalk_1.default.blue('Copying')} ${sourceRepoDetails.data.html_url}`);
    const owner = yield getOctokitUser();
    const repo = `OctoShell-${destinationAccount}`;
    const repoPath = `${owner}/${repo}`;
    yield deleteRepoIfExists(owner, repo);
    console.log(`${chalk_1.default.blue('Deleted')} ${repoPath}`);
    const repoCreateParams = {
        name: repo,
        private: true
    };
    const repoDetails = yield octokit.repos.create(repoCreateParams);
    console.log(`${chalk_1.default.blue('Created')} ${owner}/${repo}`);
    const tempDir = tmp.dirSync();
    console.log(`${chalk_1.default.blue('Cloning')} to ${tempDir.name}`);
    const gitRepo = yield Git.Clone.clone(`https://github.com/${sourceOwner}/${sourceRepo}.git`, tempDir.name);
    console.log(`${chalk_1.default.blue('Cloned')} to ${tempDir.name}`);
    let refs = yield Git.Reference.list(gitRepo);
    for (const ref of refs) {
        const refMatch = ref.match(remoteRefRegex);
        if (refMatch) {
            const branchName = refMatch[1];
            if (branchName !== 'master') {
                const branchReference = yield gitRepo.getBranch(ref);
                yield gitRepo.createBranch(branchName, branchReference.target(), false, null, null);
                console.log(`${chalk_1.default.blue('Checkout')} ${branchName}`);
            }
        }
    }
    gitRepo.checkoutBranch('master');
    console.log(`${chalk_1.default.blue('Checkout')} master`);
    gitRepo.refreshIndex();
    refs = yield Git.Reference.list(gitRepo);
    const localBranches = refs.filter((ref) => ref.match(headRefRegex));
    yield Git.Remote.delete(gitRepo, 'origin');
    const remote = yield Git.Remote.create(gitRepo, 'origin', repoDetails.data.clone_url);
    yield remote.push(localBranches, {
        callbacks: {
            credentials: (url, userName) => {
                return Git.Cred.userpassPlaintextNew(tokenUser, token);
            }
        }
    });
    console.log(`${chalk_1.default.blue('Pushed')}`);
    gitRepo.free();
    yield fs.remove(tempDir.name);
    console.log(`${chalk_1.default.blue('Deleted')} ${tempDir.name}`);
    const getIssuesResponse = yield octokit.issues.getForRepo({
        owner: sourceOwner,
        state: 'open',
        repo: sourceRepo,
    });
    // tslint:disable-next-line:no-any
    const issues = getIssuesResponse.data
        .filter((item) => !item.pull_request)
        .sort((item) => item.number)
        .map((issue) => ({
        index: issue.numer,
        getPromise: () => createIssue(owner, repo, issue)
    }));
    const getPullRequestsResponse = yield octokit.pullRequests.getAll({
        owner: sourceOwner,
        state: 'open',
        repo: sourceRepo
    });
    // tslint:disable-next-line:no-any
    const pullRequests = getPullRequestsResponse.data
        .sort((item) => item.number)
        .map((pullRequest) => ({
        index: pullRequest.numer,
        getPromise: () => createPullRequest(owner, repo, pullRequest)
    }));
    const copyOperations = [...issues, ...pullRequests]
        .sort((operation) => operation.index);
    for (const copyOperation of copyOperations) {
        yield copyOperation.getPromise();
    }
    yield octokit.repos.addCollaborator({ owner, repo, username: destinationAccount, permission: 'admin' });
    console.log(`${chalk_1.default.blue('Invited')} ${destinationAccount}`);
    console.log(`${chalk_1.default.blue('Completed')} ${repoDetails.data.html_url}`);
}))().then(() => {
    console.log(`${chalk_1.default.blue('Finished')}`);
}).catch((err) => {
    console.log(`${chalk_1.default.redBright('Error:')} ${err}`);
});
//# sourceMappingURL=index.js.map