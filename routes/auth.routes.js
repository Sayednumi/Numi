const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @desc    Auth user & get token
// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    const { phone, password } = req.body;

    try {
        const user = await User.findOne({ phone });

        if (user && (await user.matchPassword(password))) {
            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'numi-secret-123', {
                expiresIn: '30d',
            });

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    phone: user.phone,
                    role: user.role,
                    tenantId: user.tenantId,
                    permissions: user.permissions
                },
                token
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid phone or password' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
