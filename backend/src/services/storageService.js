const fs = require('fs/promises');
const path = require('path');
const { v4: uuid } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const env = require('../config/env');

const uploadsDir = path.resolve(process.cwd(), 'uploads');

function hasS3Config() {
  return Boolean(env.s3Endpoint && env.s3AccessKeyId && env.s3SecretAccessKey);
}

function createClient() {
  if (!hasS3Config()) return null;

  return new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
    },
  });
}

function buildPublicS3Url(key) {
  if (env.s3PublicBaseUrl) return `${env.s3PublicBaseUrl}/${key}`;
  if (!env.s3Endpoint) return '';
  const endpoint = env.s3Endpoint.replace(/\/$/, '');
  return `${endpoint}/${env.s3Bucket}/${key}`;
}

async function uploadFile(file, folder) {
  const safeName = path.basename(file.originalname || 'file.bin');
  const objectKey = `${folder}/${uuid()}-${safeName}`;

  if (hasS3Config()) {
    const client = createClient();
    await client.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
      }),
    );

    return { key: objectKey, url: buildPublicS3Url(objectKey) };
  }

  await fs.mkdir(path.join(uploadsDir, folder), { recursive: true });
  const filepath = path.join(uploadsDir, objectKey);
  await fs.writeFile(filepath, file.buffer);

  return { key: objectKey, url: `/uploads/${objectKey}` };
}

module.exports = { uploadFile, uploadsDir };
