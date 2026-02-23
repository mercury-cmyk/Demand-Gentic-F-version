import { describe, expect, it } from 'vitest';
import { canProceedFromClientProjectStep } from '../step-client-project';

describe('StepClientProject progression guard', () => {
  it('blocks when no client is selected', () => {
    expect(canProceedFromClientProjectStep('', '', false)).toBe(false);
  });

  it('requires project when projects are available', () => {
    expect(canProceedFromClientProjectStep('client-1', '', true)).toBe(false);
    expect(canProceedFromClientProjectStep('client-1', 'project-1', true)).toBe(true);
  });

  it('allows next without project when client has no projects', () => {
    expect(canProceedFromClientProjectStep('client-1', '', false)).toBe(true);
  });
});

