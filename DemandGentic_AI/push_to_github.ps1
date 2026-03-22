# This script will initialize a Git repository, add your files, and push them to GitHub.

# Stop the script if any command fails
$ErrorActionPreference = "Stop"

# Check if a .git directory already exists
if (-not (Test-Path -Path ".\.git")) {
    Write-Host "Initializing a new Git repository..."
    git init
    # At the first initialization we need to set the default branch name
    git checkout -b main
} else {
    Write-Host "Git repository already exists."
}

# Check if the 'origin' remote is configured
$remote = git remote -v | Select-String -Pattern "origin"
if (-not $remote) {
    Write-Host "Adding remote 'origin'..."
    git remote add origin https://github.com/zahid-mohammadi/DemandEarn.ai.git
} else {
    Write-Host "Remote 'origin' is already configured. Setting URL to ensure it's correct."
    git remote set-url origin https://github.com/zahid-mohammadi/DemandEarn.ai.git
}

Write-Host "Adding all files to the staging area..."
git add .

Write-Host "Creating an initial commit..."
# Use git status to check if there are changes to commit
$status = git status --porcelain
if ($status) {
    git commit -m "Initial commit"
} else {
    Write-Host "No changes to commit."
}


Write-Host "Pulling from remote to sync any existing files..."
# The --allow-unrelated-histories flag is needed when the local and remote repos were initialized separately.
git pull origin main --allow-unrelated-histories

Write-Host "Pushing code to GitHub..."
git push -u origin main

Write-Host "Script completed successfully."