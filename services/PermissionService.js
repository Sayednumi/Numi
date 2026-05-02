/**
 * ============================================================
 *  Numi Platform — Permission & Role System (Core Layer)
 *  File: src/services/PermissionService.js
 * 
 *  This is a pure-logic, UI-agnostic module.
 *  It defines roles, permissions, and subject resolution.
 *  Compatible with both browser (frontend) and Node.js (backend via require).
 * ============================================================
 */

// ─── 1. ROLE DEFINITIONS ─────────────────────────────────────────────────────

const ROLES = Object.freeze({
    SUPER_ADMIN: 'super_admin',
    ADMIN:   'admin',
    MANAGER: 'manager',
    TEACHER: 'teacher',
    STUDENT: 'student'
});

// ─── 2. PERMISSION KEYS ──────────────────────────────────────────────────────
// Single source of truth for all permission keys used across the platform.

const PERMISSIONS = Object.freeze({
    // Students & Accounts
    VIEW_STUDENTS:        'view_students',
    ADD_STUDENT:          'add_student',
    EDIT_STUDENT:         'edit_student',
    DELETE_STUDENT:       'delete_student',
    RESET_QUIZ:           'reset_quiz',

    // Structure & Content
    VIEW_STRUCTURE:       'view_structure',
    MANAGE_STRUCTURE:     'manage_structure',
    MANAGE_LESSONS:       'manage_lessons',
    MANAGE_ALL_GROUPS:    'manage_all_groups',

    // Live Classes & Chat
    VIEW_LIVE:            'view_live',
    MANAGE_LIVE:          'manage_live',
    VIEW_CHAT:            'view_chat',
    SEND_CHAT:            'send_chat',

    // Question Bank & AI
    VIEW_QBANK:           'view_qbank',
    MANAGE_QBANK:         'manage_qbank',
    GENERATE_AI:          'generate_ai',

    // Games & Platforms
    VIEW_GAMES:           'view_games',
    MANAGE_GAMES:         'manage_games',
    VIEW_TEACHER_PLATFORMS:   'view_teacher_platforms',
    MANAGE_TEACHER_PLATFORMS: 'manage_teacher_platforms',

    // Reporting & Dashboard
    VIEW_DASHBOARD:       'view_dashboard',
    VIEW_REPORTS:         'view_reports',

    // Administration
    MANAGE_TEACHERS:      'manage_teachers',
    MANAGE_ADMINS:        'manage_admins',
    MANAGE_PLATFORM:      'manage_platform',  // Platform-wide settings (owner only)

    // Student-only interactions
    TAKE_QUIZ:            'take_quiz',
    VIEW_LESSON:          'view_lesson',
    USE_AI_CHAT:          'use_ai_chat'
});


// ─── 3. ROLE → DEFAULT PERMISSION MAPS ───────────────────────────────────────
// These are the DEFAULT permissions for each role.
// Individual users can have overrides stored in their `permissions` object.

