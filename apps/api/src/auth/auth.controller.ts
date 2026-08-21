import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit.constants';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';

@Controller()
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/signup')
  @RateLimit(RATE_LIMIT_POLICY.authSignup)
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('auth/login')
  @RateLimit(RATE_LIMIT_POLICY.authLogin)
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('auth/refresh')
  @RateLimit(RATE_LIMIT_POLICY.authRefresh)
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('auth/logout')
  @RateLimit(RATE_LIMIT_POLICY.authRefresh)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    if (!request.authUserId) {
      throw new UnauthorizedException('A valid access token is required');
    }

    return this.authService.me(request.authUserId);
  }
}
