import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SkillDefinition } from '../tools/types';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'openalien-nodejs');
const SKILLS_DIR = path.join(CONFIG_DIR, 'skills');

export interface LoadedSkill {
  definition: SkillDefinition;
  path: string;
  status: 'loaded' | 'error' | 'missing_dependency';
  error?: string;
}

export class SkillLoader {
  private skills: Map<string, LoadedSkill> = new Map();

  async loadAll(): Promise<Map<string, LoadedSkill>> {
    this.skills.clear();

    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
      return this.skills;
    }

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.loadSkill(entry.name);
      }
    }

    return this.skills;
  }

  private async loadSkill(skillDirName: string): Promise<void> {
    const skillPath = path.join(SKILLS_DIR, skillDirName);
    const skillJsonPath = path.join(skillPath, 'skill.json');

    if (!fs.existsSync(skillJsonPath)) {
      this.skills.set(skillDirName, {
        definition: { name: skillDirName, version: '0.0.0', description: '' },
        path: skillPath,
        status: 'error',
        error: 'skill.json not found',
      });
      return;
    }

    try {
      const content = fs.readFileSync(skillJsonPath, 'utf-8');
      const definition: SkillDefinition = JSON.parse(content);

      this.skills.set(definition.name, {
        definition,
        path: skillPath,
        status: 'loaded',
      });
    } catch (error: any) {
      this.skills.set(skillDirName, {
        definition: { name: skillDirName, version: '0.0.0', description: '' },
        path: skillPath,
        status: 'error',
        error: error.message,
      });
    }
  }

  getSkill(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  getLoadedSkills(): LoadedSkill[] {
    return this.getAllSkills().filter(s => s.status === 'loaded');
  }

  getSkillsWithErrors(): LoadedSkill[] {
    return this.getAllSkills().filter(s => s.status === 'error');
  }

  async reload(name: string): Promise<LoadedSkill | undefined> {
    const skill = this.skills.get(name);
    if (!skill) return undefined;

    await this.loadSkill(path.basename(skill.path));
    return this.skills.get(name);
  }

  getSkillsDir(): string {
    return SKILLS_DIR;
  }
}