const ROLE_DEFAULT_PERMISSIONS = Object.freeze({

    [ROLES.ADMIN]: Object.values(PERMISSIONS).reduce((acc, key) => {
        acc[key] = true;
        return acc;
    }, {}),

    [ROLES.MANAGER]: {
        [PERMISSIONS.VIEW_STUDENTS]:          true,
        [PERMISSIONS.ADD_STUDENT]:            true,
        [PERMISSIONS.EDIT_STUDENT]:           true,
        [PERMISSIONS.DELETE_STUDENT]:         true,
        [PERMISSIONS.RESET_QUIZ]:             true,
        [PERMISSIONS.VIEW_STRUCTURE]:         true,
        [PERMISSIONS.MANAGE_STRUCTURE]:       true,
        [PERMISSIONS.MANAGE_LESSONS]:         true,
        [PERMISSIONS.MANAGE_ALL_GROUPS]:      true,
        [PERMISSIONS.VIEW_LIVE]:              true,
        [PERMISSIONS.MANAGE_LIVE]:            true,
        [PERMISSIONS.VIEW_CHAT]:              true,
        [PERMISSIONS.SEND_CHAT]:              true,
        [PERMISSIONS.VIEW_QBANK]:             true,
        [PERMISSIONS.MANAGE_QBANK]:           true,
        [PERMISSIONS.GENERATE_AI]:            true,
        [PERMISSIONS.VIEW_GAMES]:             true,
        [PERMISSIONS.MANAGE_GAMES]:           true,
        [PERMISSIONS.VIEW_TEACHER_PLATFORMS]: true,
        [PERMISSIONS.MANAGE_TEACHER_PLATFORMS]: true,
        [PERMISSIONS.VIEW_DASHBOARD]:         true,
        [PERMISSIONS.VIEW_REPORTS]:           true,
        [PERMISSIONS.MANAGE_TEACHERS]:        true,
        // Managers CANNOT manage other admins or platform-level settings
        [PERMISSIONS.MANAGE_ADMINS]:          false,
        [PERMISSIONS.MANAGE_PLATFORM]:        false
    },

    [ROLES.TEACHER]: {
        [PERMISSIONS.VIEW_STUDENTS]:          true,
        [PERMISSIONS.ADD_STUDENT]:            true,
        [PERMISSIONS.EDIT_STUDENT]:           true,
        [PERMISSIONS.DELETE_STUDENT]:         true,
        [PERMISSIONS.RESET_QUIZ]:             true,
        [PERMISSIONS.VIEW_STRUCTURE]:         true,
        [PERMISSIONS.MANAGE_STRUCTURE]:       true,
        [PERMISSIONS.MANAGE_LESSONS]:         true,
        [PERMISSIONS.MANAGE_ALL_GROUPS]:      false, // Only own groups
        [PERMISSIONS.VIEW_LIVE]:              true,
        [PERMISSIONS.MANAGE_LIVE]:            true,
        [PERMISSIONS.VIEW_CHAT]:              true,
        [PERMISSIONS.SEND_CHAT]:              true,
        [PERMISSIONS.VIEW_QBANK]:             true,
        [PERMISSIONS.MANAGE_QBANK]:           true,
        [PERMISSIONS.GENERATE_AI]:            true,
        [PERMISSIONS.VIEW_GAMES]:             true,
        [PERMISSIONS.MANAGE_GAMES]:           true,
        [PERMISSIONS.VIEW_TEACHER_PLATFORMS]: true,
        [PERMISSIONS.MANAGE_TEACHER_PLATFORMS]: true,
        [PERMISSIONS.VIEW_DASHBOARD]:         true,
        [PERMISSIONS.VIEW_REPORTS]:           true,
        // Teachers CANNOT manage other teachers, admins, or platform settings
        [PERMISSIONS.MANAGE_TEACHERS]:        false,
        [PERMISSIONS.MANAGE_ADMINS]:          false,
        [PERMISSIONS.MANAGE_PLATFORM]:        false
    },

    [ROLES.STUDENT]: {
        [PERMISSIONS.VIEW_LESSON]:            true,
        [PERMISSIONS.TAKE_QUIZ]:              true,
        [PERMISSIONS.USE_AI_CHAT]:            true,
        [PERMISSIONS.VIEW_CHAT]:              true,
        [PERMISSIONS.SEND_CHAT]:              true,
        // Students have NO admin or management permissions
    }
});


// ─── 4. USER PROFILE EXTENSION ───────────────────────────────────────────────
// Utility to normalize/extend a raw user object with full role profile.

/**
 * Extends a raw user object with resolved role, permissions, and subject.
 * This is the canonical way to prepare a user object before use.
 * @param {Object} rawUser - Raw user from DB or localStorage
 * @returns {Object} Extended user profile
 */
