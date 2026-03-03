import { UnifiedTool, ToolExecutor, ToolContext, ToolResult, SkillDefinition } from '../types';

export class SkillAdapter {
  adapt(skill: SkillDefinition, skillPath: string): UnifiedTool {
    const executor: ToolExecutor = async (
      args: Record<string, any>,
      context: ToolContext
    ): Promise<ToolResult> => {
      try {
        const skillModule = await this.loadSkillModule(skillPath, skill);
        
        if (!skillModule || typeof skillModule.handler !== 'function') {
          return {
            success: false,
            error: `Skill ${skill.name} has no valid handler`,
          };
        }

        const result = await skillModule.handler(args, context);
        
        return {
          success: true,
          data: result,
          metadata: {
            skillName: skill.name,
            skillVersion: skill.version,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Skill execution failed',
          metadata: {
            skillName: skill.name,
          },
        };
      }
    };

    return {
      id: `skill:${skill.name}`,
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputs || skill.parameters || skill.inputSchema || {
        type: 'object',
        properties: {},
      },
      source: 'skill',
      executor,
      metadata: {
        version: skill.version,
        tags: skill.metadata?.tags,
        capabilities: skill.metadata?.capabilities,
        dependencies: this.extractDependencies(skill),
      },
    };
  }

  private async loadSkillModule(skillPath: string, skill: SkillDefinition): Promise<any> {
    try {
      const mainFile = skill.main || 'index.js';
      const fullPath = require('path').join(skillPath, mainFile);
      
      delete require.cache[require.resolve(fullPath)];
      const module = require(fullPath);
      
      return {
        handler: module[skill.handler || 'handler'] || module.default || module,
      };
    } catch (error) {
      throw new Error(`Failed to load skill module: ${error}`);
    }
  }

  private extractDependencies(skill: SkillDefinition): UnifiedTool['metadata']['dependencies'] {
    const dependencies: UnifiedTool['metadata']['dependencies'] = [];

    if (skill.dependencies?.mcp) {
      for (const mcp of skill.dependencies.mcp) {
        dependencies.push({
          type: 'mcp',
          name: mcp.name,
          required: mcp.required,
          autoInstall: mcp.autoInstall,
        });
      }
    }

    if (skill.dependencies?.skills) {
      for (const skillName of skill.dependencies.skills) {
        dependencies.push({
          type: 'skill',
          name: skillName,
          required: true,
        });
      }
    }

    return dependencies;
  }
}
