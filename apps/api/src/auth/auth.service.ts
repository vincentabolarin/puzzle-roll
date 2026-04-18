import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AnonymousSessionDto,
  AuthResponseDto,
  UpgradeAccountDto,
} from './auth.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma/prisma.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private prisma: PrismaService
  ) {}

  private generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        isAnonymous: false,
        settings: { create: {} },
      },
    });

    const payload: JwtPayload = { sub: user.id, email: user.email, isAnonymous: false };
    const tokens = this.generateTokens(payload);

    return { ...tokens, userId: user.id, isAnonymous: false };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = { sub: user.id, email: user.email, isAnonymous: false };
    const tokens = this.generateTokens(payload);

    return { ...tokens, userId: user.id, isAnonymous: false };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    let decoded: JwtPayload & { iat: number; exp: number };
    try {
      decoded = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    const payload: JwtPayload = { sub: user.id, email: user.email, isAnonymous: user.isAnonymous };
    const tokens = this.generateTokens(payload);

    return { ...tokens, userId: user.id, isAnonymous: user.isAnonymous };
  }

  async createAnonymousSession(dto: AnonymousSessionDto): Promise<AuthResponseDto> {
    let user = dto.deviceId
      ? await this.prisma.user.findUnique({ where: { deviceId: dto.deviceId } })
      : null;

    if (!user) {
      const deviceId = dto.deviceId ?? uuidv4();
      user = await this.prisma.user.create({
        data: {
          deviceId,
          isAnonymous: true,
          settings: { create: {} },
        },
      });
    }

    const payload: JwtPayload = { sub: user.id, email: null, isAnonymous: true };
    const tokens = this.generateTokens(payload);

    return { ...tokens, userId: user.id, isAnonymous: true };
  }

  async upgradeAccount(userId: string, dto: UpgradeAccountDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isAnonymous) {
      throw new BadRequestException('Account is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: dto.email, passwordHash, isAnonymous: false },
    });

    const payload: JwtPayload = { sub: updated.id, email: updated.email, isAnonymous: false };
    const tokens = this.generateTokens(payload);

    return { ...tokens, userId: updated.id, isAnonymous: false };
  }
}
