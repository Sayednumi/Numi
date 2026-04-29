const express = require('express');
const router = express.Router();
const { Class } = require('../models/Curriculum');
const { PermissionService } = require('../../src/services/PermissionService');

// Middleware to check permissions (simulated for now, should use real middleware)
const checkPerm = (perm) => (req, res, next) => {
    // In a real app, req.user would be populated by an auth middleware
    if (req.user && PermissionService.hasPermission(req.user, perm)) {
        return next();
    }
    res.status(403).json({ success: false, message: 'Forbidden' });
};

// GET all classes for a tenant
router.get('/classes', async (req, res) => {
    try {
        const tenantId = req.query.tenantId || 'main';
        const classes = await Class.find({ tenantId }).sort('orderIndex');
        res.json({ success: true, classes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST new class
router.post('/classes', async (req, res) => {
    try {
        const { id, name, tenantId } = req.body;
        const newClass = new Class({ id, name, tenantId, groups: [] });
        await newClass.save();
        res.json({ success: true, class: newClass });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Other CRUD operations...
// (Add Group, Add Lesson, etc.)

module.exports = router;
