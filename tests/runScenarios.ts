import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// derive __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Scenario {
  description: string;
  objective: string;
}

import inquirer from 'inquirer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// parse args
const argv = yargs(hideBin(process.argv))
  .option('file', {
    type: 'string',
    description: 'Specific scenario JSON file to run (relative to tests/scenarios)',
  })
  .option('interactive', {
    type: 'boolean',
    description: 'Prompt to choose scenario file and profile',
    default: false,
  })
  .help()
  .parseSync();

function runObjective(obj: Scenario): Promise<void> {
  return new Promise((resolve) => {
    console.log(`\n=== RUNNING: ${obj.description} ===`);
    const safeObjective = obj.objective.replace(/"/g, '\\"');
    const cmd = `npx tsx src/index.ts "${safeObjective}"`;

    const child = exec(cmd, { cwd: process.cwd(), env: process.env }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (err) {
        console.error(`Objective failed with error code ${err.code}`);
      }
      resolve();
    });

    // forward live output
    if (child.stdout) child.stdout.pipe(process.stdout);
    if (child.stderr) child.stderr.pipe(process.stderr);
  });
}

async function main() {
  // interactive profile selection
  if (argv.interactive) {
    const answers: any = await inquirer.prompt([
      {
        name: 'useProfile',
        type: 'confirm',
        message: 'Do you want to use an existing browser profile for the tests?',
        default: false,
      },
      {
        name: 'profilePath',
        when: (a) => a.useProfile,
        type: 'input',
        message: 'Enter full path to the profile directory:',
      }
    ]);
    if (answers.useProfile && answers.profilePath) {
      process.env.VIO_USER_DATA_DIR = answers.profilePath;
    }
  }

  const userProfile = process.env.VIO_USER_DATA_DIR || process.env.CHROME_USER_DATA_DIR;
  if (userProfile) {
    console.log(`Using browser profile from: ${userProfile}`);
  } else {
    console.log('No user profile path provided (VIO_USER_DATA_DIR unset). A fresh browser instance will be used.');
  }

  const scenariosDir = path.join(__dirname, 'scenarios');
  let files = fs.readdirSync(scenariosDir).filter((f) => f.endsWith('.json'));

  // filter by specific file argument if given
  if (argv.file) {
    const requested = argv.file.endsWith('.json') ? argv.file : `${argv.file}.json`;
    if (files.includes(requested)) {
      files = [requested];
    } else {
      console.warn(`Requested scenario file '${requested}' not found; available: ${files.join(', ')}`);
      return;
    }
  }

  for (const file of files) {
    const filepath = path.join(scenariosDir, file);
    let list: Scenario[] = [];
    try {
      list = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as Scenario[];
    } catch (e) {
      console.warn(`Skipping ${file}: could not parse JSON`);
      continue;
    }

    console.log(`\n--- Processing scenario file: ${file} (contains ${list.length} objectives) ---`);
    for (const obj of list) {
      await runObjective(obj);
    }
  }
}

main().catch((e) => {
  console.error('Scenario runner encountered an error:', e);
  process.exit(1);
});
