import { HttpException } from '@nestjs/common';
import { assertPlanCapacity } from './plan-enforcement';

describe('plan enforcement', () => {
  it('preserves null as unlimited', () => {
    expect(() => assertPlanCapacity('projects', 1_000_000, null)).not.toThrow();
  });

  it('returns a clear 402 response at a configured limit', () => {
    try {
      assertPlanCapacity('members', 3, 3);
      throw new Error('Expected the plan limit to be exceeded');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'PLAN_LIMIT_EXCEEDED',
        resource: 'members',
        limit: 3,
      });
    }
  });
});
