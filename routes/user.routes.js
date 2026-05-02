const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * @desc    Get all users (with role filtering and pagination)
 * @route   GET /api/users
 */
router.get('/', async (req, res) => {
    try {
        const { role, scope, tenantId, page = 1, limit = 50 } = req.query;
        let query = {};

        if (role) query.role = role;
        if (scope !== 'global' && tenantId) {
            query.tenantId = tenantId;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // High-performance query with lean() and projection
        const users = await User.find(query)
            .select('-password') // Don't send passwords by default
            .skip(skip)
            .limit(parseInt(limit))
            .lean(); // Faster than full mongoose docs

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * @desc    Update user status
 * @route   PUT /api/users/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true }
        ).lean();
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
