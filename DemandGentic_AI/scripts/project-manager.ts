#!/usr/bin/env tsx
/**
 * Multi-Project Context Switcher CLI
 * Manage and switch between multiple GCP projects for local development
 * 
 * Usage:
 *   npm run project -- list                    # List all configured projects
 *   npm run project -- switch      # Switch to a project
 *   npm run project -- current                 # Show current project
 *   npm run project -- add         # Add a new project (will prompt for details)
 *   npm run project -- remove      # Remove a project
 *   npm run project -- show        # Show project configuration
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';

interface ProjectConfig {
  projectId: string;
  region: string;
  organizationId?: string;
  billingAccount?: string;
  description?: string;
}

interface ProjectsFile {
  projects: Record;
  currentProject: string;
}

const CONFIG_DIR = path.join(process.cwd(), '.gcp-projects');
const CONFIG_FILE = path.join(CONFIG_DIR, 'projects.json');
const ENV_FILE = path.join(process.cwd(), '.env');

// Ensure config directory exists
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Load projects configuration
function loadProjects(): ProjectsFile {
  ensureConfigDir();
  
  if (fs.existsSync(CONFIG_FILE)) {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  }
  
  return {
    projects: {},
    currentProject: '',
  };
}

// Save projects configuration
function saveProjects(data: ProjectsFile) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

// Update .env file with current project settings
function updateEnvFile(project: ProjectConfig) {
  let envContent = '';
  
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  }
  
  // Remove existing GCP project settings
  envContent = envContent
    .split('\n')
    .filter(line => !line.startsWith('GCP_PROJECT_ID=') && !line.startsWith('GCP_REGION='))
    .join('\n')
    .trim();
  
  // Add new project settings
  const newSettings = `\n# GCP Project Configuration (auto-updated by project-manager)\nGCP_PROJECT_ID=${project.projectId}\nGCP_REGION=${project.region || 'us-central1'}\n`;
  
  fs.writeFileSync(ENV_FILE, envContent + newSettings);
}

// List all projects
function listProjects() {
  const config = loadProjects();
  
  if (Object.keys(config.projects).length === 0) {
    console.log('📭 No projects configured yet.');
    console.log('   Use: npm run project -- add ');
    return;
  }
  
  console.log('\n📋 Configured Projects:');
  console.log('─'.repeat(80));
  
  Object.entries(config.projects).forEach(([_, project]) => {
    const current = project.projectId === config.currentProject ? ' ✓ CURRENT' : '';
    console.log(`  ID: ${project.projectId}`);
    console.log(`      Region: ${project.region}`);
    if (project.description) {
      console.log(`      Description: ${project.description}`);
    }
    if (current) {
      console.log(`      ${current}`);
    }
    console.log('');
  });
  
  console.log(`Current project: ${config.currentProject || 'none'}`);
}

// Show current project
function showCurrent() {
  const config = loadProjects();
  
  if (!config.currentProject) {
    console.log('❌ No project currently selected');
    return;
  }
  
  const project = config.projects[config.currentProject];
  if (!project) {
    console.log(`❌ Current project "${config.currentProject}" not found`);
    return;
  }
  
  console.log('\n📌 Current Project:');
  console.log('─'.repeat(40));
  console.log(`  Project ID: ${project.projectId}`);
  console.log(`  Region: ${project.region}`);
  if (project.organizationId) {
    console.log(`  Organization: ${project.organizationId}`);
  }
  if (project.billingAccount) {
    console.log(`  Billing Account: ${project.billingAccount}`);
  }
  if (project.description) {
    console.log(`  Description: ${project.description}`);
  }
  console.log('');
}

// Switch to a project
function switchProject(projectId: string) {
  const config = loadProjects();
  
  if (!config.projects[projectId]) {
    console.error(`❌ Project "${projectId}" not found`);
    process.exit(1);
  }
  
  const project = config.projects[projectId];
  
  config.currentProject = projectId;
  saveProjects(config);
  updateEnvFile(project);
  
  console.log(`\n✅ Switched to project: ${projectId}`);
  console.log(`   Region: ${project.region}`);
  console.log(`   Updated .env file`);
}

// Show project details
function showProject(projectId: string) {
  const config = loadProjects();
  
  if (!config.projects[projectId]) {
    console.error(`❌ Project "${projectId}" not found`);
    process.exit(1);
  }
  
  const project = config.projects[projectId];
  
  console.log(`\n📝 Project Details: ${projectId}`);
  console.log('─'.repeat(50));
  console.log(`  Project ID: ${project.projectId}`);
  console.log(`  Region: ${project.region}`);
  if (project.organizationId) {
    console.log(`  Organization ID: ${project.organizationId}`);
  }
  if (project.billingAccount) {
    console.log(`  Billing Account: ${project.billingAccount}`);
  }
  if (project.description) {
    console.log(`  Description: ${project.description}`);
  }
  console.log('');
}

// Remove a project
function removeProject(projectId: string) {
  const config = loadProjects();
  
  if (!config.projects[projectId]) {
    console.error(`❌ Project "${projectId}" not found`);
    process.exit(1);
  }
  
  delete config.projects[projectId];
  
  if (config.currentProject === projectId) {
    config.currentProject = '';
  }
  
  saveProjects(config);
  console.log(`✅ Removed project: ${projectId}`);
}

// Interactive prompts
function createReadlineInterface() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: any, question: string): Promise {
  return new Promise(resolve => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

// Add a new project (interactive)
async function addProject(projectId: string) {
  const config = loadProjects();
  
  if (config.projects[projectId]) {
    console.error(`❌ Project "${projectId}" already exists`);
    process.exit(1);
  }
  
  const rl = createReadlineInterface();
  
  try {
    console.log(`\n➕ Adding new project: ${projectId}`);
    
    const region = await prompt(rl, '  Region (default: us-central1): ');
    const orgId = await prompt(rl, '  Organization ID (optional): ');
    const billingAccount = await prompt(rl, '  Billing Account (optional): ');
    const description = await prompt(rl, '  Description (optional): ');
    
    const project: ProjectConfig = {
      projectId,
      region: region || 'us-central1',
      organizationId: orgId || undefined,
      billingAccount: billingAccount || undefined,
      description: description || undefined,
    };
    
    config.projects[projectId] = project;
    
    // Ask if should set as current
    const setCurrent = await prompt(rl, '\n  Set as current project? (y/n): ');
    if (setCurrent.toLowerCase() === 'y') {
      config.currentProject = projectId;
      updateEnvFile(project);
      console.log('✅ Set as current project and updated .env file');
    }
    
    saveProjects(config);
    console.log(`✅ Added project: ${projectId}\n`);
  } finally {
    rl.close();
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🔧 Project Manager - Multi-Project Context Switcher

Usage:
  npm run project -- list              List all configured projects
  npm run project -- current           Show current project
  npm run project -- add           Add a new project
  npm run project -- switch        Switch to a project
  npm run project -- show          Show project details
  npm run project -- remove        Remove a project

Examples:
  npm run project -- add my-gcp-proj
  npm run project -- switch my-gcp-proj
  npm run project -- list
    `);
    return;
  }
  
  const [command, projectId] = args;
  
  switch (command) {
    case 'list':
      listProjects();
      break;
    case 'current':
      showCurrent();
      break;
    case 'add':
      if (!projectId) {
        console.error('❌ Project ID required');
        process.exit(1);
      }
      await addProject(projectId);
      break;
    case 'switch':
      if (!projectId) {
        console.error('❌ Project ID required');
        process.exit(1);
      }
      switchProject(projectId);
      break;
    case 'show':
      if (!projectId) {
        console.error('❌ Project ID required');
        process.exit(1);
      }
      showProject(projectId);
      break;
    case 'remove':
      if (!projectId) {
        console.error('❌ Project ID required');
        process.exit(1);
      }
      removeProject(projectId);
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});