function buildUserProfile(rawUser) {
    if (!rawUser) return null;

    const role = rawUser.role || ROLES.STUDENT;

    return {
        // Core identity
        id:             rawUser.id || rawUser._id || '',
        name:           rawUser.name || '',
        phone:          rawUser.phone || '',
        role:           role,

        // Multi-tenancy
        tenantId:       rawUser.tenantId || 'main',
        academyId:      rawUser.academyId || null, // Reserved for future multi-school

        // Subject system (resolved via resolveSubject below)
        subject:        resolveSubject(rawUser).subject,
        subjectSource:  resolveSubject(rawUser).source,
        managerSubject: rawUser.managerSubject || null, // Manager override

        // Status & grouping
        status:         rawUser.status || 'inactive',
        classId:        rawUser.classId || '',
        groupId:        rawUser.groupId || '',

        // Raw permissions from DB (merged with role defaults)
        permissions:    rawUser.permissions || {},

        // Preserve other fields
        xp:             rawUser.xp || 0,
        streak:         rawUser.streak || 0,
        avatar:         rawUser.avatar || '',
    };
}


// ─── 5. PERMISSION CHECKER ───────────────────────────────────────────────────

/**
 * Helper to determine if the user has absolute global override capability
 */
function isSuperAdmin(user) {
    if (!user) return false;
    // ABSOLUTE OWNER: By role, by name, or by specific phone number
    return user.role === ROLES.SUPER_ADMIN 
        || user.name === 'سيد حمدي' 
        || user.phone === '01110154093'
        || (user.permissions && user.permissions.isSuperAdmin === true);
}

/**
 * Checks whether a user has a specific permission.
 * Priority: super_admin → individual override → role default.
 *
 * @param {Object} user       - Extended user profile (from buildUserProfile)
 * @param {string} permission - One of the PERMISSIONS keys
 * @returns {boolean}
 */
function hasPermission(user, permission) {
    if (!user || !permission) return false;

    // GLOBAL OVERRIDE
    if (isSuperAdmin(user)) return true;

    const role = user.role || ROLES.STUDENT;

    // Admin (owner) with isOwner flag gets everything
    if (role === ROLES.ADMIN && user.permissions?.isOwner) return true;

    // Check individual user permission override first
    if (user.permissions && typeof user.permissions[permission] !== 'undefined') {
        return !!user.permissions[permission];
    }

    // Fall back to role default
    const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role] || {};
    return !!roleDefaults[permission];
}

/**
 * Returns a resolved permissions map for a user (all keys, merged with role defaults).
 * Useful for sending to the frontend in a single object.
 *
 * @param {Object} user - Extended user profile
 * @returns {Object} Full permissions map { permission_key: bool }
 */
function resolvePermissions(user) {
    if (!user) return {};

    // GLOBAL OVERRIDE
    if (isSuperAdmin(user) || (user.role === ROLES.ADMIN && user.permissions?.isOwner)) {
        return Object.values(PERMISSIONS).reduce((acc, key) => {
            acc[key] = true;
            return acc;
        }, {});
    }

    const role = user.role || ROLES.STUDENT;
    const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role] || {};

    // Merge: role defaults + individual overrides
    return {
        ...roleDefaults,
        ...(user.permissions || {})
    };
}


// ─── 6. SUBJECT OVERRIDE LOGIC ───────────────────────────────────────────────

const DEFAULT_SUBJECT = 'math';

/**
 * Resolves the effective subject for a user using priority rules:
 *   1. Manager-assigned subject (highest priority)
 *   2. Teacher/user self-selected subject
 *   3. Default fallback ('math')
 *
 * @param {Object} user - Extended user profile
 * @returns {{ subject: string, source: 'manager'|'teacher'|'default' }}
 */
function resolveSubject(user) {
    if (!user) return { subject: DEFAULT_SUBJECT, source: 'default' };

    // 1. Teacher / self-selected subject (highest priority at login)
    if (user.subject) {
        return { subject: user.subject, source: 'teacher' };
    }

    // 2. Admin/Manager assigned subject
    if (user.managerSubject) {
        return { subject: user.managerSubject, source: 'manager' };
    }

    // 3. Default fallback
    return { subject: DEFAULT_SUBJECT, source: 'default' };
}


// ─── 7. ROLE GUARD FACTORY ───────────────────────────────────────────────────
// Useful for wrapping actions/routes with role checks.

/**
 * Creates a guard function that verifies the user has the required role(s).
 * @param {...string} allowedRoles - One or more roles from ROLES
 * @returns {Function} Guard: (user) => boolean
 */
