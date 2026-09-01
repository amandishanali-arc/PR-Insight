import { Test, TestingModule } from '@nestjs/testing';
import { GithubService } from './github.service';
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

describe('GithubService', () => {
  let service: GithubService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GithubService],
    }).compile();

    service = module.get<GithubService>(GithubService);
  });

  it('should be defined', () => {
    assert.ok(service);
  });
});

