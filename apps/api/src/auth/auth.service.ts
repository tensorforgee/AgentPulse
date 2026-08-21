import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { SignupDto } from './dto/signup.dto';
import type { JwtAuthPayload } from './auth.types';
import {
  hashRefreshToken,
  normalizeEmail,
  refreshTokenMatches,
} from './auth.utils';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const JWT_ISSUER = 'agentpulse-api';
const JWT_AUDIENCE = 'agentpulse';

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function requiredSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') {
  const value = process.env[name];

  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`${name} must contain at least 32 bytes`);
  }

  return value;
}

function isJwtAuthPayload(
  value: unknown,
  expectedType: JwtAuthPayload['type'],
): value is JwtAuthPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<JwtAuthPayload>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.jti === 'string' &&
    payload.type === expectedType
  );
}

@Injectable()
export class AuthService {
  private readonly accessSecret = requiredSecret('JWT_ACCESS_SECRET');
  private readonly refreshSecret = requiredSecret('JWT_REFRESH_SECRET');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    if (this.accessSecret === this.refreshSecret) {
      throw new Error('JWT access and refresh secrets must be different');
    }
  }

  async signup(dto: SignupDto) {
    const email = normalizeEmail(dto.email);
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName?.trim() || null,
        },
        select: publicUserSelect,
      });

      return {
        user,
        ...(await this.issueAndStoreTokens(user.id)),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      ...(await this.issueAndStoreTokens(user.id)),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, refreshTokenHash: true },
    });

    if (
      !user?.refreshTokenHash ||
      !refreshTokenMatches(dto.refreshToken, user.refreshTokenHash)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueAndStoreTokens(user.id, user.refreshTokenHash);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    try {
      const payload = await this.verifyRefreshToken(dto.refreshToken);
      await this.prisma.user.updateMany({
        where: {
          id: payload.sub,
          refreshTokenHash: hashRefreshToken(dto.refreshToken),
        },
        data: { refreshTokenHash: null },
      });
    } catch {
      // Logout is intentionally idempotent and does not reveal token validity.
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Authenticated user no longer exists');
    }

    return user;
  }

  async verifyAccessToken(token: string): Promise<string> {
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token, {
        secret: this.accessSecret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      if (!isJwtAuthPayload(payload, 'access')) {
        throw new UnauthorizedException();
      }

      return payload.sub;
    } catch {
      throw new UnauthorizedException('A valid access token is required');
    }
  }

  private async verifyRefreshToken(token: string): Promise<JwtAuthPayload> {
    try {
      const payload: unknown = await this.jwtService.verifyAsync(token, {
        secret: this.refreshSecret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      if (!isJwtAuthPayload(payload, 'refresh')) {
        throw new UnauthorizedException();
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueAndStoreTokens(userId: string, previousHash?: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, type: 'access', jti: randomUUID() },
        {
          secret: this.accessSecret,
          algorithm: 'HS256',
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, type: 'refresh', jti: randomUUID() },
        {
          secret: this.refreshSecret,
          algorithm: 'HS256',
          expiresIn: REFRESH_TOKEN_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      ),
    ]);
    const refreshTokenHash = hashRefreshToken(refreshToken);

    if (previousHash) {
      const result = await this.prisma.user.updateMany({
        where: { id: userId, refreshTokenHash: previousHash },
        data: { refreshTokenHash },
      });

      if (result.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash },
      });
    }

    return { accessToken, refreshToken };
  }
}
