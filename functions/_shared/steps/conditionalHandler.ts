import { ExecutionContext, IStepHandler, StepOutput, resolvePlaceholders } from '../executor/context';

export class ConditionalHandler implements IStepHandler {
  async execute(config: any, context: ExecutionContext): Promise<StepOutput> {
    const inputVal = resolvePlaceholders('{{input}}', context) || '';
    const targetVal = config.value || '';
    const operator = config.operator || 'contains';
    
    let isTrue = false;
    
    if (operator === 'contains') {
      isTrue = inputVal.includes(targetVal);
    } else if (operator === 'equals') {
      isTrue = inputVal === targetVal;
    } else if (operator === 'not_equals') {
      isTrue = inputVal !== targetVal;
    }
    
    return {
      status: 'completed',
      output: { evaluated: isTrue, inputVal, targetVal, operator }
    };
  }
}
