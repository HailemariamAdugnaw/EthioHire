const path = require('path');
const { v4: uuid } = require('uuid');
const env = require('../config/env');

function buildObjectUrl(folder, filename) {
  const objectName = `${folder}/${uuid()}-${filename}`;
  return `${env.s3BaseUrl}/${env.s3Bucket}/${objectName}`;
}

function fakeUpload(file, folder) {
  const safeName = path.basename(file.originalname || 'file.bin');
  return { url: buildObjectUrl(folder, safeName), key: `${folder}/${safeName}` };
}

module.exports = { fakeUpload };
