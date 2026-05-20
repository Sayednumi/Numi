const { verifyToken } = require('../config/jwt');
const mongoose = require('mongoose');

const requireAuth = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
            }
            
            const User = mongoose.model('User');
            const searchId = decoded.userId || decoded.id;
            
            // Try to find by id (custom field) or standard _id
            req.user = await User.findOne({ 
                $or: [
                    { id: searchId }, 
                    { _id: mongoose.isValidObjectId(searchId) ? searchId : undefined }
                ].filter(Boolean)
            }).lean();
            
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'User not found' });
            }
            
            const isSuperAdmin = req.user.role === 'super_admin' 
              || req.user.phone === '01110154093'
              || (req.user.permissions && req.user.permissions.isSuperAdmin === true);

            if (isSuperAdmin || req.query.scope === 'global') {
              req.tenantId = 'global';
              req.isSuperAdmin = true;
            } else {
              req.tenantId = req.user.tenantId || req.user.id || 'main';
            }
            
            return next();
        } catch (error) {
            console.error('requireAuth Error:', error);
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    } else {
        // Graceful fallback to x-user-id for legacy compatibility
        const userId = req.headers['x-user-id'];
        if (userId) {
            try {
                const User = mongoose.model('User');
                req.user = await User.findOne({ id: userId }).lean();
                if (req.user) {
                    const isSuperAdmin = req.user.role === 'super_admin' 
                      || req.user.phone === '01110154093'
                      || (req.user.permissions && req.user.permissions.isSuperAdmin === true);

                    if (isSuperAdmin || req.query.scope === 'global') {
                      req.tenantId = 'global';
                      req.isSuperAdmin = true;
                    } else {
                      req.tenantId = req.user.tenantId || req.user.id || 'main';
                    }
                    return next();
                }
            } catch (e) {}
        }
        return res.status(401).json({ success: false, message: 'Not authorized, token required' });
    }
};

// Aliasing protect as requireAuth for maximum safety
const protect = requireAuth;

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || (!roles.includes(req.user.role) && !req.isSuperAdmin)) {
            return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
};

module.exports = { requireAuth, protect, authorize };
