const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'numi_educational_platform_super_secret_jwt_key_2026';
const JWT_EXPIRE = '7d';

/**
 * Generate a JWT for a user
 * @param {Object} user - The user document/object
 * @returns {String} token
 */
const generateToken = (user) => {
  const payload = {
    userId: user._id ? user._id.toString() : user.id,
    id: user._id ? user._id.toString() : user.id,
    role: user.role,
    tenantId: user.tenant || user.tenantId
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE
  });
};

/**
 * Verify a JWT token
 * @param {String} token - The token string
 * @returns {Object|null} decoded payload or null
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken
};
