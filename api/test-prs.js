const { Octokit } = require('@octokit/rest');
const fs = require('fs');

// Читаем токен из .env
const envContent = fs.readFileSync('/home/kent/Diplom/sdlc-monitor/api/.env', 'utf8');
const tokenMatch = envContent.match(/GITHUB_TOKEN="?([^"\n]+)"?/);
const token = tokenMatch ? tokenMatch[1] : undefined;

console.log('Token found:', token ? `${token.slice(0, 10)}...` : 'NO TOKEN');

const octokit = new Octokit({ auth: token });

async function test() {
  // Тест PR
  const prs = await octokit.pulls.list({
    owner: 'nestjs',
    repo: 'nest',
    state: 'closed',
    per_page: 5,
    page: 1,
  });
  
  console.log(`PRs found: ${prs.data.length}`);
  prs.data.slice(0, 3).forEach(pr => {
    console.log(`  PR #${pr.number}: "${pr.title.slice(0, 40)}" by ${pr.user?.login}`);
  });
}

test().catch(err => console.error('ERROR:', err.message, err.status));
