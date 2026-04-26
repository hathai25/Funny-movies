import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { shareVideoSchema, type ShareVideoInput } from '@remitano/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(201)
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(shareVideoSchema)) body: ShareVideoInput,
  ) {
    return this.videos.share(user.id, body);
  }

  @Get()
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.videos.list({ cursor, limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit });
  }
}
