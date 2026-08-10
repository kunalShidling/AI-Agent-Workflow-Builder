export interface ExecutionContext {
  workflowRunId: string;
  workflowId: string;
  outputs: Record<string, any>;
  triggerPayload?: any;
}

export interface StepOutput {
  status: 'completed' | 'failed' | 'paused' | 'skipped';
  output?: any;
  error?: any;
  nextStepOverride?: string; // For conditional branching
}

export interface IStepHandler {
  execute(config: any, context: ExecutionContext): Promise<StepOutput>;
}

// Utility to replace placeholders like {{step_name.field}} or {{trigger.payload.field}}
export function resolvePlaceholders(text: string, context: ExecutionContext): string {
  if (!text) return text;
  
  return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    // Basic lookup for {{input}}
    if (path === 'input') {
      const keys = Object.keys(context.outputs);
      const lastKey = keys[keys.length - 1];
      if (lastKey && context.outputs[lastKey]) {
        return typeof context.outputs[lastKey] === 'string' ? context.outputs[lastKey] : JSON.stringify(context.outputs[lastKey]);
      }
    }
    
    // Support for {{trigger.payload.fieldName}}
    if (path.startsWith('trigger.payload') && context.triggerPayload) {
      const field = path.replace('trigger.payload.', '');
      if (field === 'trigger.payload') {
        // user requested the whole payload
        return typeof context.triggerPayload === 'string' ? context.triggerPayload : JSON.stringify(context.triggerPayload);
      }
      
      const val = context.triggerPayload[field];
      if (val !== undefined) {
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      }
    }
    
    return match;
  });
}
