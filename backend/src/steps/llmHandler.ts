import { ExecutionContext, IStepHandler, StepOutput, resolvePlaceholders } from '../executor/context';
import fetch from 'node-fetch';
import { logger } from '../utils/logger';

export class LLMHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    const promptTemplate = config.prompt || 'Analyze this: {{input}}';
    const prompt = resolvePlaceholders(promptTemplate, context);
    
    const provider = process.env.LLM_PROVIDER || 'stub';
    
    if (provider === 'stub') {
      logger.info('Using LLM STUB implementation');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Artificial delay
      return {
        status: 'completed',
        output: { response: `Stubbed response for: ${prompt}`, originalPrompt: prompt }
      };
    }

    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_API_KEY is missing');
    }

    const url = provider === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
      
    const model = process.env.LLM_MODEL || 'llama3-8b-8192';
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LLM API Error: ${res.status} ${errorText}`);
    }
    
    const data = await res.json() as any;
    return {
      status: 'completed',
      output: { response: data.choices[0].message.content }
    };
  }
}
