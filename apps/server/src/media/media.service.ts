import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

const LIMITS = { image: 10 * 1024 * 1024, video: 500 * 1024 * 1024 };

@Injectable()
export class MediaService {
  constructor(private readonly cfg: ConfigService) {}

  sign(teamId: bigint, dto: { kind: 'image' | 'video'; ext: string; size: number }) {
    if (dto.size > LIMITS[dto.kind]) {
      throw new BadRequestException({
        code: 40001,
        message: `${dto.kind} 大小超过限制（${LIMITS[dto.kind] / 1024 / 1024} MB）`,
      });
    }
    const ext = dto.ext.replace(/^\./, '').toLowerCase().slice(0, 5);
    const key = `t${teamId}/${dto.kind}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    const bucket = this.cfg.get<string>('COS_BUCKET') ?? 'redmatrix';
    const region = this.cfg.get<string>('COS_REGION') ?? 'ap-shanghai';
    // Production: generate temporary STS credentials with `qcloud-cos-sts` for direct upload.
    // Dev placeholder: return a fake signed URL pointing to local mock.
    return {
      key,
      uploadUrl: `https://${bucket}.cos.${region}.myqcloud.com/${key}?placeholder=sts-credentials-required`,
      publicUrl: `https://${bucket}.cos.${region}.myqcloud.com/${key}`,
      ttl: 900,
    };
  }
}
