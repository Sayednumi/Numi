/**
 * ============================================================
 *  Numi Platform — Role Middleware (Backend Enforcement Layer)
 *  File: backend/middleware/roleMiddleware.js
 *
 *  Provides Express middleware functions for route-level
 *  permission enforcement on the backend.
 * ============================================================
 */

const PermissionService = require('../../src/services/PermissionService');
const { ROLES, PERMISSIONS, buildUserProfile, hasPermission, Guards, isSuperAdmin } = PermissionService;

/**
 * Middleware: Requires the user to be authenticated (x-user-id header set).
 * Attaches a fully resolved `req.userProfile` to the request.
 */
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    req.userProfile = buildUserProfile(req.user);
    next();
}

/**
 * Middleware Factory: Requires the user to have a specific role.
 * @param {...string} roles - Allowed roles from ROLES
 *
 * Usage:
 *   router.get('/admin/something', requireRole(ROLES.ADMIN), handler)
 *   router.get('/teachers', requireRole(ROLES.ADMIN, ROLES.MANAGER), handler)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const userProfile = req.userProfile || buildUserProfile(req.user);
        req.userProfile = userProfile;

        if (!roles.includes(userProfile.role) && !isSuperAdmin(userProfile)) {
            return res.status(403).json({
                error: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${userProfile.role}`
            });
        }
        next();
    };
}

/**
 * Middleware Factory: Requires the user to have a specific permission key.
 * @param {string} permission - One of the PERMISSIONS keys
 *
 * Usage:
 *   router.delete('/student/:id', requirePermission(PERMISSIONS.DELETE_STUDENT), handler)
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const userProfile = req.userProfile || buildUserProfile(req.user);
        req.userProfile = userProfile;

        if (!hasPermission(userProfile, permission)) {
            return res.status(403).json({
                error: `Access denied. Missing permission: ${permission}`
            });
        }
        next();
    };
}

/**
 * Middleware: Enforces tenant isolation.
 * Prevents a teacher/admin from accessing another tenant's data.
 * Admins with isOwner flag can query any tenant via ?tenantId=
 */
function enforceTenantIsolation(req, res, next) {
    if (!req.user) return next();

    const userProfile = req.userProfile || buildUserProfile(req.user);
    req.userProfile = userProfile;

    // Owner admin or SUPER ADMIN can cross tenants
    if (isSuperAdmin(userProfile) || (userProfile.role === ROLES.ADMIN && userProfile.permissions?.isOwner)) {
        return next();
    }

    // Non-owners: force tenantId to their own
    if ([ROLES.ADMIN, ROLES.MANAGER, ROLES.TEACHER].includes(userProfile.role)) {
        req.tenantId = userProfile.id;
    } else if (userProfile.role === ROLES.STUDENT) {
        req.tenantId = userProfile.tenantId || 'main';
    }

    next();
}

/**
 * Resolves and attaches the effective subject to req.resolvedSubject.
 * AI routes should use this middleware and read from req.resolvedSubject.
 */
function resolveSubjectMiddleware(req, res, next) {
    const userProfile = req.userProfile || buildUserProfile(req.user);
    req.userProfile = userProfile;
    req.resolvedSubject = PermissionService.resolveSubject(userProfile);
    next();
}

module.exports = {
    requireAuth,
    requireRole,
    requirePermission,
    enforceTenantIsolation,
    resolveSubjectMiddleware,
    // Re-export for convenience in route files
    ROLES,
    PERMISSIONS,
};
