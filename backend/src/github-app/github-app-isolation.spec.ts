import { of } from 'rxjs';
import { Types } from 'mongoose';
import { GithubAppService } from './github-app.service';
import { GithubAppController } from './github-app.controller';

describe('GitHub connection user isolation', () => {
  it('requires a separate PR Insight association even for the same GitHub account', async () => {
    const userA = '507f1f77bcf86cd799439011';
    const userB = '507f1f77bcf86cd799439012';
    const rows = [{ userId: userA, installationId: 42, accountLogin: 'owner', accountType: 'User' }];
    const find = jest.fn(({ userId }: { userId: Types.ObjectId }) => {
      const query = { select: () => query, lean: () => query, exec: async () => rows.filter((row) => row.userId === userId.toString()) };
      return query;
    });
    const auth = jest.fn().mockResolvedValue({ token: 'test-installation-token' });
    const service = new GithubAppService({ find } as never, {} as never, { get: () => of({ data: {} }) } as never, {} as never);
    jest.spyOn(service as unknown as { createAppAuthenticator(): Promise<typeof auth> }, 'createAppAuthenticator').mockResolvedValue(auth);
    const controller = new GithubAppController(service, {} as never);
    await expect(controller.status({ user: { id: userA } } as never)).resolves.toMatchObject({ connected: true });
    await expect(controller.status({ user: { id: userB } } as never)).resolves.toEqual({ connected: false, installations: [] });
    await expect(service.getRepositoryToken(userA, 'owner', 'private-repo')).resolves.toBe('test-installation-token');
    auth.mockClear();
    await expect(service.getRepositoryToken(userB, 'owner', 'private-repo')).rejects.toThrow('No GitHub connection');
    expect(auth).not.toHaveBeenCalled();
    expect(find).toHaveBeenLastCalledWith({ userId: new Types.ObjectId(userB) });
    rows.push({ ...rows[0], userId: userB });
    await expect(service.getRepositoryToken(userB, 'owner', 'private-repo')).resolves.toBe('test-installation-token');
  });
});
