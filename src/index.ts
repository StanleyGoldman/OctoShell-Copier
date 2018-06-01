import * as Octokit from '@octokit/rest';
import * as fs from 'fs';
import * as Git from 'nodegit';

// tslint:disable-next-line:no-var-requires
require('dotenv').config();

// if (process.argv.length !== 3) {
//     console.log('Arguments: [accountIndex]');
//     process.exit(1);
// }

// const accountIndex = parseInt(process.argv[2]);

const blah = async () => {
    const octokit = new Octokit();
    // const blah = Git.Clone.clone('', '');
    // await fs.exists('');
};