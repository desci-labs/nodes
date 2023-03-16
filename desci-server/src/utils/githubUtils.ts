import axios from 'axios';

interface GithubUrlInfo {
  branch: string;
  author: string;
  repo: string;
}

export const processGithubUrl = async (e: string): Promise<GithubUrlInfo> => {
  const [, author, repo] = e.match(/github.com[\/:]([^\/]+)\/([^\/^.]+)/);

  let branch: string;
  if (e.includes('/tree/')) {
    branch = e.match(/\/tree\/([^\/]+)/)[1];
  } else {
    branch = await retrieveDefaultBranch(author, repo);
  }
  console.log('SCAN: author,repo', author, repo);
  return { branch, author, repo };
};

export const getGithubExternalUrl = async (e: string): Promise<string> => {
  const { author, repo } = await processGithubUrl(e);
  return `https://github.com/${author}/${repo}`;
};

const retrieveDefaultBranch = async (author: string, repo: string): Promise<string> => {
  const url = `https://api.github.com/repos/${author}/${repo}`;
  const res = await axios.get(url);
  const { default_branch } = res.data;
  if (!default_branch) throw Error(`Unable to retrieve default branch for github repo url: ${url}`);
  return default_branch;
};
