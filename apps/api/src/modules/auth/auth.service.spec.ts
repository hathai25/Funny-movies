import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: JwtService;

  const cfg = {
    jwtAccessSecret: 'test-secret-test-secret-test-secret',
    jwtAccessTtl: '1h',
  } as unknown as AppConfigService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwt = new JwtService({ secret: cfg.jwtAccessSecret });
    service = new AuthService(prisma as unknown as PrismaService, jwt, cfg);
  });

  describe('register', () => {
    it('creates a user and returns an access token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'u1', createdAt: new Date(), ...data }),
      );

      const res = await service.register({
        email: 'a@b.com',
        password: 'password123',
        name: 'A',
      });

      expect(res.user.email).toBe('a@b.com');
      expect(typeof res.accessToken).toBe('string');
      expect(jwt.verify(res.accessToken, { secret: cfg.jwtAccessSecret }).sub).toBe('u1');
    });

    it('rejects when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({ email: 'a@b.com', password: 'password123', name: 'A' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns a token for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        passwordHash,
        createdAt: new Date(),
      });

      const res = await service.login({ email: 'a@b.com', password: 'password123' });
      expect(res.accessToken).toBeDefined();
      expect(res.user.id).toBe('u1');
    });

    it('rejects invalid password', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        passwordHash,
        createdAt: new Date(),
      });

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@b.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
