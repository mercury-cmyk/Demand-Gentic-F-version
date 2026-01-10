# This script will initialize a Git repository, add your files, and push them to GitHub.

# Stop the script if any command fails
$ErrorActionPreference = "Stop"

# Check if a .git directory already exists
if (-not (Test-Path -Path ".\.git")) {
    Write-Host "Initializing a new Git repository..."
    git init
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
# The -m flag is for the message. If commit fails, it might be because there are no changes.
git commit -m "Initial commit" --allow-empty

Write-Host "Pushing code to GitHub..."
# Using 'main' as the branch name. If your default is 'master', you may need to change this.
git push -u origin main

Write-Host "Script completed."
