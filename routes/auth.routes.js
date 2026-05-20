const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken } = require('../config/jwt');

// @desc    Auth user & get token
// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    const { phone, password } = req.body;

    try {
        const user = await User.findOne({ phone });

        if (user && (await user.matchPassword(password))) {
            // Generate token containing userId, role, and tenantId
            const token = generateToken(user);

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    phone: user.phone,
                    role: user.role,
                    tenantId: user.tenantId,
                    permissions: user.permissions,
                    token: token // Embed token in user object for easy storage
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

// @desc    Register a new student user
// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, phone, password, parentPhone, school, classId, groupId, tenantId } = req.body;

    try {
        if (!name || !phone || !password || !classId || !groupId) {
            return res.status(400).json({ success: false, message: 'Please complete all required fields.' });
        }

        if (phone.length !== 11) {
            return res.status(400).json({ success: false, message: 'Phone number must be exactly 11 digits.' });
        }

        const userExists = await User.findOne({ phone });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'This phone number is already registered.' });
        }

        // Generate a unique custom id for legacy frontend tracking
        const id = 'student_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();

        const user = await User.create({
            id,
            name,
            phone,
            password,
            parentPhone: parentPhone || '',
            school: school || '',
            classId,
            groupId,
            tenantId: tenantId || 'main',
            role: 'student',
            status: 'inactive' // Requires admin activation
        });

        if (user) {
            res.status(201).json({
                success: true,
                message: 'Account created successfully! Awaiting administrator activation.'
            });
        } else {
            res.status(400).json({ success: false, message: 'Failed to create user.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
