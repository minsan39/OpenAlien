import { SkillLoader, LoadedSkill } from './loader';
import { SkillAdapter } from '../tools/adapters';
import { UnifiedTool, SkillDefinition } from '../tools/types';
import { MCPPool } from '../mcp/pool';

export interface DependencyCheckResult {
  skillName: string;
  canUse: boolean;
  missingDependencies: string[];
  missingMCPs: string[];
}

export class SkillManager {
  private loader: SkillLoader;
  private adapter: SkillAdapter;
  private mcpPool: MCPPool;

  constructor(mcpPool: MCPPool) {
    this.loader = new SkillLoader();
    this.adapter = new SkillAdapter();
    this.mcpPool = mcpPool;
  }

  async loadSkills(): Promise<LoadedSkill[]> {
    await this.loader.loadAll();
    return this.loader.getAllSkills();
  }

  getSkill(name: string): LoadedSkill | undefined {
    return this.loader.getSkill(name);
  }

  getAllSkills(): LoadedSkill[] {
    return this.loader.getAllSkills();
  }

  getLoadedSkills(): LoadedSkill[] {
    return this.loader.getLoadedSkills();
  }

  adaptSkill(skill: LoadedSkill): UnifiedTool | null {
    if (skill.status !== 'loaded') return null;
    return this.adapter.adapt(skill.definition, skill.path);
  }

  adaptAllSkills(): UnifiedTool[] {
    const tools: UnifiedTool[] = [];
    
    for (const skill of this.loader.getLoadedSkills()) {
      const tool = this.adaptSkill(skill);
      if (tool) tools.push(tool);
    }

    return tools;
  }

  async checkDependencies(skill: LoadedSkill): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      skillName: skill.definition.name,
      canUse: true,
      missingDependencies: [],
      missingMCPs: [],
    };

    const deps = skill.definition.dependencies;
    if (!deps) return result;

    if (deps.mcp) {
      for (const mcp of deps.mcp) {
        const client = await this.mcpPool.getClient(mcp.name);
        if (!client) {
          result.missingMCPs.push(mcp.name);
          if (mcp.required) {
            result.canUse = false;
          }
        }
      }
    }

    if (deps.skills) {
      for (const skillName of deps.skills) {
        const depSkill = this.loader.getSkill(skillName);
        if (!depSkill || depSkill.status !== 'loaded') {
          result.missingDependencies.push(skillName);
          result.canUse = false;
        }
      }
    }

    return result;
  }

  async checkAllDependencies(): Promise<Map<string, DependencyCheckResult>> {
    const results = new Map<string, DependencyCheckResult>();

    for (const skill of this.loader.getAllSkills()) {
      const checkResult = await this.checkDependencies(skill);
      results.set(skill.definition.name, checkResult);
    }

    return results;
  }

  async getAvailableSkills(): Promise<Array<{ skill: LoadedSkill; dependencyStatus: DependencyCheckResult }>> {
    const results: Array<{ skill: LoadedSkill; dependencyStatus: DependencyCheckResult }> = [];

    for (const skill of this.loader.getLoadedSkills()) {
      const dependencyStatus = await this.checkDependencies(skill);
      results.push({ skill, dependencyStatus });
    }

    return results;
  }

  searchSkills(query: string): LoadedSkill[] {
    const lowerQuery = query.toLowerCase();
    return this.loader.getAllSkills().filter(skill => 
      skill.definition.name.toLowerCase().includes(lowerQuery) ||
      skill.definition.description.toLowerCase().includes(lowerQuery) ||
      skill.definition.metadata?.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  getSkillsByCapability(capability: string): LoadedSkill[] {
    return this.loader.getLoadedSkills().filter(skill =>
      skill.definition.metadata?.capabilities?.includes(capability)
    );
  }

  getSkillsDir(): string {
    return this.loader.getSkillsDir();
  }
}
