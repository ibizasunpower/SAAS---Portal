const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = "YOUR_GITHUB_TOKEN"; // Replace with your actual GitHub token if you hit rate limits
const repos = JSON.parse(fs.readFileSync(path.join(__dirname, 'oca_18_repos.json'), 'utf8'));

async function fetchModulesForRepo(repoName) {
    try {
        const url = `https://api.github.com/repos/OCA/${repoName}/git/trees/18.0`;
        const headers = { 'User-Agent': 'OCA-Module-Indexer' };
        if (GITHUB_TOKEN && GITHUB_TOKEN !== 'YOUR_GITHUB_TOKEN') {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }
        
        const response = await fetch(url, { headers });
        if (!response.ok) return [];

        const data = await response.json();
        if (!data.tree) return [];
        
        // Odoo modules are directories in the root that aren't dot-folders or setup files
        return data.tree
            .filter(item => item.type === 'tree' && !item.path.startsWith('.') && item.path !== 'setup')
            .map(item => item.path);
    } catch {
        return [];
    }
}

async function run() {
    console.log(`Extracting module names from ${repos.length} repositories...`);
    const allModules = {};
    let count = 0;

    for (const repo of repos) {
        const modules = await fetchModulesForRepo(repo.name);
        if (modules.length > 0) {
            allModules[repo.name] = modules;
            console.log(`[${count + 1}/${repos.length}] Found ${modules.length} modules in ${repo.name}`);
        } else {
            console.log(`[${count + 1}/${repos.length}] No modules found in ${repo.name}`);
        }
        count++;
        
        // Small delay to prevent abuse detection
        await new Promise(r => setTimeout(r, 100));
    }

    fs.writeFileSync(path.join(__dirname, 'all_oca_modules_by_repo.json'), JSON.stringify(allModules, null, 2));
    
    // Flatten list to get all unique module names
    const flatList = Object.values(allModules).flat();
    fs.writeFileSync(path.join(__dirname, 'all_oca_module_names.json'), JSON.stringify(flatList, null, 2));
    
    console.log(`Done! Found ${flatList.length} total individual modules across ${Object.keys(allModules).length} repositories.`);
}

run();
