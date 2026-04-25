import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { YoutubeOembedClient } from './youtube-oembed.client';

@Module({
  imports: [AuthModule],
  controllers: [VideosController],
  providers: [VideosService, YoutubeOembedClient],
  exports: [VideosService],
})
export class VideosModule {}
