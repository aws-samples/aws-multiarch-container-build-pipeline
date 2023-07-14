const DefaultGitBranch = 'main';

function throwExpression(errorMessage: string): never {
  throw new Error(errorMessage);
}

export function getDomainName() {
  return process.env.DOMAIN_NAME || throwExpression('Missing DOMAIN_NAME');
}

export function getCodeStarConnectionArn() {
  return process.env.CODESTAR_CONNECTION_ARN || throwExpression('Missing CODESTAR_CONNECTION_ARN');
}

export function getGitHubOwner() {
  return process.env.GITHUB_OWNER || throwExpression('Missing GITHUB_OWNER');
}

export function getGitHubRepo() {
  return process.env.GITHUB_REPO || throwExpression('Missing GITHUB_REPO');
}

export function getGitBranch() {
  return process.env.GIT_BRANCH || DefaultGitBranch;
}
