const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'numi-secret-123');
            
            const User = mongoose.model('User');
            req.user = await User.findOne({ id: decoded.id }).lean();
            
            // Re-use the multi-tenant logic from original server.js
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
            }
            
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    } else {
        // Fallback for legacy frontend (using x-user-id)
        const userId = req.headers['x-user-id'];
        if (userId) {
            try {
                const User = mongoose.model('User');
                req.user = await User.findOne({ id: userId }).lean();
                if (req.user) {
                    req.tenantId = req.user.tenantId || req.user.id || 'main';
                    return next();
                }
            } catch (e) {}
        }
        res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role) && !req.isSuperAdmin) {
            return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
};

module.exports = { protect, authorize };
