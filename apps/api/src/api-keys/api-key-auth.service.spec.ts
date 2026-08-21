import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyAuthService } from './api-key-auth.service';
import { generateApiKey } from './api-key.utils';

describe('ApiKeyAuthService', () => {
  const generated = generateApiKey();
  const project = {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    name: 'Test project',
    slug: 'test-project',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setup(updateCount: number) {
    let lastUpdateArgs: unknown;
    const prisma = {
      apiKey: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '33333333-3333-4333-8333-333333333333',
            hashedKey: generated.digest,
            project,
          },
        ]),
        updateMany: jest.fn((args: unknown) => {
          lastUpdateArgs = args;
          return Promise.resolve({ count: updateCount });
        }),
      },
    };
    return {
      prisma,
      service: new ApiKeyAuthService(prisma as unknown as PrismaService),
      getLastUpdateArgs: () => lastUpdateArgs,
    };
  }

  it('resolves the project when the key remains active during authentication', async () => {
    const { prisma, service, getLastUpdateArgs } = setup(1);

    await expect(
      service.authenticate(generated.plaintext),
    ).resolves.toMatchObject({
      project: { id: project.id },
    });
    expect(prisma.apiKey.updateMany).toHaveBeenCalledTimes(1);
    expect(getLastUpdateArgs()).toMatchObject({
      where: {
        id: '33333333-3333-4333-8333-333333333333',
        revokedAt: null,
      },
    });
  });

  it('rejects a key revoked or expired before last-used recording', async () => {
    const { service } = setup(0);

    await expect(
      service.authenticate(generated.plaintext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
