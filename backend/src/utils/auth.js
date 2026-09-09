const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function createToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '12h' });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { hashPassword, comparePassword, createToken, verifyToken };
