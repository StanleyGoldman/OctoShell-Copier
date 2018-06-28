## Octoshell Copier

# Requirements
- NodeJS
- Personal Access Token with the following permissions: *repo*, *delete_repo*

# Instructions
1. `npm install`
2. Create `.env` with the following two variables
  - a. *OCTOKIT_USER*: Set equal to the user associated with the token that was just created
  - b. *OCTOKIT_TOKEN*: Set equal to the token value
3. Execute the script with `node src/index.js [interview-account] 
