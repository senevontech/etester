import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('STORAGE_BUCKET');
    this.client = new S3Client({
      region: this.configService.getOrThrow<string>('STORAGE_REGION'),
      endpoint: this.configService.get<string>('STORAGE_ENDPOINT') || undefined,
      forcePathStyle: this.configService.get<boolean>('STORAGE_FORCE_PATH_STYLE', false),
      credentials: this.configService.get<string>('STORAGE_ACCESS_KEY_ID')
        ? {
            accessKeyId: this.configService.getOrThrow<string>('STORAGE_ACCESS_KEY_ID'),
            secretAccessKey: this.configService.getOrThrow<string>('STORAGE_SECRET_ACCESS_KEY')
          }
        : undefined
    });
  }

  async createUploadUrl(key: string, contentType: string, expiresIn = 900) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });

    return {
      key,
      bucket: this.bucket,
      url: await getSignedUrl(this.client, command, { expiresIn })
    };
  }

  async createDownloadUrl(key: string, expiresIn = 900) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    return {
      key,
      bucket: this.bucket,
      url: await getSignedUrl(this.client, command, { expiresIn })
    };
  }
}