function createRoleGuard(...allowedRoles) {
    return function guard(user) {
        if (!user || !user.role) return false;
        return allowedRoles.includes(user.role);
    };
}

// Pre-built guards for common use
const Guards = {
    isSuperAdmin: createRoleGuard(ROLES.SUPER_ADMIN),
    isAdmin:   createRoleGuard(ROLES.SUPER_ADMIN, ROLES.ADMIN),
    isManager: createRoleGuard(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER),
    isTeacher: createRoleGuard(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.TEACHER),
    isStudent: createRoleGuard(ROLES.STUDENT),
    isStaff:   createRoleGuard(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.TEACHER),
};


// ─── 8. AI INTEGRATION ADAPTER ───────────────────────────────────────────────
// The AI system must ONLY read the subject through this adapter.

/**
 * Returns the subject context to inject into AI prompts.
 * Ensures the AI always uses the resolved subject, never a raw field.
 *
 * @param {Object} user - Extended user profile
 * @returns {{ subject: string, source: string, prompt_hint: string }}
 */
function getAISubjectContext(user) {
    const { subject, source } = resolveSubject(user);
    return {
        subject,
        source,
        prompt_hint: `You are an AI assistant for the "${subject}" subject on the Numi platform. ` +
                     `Subject resolved from: ${source}.`
    };
}


// ─── 9. ORGANIZATION-AWARE PERMISSION GUARD ──────────────────────────────────────

/**
 * Checks BOTH role permission AND organization membership.
 * This is the production-safe guard that must be used when
 * any user tries to access another user's data.
 *
 * @param {Object} requestingUser  - The user making the request
 * @param {string} targetOrgId    - The organization the data belongs to
 * @param {string} permissionKey  - The PERMISSIONS key required
 * @returns {{ allowed: boolean, reason: string }}
 */
function hasOrgPermission(requestingUser, targetOrgId, permissionKey) {
    // 0. SUPER ADMIN GLOBAL OVERRIDE
    if (isSuperAdmin(requestingUser)) {
        return { allowed: true, reason: 'SUPER_ADMIN_OVERRIDE' };
    }

    // 1. Check role-based permission first
    const perms = resolvePermissions(requestingUser);
    if (!perms[permissionKey]) {
        return { allowed: false, reason: `Missing permission: ${permissionKey}` };
    }

    // 2. Check organization membership (admins with no org are system-level)
    const userOrgId = requestingUser.organizationId || requestingUser.academyId || requestingUser.schoolId;
    if (requestingUser.role === ROLES.ADMIN && !userOrgId) {
        return { allowed: true, reason: 'System-level admin' };  // Global admin bypass
    }

    if (!userOrgId) {
        return { allowed: false, reason: 'User has no organization assigned' };
    }

    if (userOrgId !== targetOrgId) {
        return { allowed: false, reason: `Cross-tenant access denied: user org="${userOrgId}" target="${targetOrgId}"` };
    }

    return { allowed: true, reason: 'OK' };
}

/**
 * Hard-throws if cross-tenant access is attempted.
 * Use at controller/service boundaries.
 */
function assertOrgAccess(requestingUser, targetOrgId, permissionKey) {
    const result = hasOrgPermission(requestingUser, targetOrgId, permissionKey);
    if (!result.allowed) {
        throw new Error(`[PermissionService] Access Denied — ${result.reason}`);
    }
    return true;
}

// ─── 10. EXPORTS ──────────────────────────────────────────────────────────────
// Supports both CommonJS (Node.js backend) and browser global scope.

const PermissionService = {
    ROLES,
    PERMISSIONS,
    ROLE_DEFAULT_PERMISSIONS,
    isSuperAdmin,
    buildUserProfile,
    hasPermission,
    resolvePermissions,
    resolveSubject,
    createRoleGuard,
    Guards,
    getAISubjectContext,
    DEFAULT_SUBJECT,
    // Multi-tenant org enforcement
    hasOrgPermission,
    assertOrgAccess
};

// Node.js / CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PermissionService;
}

// Browser global (when loaded via <script> tag)
if (typeof window !== 'undefined') {
    window.PermissionService = PermissionService;
}
